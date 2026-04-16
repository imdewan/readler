// espeak-ng phonemizer (pure JS via Emscripten asm.js) — exact same IPA output
// as KittenTTS Python: EspeakBackend(language="en-us", preserve_punctuation=True, with_stress=True)
//
// Pipeline: normalizeText → espeak-ng (JS) → IPA string → token IDs → BigInt64Array

import { phonemize as espeakPhonemize } from 'phonemizer';
import { normalizeText } from './preprocessor';
import { SYMBOL_TO_ID, BOS_ID, EOS_ID } from './symbols';

// Map an IPA string character-by-character to token IDs.
// Unknown chars silently dropped (same as KittenTTS TextCleaner).
function ipaToIds(ipa: string): number[] {
  const ids: number[] = [];
  for (const ch of ipa) {
    const id = SYMBOL_TO_ID.get(ch);
    if (id !== undefined) ids.push(id);
  }
  return ids;
}

// Full pipeline: raw text → BigInt64Array of token IDs for ONNX.
export async function textToTokenIds(rawText: string): Promise<BigInt64Array> {
  // 1. Normalize (numbers, currency, etc.)
  const normalized = normalizeText(rawText);

  // 2. Phonemize via espeak-ng JS (en-us, with stress)
  const lines = await espeakPhonemize(normalized, 'en-us');
  const ipa = lines.join(' ');

  // 3. Map IPA → token IDs, wrap with BOS / EOS
  const ids: number[] = [BOS_ID, ...ipaToIds(ipa), EOS_ID, BOS_ID];

  return new BigInt64Array(ids.map(BigInt));
}
