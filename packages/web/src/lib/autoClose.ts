import type { Decision } from '@ci/core';

/** The decision type of A2a's closing with an answer found in a source (pdi contract 0.5.0). */
export const AUTO_CLOSE = 'finding.auto_close';

/** Active decisions that closed a finding with an answer found in a source, newest first ("Auto-closed"). */
export const autoClosedDecisions = (all: readonly Decision[]): Decision[] =>
  all.filter((d) => d.status === 'active' && d.decisionType === AUTO_CLOSE).sort((a, b) => b.decidedAt.localeCompare(a.decidedAt));

/** A2b: where the decision stands in pdi's registry — its DEC, or "not in pdi" until pdi has recorded it. */
export const pdiDecisionLabel = (d: Pick<Decision, 'pdiDecision'>): string => d.pdiDecision ?? 'not in pdi';

/** A share of the acceptance measure for display. */
export const sharePercent = (x: number | null): string => (x === null ? '—' : `${Math.round(x * 1000) / 10}%`);
