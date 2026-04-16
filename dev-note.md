# KittenTTS React Native — Dev Notes

## What this app does

Offline text-to-speech using KittenTTS ONNX models. Type text, pick a voice, hear it spoken — no server, no internet after first download.

**Pipeline:** Text → Normalize → Phonemize (IPA) → Token IDs → ONNX Model → Audio → Play

---

## Architecture Overview

```
app/(app)/home.tsx            ← Home screen (recent, clipboard, entry points)
app/(app)/reader.tsx          ← Text reader (paste/type text, listen)
app/(app)/book.tsx            ← Document reader (PDF/EPUB import, paginated reading)
    ↓
hooks/useSentencePlayer.ts    ← Sentence-level TTS with lookahead pre-synthesis
    ↓
lib/tts/index.ts              ← Lazy loader (prevents crash on startup)
lib/tts/engine.ts             ← Core: downloads model, runs ONNX inference, plays audio
    ↓
lib/tts/phonemizer.ts         ← Text → IPA phonemes (via espeak-ng compiled to JS)
lib/tts/preprocessor.ts       ← Text normalization (numbers, currency, abbreviations)
lib/tts/symbols.ts            ← IPA character → token ID mapping (KittenTTS vocab)
lib/tts/npz.ts                ← Parses .npz voice style files
    ↓
lib/document-extract.ts       ← Unified PDF/EPUB extraction + pagination
lib/epub-extract.ts           ← EPUB unzip + OPF spine + XHTML text extraction
lib/pending.ts                ← In-memory text/title passing between screens
lib/settings.ts               ← AsyncStorage settings + recent items
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

**Fix:** `lib/tts/index.ts` uses dynamic `import()` to defer loading `engine.ts` until `loadModel()` or `speak()` is actually called. Voice names are duplicated as static data to avoid triggering the eager import.

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

## Features

### EPUB + PDF Document Reader

Full document reader (`app/(app)/book.tsx`) supporting both PDF and EPUB imports via `expo-document-picker`.

- **EPUB extraction** (`lib/epub-extract.ts`): Unzips with `fflate`, parses OPF spine for reading order, extracts clean text from XHTML chapters.
- **PDF extraction**: Uses `react-native-pdf-text` to pull text per page.
- **Unified API** (`lib/document-extract.ts`): `extractDocument()` detects file type, delegates to the right extractor. `splitIntoPages()` paginates at paragraph boundaries. `cleanText()` fixes hyphenated line breaks and normalizes whitespace.
- **Page-by-page reading**: Vertical ScrollView per page, header shows doc name + page info, font size adjustment bar, bottom bar with page navigation arrows and inline play/stop controls.
- **Import screen**: Professional layout — hero icon, feature list (PDF, EPUB, Listen, Customize), thumb-friendly CTA placement at bottom.

### Pre-buffered TTS Playback

Sentence-level TTS with lookahead pre-synthesis to minimize gaps between sentences.

- **Split pipeline** (`lib/tts/engine.ts`): `synthesize()` returns WAV path, `preparePlayer()` creates AudioPlayer, `playPrepared()` plays it. Decoupled from monolithic `speak()`.
- **Sequential background queue** (`hooks/useSentencePlayer.ts`): Producer-consumer pattern using `ready` Map + `waiters` Map. LOOKAHEAD=5 sentences synthesized one-by-one in background (ONNX is single-threaded, parallel was worse).
- **Pre-load first 2**: Before playback starts, first 2 sentences are synthesized and prepared. Phase set to `"loading"` immediately on play press for instant feedback.
- **Per-page playback with auto-advance**: `playPage()` in book.tsx sends only current page text to the player. When page finishes, automatically scrolls to top and starts next page. Page number chip visible in header during playback.

### Home Screen

Clean home screen (`app/(app)/home.tsx`) with:
- Greeting header with voice/speed pill and settings shortcut
- Recent documents list with type-aware icons, deduplication (moves existing item to top instead of adding duplicate)
- Action cards: Text (paste/type), Document (import PDF/EPUB), Library (Standard Ebooks)
- Tip cards shown when no recent items exist

### Standard Ebooks Library

Browse and download free public domain books from Standard Ebooks.

- **Library screen** (`app/(app)/library.tsx`): Search with 500ms debounce, Popular/Newest tabs, infinite scroll, book cards with cover, title, and "By Author" format.
- **Book detail screen** (`app/(app)/book-detail.tsx`): Cover image, title, author, meta pills (word count, reading time, reading ease), description, subject tags, "Read this book" download CTA.
- **Catalog API** (`lib/standard-ebooks.ts`): Scrapes Standard Ebooks HTML pages, parses book metadata via regex. Handles both listing pages and individual book detail pages.
- **Download flow**: Downloads EPUB to cache, passes file URI to book.tsx via pending system. Cached EPUB is deleted after text extraction to prevent pile-up.
- **Attribution**: Info icon in library header shows Standard Ebooks attribution alert.

### Pause/Resume with Bookmarks

- **Pause** stops audio mid-sentence, saves page + sentence index to disk (`lib/settings.ts` bookmark API).
- **Resume** from paused state re-synthesizes the paused sentence and continues from exact position. From cold open, loads saved bookmark and shows highlighted sentence view.
- **Navigate away** auto-pauses and saves bookmark. Coming back restores position.
- **Free page browsing** during playback — `playingPage` tracks TTS position separately from `currentPage`.

### Smart Sentence Splitting

Sentence splitter (`hooks/useSentencePlayer.ts: splitSentences()`) handles real-world book text:

- **Abbreviation-aware**: Won't split on `Mr.`, `Mrs.`, `Dr.`, `St.`, `Jr.`, `Prof.`, etc.
- **Quote-aware**: Punctuation inside quotes (`he said "ok!"`) doesn't create a false split. Closing quotes (`"`, `"`, `'`) are consumed with their sentence.
- **Preserves formatting**: Em-dashes, en-dashes, and special punctuation kept intact. Paragraph breaks rendered as `"\n\n"` in the sentence view.
- **Inline text flow**: Sentence highlighting uses nested `<Text>` components (not flex-wrap) so text flows identically to the non-playing view.

### Seamless Page Transitions

When TTS finishes a page and auto-advances to the next:

- **`continuing` flag**: Skips `clearBuffer()`, model re-check, and synchronous preload. Queue starts synthesizing immediately.
- **Phase preserved**: Stays in `"playing"` phase — no spinner flash between pages.

### WAV Cleanup

- `clearBuffer()` deletes the entire `tts_buf/` directory on play start, stop, and natural end.
- Downloaded EPUBs deleted from cache after text extraction.
- "Clear all data" in settings wipes settings, recents, and bookmarks.

---

## Stack

- Expo SDK 54 (new architecture enabled)
- React Native 0.81
- Hermes JS engine
- onnxruntime-react-native 1.24.3
- phonemizer 1.2.1 (Xenova — espeak-ng via Emscripten asm.js)
- expo-audio, expo-file-system
- pako (gzip decompression for phonemizer patch)
