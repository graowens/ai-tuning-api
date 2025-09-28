export function extractAsciiStrings(buf: Buffer, minLen = 4): string[] {
  const out: string[] = [];
  let cur = '';
  for (const b of buf) {
    if (b >= 32 && b <= 126) cur += String.fromCharCode(b);
    else {
      if (cur.length >= minLen) out.push(cur);
      cur = '';
    }
  }
  if (cur.length >= minLen) out.push(cur);
  return out;
}

export function tokenizeStrings(strings: string[]): Set<string> {
  const tokens = new Set<string>();
  for (const s of strings) {
    // Split on non-alphanumeric; keep underscores and dashes as delimiters
    for (const t of s.split(/[^A-Za-z0-9]+/)) {
      const tt = t.trim();
      if (tt.length >= 4) tokens.add(tt.toLowerCase());
    }
  }
  return tokens;
}

// Specialized extractors for ECU-style patterns
export function extractPartNumbers(strings: string[]): Set<string> {
  const out = new Set<string>();
  const re = /\b(?:0[0-9A-Z]{1}[A-Z0-9]{8,}|03L9\d{6}[A-Z]{0,2}|0769\d{6}[A-Z]{0,2})\b/g; // broad match
  for (const s of strings) {
    const m = s.match(re);
    if (m) m.forEach((x) => out.add(x));
  }
  return out;
}

export function extractSwIds(strings: string[]): Set<string> {
  const out = new Set<string>();
  const re = /\b1037\d{4,}\b/g; // matches SW IDs like 1037508389
  for (const s of strings) {
    const m = s.match(re);
    if (m) m.forEach((x) => out.add(x));
  }
  return out;
}
