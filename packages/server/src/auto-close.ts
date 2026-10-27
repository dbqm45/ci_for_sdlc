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

/** Writes the event to the proposal log and the audit log. `actor` is the person, or the rule for proposals and `apply`. */
export async function recordAutoClose(store: Store, events: { event: AutoCloseEvent; question: string; actor: string; via?: Principal; answer?: string }[]) {
  if (!events.length) return;
  await store.appendAutoClose(events.map((e) => e.event));
  for (const { event: e, question, actor, via, answer } of events) {
    const from = e.source ? ` from ${e.source.title}` : '';
    const text = answer && answer !== e.quote ? ` → ${answer}` : e.quote ? `: «${e.quote}»` : '';
    await store.audit({ at: e.at, kind: 'auto_close', actor, ...(via && { via }), summary: `${VERB[e.outcome]} for ${e.itemKey} "${question}"${from}${text}`, details: e });
  }
}
