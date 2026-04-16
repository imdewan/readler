// NPZ / NPY parser for voices.npz.
// NPZ = ZIP archive of .npy files.
// NPY = NumPy array binary format (magic + header + raw data).

import { unzipSync } from 'fflate';

export interface NpyArray {
  shape: number[];
  data: Float32Array;
}

// Parse a single .npy buffer → { shape, data }
function parseNpy(buffer: ArrayBuffer): NpyArray {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // Magic: \x93NUMPY
  if (bytes[0] !== 0x93 || bytes[1] !== 0x4e /* N */ || bytes[2] !== 0x55 /* U */) {
    throw new Error('Not a valid .npy file');
  }

  const major = bytes[6];
  let headerLen: number;
  let dataOffset: number;

  if (major === 1) {
    headerLen = view.getUint16(8, true);
    dataOffset = 10 + headerLen;
  } else {
    // version 2.0: 4-byte header len
    headerLen = view.getUint32(8, true);
    dataOffset = 12 + headerLen;
  }

  const headerBytes = bytes.subarray(major === 1 ? 10 : 12, (major === 1 ? 10 : 12) + headerLen);
  const header = new TextDecoder().decode(headerBytes);

  // Extract shape: e.g.  'shape': (256, 512)  or  (512,)
  const shapeMatch = header.match(/'shape'\s*:\s*\(([^)]*)\)/);
  const shape: number[] = shapeMatch
    ? shapeMatch[1].split(',').map(s => s.trim()).filter(Boolean).map(Number)
    : [];

  const data = new Float32Array(buffer, dataOffset);
  return { shape, data };
}

// Parse a voices.npz buffer → map of voice key → NpyArray
export function parseNpz(buffer: ArrayBuffer): Map<string, NpyArray> {
  const zip = unzipSync(new Uint8Array(buffer));
  const voices = new Map<string, NpyArray>();

  for (const [filename, fileData] of Object.entries(zip)) {
    if (!filename.endsWith('.npy')) continue;
    const key = filename.replace(/\.npy$/, '');
    try {
      const arr = parseNpy(fileData.buffer.slice(
        fileData.byteOffset,
        fileData.byteOffset + fileData.byteLength,
      ) as ArrayBuffer);
      voices.set(key, arr);
    } catch {
      // Skip malformed entries
    }
  }

  return voices;
}

// Get a single style row for a voice at a given ref_id.
// ref_id is typically clamped to [0, nRows - 1].
export function getStyleVector(voices: Map<string, NpyArray>, voiceKey: string, refId: number): Float32Array {
  const arr = voices.get(voiceKey);
  if (!arr) throw new Error(`Voice key not found: ${voiceKey}`);

  const [nRows, styleDim] = arr.shape.length >= 2
    ? [arr.shape[0], arr.shape[1]]
    : [1, arr.data.length];

  const clampedId = Math.max(0, Math.min(refId, nRows - 1));
  const start = clampedId * styleDim;
  return arr.data.slice(start, start + styleDim);
}
