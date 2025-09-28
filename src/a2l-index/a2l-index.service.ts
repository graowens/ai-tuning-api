import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { createHash } from 'crypto';
import { A2lMeta, BinMeta } from '../common/types';
import { extractAsciiStrings, tokenizeStrings, extractPartNumbers, extractSwIds } from '../utils/ascii';
import { computeChunkHashes, computeKGramHashes, jaccard, SimilarBin } from '../utils/chunk-sim';

const DEFAULT_CHUNK_SIZE = parseInt(process.env.SIM_CHUNK_SIZE ?? '2048', 10) || 2048;
const DEFAULT_K = parseInt(process.env.SIM_KGRAM_K ?? '64', 10) || 64;
const DEFAULT_STEP = parseInt(process.env.SIM_KGRAM_STEP ?? '16', 10) || 16;

@Injectable()
export class A2lIndexService implements OnModuleInit {
  private readonly logger = new Logger(A2lIndexService.name);
  private root!: string;

  private a2ls: A2lMeta[] = [];
  private bins: BinMeta[] = [];
  private binHashToA2l = new Map<string, string[]>();
  private dirA2lMap = new Map<string, string[]>();

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    this.root = this.config.get<string>('DATA_ROOT') ?? '';
    if (!this.root) {
      this.logger.warn('DATA_ROOT is not set. Set it in .env to your data folder.');
      return;
    }
    if (!fs.existsSync(this.root)) {
      this.logger.warn(`DATA_ROOT does not exist: ${this.root}`);
      return;
    }
    this.logger.log(`Indexing from DATA_ROOT: ${this.root}`);
    const t0 = Date.now();
    await this.scanRecursive(this.root);
    await this.postIndexAssociations();
    const t1 = Date.now();
    this.logger.log(`Indexed ${this.a2ls.length} A2L(s), ${this.bins.length} BIN(s) in ${t1 - t0} ms`);
    // Sanity sample
    if (this.a2ls.length) this.logger.log(`Sample A2L: ${this.a2ls[0].a2lPath}`);
    if (this.bins.length) this.logger.log(`Sample BIN: ${this.bins[0].binPath}`);
  }

  private async scanRecursive(dir: string): Promise<void> {
    let entries: fs.Dirent[];
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch (e) {
      this.logger.warn(`Cannot read dir ${dir}: ${String(e)}`);
      return;
    }

    const localA2ls: string[] = [];
    const subdirs: string[] = [];

    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        subdirs.push(full);
        continue;
      }
      const lower = e.name.toLowerCase();
      if (lower.endsWith('.a2l')) localA2ls.push(full);
    }

    if (localA2ls.length > 0) {
      this.dirA2lMap.set(dir, localA2ls);
      for (const a2lPath of localA2ls) {
        const meta = await this.parseA2lMeta(a2lPath, dir);
        this.a2ls.push(meta);
      }
    }

    for (const e of entries) {
      if (!e.isFile()) continue;
      const full = path.join(dir, e.name);
      const lower = e.name.toLowerCase();

      if (lower.endsWith('.bin')) {
        const buf = await fsp.readFile(full);
        const sha1 = createHash('sha1').update(buf).digest('hex');
        const ascii = extractAsciiStrings(buf);
        const asciiTokens = tokenizeStrings(ascii);
        const chunkHashes = computeChunkHashes(buf, DEFAULT_CHUNK_SIZE);
        const kgramHashes = computeKGramHashes(buf, DEFAULT_K, DEFAULT_STEP);
        const bm: BinMeta = {
          binPath: full,
          sha1,
          dir,
          associatedA2lPaths: [],
          asciiTokens,
          chunkHashes,
          kgramHashes,
          sizeBytes: buf.length,
        };
        this.bins.push(bm);
      }
    }

    await Promise.all(subdirs.map((d) => this.scanRecursive(d)));
  }

  private async parseA2lMeta(a2lPath: string, dir: string): Promise<A2lMeta> {
    let text = '';
    try {
      text = await fsp.readFile(a2lPath, 'utf-8');
    } catch (e) {
      this.logger.warn(`Cannot read A2L ${a2lPath}: ${String(e)}`);
    }

    const label = path.basename(a2lPath).replace(/\.[Aa]2[Ll]$/, '');
    const identifiers = new Set<string>();
    const partNumbers = new Set<string>();
    const swIds = new Set<string>();

    const quoted = Array.from(text.matchAll(/"(.*?)"/g)).map((m) => m[1]);
    const keywordLines = text
      .split(/\r?\n/)
      .filter((ln) => /\b(PROJECT|MODULE|VERSION|ECU|USER|FUNCTION)\b/i.test(ln));

    const baseStrings = quoted.concat(keywordLines);
    const tokens = Array.from(tokenizeStrings(baseStrings));
    for (const t of tokens) identifiers.add(t);

    for (const p of extractPartNumbers(baseStrings)) partNumbers.add(p.toLowerCase());
    for (const s of extractSwIds(baseStrings)) swIds.add(s.toLowerCase());

    const sidecars = ['EPK.txt', 'ident.txt', 'minmax.csv'];
    for (const sc of sidecars) {
      const scPath = path.join(dir, sc);
      if (fs.existsSync(scPath)) {
        try {
          const scText = await fsp.readFile(scPath, 'utf-8');
          for (const t of tokenizeStrings([scText])) identifiers.add(t);
          for (const p of extractPartNumbers([scText])) partNumbers.add(p.toLowerCase());
          for (const s of extractSwIds([scText])) swIds.add(s.toLowerCase());
        } catch { /* ignore */ }
      }
    }

    const sizeBytes = Buffer.byteLength(text, 'utf-8');
    return { a2lPath, label, dir, identifiers, partNumbers, swIds, sizeBytes };
  }

  private async postIndexAssociations(): Promise<void> {
    for (const b of this.bins) {
      const a2ls = this.findNearestA2ls(b.dir);
      b.associatedA2lPaths = a2ls;
      if (a2ls.length > 0) this.binHashToA2l.set(b.sha1, a2ls);
    }
  }

  private findNearestA2ls(startDir: string): string[] {
    let dir = startDir;
    for (;;) {
      const a2ls = this.dirA2lMap.get(dir);
      if (a2ls && a2ls.length > 0) return a2ls;
      const parent = path.dirname(dir);
      if (!parent || parent === dir) return [];
      dir = parent;
    }
  }

  // Public API
  getRoot() { return this.root; }
  findA2ls() { return this.a2ls; }
  findBins() { return this.bins; }
  getA2lByPath(p: string) { return this.a2ls.find((x) => x.a2lPath === p); }
  findByBinHash(hash: string) { return this.binHashToA2l.get(hash) ?? []; }
  getAssociatedA2lsForBinHash(sha1: string): string[] {
    return this.binHashToA2l.get(sha1) ?? [];
  }

  findSimilarBinsByChunks(buf: Buffer, opts?: { chunkSize?: number; topK?: number }): SimilarBin[] {
    const chunkSize = opts?.chunkSize ?? DEFAULT_CHUNK_SIZE;
    const upSig = computeChunkHashes(buf, chunkSize);
    const scored: SimilarBin[] = [];
    for (const b of this.bins) {
      const sim = jaccard(upSig, b.chunkHashes);
      if (sim > 0) scored.push({ binPath: b.binPath, dir: b.dir, sha1: b.sha1, similarity: sim });
    }
    scored.sort((a, b) => b.similarity - a.similarity);
    return scored.slice(0, opts?.topK ?? 5);
  }

  findSimilarBinsByKgrams(buf: Buffer, opts?: { k?: number; step?: number; topK?: number }): SimilarBin[] {
    const k = opts?.k ?? DEFAULT_K;
    const step = opts?.step ?? DEFAULT_STEP;
    const upSig = computeKGramHashes(buf, k, step);
    const scored: SimilarBin[] = [];
    for (const b of this.bins) {
      const sim = jaccard(upSig, b.kgramHashes);
      if (sim > 0) scored.push({ binPath: b.binPath, dir: b.dir, sha1: b.sha1, similarity: sim });
    }
    scored.sort((a, b) => b.similarity - a.similarity);
    return scored.slice(0, opts?.topK ?? 5);
  }

  // ASCII token overlap vs known BINs
  findSimilarBinsByTokens(uploadTokens: Set<string>, topK = 5): SimilarBin[] {
    const scored: SimilarBin[] = [];
    for (const b of this.bins) {
      const { count, denom } = overlap(uploadTokens, b.asciiTokens);
      if (count > 0 && denom > 0) {
        const sim = count / denom;
        scored.push({ binPath: b.binPath, dir: b.dir, sha1: b.sha1, similarity: sim });
      }
    }
    scored.sort((a, b) => b.similarity - a.similarity);
    return scored.slice(0, topK);
  }
}

function overlap(a: Set<string>, b: Set<string>) {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const denom = Math.min(a.size, b.size) || 1;
  return { count: inter, denom };
}
