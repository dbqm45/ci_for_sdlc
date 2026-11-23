/**
 * D9 (docs/PDI-D9-PLAN.md): a read-only copy of the suite decision index in pdi, made from `pdi-records changes`
 * (pdi D7), so that DI Definition shows decisions taken elsewhere in the suite (gates in pdi, the factory's decisions in
 * repositories, DI Release) next to the findings and questions they may concern. Pure functions; the server fetches.
 */

/** A decision of another application of the suite, as the copy keeps it (without the Decision Record file). */
export interface SuiteDecision {
  id: string;
  statement: string;
  why?: string;
  /** `recorded` binds; `superseded` stays in the copy so it never looks binding. */
  status: string;
  supersededBy?: string;
  /** The owner: `origin.app`, or `pdi` for a decision taken in pdi itself. */
  app: string;
  scope?: string;
  localId?: string;
  type?: string;
  decidedAt?: string;
  decidedBy?: string;
  /** The CHG of the decision (`links.chg`). */
  change?: string;
  /** The owner's page of the decision (https only). */
  link?: string;
  changedAt?: string;
}

export interface SuiteDecisionCache {
  /** The cursor of the last page (`<changed_at>/<DEC-n>`), for the next `--since`. */
  next?: string;
  fetchedAt?: string;
  /** Why the last refresh failed; absent after a good one. */
  error?: string;
  decisions: SuiteDecision[];
}

const ID = /^[A-Z][A-Z0-9]+-[0-9]+$/;
const MAX_TEXT = 2000;
/** Decisions of DI Definition itself are here already. */
const OWN_APP = 'ci_for_sdlc';

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown, max = MAX_TEXT) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);
const https = (v: unknown) => (typeof v === 'string' && v.startsWith('https://') && v.length <= MAX_TEXT ? v : undefined);

/** One entry of `pdi-records changes`, checked; undefined when it is not a decision this copy can show. */
export function suiteDecisionOf(raw: unknown): SuiteDecision | undefined {
  if (!isRecord(raw) || typeof raw.id !== 'string' || !ID.test(raw.id)) return undefined;
  const statement = text(raw.statement);
  if (!statement) return undefined;
  const origin = isRecord(raw.origin) ? raw.origin : {};
  const source = isRecord(raw.source) ? raw.source : {};
  const links = isRecord(raw.links) ? raw.links : {};
  const out: SuiteDecision = { id: raw.id, statement, status: text(raw.status, 40) ?? 'recorded', app: text(origin.app, 40) ?? 'pdi' };
  const add = <K extends keyof SuiteDecision>(k: K, v: SuiteDecision[K] | undefined) => {
    if (v !== undefined) out[k] = v;
  };
  add('why', text(raw.why));
  add('supersededBy', typeof raw.superseded_by === 'string' && ID.test(raw.superseded_by) ? raw.superseded_by : undefined);
  add('scope', text(origin.scope, 200));
  add('localId', text(origin.local_id, 200));
  add('type', text(raw.decision_type, 200));
  add('decidedAt', text(raw.decided_at, 40));
  add('decidedBy', text(raw.decided_by, 200));
  add('change', typeof links.chg === 'string' && ID.test(links.chg) ? links.chg : undefined);
  add('link', https(origin.url) ?? https(source.url));
  add('changedAt', text(raw.changed_at, 40));
  return out;
}

/** The copy after one page: changed decisions replaced in place, new ones appended, our own skipped. */
export function mergeSuiteDecisions(cache: SuiteDecisionCache, page: unknown[], next: string | undefined, at: string): SuiteDecisionCache {
  const decisions = [...cache.decisions];
  for (const raw of page) {
    const d = suiteDecisionOf(raw);
    if (!d || d.app === OWN_APP) continue;
    const i = decisions.findIndex((x) => x.id === d.id);
    if (i >= 0) decisions[i] = d;
    else decisions.push(d);
  }
  return { decisions, fetchedAt: at, ...((next ?? cache.next) && { next: next ?? cache.next }) };
}

/**
 * The decisions of a change (`change`) and/or matching every word of `q` (fragments, any case) in their statement,
 * reason, ids and type; binding ones first, then the latest. Nothing without a change or words.
 */
export function selectSuiteDecisions(all: readonly SuiteDecision[], f: { change?: string; q?: string; limit?: number }): SuiteDecision[] {
  const words = (f.q ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!f.change && !words.length) return [];
  const hay = (d: SuiteDecision) => [d.id, d.statement, d.why, d.localId, d.type, d.change, d.app].filter(Boolean).join(' ').toLowerCase();
  return all
    .filter((d) => (!f.change || d.change === f.change) && words.every((w) => hay(d).includes(w)))
    .sort((a, b) => Number(b.status === 'recorded') - Number(a.status === 'recorded') || (b.changedAt ?? '').localeCompare(a.changedAt ?? '') || b.id.localeCompare(a.id, 'en', { numeric: true }))
    .slice(0, f.limit ?? 50);
}
