// KittenTTS inference engine.
// Downloads model + voices once, caches to disk, runs ONNX, plays WAV.

import { InferenceSession, Tensor } from 'onnxruntime-react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import type { AudioPlayer } from 'expo-audio';
import { textToTokenIds } from './phonemizer';
import { parseNpz, getStyleVector, NpyArray } from './npz';

// ─── Model URLs (HuggingFace) ──────────────────────────────────────────────
const MODEL_URL =
  'https://huggingface.co/KittenML/kitten-tts-nano-0.8/resolve/main/kitten_tts_nano_v0_8.onnx';
const VOICES_URL =
  'https://huggingface.co/KittenML/kitten-tts-nano-0.8/resolve/main/voices.npz';

const MODEL_PATH  = (FileSystem.documentDirectory ?? '') + 'kittentts_nano.onnx';
const VOICES_PATH = (FileSystem.documentDirectory ?? '') + 'kittentts_voices.npz';
const WAV_PATH    = (FileSystem.cacheDirectory ?? '') + 'kittentts_out.wav';
const SAMPLE_RATE = 24000;
const TRIM_TAIL   = 5000; // samples trimmed from end (silence artifact)

// ─── Voice config (from config.json) ──────────────────────────────────────
export const VOICE_ALIASES: Record<string, string> = {
  Bella:  'expr-voice-2-f',
  Jasper: 'expr-voice-2-m',
  Luna:   'expr-voice-3-f',
  Bruno:  'expr-voice-3-m',
  Rosie:  'expr-voice-4-f',
  Hugo:   'expr-voice-4-m',
  Kiki:   'expr-voice-5-f',
  Leo:    'expr-voice-5-m',
};

export const VOICE_NAMES = Object.keys(VOICE_ALIASES);

const SPEED_PRIORS: Record<string, number> = {
  'expr-voice-2-f': 0.8,
  'expr-voice-2-m': 0.8,
  'expr-voice-3-f': 0.8,
  'expr-voice-3-m': 0.8,
  'expr-voice-4-f': 0.8,
  'expr-voice-4-m': 0.9,
  'expr-voice-5-f': 0.8,
  'expr-voice-5-m': 0.8,
};

// ─── Cached state ──────────────────────────────────────────────────────────
let _session: InferenceSession | null = null;
let _voices: Map<string, NpyArray> | null = null;
let _player: AudioPlayer | null = null;

// ─── Download helpers ──────────────────────────────────────────────────────
async function ensureFile(
  localPath: string,
  remoteUrl: string,
  onProgress?: (pct: number) => void,
): Promise<void> {
  const info = await FileSystem.getInfoAsync(localPath);
  if (info.exists) return;

  const callback = onProgress
    ? ({ totalBytesWritten, totalBytesExpectedToWrite }: FileSystem.DownloadProgressData) => {
        if (totalBytesExpectedToWrite > 0) {
          onProgress(totalBytesWritten / totalBytesExpectedToWrite);
        }
      }
    : undefined;

  const downloadResumable = FileSystem.createDownloadResumable(
    remoteUrl,
    localPath,
    {},
    callback,
  );

  const result = await downloadResumable.downloadAsync();
  if (!result || result.status !== 200) {
    throw new Error(`Download failed for ${remoteUrl}: ${result?.status}`);
  }
}

// ─── Encode Float32 audio → WAV bytes ─────────────────────────────────────
function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const numChannels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * bytesPerSample;
  const buf = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buf);

  const ws = (off: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i));
  };

  ws(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  ws(8, 'WAVE');
  ws(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  ws(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Uint8Array(buf);
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// ─── Public API ────────────────────────────────────────────────────────────

export interface LoadOptions {
  onModelProgress?: (pct: number) => void;
  onVoicesProgress?: (pct: number) => void;
}

/** Download model + voices (idempotent — skips if already on disk). */
export async function loadModel(opts: LoadOptions = {}): Promise<void> {
  await ensureFile(MODEL_PATH, MODEL_URL, opts.onModelProgress);
  await ensureFile(VOICES_PATH, VOICES_URL, opts.onVoicesProgress);

  if (!_session) {
    // onnxruntime-react-native accepts a local path (strip file:// prefix)
    const localPath = MODEL_PATH.replace(/^file:\/\//, '');
    _session = await InferenceSession.create(localPath);
  }

  if (!_voices) {
    const b64 = await FileSystem.readAsStringAsync(VOICES_PATH, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const binaryStr = atob(b64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
    _voices = parseNpz(bytes.buffer as ArrayBuffer);
  }
}

export function isLoaded(): boolean {
  return _session !== null && _voices !== null;
}

export interface SpeakOptions {
  voice?: string;   // Voice alias e.g. "Bella"
  speed?: number;   // Multiplier, default 1.0
}

/** Synthesize text and play audio. Throws if model not loaded. */
export async function speak(text: string, opts: SpeakOptions = {}): Promise<void> {
  if (!_session || !_voices) throw new Error('Model not loaded — call loadModel() first');

  const voiceName = opts.voice ?? 'Bella';
  const voiceKey = VOICE_ALIASES[voiceName] ?? VOICE_ALIASES['Bella'];
  const speedPrior = SPEED_PRIORS[voiceKey] ?? 0.8;
  const speed = speedPrior * (opts.speed ?? 1.0);

  // Build token IDs (async — calls native espeak-ng)
  const inputIds = await textToTokenIds(text);
  const seqLen = inputIds.length;

  // Pick style vector: ref_id = min(seqLen, nRows-1)
  const styleVec = getStyleVector(_voices, voiceKey, Math.min(seqLen, 255));
  const styleDim = styleVec.length;

  const feeds = {
    input_ids: new Tensor('int64', inputIds, [1, seqLen]),
    style: new Tensor('float32', styleVec, [1, styleDim]),
    speed: new Tensor('float32', new Float32Array([speed]), [1]),
  };

  const results = await _session.run(feeds);

  // First output tensor contains the audio
  const outputName = _session.outputNames[0];
  const rawAudio = results[outputName].data as Float32Array;

  // Trim silence tail (same as Python: outputs[0][..., :-5000])
  const audio = rawAudio.length > TRIM_TAIL
    ? rawAudio.slice(0, rawAudio.length - TRIM_TAIL)
    : rawAudio;

  // Encode to WAV and write to cache
  const wav = encodeWav(audio, SAMPLE_RATE);
  const b64 = uint8ToBase64(wav);
  await FileSystem.writeAsStringAsync(WAV_PATH, b64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  // Stop any currently playing audio
  await stop();

  // Play and wait for completion
  await setAudioModeAsync({ playsInSilentMode: true });
  _player = createAudioPlayer(WAV_PATH);

  let _resolve: (() => void) | null = null;
  _stopResolve = () => { _resolve?.(); };

  return new Promise<void>((resolve) => {
    _resolve = resolve;
    const sub = _player!.addListener('playbackStatusUpdate', (status) => {
      if (status.didJustFinish) {
        sub.remove();
        _stopResolve = null;
        resolve();
      }
    });
    _player!.play();
  });
}

let _stopResolve: (() => void) | null = null;

/** Stop currently playing audio. */
export async function stop(): Promise<void> {
  const resolve = _stopResolve;
  _stopResolve = null;
  if (_player) {
    _player.pause();
    _player.release();
    _player = null;
  }
  resolve?.();
}
