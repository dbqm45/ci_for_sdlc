import type { Claim, ClaimAttribute, ClaimPackId, Evidence } from '../model.js';
import { hash, sentences } from '../text.js';

/**
 * Claim extraction — normalizes free text into comparable statements so that
 * conflicts can be detected across Jira, Confluence, Figma and decisions.
 * Deterministic; the semantic AI layer can add claims it finds on top.
 *
 * The vocabulary comes in packs per domain (docs/CLAIM-PACKS-PLAN.md): the subjects a sentence can be about and the
 * extractors of the attributes. `GENERAL_CLAIM_PACK` below is the default; `claim-pack-ev.ts` adds EV charging.
 */

export interface ClaimExtractor {
  attribute: ClaimAttribute;
  /** Returns [value, unit?, subject?] or undefined; a subject here wins over the sentence's. */
  match: (s: string) => [string | number | boolean, string?, string?] | undefined;
}

export interface ClaimPack {
  id: ClaimPackId;
  label: string;
  /** In order: the first that matches a sentence is its subject. */
  subjects: [string, RegExp][];
  extractors: ClaimExtractor[];
}

export const GENERAL_SUBJECTS: [string, RegExp][] = [
  ['refund', /\brefund/i],
  ['payment', /\b(payment|charge|checkout|pay)\w*/i],
  ['session', /\bsession/i],
  ['upload', /\b(upload|file)/i],
  ['card', /\b(card|payment method)s?\b/i],
  ['order', /\border/i],
];

/** Normalize a label / space / domain name into a claim subject. */
export function normalizeSubject(x: string, pack: ClaimPack = GENERAL_CLAIM_PACK): string {
  for (const [name, re] of pack.subjects) if (re.test(x)) return name;
  return x.toLowerCase().replace(/s$/, '') || 'general';
}

function subjectOf(sentence: string, fallback: string, pack: ClaimPack): string {
  for (const [name, re] of pack.subjects) if (re.test(sentence)) return name;
  return fallback;
}

const UNIT_SECONDS: Record<string, number> = { ms: 0.001, millisecond: 0.001, s: 1, sec: 1, second: 1, min: 60, minute: 60, h: 3600, hour: 3600 };
function toSeconds(n: number, unit: string): number {
  const u = unit.toLowerCase().replace(/s$/, '');
  return Math.round(n * (UNIT_SECONDS[u] ?? UNIT_SECONDS[u + 's'] ?? 1) * 1000) / 1000;
}

export const GENERAL_EXTRACTORS: ClaimExtractor[] = [
  {
    attribute: 'timeout',
    match: (s) => {
      if (/session/i.test(s)) return undefined; // handled by session_lifetime
      const a = /time[- ]?out[^.\d]{0,40}?(\d+(?:\.\d+)?)\s*(ms|milliseconds?|s|secs?|seconds?|min|minutes?)\b/i.exec(s);
      const b = /(\d+(?:\.\d+)?)\s*(ms|milliseconds?|s|secs?|seconds?|min|minutes?)\s*time[- ]?out/i.exec(s);
      const c = /(?:does not|doesn't|do not|no) respon\w*\s*within\s*(\d+(?:\.\d+)?)\s*(ms|milliseconds?|s|secs?|seconds?|min|minutes?)\b/i.exec(s);
      const d = /(?:TIMEOUT|timeout)\w*\s*[=:]\s*(\d+)\s*(ms)?/.exec(s);
      const m = a ?? b ?? c;
      if (m) return [toSeconds(Number(m[1]), m[2]!), 's'];
      if (d) return [d[2] ? toSeconds(Number(d[1]), 'ms') : Number(d[1]), 's'];
      return undefined;
    },
  },
  {
    attribute: 'retry_limit',
    match: (s) => {
      if (!/retr|attempt|tr(?:y|ies) again/i.test(s)) return undefined;
      if (/unlimited|any number of|as many times/i.test(s)) return ['unlimited'];
      const m =
        /(?:up to|max(?:imum)?(?: of)?|at most|limit(?:ed)? (?:of|to)|no more than)\s*(\d+|one|two|three|four|five)\s*(?:\w+\s){0,2}?(?:retries|retry attempts|attempts|times|tries)/i.exec(s) ??
        /(\d+|one|two|three|four|five)\s*(?:retries|retry attempts)\b/i.exec(s) ??
        /retry limit (?:of |is |= ?)?(\d+)/i.exec(s);
      return m ? [wordNum(m[1]!)] : undefined;
    },
  },
  {
    attribute: 'idempotent',
    match: (s) => {
      if (/\b(not idempotent|non-idempotent|without (?:an )?idempotency|no idempotency|accepts? repeated|creates? a new (?:charge|payment) (?:for )?each)/i.test(s)) return [false];
      if (/\b(must be|is|are|shall be|guaranteed to be) idempotent|idempotency[- ]key|deduplicat/i.test(s)) return [true];
      return undefined;
    },
  },
  {
    attribute: 'processing_mode',
    match: (s) => {
      if (/\b(asynchronous(?:ly)?|async|processed in the background|202 accepted|via webhook|eventually consistent|status is polled|poll(?:s|ing)? (?:for )?(?:the )?status)\b/i.test(s)) return ['async'];
      if (/\b(synchronous(?:ly)?|immediate (?:response|result|confirmation)|final result (?:is )?returned immediately|returns the final (?:status|result))\b/i.test(s)) return ['sync'];
      return undefined;
    },
  },
  {
    attribute: 'session_lifetime',
    match: (s) => {
      const m = /session[^.\d]{0,40}?(\d+)\s*(min|minutes?|h|hours?)\b/i.exec(s);
      return m && /expir|lifetime|time[- ]?out|valid/i.test(s) ? [toSeconds(Number(m[1]), m[2]!) / 60, 'min'] : undefined;
    },
  },
  {
    attribute: 'max_items',
    match: (s) => {
      const m = /(?:max(?:imum)?(?: of)?|up to|at most|no more than|limit(?:ed)? to)\s*(\d+)\s*(?:saved\s+)?(cards|payment methods|methods|items|addresses)/i.exec(s);
      return m ? [Number(m[1]), m[2]!.toLowerCase()] : undefined;
    },
  },
  {
    attribute: 'max_file_size',
    match: (s) => {
      if (!/upload|file|attachment/i.test(s)) return undefined;
      const m = /(\d+(?:\.\d+)?)\s*(KB|MB|GB)\b/i.exec(s);
      if (!m) return undefined;
      const mult = { kb: 1 / 1024, mb: 1, gb: 1024 }[m[2]!.toLowerCase() as 'kb' | 'mb' | 'gb'];
      return [Number(m[1]) * mult, 'MB'];
    },
  },
];

/** Today's checkout vocabulary: the default for every project. */
export const GENERAL_CLAIM_PACK: ClaimPack = { id: 'general', label: 'General (web products, checkout)', subjects: GENERAL_SUBJECTS, extractors: GENERAL_EXTRACTORS };

function wordNum(x: string): number {
  const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };
  return words[x.toLowerCase()] ?? Number(x);
}

