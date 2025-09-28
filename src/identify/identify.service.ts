import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { A2lIndexService } from '../a2l-index/a2l-index.service';
import { extractAsciiStrings, tokenizeStrings, extractPartNumbers, extractSwIds } from '../utils/ascii';
import type { Express } from 'express';
import type { MatchResult } from '../common/types';

@Injectable()
export class IdentifyService {
  constructor(private readonly index: A2lIndexService) {}

  async identify(file: Express.Multer.File) {
    if (!file?.buffer) {
      return { ok: false, error: 'No file provided' };
    }

    const buf = file.buffer;
    const sha1 = createHash('sha1').update(buf).digest('hex');

    // Tier 0: exact BIN hash ⇒ A2L(s)
    const exactPaths = this.index.findByBinHash(sha1);

    // Extract tokens from upload
    const ascii = extractAsciiStrings(buf);
    const tokens = tokenizeStrings(ascii);
    const partNumbers = new Set(Array.from(extractPartNumbers(ascii)).map((x) => x.toLowerCase()));
    const swIds = new Set(Array.from(extractSwIds(ascii)).map((x) => x.toLowerCase()));
    const nameTokens = tokenizeStrings([file.originalname ?? '']);

    const results: MatchResult[] = [];
    const seen = new Set<string>();

    // Exact matches: strong score
    for (const p of exactPaths) {
      const meta = this.index.getA2lByPath(p);
      if (!meta) continue;
      results.push({
        a2lPath: meta.a2lPath,
        label: meta.label,
        score: 100,
        reasons: [`Exact BIN hash match: ${sha1}`],
        hits: [],
      });
      seen.add(meta.a2lPath);
    }

    // Tier 1: similar BINs (fixed chunks)
    const simByChunks = this.index.findSimilarBinsByChunks(buf, { topK: 5 });
    for (const sb of simByChunks) {
      const a2lPaths = this.index.getAssociatedA2lsForBinHash(sb.sha1);
      for (const p of a2lPaths) {
        if (seen.has(p)) continue;
        const meta = this.index.getA2lByPath(p);
        if (!meta) continue;
        const score = Math.round(sb.similarity * 60); // up to 60 pts
        results.push({
          a2lPath: meta.a2lPath,
          label: meta.label,
          score,
          reasons: [
            `Similar to known BIN (fixed chunks): ${Math.round(sb.similarity * 100)}%`,
            `BIN: ${sb.binPath}`,
          ],
          hits: [],
        });
        seen.add(p);
      }
    }

    // Tier 2: similar BINs (k-grams, shift tolerant)
    const simByK = this.index.findSimilarBinsByKgrams(buf, { topK: 5 });
    for (const sb of simByK) {
      const a2lPaths = this.index.getAssociatedA2lsForBinHash(sb.sha1);
      for (const p of a2lPaths) {
        if (seen.has(p)) continue;
        const meta = this.index.getA2lByPath(p);
        if (!meta) continue;
        const score = Math.round(sb.similarity * 70); // up to 70 pts
        results.push({
          a2lPath: meta.a2lPath,
          label: meta.label,
          score,
          reasons: [
            `Similar to known BIN (k-grams): ${Math.round(sb.similarity * 100)}%`,
            `BIN: ${sb.binPath}`,
          ],
          hits: [],
        });
        seen.add(p);
      }
    }

    // Tier 3: BIN ASCII token overlap
    const simByTokens = this.index.findSimilarBinsByTokens(tokens, 5);
    for (const sb of simByTokens) {
      const a2lPaths = this.index.getAssociatedA2lsForBinHash(sb.sha1);
      for (const p of a2lPaths) {
        if (seen.has(p)) continue;
        const meta = this.index.getA2lByPath(p);
        if (!meta) continue;
        const score = Math.round(sb.similarity * 50); // up to 50 pts
        results.push({
          a2lPath: meta.a2lPath,
          label: meta.label,
          score,
          reasons: [
            `Similar BIN by ASCII tokens: ${Math.round(sb.similarity * 100)}%`,
            `BIN: ${sb.binPath}`,
          ],
          hits: [],
        });
        seen.add(p);
      }
    }

    // Tier 4: metadata vs A2L files
    for (const meta of this.index.findA2ls()) {
      if (seen.has(meta.a2lPath)) continue;
      let score = 0;
      const reasons: string[] = [];
      const hits: string[] = [];

      if (nameTokens.has(meta.label.toLowerCase())) {
        score += 15;
        reasons.push(`Filename token matched label '${meta.label}'`);
        hits.push(meta.label);
      }
      const dirBase = meta.dir.split(/[\\/]/).pop() ?? '';
      if (dirBase && nameTokens.has(dirBase.toLowerCase())) {
        score += 10;
        reasons.push(`Filename token matched folder '${dirBase}'`);
        hits.push(dirBase);
      }

      const idHits = intersectCounts(tokens, meta.identifiers, 25);
      if (idHits.count > 0) {
        score += idHits.count * 4;
        reasons.push(`Matched ${idHits.count} identifier token(s)`);
        hits.push(...idHits.examples);
      }

      const pnHits = intersectCounts(partNumbers, meta.partNumbers, 10);
      if (pnHits.count > 0) {
        score += pnHits.count * 8;
        reasons.push(`Matched ${pnHits.count} part number(s)`);
        hits.push(...pnHits.examples);
      }

      const swHits = intersectCounts(swIds, meta.swIds, 10);
      if (swHits.count > 0) {
        score += swHits.count * 10;
        reasons.push(`Matched ${swHits.count} SW ID(s)`);
        hits.push(...swHits.examples);
      }

      if (score > 0) {
        results.push({ a2lPath: meta.a2lPath, label: meta.label, score, reasons, hits });
      }
    }

    results.sort((a, b) => b.score - a.score);
    const top = results.slice(0, 5);

    if (top.length === 0) {
      return {
        ok: true,
        sha1,
        receivedBytes: buf.length,
        matches: [],
        debug: {
          dataRoot: this.index.getRoot(),
          indexed: { a2ls: this.index.findA2ls().length, bins: this.index.findBins().length },
          notes: [
            'No candidates found. Verify DATA_ROOT and that the indexer ran at startup.',
            'Increase k-gram sensitivity with SIM_KGRAM_STEP=8 in .env and restart.',
          ],
        },
      };
    }

    return { ok: true, sha1, receivedBytes: buf.length, matches: top };
  }
}

function intersectCounts(a: Set<string>, b: Set<string>, maxExamples: number) {
  const examples: string[] = [];
  let count = 0;
  for (const x of a) {
    if (b.has(x)) {
      count++;
      if (examples.length < maxExamples) examples.push(x);
    }
  }
  return { count, examples };
}
