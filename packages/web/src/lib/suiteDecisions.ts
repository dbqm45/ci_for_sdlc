import type { SuiteDecision } from '@ci/core';

/** D9 (docs/PDI-D9-PLAN.md): the applications of the suite a decision can come from. */
export const SUITE_APPS: Record<string, string> = {
  pdi: 'DI Decision',
  tf: 'DI Agent Factory',
  shipscope: 'DI Release',
  ci_for_sdlc: 'DI Definition',
};

/** The state of the copy as GET /api/suite-decisions gives it. */
export interface SuiteCopyStatus {
  enabled: boolean;
  fetchedAt?: string;
  error?: string;
  count: number;
}

const DAY_MS = 86_400_000;

/** Its app's name and whether it binds: a superseded decision says by what, and never looks binding. */
export function suiteDecisionState(d: SuiteDecision): { app: string; binding: boolean; label: string } {
  const binding = d.status === 'recorded';
  return { app: SUITE_APPS[d.app] ?? d.app, binding, label: binding ? 'binding' : d.status === 'superseded' ? (d.supersededBy ? `superseded by ${d.supersededBy}` : 'superseded') : d.status };
}

/** How old the copy is; stale after a failed refresh, or when older than a day. */
export function copyState(s: SuiteCopyStatus, now = Date.now()): { stale: boolean; text: string } {
  if (!s.fetchedAt) return { stale: true, text: s.error ? `not fetched from pdi yet (${s.error})` : 'not fetched from pdi yet' };
  const ms = now - new Date(s.fetchedAt).getTime();
  const min = Math.max(0, Math.round(ms / 60_000));
  const age = min < 60 ? `${min} min` : min < 48 * 60 ? `${Math.round(min / 60)} h` : `${Math.round(ms / DAY_MS)} days`;
  const stale = !!s.error || ms > DAY_MS;
  return { stale, text: `${stale ? 'stale copy' : 'copy'} from pdi, ${age} old${s.error ? ` (${s.error})` : ''}` };
}
