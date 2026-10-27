import { AUTO_CLOSE_DECISION_TYPE } from './model.js';

/**
 * A2a: local measure of how often people take the AI's answer proposals as they are, until pdi receives these decisions
 * (A2b). The thresholds are pdi's (`contract.json` → `autonomy.lower_when` / `raise_when`, DA2); the result only states
 * them — changing the autonomy level is always a person's decision.
 */

export const AUTO_CLOSE_OUTCOMES = ['proposed', 'accepted', 'edited', 'rejected', 'applied', 'reopened'] as const;
export type AutoCloseOutcome = (typeof AUTO_CLOSE_OUTCOMES)[number];

/** One step in the life of an answer proposal (server: auto-close.json). */
export interface AutoCloseEvent {
  at: string;
  proposalId: string;
  outcome: AutoCloseOutcome;
  decisionType: string;
  itemKey?: string;
  findingId?: string;
  questionId?: string;
  rule?: string;
  origin?: 'rule' | 'ai';
  source?: { source: string; entityId: string; title: string; url?: string };
  quote?: string;
  decisionId?: string;
  by?: string;
  /** A2b: the DEC pdi gave this step (a rejection has no local decision to keep it on). */
  pdiDecision?: string;
}

export const ACCEPTANCE_THRESHOLDS = { lastDecisions: 30, minUneditedShare: 0.95, maxEditedShare: 0.1 } as const;

export interface AcceptanceStats {
  decisionType: string;
  /** Proposals a person judged, at most the last `lastDecisions`. */
  reviewed: number;
  accepted: number;
  edited: number;
  rejected: number;
  reopened: number;
  /** Closed by the `apply` policy and not reopened: no person judged them. */
  applied: number;
  uneditedShare: number | null;
  editedShare: number | null;
  thresholds: typeof ACCEPTANCE_THRESHOLDS;
  verdict: 'not_enough_data' | 'meets_lower_threshold' | 'hold' | 'back_to_human';
  note: string;
}

const HUMAN = new Set<AutoCloseOutcome>(['accepted', 'edited', 'rejected', 'reopened']);

/** Per proposal its latest outcome; the window is the last 30 judged by a person (a reopened one counts as rejected). */
export function acceptanceStats(events: readonly AutoCloseEvent[], decisionType: string = AUTO_CLOSE_DECISION_TYPE): AcceptanceStats {
  const latest = new Map<string, AutoCloseEvent>();
  for (const e of [...events].filter((x) => x.decisionType === decisionType && x.outcome !== 'proposed').sort((a, b) => a.at.localeCompare(b.at))) latest.set(e.proposalId, e);
  const judged = [...latest.values()].filter((e) => HUMAN.has(e.outcome)).sort((a, b) => a.at.localeCompare(b.at));
  const window = judged.slice(-ACCEPTANCE_THRESHOLDS.lastDecisions);
  const count = (o: AutoCloseOutcome) => window.filter((e) => e.outcome === o).length;
  const reviewed = window.length;
  const [accepted, edited] = [count('accepted'), count('edited')];
  const uneditedShare = reviewed ? accepted / reviewed : null;
  const editedShare = reviewed ? edited / reviewed : null;
  const pct = (x: number) => `${Math.round(x * 1000) / 10}%`;
  let verdict: AcceptanceStats['verdict'];
  let note: string;
  if (editedShare !== null && editedShare > ACCEPTANCE_THRESHOLDS.maxEditedShare) {
    verdict = 'back_to_human';
    note = `${pct(editedShare)} of the drafts were edited (above ${pct(ACCEPTANCE_THRESHOLDS.maxEditedShare)}): automation should go back to a person`;
  } else if (reviewed < ACCEPTANCE_THRESHOLDS.lastDecisions) {
    verdict = 'not_enough_data';
    note = `Not enough data: ${reviewed}/${ACCEPTANCE_THRESHOLDS.lastDecisions} reviewed proposals`;
  } else if (uneditedShare! >= ACCEPTANCE_THRESHOLDS.minUneditedShare) {
    verdict = 'meets_lower_threshold';
    note = `${pct(uneditedShare!)} accepted unedited in the last ${reviewed}: meets the threshold to lower the autonomy level (a person decides)`;
  } else {
    verdict = 'hold';
    note = `${pct(uneditedShare!)} accepted unedited in the last ${reviewed}: below ${pct(ACCEPTANCE_THRESHOLDS.minUneditedShare)}`;
  }
  return {
    decisionType,
    reviewed,
    accepted,
    edited,
    rejected: count('rejected'),
    reopened: count('reopened'),
    applied: [...latest.values()].filter((e) => e.outcome === 'applied').length,
    uneditedShare,
    editedShare,
    thresholds: ACCEPTANCE_THRESHOLDS,
    verdict,
    note,
  };
}
