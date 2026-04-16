import * as FileSystem from 'expo-file-system/legacy';
import { unzipSync, strFromU8 } from 'fflate';

/**
 * Extract readable text from an EPUB file.
 * EPUB = ZIP containing XHTML content files.
 * Uses fflate (already in deps) to decompress.
 */

function stripHtmlTags(html: string): string {
  // Remove script/style blocks entirely
  let cleaned = html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '');

  // Convert block elements to newlines
  cleaned = cleaned.replace(/<\/(p|div|h[1-6]|li|blockquote|tr|br\s*\/?)>/gi, '\n');
  cleaned = cleaned.replace(/<br\s*\/?>/gi, '\n');
  cleaned = cleaned.replace(/<\/(td|th)>/gi, '\t');

  // Heading markers for formatting preservation
  cleaned = cleaned.replace(/<h([1-6])[^>]*>/gi, '\n\n');

  // Strip remaining tags
  cleaned = cleaned.replace(/<[^>]+>/g, '');

  // Decode common HTML entities
  cleaned = cleaned
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));

  // Normalize whitespace
  cleaned = cleaned.replace(/[ \t]+/g, ' ');
  cleaned = cleaned.replace(/\n /g, '\n');
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  return cleaned.trim();
}

function parseSpineOrder(opfContent: string): string[] {
  // Extract manifest items: id → href
  const manifest = new Map<string, string>();
  for (const m of opfContent.matchAll(/<item\s+[^>]*?id="([^"]+)"[^>]*?href="([^"]+)"[^>]*?\/?>/gi)) {
    manifest.set(m[1], m[2]);
  }
  // Also handle reversed attribute order
  for (const m of opfContent.matchAll(/<item\s+[^>]*?href="([^"]+)"[^>]*?id="([^"]+)"[^>]*?\/?>/gi)) {
    if (!manifest.has(m[2])) manifest.set(m[2], m[1]);
  }

  // Extract spine order
  const spineIds: string[] = [];
  for (const m of opfContent.matchAll(/<itemref\s+[^>]*?idref="([^"]+)"[^>]*?\/?>/gi)) {
    spineIds.push(m[1]);
  }

  // Map spine IDs to hrefs
  const hrefs: string[] = [];
  for (const id of spineIds) {
    const href = manifest.get(id);
    if (href) hrefs.push(decodeURIComponent(href));
  }

  return hrefs;
}

function findOpfPath(containerXml: string): string {
  const match = containerXml.match(/full-path="([^"]+)"/);
  return match ? match[1] : 'content.opf';
}

export async function extractTextFromEpub(fileUri: string): Promise<string[]> {
  const b64 = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

  const files = unzipSync(bytes);

  // Helper to find a file case-insensitively
  const findFile = (path: string): Uint8Array | undefined => {
    const normalized = path.replace(/^\//, '');
    return files[normalized] ?? files['/' + normalized];
  };

  // Find OPF path from META-INF/container.xml
  const containerData = findFile('META-INF/container.xml');
  let opfPath = 'content.opf';
  if (containerData) {
    opfPath = findOpfPath(strFromU8(containerData));
  }

  // Read OPF
  const opfData = findFile(opfPath);
  if (!opfData) {
    // Fallback: find any .opf file
    const opfKey = Object.keys(files).find(k => k.endsWith('.opf'));
    if (!opfKey) throw new Error('No OPF manifest found in EPUB');
    opfPath = opfKey;
  }

  const opfContent = strFromU8(opfData ?? files[opfPath]);
  const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';

  // Get spine-ordered content files
  const spineHrefs = parseSpineOrder(opfContent);

  if (spineHrefs.length === 0) {
    // Fallback: grab all xhtml/html files
    const htmlKeys = Object.keys(files).filter(
      k => k.endsWith('.xhtml') || k.endsWith('.html') || k.endsWith('.htm'),
    );
    htmlKeys.sort();
    if (htmlKeys.length === 0) throw new Error('No content files found in EPUB');
    return htmlKeys
      .map(k => stripHtmlTags(strFromU8(files[k])))
      .filter(t => t.length > 0);
  }

  // Extract text from each spine item (each = roughly a chapter)
  const chapters: string[] = [];
  for (const href of spineHrefs) {
    const fullPath = opfDir + href;
    const data = findFile(fullPath) ?? findFile(href);
    if (!data) continue;
    const text = stripHtmlTags(strFromU8(data));
    if (text.length > 20) chapters.push(text);
  }

  if (chapters.length === 0) throw new Error('No readable text found in EPUB');
  return chapters;
}
