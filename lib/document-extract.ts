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
    const chapters = await extractTextFromEpub(fileUri);
    return { type, chapters, fullText: chapters.join('\n\n') };
  }

  // PDF
  const text = await extractTextFromPdf(fileUri);
  return { type: 'pdf', chapters: [text], fullText: text };
}
