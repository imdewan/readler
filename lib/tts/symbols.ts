// KittenTTS symbol table — matches onnx_model.py TextCleaner exactly.
// Order matters: index in this array = token ID fed to the ONNX model.

export const SYMBOL_LIST: string[] = [
  // Index 0 — pad / BOS
  '$',
  // Index 1–16 — punctuation
  ';', ':', ',', '.', '!', '?', '¡', '¿', '—', '…',
  '\u201c', '«', '»', '\u201d', '"', ' ',
  // Index 17–42 — uppercase A–Z
  'A','B','C','D','E','F','G','H','I','J','K','L','M',
  'N','O','P','Q','R','S','T','U','V','W','X','Y','Z',
  // Index 43–68 — lowercase a–z
  'a','b','c','d','e','f','g','h','i','j','k','l','m',
  'n','o','p','q','r','s','t','u','v','w','x','y','z',
  // Index 69+ — IPA characters (espeak-ng en-us output set)
  'ɑ','ɐ','ɒ','æ','ɓ','ʙ','β','ɔ','ɕ','ç','ɗ','ɖ','ð','ʤ','ə','ɘ',
  'ɚ','ɛ','ɜ','ɝ','ɞ','ɟ','ʄ','ɡ','ɠ','ɢ','ʛ','ɦ','ɧ','ħ','ɥ','ʜ',
  'ɨ','ɪ','ʝ','ɭ','ɬ','ɫ','ɮ','ʟ','ɱ','ɯ','ɰ','ŋ','ɳ','ɲ','ɴ','ø',
  'ɵ','ɸ','θ','œ','ɶ','ʘ','ɹ','ɺ','ɾ','ɻ','ʀ','ʁ','ɽ','ʂ','ʃ','ʈ',
  'ʧ','ʉ','ʊ','ʋ','ⱱ','ʌ','ɣ','ɤ','ʍ','χ','ʎ','ʏ','ʑ','ʐ','ʒ','ʔ',
  'ʡ','ʕ','ʢ','ǀ','ǁ','ǂ','ǃ','ˈ','ˌ','ː','ˑ','ʼ','ʴ','ʰ','ʱ','ʲ',
  'ʷ','ˠ','ˤ','˞','↓','↑','→','↗','↘',"'",'̩',"'",'ᵻ',
];

// char → token ID lookup (O(1))
export const SYMBOL_TO_ID: Map<string, number> = new Map(
  SYMBOL_LIST.map((s, i) => [s, i])
);

// Special token IDs
export const BOS_ID = 0;   // '$'
export const EOS_ID = 10;  // '…'
