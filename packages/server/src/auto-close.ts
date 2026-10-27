import { AUTO_CLOSE_DECISION_TYPE, type AutoCloseEvent, type AutoCloseOutcome, type Finding } from '@ci/core';
import type { Principal } from './http.js';
import type { Store } from './store.js';

/**
 * A2a (docs/AUTO-CLOSE-A2A-PLAN.md): one step of an answer proposal, in the proposal log (auto-close.json, which the
 * acceptance measure reads) and in the audit log (who or which rule, when, the quote and its source).
 */

const VERB: Record<AutoCloseOutcome, string> = {
  proposed: 'Answer proposed',
  accepted: 'Answer accepted',
  edited: 'Answer edited and accepted',
  rejected: 'Answer rejected',
  applied: 'Answer applied',
  reopened: 'Auto-closed answer reopened',
};

/** The proposal a finding carries, as a log event. */
export function proposalEvent(f: Finding, outcome: AutoCloseOutcome, at: string, extra: { by?: string; decisionId?: string } = {}): AutoCloseEvent {
  const p = f.answer!;
  const { source, entityId, title, url } = p.source;
  return {
    at,
    proposalId: p.id,
    outcome,
    decisionType: AUTO_CLOSE_DECISION_TYPE,
    itemKey: f.itemKey,
    findingId: f.id,
    questionId: f.question?.id,
    rule: p.rule,
    origin: p.origin,
    source: { source, entityId, title, ...(url && { url }) },
    quote: p.quote,
    ...extra,
  };
}

/** One A2a step: the log event, the question it is about, who acted, and for pdi the answer and the reason. */
export interface AutoCloseStep {
  event: AutoCloseEvent;
  question: string;
  /** The person, or the rule for proposals and `apply`. */
  actor: string;
  via?: Principal;
  answer?: string;
  /** Why a person reopened it. */
  why?: string;
}

/** Where decided steps go next (A2b: pdi's registry). */
export type AutoCloseSink = (steps: AutoCloseStep[]) => Promise<void>;

/** Writes the steps to the proposal log and the audit log, then hands the decided ones (not proposals) to `sink`. */
export async function recordAutoClose(store: Store, steps: AutoCloseStep[], sink?: AutoCloseSink) {
  if (!steps.length) return;
  await store.appendAutoClose(steps.map((e) => e.event));
  for (const { event: e, question, actor, via, answer } of steps) {
    const from = e.source ? ` from ${e.source.title}` : '';
    const text = answer && answer !== e.quote ? ` → ${answer}` : e.quote ? `: «${e.quote}»` : '';
    await store.audit({ at: e.at, kind: 'auto_close', actor, ...(via && { via }), summary: `${VERB[e.outcome]} for ${e.itemKey} "${question}"${from}${text}`, details: e });
  }
  const decided = steps.filter((x) => x.event.outcome !== 'proposed');
  if (sink && decided.length) await sink(decided);
}
