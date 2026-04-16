import { extractTextFromPdf } from './pdf-extract';
import { extractTextFromEpub } from './epub-extract';

export type DocType = 'pdf' | 'epub';

export interface ExtractedDocument {
  type: DocType;
  /** For PDF: single-element array. For EPUB: one string per chapter. */
  chapters: string[];
  /** Full text joined */
  fullText: string;
}

function detectType(fileName: string, mimeType?: string): DocType {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.epub')) return 'epub';
  if (mimeType === 'application/epub+zip') return 'epub';
  return 'pdf';
}

/** Clean up extracted text — normalize whitespace, fix common artifacts. */
function cleanText(raw: string): string {
  return raw
    // Fix hyphenated line breaks (word- \nword → word)
    .replace(/(\w)-\s*\n\s*(\w)/g, '$1$2')
    // Collapse single newlines within paragraphs into spaces
    .replace(/([^\n])\n([^\n])/g, '$1 $2')
    // Normalize multiple spaces/tabs
    .replace(/[ \t]{2,}/g, ' ')
    // Normalize paragraph breaks (3+ newlines → 2)
    .replace(/\n{3,}/g, '\n\n')
    // Trim lines
    .replace(/^ +| +$/gm, '')
    .trim();
}

/**
 * Split a long string into rough pages by paragraph boundaries.
 * Target ~1500 chars per page (roughly one screen of text).
 */
export function splitIntoPages(text: string, charsPerPage = 1500): string[] {
  const paragraphs = text.split(/\n\n+/);
  const pages: string[] = [];
  let current = '';

  for (const para of paragraphs) {
    if (current.length > 0 && current.length + para.length + 2 > charsPerPage) {
      pages.push(current.trim());
      current = para;
    } else {
      current += (current ? '\n\n' : '') + para;
    }
  }
  if (current.trim()) pages.push(current.trim());

  return pages.length > 0 ? pages : [text];
}

export async function extractDocument(
  fileUri: string,
  fileName: string,
  mimeType?: string,
): Promise<ExtractedDocument> {
  const type = detectType(fileName, mimeType);

  if (type === 'epub') {
    const rawChapters = await extractTextFromEpub(fileUri);
    const chapters = rawChapters.map(cleanText).filter(c => c.length > 0);
    return { type, chapters, fullText: chapters.join('\n\n') };
  }

  // PDF
  const raw = await extractTextFromPdf(fileUri);
  const text = cleanText(raw);
  return { type: 'pdf', chapters: [text], fullText: text };
}
