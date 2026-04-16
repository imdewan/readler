import * as FileSystem from 'expo-file-system/legacy';
import { extractText, isAvailable } from 'expo-pdf-text-extract';
import { inflateSync } from 'fflate';

// ── Native extraction (PDFKit / PDFBox) ──────────────────────────────────────

async function extractNative(fileUri: string): Promise<string> {
  const text = await extractText(fileUri);
  if (!text || text.trim().length < 10) {
    throw new Error('Native extraction returned no text');
  }
  return text.trim();
}

// ── JS fallback (regex + fflate) ─────────────────────────────────────────────

type CMap = Map<number, string>;

function bytesToLatin1(bytes: Uint8Array): string {
  let s = '';
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return s;
}

function hexToUtf16(hex: string): string {
  const clean = hex.replace(/\s/g, '');
  let out = '';
  for (let i = 0; i < clean.length; i += 4) {
    const code = parseInt(clean.slice(i, i + 4), 16);
    if (code) out += String.fromCodePoint(code);
  }
  return out || String.fromCharCode(parseInt(clean, 16));
}

function parseCMap(cmapText: string): CMap {
  const map: CMap = new Map();
  for (const block of cmapText.match(/beginbfchar([\s\S]*?)endbfchar/g) ?? []) {
    for (const m of block.matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) {
      map.set(parseInt(m[1], 16), hexToUtf16(m[2]));
    }
  }
  for (const block of cmapText.match(/beginbfrange([\s\S]*?)endbfrange/g) ?? []) {
    for (const m of block.matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) {
      let base = parseInt(m[3], 16);
      for (let c = parseInt(m[1], 16); c <= parseInt(m[2], 16); c++) {
        map.set(c, String.fromCodePoint(base++));
      }
    }
  }
  return map;
}

function findStreams(bytes: Uint8Array): { content: string; dict: string }[] {
  const results: { content: string; dict: string }[] = [];
  const text = bytesToLatin1(bytes);
  let match: RegExpExecArray | null;
  const re = /stream\r?\n/g;
  while ((match = re.exec(text)) !== null) {
    const start = match.index + match[0].length;
    const dict = text.slice(Math.max(0, match.index - 800), match.index);
    const end = text.indexOf('endstream', start);
    if (end === -1) continue;
    const raw = bytes.slice(start, end);
    if (dict.includes('/FlateDecode')) {
      try { results.push({ content: bytesToLatin1(inflateSync(raw)), dict }); continue; } catch {}
      try { results.push({ content: bytesToLatin1(inflateSync(raw.slice(0, -1))), dict }); } catch {}
    } else {
      results.push({ content: bytesToLatin1(raw), dict });
    }
  }
  return results;
}

function decodeLiteral(raw: string): string {
  return raw
    .replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t')
    .replace(/\\\(/g, '(').replace(/\\\)/g, ')').replace(/\\\\/g, '\\')
    .replace(/\\(\d{1,3})/g, (_, o: string) => String.fromCharCode(parseInt(o, 8)));
}

function decodeHex(hex: string, cmap: CMap | null): string {
  const clean = hex.replace(/\s/g, '');
  if (!cmap || cmap.size === 0) {
    let o = '';
    for (let i = 0; i < clean.length; i += 2) o += String.fromCharCode(parseInt(clean.slice(i, i + 2), 16));
    return o;
  }
  const size = clean.length >= 4 && cmap.has(parseInt(clean.slice(0, 4), 16)) ? 4 : 2;
  let o = '';
  for (let i = 0; i < clean.length; i += size) {
    const gid = parseInt(clean.slice(i, i + size), 16);
    o += cmap.get(gid) ?? (gid >= 32 && gid < 127 ? String.fromCharCode(gid) : '');
  }
  return o;
}

function extractOps(content: string, cmap: CMap | null): string {
  const chunks: string[] = [];
  for (const block of content.match(/BT[\s\S]*?ET/g) ?? []) {
    for (const m of block.matchAll(/\(([^)\\]*(?:\\.[^)\\]*)*)\)\s*(?:Tj|'|")/g)) {
      const t = decodeLiteral(m[1]); if (t) chunks.push(t);
    }
    for (const m of block.matchAll(/\[([^\]]*)\]\s*TJ/g)) {
      let p = '';
      for (const pt of m[1].matchAll(/\(([^)\\]*(?:\\.[^)\\]*)*)\)/g)) p += decodeLiteral(pt[1]);
      for (const pt of m[1].matchAll(/<([0-9a-fA-F\s]+)>/g)) p += decodeHex(pt[1], cmap);
      if (p) chunks.push(p);
    }
    for (const m of block.matchAll(/<([0-9a-fA-F\s]+)>\s*Tj/g)) {
      const t = decodeHex(m[1], cmap); if (t) chunks.push(t);
    }
  }
  return chunks.join(' ');
}

async function extractJS(fileUri: string): Promise<string> {
  const b64 = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.Base64 });
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

  const streams = findStreams(bytes);

  const merged: CMap = new Map();
  for (const { content } of streams) {
    if (content.includes('beginbfchar') || content.includes('beginbfrange')) {
      for (const [k, v] of parseCMap(content)) merged.set(k, v);
    }
  }

  const texts: string[] = [];
  for (const { content } of streams) {
    if (content.includes('BT')) {
      const t = extractOps(content, merged.size > 0 ? merged : null);
      if (t.trim()) texts.push(t);
    }
  }

  if (texts.length === 0) {
    const raw = extractOps(bin, null);
    if (raw.trim()) texts.push(raw);
  }

  const seen = new Set<string>();
  const unique = texts.filter(t => { const k = t.trim().slice(0, 100); if (seen.has(k)) return false; seen.add(k); return true; });

  const result = unique.join('\n').replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (!result || result.length < 10) throw new Error('No readable text found');
  return result;
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function extractTextFromPdf(fileUri: string): Promise<string> {
  // Try native first (PDFKit/PDFBox) — handles all standard PDFs
  if (isAvailable()) {
    try { return await extractNative(fileUri); } catch { /* fall through */ }
  }

  // JS fallback
  try { return await extractJS(fileUri); } catch {}

  throw new Error('Could not extract text. The PDF may be image-based or encrypted.');
}
