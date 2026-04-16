# KittenTTS React Native — Dev Notes

## What this app does

Offline text-to-speech using KittenTTS ONNX models. Type text, pick a voice, hear it spoken — no server, no internet after first download.

**Pipeline:** Text → Normalize → Phonemize (IPA) → Token IDs → ONNX Model → Audio → Play

---

## Architecture Overview

```
app/(tabs)/index.tsx          ← UI (text input, voice picker, speak/stop buttons)
    ↓
modules/tts/index.ts          ← Lazy loader (prevents crash on startup)
    ↓
modules/tts/engine.ts         ← Core: downloads model, runs ONNX inference, plays audio
    ↓
modules/tts/phonemizer.ts     ← Text → IPA phonemes (via espeak-ng compiled to JS)
modules/tts/preprocessor.ts   ← Text normalization (numbers, currency, abbreviations)
modules/tts/symbols.ts        ← IPA character → token ID mapping (KittenTTS vocab)
modules/tts/npz.ts            ← Parses .npz voice style files
```

---

## Key Implementation Details

### 1. Phonemizer — Pure JS espeak-ng

**Problem:** KittenTTS was trained on espeak-ng IPA output. We need the exact same phonemization on mobile.

**Failed approach:** Compiling espeak-ng as a native C module. The C source files hit irreconcilable header conflicts with React Native's C++ ecosystem (yoga headers injecting `<bitset>` into C compilation units). Weeks of podspec/Xcode tinkering couldn't fix it.

**Working approach:** The npm `phonemizer` package (by Xenova) — espeak-ng compiled to asm.js via Emscripten. It's a 1.3MB self-contained JS bundle with all espeak-ng data embedded as base64. No native code, no WebAssembly, works in Hermes.

```ts
// modules/tts/phonemizer.ts
import { phonemize } from 'phonemizer';
const lines = await phonemize("Hello world.", "en-us");
// → ["həlˈoʊ wˈɜːld"]
```

**Patch required:** The original bundle uses `new Blob().stream().pipeThrough(new DecompressionStream("gzip"))` to decompress its embedded data. Hermes doesn't support Blob or DecompressionStream. Patched to use `pako.inflate()` instead. See `patches/phonemizer+1.2.1.patch`.

### 2. Lazy Loading — Preventing Startup Crash

**Problem:** `onnxruntime-react-native` installs JSI bindings the moment its JS module is imported. If the import chain is eager (UI → tts → engine → onnxruntime), the app crashes before the first frame renders.

**Fix:** `modules/tts/index.ts` uses dynamic `import()` to defer loading `engine.ts` until `loadModel()` or `speak()` is actually called. Voice names are duplicated as static data to avoid triggering the eager import.

### 3. ONNX Runtime on Android — Manual Package Registration

**Problem:** `onnxruntime-react-native` doesn't have a `react-native.config.js`, so RN autolinking doesn't register it. The gradle dependency gets added (via expo prebuild), but the Java `OnnxruntimePackage` never makes it into the `PackageList`. Result: `NativeModules.Onnxruntime` is null → `"Cannot read property 'install' of null"`.

**Fix:** Manually added `OnnxruntimePackage()` to `MainApplication.kt`:

```kotlin
import ai.onnxruntime.reactnative.OnnxruntimePackage

// inside getPackages():
PackageList(this).packages.apply {
    add(OnnxruntimePackage())
}
```

### 4. Android 16KB Page Alignment

**Problem:** Play Store requires 16KB-aligned ELF binaries. The prebuilt onnxruntime `.so` files (from the AAR) are already 16KB aligned in v1.24.3. But `libonnxruntimejsi.so` — built locally from the react-native package's CMakeLists.txt — was only 4KB aligned.

**Fix:** Patched `CMakeLists.txt` to add the linker flag:
```cmake
set(CMAKE_SHARED_LINKER_FLAGS "${CMAKE_SHARED_LINKER_FLAGS} -Wl,-z,max-page-size=16384")
```
See `patches/onnxruntime-react-native+1.24.3.patch`.

### 5. Audio Playback — expo-av → expo-audio

`expo-av` is deprecated in SDK 54. Replaced with `expo-audio`:
- `Audio.Sound.createAsync()` → `createAudioPlayer()`
- `sound.playAsync()` → `player.play()`
- `sound.stopAsync(); sound.unloadAsync()` → `player.pause(); player.release()`
- `Audio.setAudioModeAsync({ playsInSilentModeIOS })` → `setAudioModeAsync({ playsInSilentMode })`

### 6. iOS — SwiftUI Linker Fix

Pre-built ReactNativeDependencies XCFrameworks have an implicit SwiftUICore dependency. Fixed by adding `-framework SwiftUI` to the main app target's `OTHER_LDFLAGS` via a Podfile `post_install` hook.

---

## Patches (auto-applied via postinstall)

| Patch | Why |
|---|---|
| `patches/phonemizer+1.2.1.patch` | Replace Blob/DecompressionStream with pako for Hermes compatibility |
| `patches/onnxruntime-react-native+1.24.3.patch` | Add 16KB page alignment to locally-built `libonnxruntimejsi.so` |

Applied automatically by `patch-package` via the `postinstall` script in `package.json`.

---

## Model Details

- **Model:** KittenTTS Nano v0.8 (~55MB ONNX)
- **Voices:** 8 voices in `voices.npz` (~5MB), each with style vectors indexed by sequence length
- **Sample rate:** 24kHz mono
- **Downloaded from:** HuggingFace on first launch, cached to `documentDirectory`

---

## Stack

- Expo SDK 54 (new architecture enabled)
- React Native 0.81
- Hermes JS engine
- onnxruntime-react-native 1.24.3
- phonemizer 1.2.1 (Xenova — espeak-ng via Emscripten asm.js)
- expo-audio, expo-file-system
- pako (gzip decompression for phonemizer patch)
