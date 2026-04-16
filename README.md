# Readler

Offline text-to-speech reader for iOS and Android. Import books, paste text, or browse free public domain literature — then listen with natural-sounding voices, no internet required.

Built with React Native + Expo. Runs KittenTTS Nano (ONNX) entirely on-device.

---

## Features

**Read anything out loud**
- Import PDF or EPUB files from your device
- Paste or type any text
- Browse and download books from Standard Ebooks (free, public domain)

**Smart TTS playback**
- 8 voices (4 female, 4 male) with adjustable speed
- Sentence-by-sentence highlighting with live progress
- Pre-buffered synthesis — sentences are prepared ahead of time for minimal gaps
- Seamless page transitions with no audio interruption

**Pause, resume, bookmark**
- Pause mid-sentence, resume from the exact position
- Bookmarks saved to disk — close the app, come back later, pick up where you left off
- Navigate pages freely while audio continues playing

**Proper sentence splitting**
- Handles abbreviations (Mr., Dr., St.) without false breaks
- Respects quoted speech — `he said "ok!"` stays as one sentence
- Preserves em-dashes, curly quotes, and paragraph structure

**Fully offline**
- Model + voices downloaded once on first launch (~60MB total)
- All inference runs locally via ONNX Runtime
- No server, no API keys, no data leaves your device

---

## Stack

| Layer | Tech |
|---|---|
| Framework | Expo SDK 54, React Native 0.81, Hermes |
| TTS Model | KittenTTS Nano v0.8 (ONNX, 24kHz) |
| Inference | onnxruntime-react-native 1.24.3 |
| Phonemizer | espeak-ng compiled to asm.js (Xenova/phonemizer) |
| Audio | expo-audio |
| Navigation | expo-router (file-based, Stack) |
| Storage | expo-secure-store, expo-file-system |

---

## Getting Started

```bash
# Install dependencies
npm install

# Start dev server
npx expo start

# Run on device
npx expo run:ios
npx expo run:android
```

> Requires a development build (not Expo Go) due to native ONNX Runtime dependency.

---

## Project Structure

```
app/
  (app)/
    home.tsx          Home screen — recents, action cards
    reader.tsx        Text reader — paste/type, listen
    book.tsx          Document reader — PDF/EPUB, paginated TTS
    library.tsx       Standard Ebooks — browse, search
    book-detail.tsx   Book detail — metadata, download
    settings.tsx      Voice, speed, data management

hooks/
  useSentencePlayer.ts   Sentence-level TTS with lookahead queue

lib/
  tts/
    engine.ts         ONNX inference, audio synthesis
    phonemizer.ts     Text to IPA phonemes
    preprocessor.ts   Number/currency normalization
    symbols.ts        IPA to token mapping
  document-extract.ts  PDF/EPUB unified extraction
  epub-extract.ts      EPUB unzip + text extraction
  standard-ebooks.ts   Standard Ebooks catalog API
  settings.ts          Settings, recents, bookmarks
  pending.ts           Cross-screen data passing
```

---

## Patches

Two patches are applied automatically via `patch-package`:

- **phonemizer**: Replaces `Blob`/`DecompressionStream` with `pako.inflate()` for Hermes compatibility
- **onnxruntime-react-native**: Adds 16KB page alignment for Android Play Store compliance

---

## License

All books sourced from [Standard Ebooks](https://standardebooks.org) are public domain.
