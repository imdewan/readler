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
const WAV_DIR     = (FileSystem.cacheDirectory ?? '') + 'tts_buf/';
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

let _bufId = 0;

async function ensureWavDir() {
  const info = await FileSystem.getInfoAsync(WAV_DIR);
  if (!info.exists) await FileSystem.makeDirectoryAsync(WAV_DIR, { intermediates: true });
}

/** Synthesize text to a WAV file, return its path. Does NOT play. */
export async function synthesize(text: string, opts: SpeakOptions = {}): Promise<string> {
  if (!_session || !_voices) throw new Error('Model not loaded — call loadModel() first');

  const voiceName = opts.voice ?? 'Bella';
  const voiceKey = VOICE_ALIASES[voiceName] ?? VOICE_ALIASES['Bella'];
  const speedPrior = SPEED_PRIORS[voiceKey] ?? 0.8;
  const speed = speedPrior * (opts.speed ?? 1.0);

  const inputIds = await textToTokenIds(text);
  const seqLen = inputIds.length;

  const styleVec = getStyleVector(_voices, voiceKey, Math.min(seqLen, 255));
  const styleDim = styleVec.length;

  const feeds = {
    input_ids: new Tensor('int64', inputIds, [1, seqLen]),
    style: new Tensor('float32', styleVec, [1, styleDim]),
    speed: new Tensor('float32', new Float32Array([speed]), [1]),
  };

  const results = await _session.run(feeds);
  const outputName = _session.outputNames[0];
  const rawAudio = results[outputName].data as Float32Array;

  const audio = rawAudio.length > TRIM_TAIL
    ? rawAudio.slice(0, rawAudio.length - TRIM_TAIL)
    : rawAudio;

  const wav = encodeWav(audio, SAMPLE_RATE);
  const b64 = uint8ToBase64(wav);

  await ensureWavDir();
  const wavPath = WAV_DIR + `buf_${_bufId++}.wav`;
  await FileSystem.writeAsStringAsync(wavPath, b64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  return wavPath;
}

let _audioModeSet = false;
let _stopResolve: (() => void) | null = null;

/** Pre-create a player for a WAV file (does not play yet). */
export function preparePlayer(wavPath: string): AudioPlayer {
  return createAudioPlayer(wavPath);
}

/** Play a WAV file and wait for completion. */
export async function playFile(wavPath: string): Promise<void> {
  // Release previous player (don't pause — it already finished naturally)
  if (_player) {
    _player.release();
    _player = null;
  }

  if (!_audioModeSet) {
    await setAudioModeAsync({ playsInSilentMode: true });
    _audioModeSet = true;
  }

  _player = createAudioPlayer(wavPath);

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

/** Play a pre-created player and wait for completion. */
export async function playPrepared(prepared: AudioPlayer): Promise<void> {
  // Release previous
  if (_player) {
    _player.release();
    _player = null;
  }

  if (!_audioModeSet) {
    await setAudioModeAsync({ playsInSilentMode: true });
    _audioModeSet = true;
  }

  _player = prepared;

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

/** Synthesize text and play audio. Throws if model not loaded. */
export async function speak(text: string, opts: SpeakOptions = {}): Promise<void> {
  const wavPath = await synthesize(text, opts);
  await playFile(wavPath);
}

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

/** Delete all cached WAV files in tts_buf/. */
export async function clearBuffer(): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(WAV_DIR);
    if (info.exists) {
      await FileSystem.deleteAsync(WAV_DIR, { idempotent: true });
    }
    _bufId = 0;
  } catch {}
}
