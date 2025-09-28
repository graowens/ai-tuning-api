export interface A2lMeta {
  a2lPath: string;
  label: string;
  dir: string;
  identifiers: Set<string>;
  partNumbers: Set<string>;
  swIds: Set<string>;
  sizeBytes?: number;
}

export interface BinMeta {
  binPath: string;
  sha1: string;
  dir: string;
  associatedA2lPaths: string[];
  asciiTokens: Set<string>;
  chunkHashes: Set<string>;
  kgramHashes: Set<string>;
  sizeBytes?: number;
}

export interface MatchResult {
  a2lPath: string;
  label: string;
  score: number;
  reasons: string[];
  hits: string[];
}
