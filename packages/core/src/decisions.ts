import type { Decision } from './model.js';
import { hash } from './text.js';

/** Raised when a decision change breaks an invariant; maps to HTTP 400. */
export class DecisionError extends Error {
  readonly statusCode = 400;
}

/** Reads decisions stored before versioning as active version 1. */
export function normalizeDecision(d: Decision): Decision {
  return { ...d, version: d.version ?? 1, status: d.status ?? 'active' };
}

export const activeDecisions = (all: Decision[]): Decision[] => all.map(normalizeDecision).filter((d) => d.status === 'active');

export type NewDecision = Omit<Decision, 'id' | 'version' | 'status' | 'supersedes' | 'supersededBy' | 'supersededAt' | 'withdrawnBy' | 'withdrawnAt' | 'withdrawReason'>;

/**
 * Records a decision as a new immutable version. An active decision on the
 * same question is marked superseded (a reason is required); a withdrawn one
 * only continues the version chain.
 */
export function recordDecision(all: Decision[], input: NewDecision): { all: Decision[]; decision: Decision } {
  const list = all.map(normalizeDecision);
  const chain = list.filter((d) => d.questionId === input.questionId).sort((a, b) => b.version - a.version);
  const latest = chain[0];
  const active = chain.find((d) => d.status === 'active');
  const changeReason = input.changeReason?.trim() || undefined;
  if (active && !changeReason) throw new DecisionError(`Question already has an active decision ("${active.answer}"). A reason is required to change it.`);
  const version = (latest?.version ?? 0) + 1;
  const decision: Decision = {
    ...input,
    changeReason: active ? changeReason : undefined,
    id: hash(`${input.questionId}|${version}|${input.decidedAt}`),
    version,
    status: 'active',
    supersedes: latest?.id,
  };
  const next = list.map((d) => (d === active ? { ...d, status: 'superseded' as const, supersededBy: decision.id, supersededAt: input.decidedAt } : d));
  return { all: [...next, decision], decision };
}

/** Withdraws an active decision; the record stays for history. */
export function withdrawDecision(all: Decision[], id: string, by: string, at: string, reason?: string): { all: Decision[]; decision?: Decision } {
  let decision: Decision | undefined;
  const next = all.map(normalizeDecision).map((d) => {
    if (d.id !== id || d.status !== 'active') return d;
    decision = { ...d, status: 'withdrawn', withdrawnBy: by, withdrawnAt: at, withdrawReason: reason?.trim() || undefined };
    return decision;
  });
  return { all: next, decision };
}