export function extractClaims(
  text: string,
  evidence: Omit<Evidence, 'excerpt'>,
  opts: { defaultSubject: string; updatedAt?: string; confidence?: Claim['confidence']; pack?: ClaimPack },
): Claim[] {
  const pack = opts.pack ?? GENERAL_CLAIM_PACK;
  const out: Claim[] = [];
  const seen = new Set<string>();
  for (const s of sentences(text)) {
    for (const ex of pack.extractors) {
      const m = ex.match(s);
      if (!m) continue;
      const subject = m[2] ?? subjectOf(s, opts.defaultSubject, pack);
      const sig = `${subject}|${ex.attribute}|${String(m[0])}`;
      if (seen.has(sig)) continue;
      seen.add(sig);
      out.push({
        id: hash(`${evidence.entityId}|${sig}`),
        subject,
        attribute: ex.attribute,
        value: m[0],
        unit: m[1],
        text: s.length > 220 ? s.slice(0, 217) + '…' : s,
        evidence: { ...evidence, excerpt: s.length > 220 ? s.slice(0, 217) + '…' : s },
        updatedAt: opts.updatedAt,
        confidence: opts.confidence ?? 'high',
      });
    }
  }
  return out;
}

export function formatClaimValue(c: Pick<Claim, 'attribute' | 'value' | 'unit'>): string {
  if (typeof c.value === 'boolean') return c.attribute === 'idempotent' ? (c.value ? 'idempotent' : 'not idempotent') : String(c.value);
  if (c.unit === 's') return `${c.value} s`;
  return c.unit ? `${c.value} ${c.unit}` : String(c.value);
}

export const ATTRIBUTE_LABELS: Record<ClaimAttribute, string> = {
  timeout: 'timeout',
  retry_limit: 'retry limit',
  idempotent: 'idempotency',
  processing_mode: 'processing mode',
  session_lifetime: 'session lifetime',
  max_items: 'item limit',
  max_file_size: 'max file size',
  min_length: 'minimum length',
  max_length: 'maximum length',
  power: 'power',
  energy: 'energy',
  ocpp_version: 'OCPP version',
  uptime_target: 'uptime target',
  uptime_definition: 'uptime definition',
  connector_status: 'connector status',
};

export interface ClaimConflict {
  subject: string;
  attribute: ClaimAttribute;
  claims: Claim[];
  values: string[];
}

/** Group claims by subject+attribute and report groups with >1 distinct value. */
export function findConflicts(claims: Claim[]): ClaimConflict[] {
  const groups = new Map<string, Claim[]>();
  for (const c of claims) {
    const k = `${c.subject}|${c.attribute}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(c);
  }
  const out: ClaimConflict[] = [];
  for (const [k, cs] of groups) {
    const values = [...new Set(cs.map((c) => formatClaimValue(c)))];
    const entities = new Set(cs.map((c) => c.evidence.entityId));
    if (values.length > 1 && entities.size > 1) {
      const [subject = '', attribute = ''] = k.split('|');
      out.push({ subject, attribute: attribute as ClaimAttribute, claims: cs, values });
    }
  }
  return out;
}
