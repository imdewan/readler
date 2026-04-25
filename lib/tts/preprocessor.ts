// Text normalization — mirrors KittenTTS preprocess.py (Option A, JS port).
// Converts numbers, currency, ordinals, contractions to speakable English.

const ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven',
               'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen',
               'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty',
              'sixty', 'seventy', 'eighty', 'ninety'];

function intToWords(n: number): string {
  if (n < 0) return 'negative ' + intToWords(-n);
  if (n === 0) return 'zero';
  if (n < 20) return ONES[n];
  if (n < 100) {
    return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '');
  }
  if (n < 1000) {
    return ONES[Math.floor(n / 100)] + ' hundred' +
           (n % 100 ? ' ' + intToWords(n % 100) : '');
  }
  // 1000-9999 — use "X hundred" form, model pronounces it better than "thousand"
  if (n < 10_000) {
    const hundreds = Math.floor(n / 100);
    const rem = n % 100;
    return intToWords(hundreds) + ' hundred' + (rem ? ' ' + intToWords(rem) : '');
  }
  if (n < 1_000_000) {
    return intToWords(Math.floor(n / 1000)) + ' thousand' +
           (n % 1000 ? ' ' + intToWords(n % 1000) : '');
  }
  if (n < 1_000_000_000) {
    return intToWords(Math.floor(n / 1_000_000)) + ' million' +
           (n % 1_000_000 ? ' ' + intToWords(n % 1_000_000) : '');
  }
  return intToWords(Math.floor(n / 1_000_000_000)) + ' billion' +
         (n % 1_000_000_000 ? ' ' + intToWords(n % 1_000_000_000) : '');
}

const ORDINAL_SUFFIXES: Record<string, string> = {
  '1': 'first', '2': 'second', '3': 'third', '4': 'fourth', '5': 'fifth',
  '6': 'sixth', '7': 'seventh', '8': 'eighth', '9': 'ninth', '10': 'tenth',
  '11': 'eleventh', '12': 'twelfth',
};

function ordinalToWords(n: number): string {
  const key = String(n);
  if (ORDINAL_SUFFIXES[key]) return ORDINAL_SUFFIXES[key];
  const w = intToWords(n);
  if (w.endsWith('one')) return w.slice(0, -3) + 'first';
  if (w.endsWith('two')) return w.slice(0, -3) + 'second';
  if (w.endsWith('three')) return w.slice(0, -5) + 'third';
  if (w.endsWith('five')) return w.slice(0, -4) + 'fifth';
  if (w.endsWith('eight')) return w + 'h';
  if (w.endsWith('nine')) return w.slice(0, -1) + 'th';
  if (w.endsWith('twelve')) return w.slice(0, -2) + 'fth';
  return w + 'th';
}

function expandDecimal(match: string): string {
  const [intPart, fracPart] = match.split('.');
  const intWords = intToWords(parseInt(intPart, 10));
  const fracWords = fracPart.split('').map(d => intToWords(parseInt(d, 10))).join(' ');
  return intWords + ' point ' + fracWords;
}

export function normalizeText(text: string): string {
  // Remove URLs
  text = text.replace(/https?:\/\/\S+/g, '');

  // Strip thousands-separator commas: $1,500 → $1500, 12,345 → 12345
  text = text.replace(/(\d),(?=\d{3}(?:\D|$))/g, '$1');

  // Expand contractions with apostrophes (preserve in dict lookup)
  // Already handled in dict.ts

  // Currency: $5 → five dollars, $5.50 → five dollars fifty cents
  text = text.replace(/\$(\d+)\.(\d{2})\b/g, (_, d, c) => {
    const dollars = parseInt(d, 10);
    const cents = parseInt(c, 10);
    return intToWords(dollars) + (dollars === 1 ? ' dollar ' : ' dollars ') +
           intToWords(cents) + (cents === 1 ? ' cent' : ' cents');
  });
  text = text.replace(/\$(\d+)([KkMmBb]?)\b/g, (_, n, suffix) => {
    const num = parseInt(n, 10);
    const mult = suffix.toLowerCase() === 'k' ? 1000
               : suffix.toLowerCase() === 'm' ? 1_000_000
               : suffix.toLowerCase() === 'b' ? 1_000_000_000 : 1;
    return intToWords(num * mult) + ' dollars';
  });

  // Percentages: 50% → fifty percent
  text = text.replace(/(\d+)%/g, (_, n) => intToWords(parseInt(n, 10)) + ' percent');

  // Ordinals: 1st, 2nd, 3rd, 4th…
  text = text.replace(/\b(\d+)(st|nd|rd|th)\b/gi, (_, n) => ordinalToWords(parseInt(n, 10)));

  // Decimal numbers: 3.14
  text = text.replace(/\b(\d+)\.(\d+)\b/g, expandDecimal);

  // Plain integers
  text = text.replace(/\b(\d{1,9})\b/g, (_, n) => intToWords(parseInt(n, 10)));

  // Collapse whitespace
  text = text.replace(/\s+/g, ' ').trim();

  return text;
}
