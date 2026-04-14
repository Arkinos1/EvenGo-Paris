/**
 * Escape HTML special characters to prevent XSS
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Normalize text for fuzzy matching:
 * - Remove accents
 * - Replace special apostrophes with space
 * - Lowercase
 * - Collapse whitespace
 */
export function normalizeText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // Remove accent marks
    .replace(/[''`´-]/g, ' ')          // Replace apostrophes/dashes with space
    .toLowerCase()
    .replace(/\s+/g, ' ')              // Collapse whitespace
    .trim();
}

/**
 * Simple Levenshtein distance for fuzzy matching
 */
export function levenshteinDistance(left: string, right: string): number {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;

  const memo: number[][] = [];

  for (let i = 0; i <= left.length; i++) {
    memo[i] = [i];
  }
  for (let j = 0; j <= right.length; j++) {
    if (!memo[0]) memo[0] = [];
    memo[0][j] = j;
  }

  for (let i = 1; i <= left.length; i++) {
    for (let j = 1; j <= right.length; j++) {
      const memoI = memo[i];
      const memoIm1 = memo[i - 1];
      if (!memoI || !memoIm1) continue;

      const insertion = (memoI[j - 1] ?? 0) + 1;
      const deletion = (memoIm1[j] ?? 0) + 1;
      const substitution = (memoIm1[j - 1] ?? 0) + (left[i - 1] === right[j - 1] ? 0 : 1);
      memoI[j] = Math.min(insertion, deletion, substitution);
    }
  }

  const final = memo[left.length];
  return final?.[right.length] ?? 0;
}

/**
 * Generate a UUID v4
 */
export function generateUUID(): string {
  try {
    if (typeof globalThis.crypto?.randomUUID === 'function') {
      return globalThis.crypto.randomUUID();
    }
  } catch {
    // Fall back below.
  }

  try {
    if (typeof globalThis.crypto?.getRandomValues === 'function') {
      const bytes = new Uint8Array(16);
      globalThis.crypto.getRandomValues(bytes);
      const b6 = bytes[6] ?? 0;
      const b8 = bytes[8] ?? 0;
      bytes[6] = (b6 & 0x0f) | 0x40;
      bytes[8] = (b8 & 0x3f) | 0x80;
      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }
  } catch {
    // Final fallback below.
  }

  const ts = Date.now().toString(16);
  const rand = Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
  return `${ts.slice(-8)}-${rand.slice(0, 4)}-4${rand.slice(4, 7)}-a${rand.slice(0, 3)}-${(ts + rand).slice(-12)}`;
}
