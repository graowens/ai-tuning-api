import { createHash } from 'crypto';

export interface SimilarBin {
  binPath: string;
  dir: string;
  sha1: string;
  similarity: number; // 0..1
}

export function computeChunkHashes(buf: Buffer, chunkSize = 2048): Set<string> {
  const hashes = new Set<string>();
  for (let i = 0; i < buf.length; i += chunkSize) {
    const end = Math.min(buf.length, i + chunkSize);
    const h = createHash('sha1').update(buf.subarray(i, end)).digest('hex');
    hashes.add(h);
  }
  return hashes;
}

// Sliding window k-gram hashes (shift tolerant)
export function computeKGramHashes(buf: Buffer, k = 64, step = 16): Set<string> {
  const hashes = new Set<string>();
  if (buf.length < k) return hashes;
  for (let i = 0; i <= buf.length - k; i += step) {
    const h = createHash('sha1').update(buf.subarray(i, i + k)).digest('hex');
    hashes.add(h);
  }
  return hashes;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}
