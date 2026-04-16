// Lazy re-exports — engine.ts imports onnxruntime which installs JSI bindings
// at import time. Deferring until actual use prevents startup crashes.

export type { LoadOptions, SpeakOptions } from './engine';

// Voice names are static data — duplicated here to avoid eager engine import.
export const VOICE_NAMES = ['Bella', 'Jasper', 'Luna', 'Bruno', 'Rosie', 'Hugo', 'Kiki', 'Leo'];

let _engine: typeof import('./engine') | null = null;
async function getEngine() {
  if (!_engine) _engine = await import('./engine');
  return _engine;
}

export async function loadModel(opts?: import('./engine').LoadOptions) {
  const engine = await getEngine();
  return engine.loadModel(opts);
}

export function isLoaded(): boolean {
  if (!_engine) return false;
  return _engine.isLoaded();
}

export async function speak(text: string, opts?: import('./engine').SpeakOptions) {
  const engine = await getEngine();
  return engine.speak(text, opts);
}

export async function synthesize(text: string, opts?: import('./engine').SpeakOptions) {
  const engine = await getEngine();
  return engine.synthesize(text, opts);
}

export async function playFile(wavPath: string) {
  const engine = await getEngine();
  return engine.playFile(wavPath);
}

export async function preparePlayer(wavPath: string) {
  const engine = await getEngine();
  return engine.preparePlayer(wavPath);
}

export async function playPrepared(prepared: any) {
  const engine = await getEngine();
  return engine.playPrepared(prepared);
}

export async function stop() {
  if (!_engine) return;
  return _engine.stop();
}

export async function clearBuffer() {
  if (!_engine) return;
  return _engine.clearBuffer();
}
