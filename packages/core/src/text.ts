/** Lightweight, dependency-free text utilities for semantic-ish matching. */

const STOPWORDS = new Set(
  `a an the and or but if then else when while of to in on at by for with from into onto as is are was were be been being
  this that these those it its it's he she they them we you your our their his her i me my mine us
  can could should would will shall may might must do does did done have has had not no yes so than too very just
  all any each every some such only own same other more most less least few many much
  user users able allow allows allowed via per also about after before during over under again further once here there
  what which who whom why how where new using use used make made get gets got see shown show shows
  given then story task epic as want so that acceptance criteria`.split(/\s+/),
);

/** Very small suffix stripper — good enough to match retry/retries/retried. */
export function stem(word: string): string {
  let w = word;
  if (w.length > 5 && w.endsWith('ies')) w = w.slice(0, -3) + 'y';
  else if (w.length > 5 && w.endsWith('ied')) w = w.slice(0, -3) + 'y';
  else if (w.length > 5 && w.endsWith('ing')) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith('ed')) w = w.slice(0, -2);
  else if (w.length > 4 && w.endsWith('es') && !w.endsWith('ses')) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
  return w;
}

export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z][a-z0-9]+/g) ?? [])
    .filter((t) => !STOPWORDS.has(t) && t.length > 2)
    .map(stem);
}

export type Vector = Map<string, number>;

export class TfIdf {
  private df = new Map<string, number>();
  private docs = 0;

  constructor(corpus: string[]) {
    for (const doc of corpus) {
      this.docs++;
      for (const t of new Set(tokenize(doc))) this.df.set(t, (this.df.get(t) ?? 0) + 1);
    }
  }

  vector(text: string): Vector {
    const tf = new Map<string, number>();
    for (const t of tokenize(text)) tf.set(t, (tf.get(t) ?? 0) + 1);
    const v: Vector = new Map();
    for (const [t, n] of tf) {
      const idf = Math.log((this.docs + 1) / ((this.df.get(t) ?? 0) + 1)) + 1;
      v.set(t, (1 + Math.log(n)) * idf);
    }
    return v;
  }
}

export function cosine(a: Vector, b: Vector): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const [, x] of a) na += x * x;
  for (const [, y] of b) nb += y * y;
  const [small, big] = a.size < b.size ? [a, b] : [b, a];
  for (const [t, x] of small) {
    const y = big.get(t);
    if (y) dot += x * y;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/** Top shared terms between two vectors (for explainability). */
export function sharedTerms(a: Vector, b: Vector, n = 4): string[] {
  const out: [string, number][] = [];
  for (const [t, x] of a) {
    const y = b.get(t);
    if (y) out.push([t, x * y]);
  }
  return out
    .sort((p, q) => q[1] - p[1])
    .slice(0, n)
    .map(([t]) => t);
}

/** FNV-1a 32-bit — stable content hash for drift detection and ids. */
export function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function excerpt(text: string, needle: RegExp, radius = 90): string | undefined {
  const m = needle.exec(text);
  if (!m) return undefined;
  const start = Math.max(0, m.index - radius);
  const end = Math.min(text.length, m.index + m[0].length + radius);
  return (start > 0 ? '…' : '') + text.slice(start, end).replace(/\s+/g, ' ').trim() + (end < text.length ? '…' : '');
}

/** Split text into sentences / bullet lines. */
export function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.replace(/^[\s*•\-–\d.)]+/, '').trim())
    .filter((s) => s.length > 3);
}

export function htmlToText(html: string): string {
  return html
    .replace(/<\s*(br|\/p|\/li|\/h\d|\/tr|\/div)\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .trim();
}
