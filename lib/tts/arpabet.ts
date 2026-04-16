// ARPABET → IPA conversion using espeak-ng en-us notation.
// Stress numbers (0/1/2) are stripped from vowels and converted to
// IPA stress markers (ˈ / ˌ) placed before the vowel.

// Vowel phonemes — value is [unstressed_ipa, stressed_ipa]
const VOWELS: Record<string, [string, string]> = {
  AA: ['ɑ',  'ɑ'],
  AE: ['æ',  'æ'],
  AH: ['ə',  'ʌ'],   // AH0 = schwa, AH1/AH2 = strut
  AO: ['ɔ',  'ɔ'],
  AW: ['aʊ', 'aʊ'],
  AY: ['aɪ', 'aɪ'],
  EH: ['ɛ',  'ɛ'],
  ER: ['ər', 'ɜːr'],
  EY: ['eɪ', 'eɪ'],
  IH: ['ɪ',  'ɪ'],
  IY: ['iː', 'iː'],
  OW: ['oʊ', 'oʊ'],
  OY: ['ɔɪ', 'ɔɪ'],
  UH: ['ʊ',  'ʊ'],
  UW: ['uː', 'uː'],
};

// Consonant phonemes → IPA (same for all stress levels — consonants have no stress)
const CONSONANTS: Record<string, string> = {
  B:  'b',
  CH: 'ʧ',
  D:  'd',
  DH: 'ð',
  F:  'f',
  G:  'ɡ',
  HH: 'h',
  JH: 'ʤ',
  K:  'k',
  L:  'l',
  M:  'm',
  N:  'n',
  NG: 'ŋ',
  P:  'p',
  R:  'r',
  S:  's',
  SH: 'ʃ',
  T:  't',
  TH: 'θ',
  V:  'v',
  W:  'w',
  Y:  'j',
  Z:  'z',
  ZH: 'ʒ',
};

/** Convert an ARPABET phoneme string (e.g. "HH AH0 L OW1") to IPA. */
export function arpabetToIpa(arpabet: string): string {
  const phonemes = arpabet.trim().split(/\s+/);
  let ipa = '';

  for (const phoneme of phonemes) {
    // Check for stress digit suffix
    const stressMatch = phoneme.match(/^([A-Z]+)([012])$/);

    if (stressMatch) {
      const base = stressMatch[1];
      const stress = parseInt(stressMatch[2], 10);
      const vowelPair = VOWELS[base];

      if (vowelPair) {
        // stress 0 = unstressed (schwa etc.), 1 = primary, 2 = secondary
        if (stress === 1) ipa += 'ˈ';
        else if (stress === 2) ipa += 'ˌ';
        ipa += stress === 0 ? vowelPair[0] : vowelPair[1];
        continue;
      }
    }

    // No stress digit — consonant or bare phoneme
    const base = phoneme.replace(/[012]$/, '');
    const cons = CONSONANTS[base];
    if (cons) {
      ipa += cons;
    }
    // Unknown phonemes silently dropped
  }

  return ipa;
}
