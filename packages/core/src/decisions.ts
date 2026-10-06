import type { ActiveDecision, Decision, StoredDecision, SupersededDecision, WithdrawnDecision } from './model.js';
import { hash } from './text.js';

/** Raised when a decision change breaks an invariant; maps to HTTP 400. */
export class DecisionError extends Error {
  readonly statusCode = 400;
  constructor(
    readonly code: 'change_reason_required',
    message: string,
  ) {
    super(message);
    this.name = 'DecisionError';
  }
}

/**
 * The only path from a stored record to a Decision: missing version and
 * status read as active version 1, and fields that do not belong to the
 * status are dropped. Lifecycle fields missing from an old record get neutral
 * values rather than failing the whole list.
 */
export function normalizeDecision(d: StoredDecision): Decision {
  const { status = 'active', version = 1, supersededBy, supersededAt, withdrawnBy, withdrawnAt, withdrawReason, ...base } = d;
  switch (status) {
    case 'active':
      return { ...base, version, status };
    case 'superseded':
      return { ...base, version, status, supersededBy: supersededBy ?? '', supersededAt: supersededAt ?? base.decidedAt };
    case 'withdrawn':
      return { ...base, version, status, withdrawnBy: withdrawnBy ?? 'unknown', withdrawnAt: withdrawnAt ?? base.decidedAt, ...(withdrawReason && { withdrawReason }) };
  }
}

export const activeDecisions = (all: readonly StoredDecision[]): ActiveDecision[] => all.map(normalizeDecision).filter((d): d is ActiveDecision => d.status === 'active');

export type NewDecision = Omit<ActiveDecision, 'id' | 'version' | 'status' | 'supersedes'>;

/**
 * Records a decision as a new immutable version. An active decision on the
 * same question is marked superseded (a reason is required, unless it was only
 * a confirmation of an AI finding); a withdrawn one only continues the chain.
 */
export function recordDecision(all: readonly StoredDecision[], input: NewDecision): { all: Decision[]; decision: ActiveDecision } {
  const list = all.map(normalizeDecision);
  const chain = list.filter((d) => d.questionId === input.questionId).sort((a, b) => b.version - a.version);
  const latest = chain[0];
  const active = chain.find((d): d is ActiveDecision => d.status === 'active');
  const changeReason = input.changeReason?.trim() || undefined;
  if (active && active.effect !== 'confirm' && !changeReason)
    throw new DecisionError('change_reason_required', `Question already has an active decision ("${active.answer}"). A reason is required to change it.`);
  const version = (latest?.version ?? 0) + 1;
  const decision: ActiveDecision = {
    ...input,
    changeReason: active ? changeReason : undefined,
    id: hash(`${input.questionId}|${version}|${input.decidedAt}`),
    version,
    status: 'active',
    supersedes: latest?.id,
  };
  const superseded = (d: ActiveDecision): SupersededDecision => ({ ...d, status: 'superseded', supersededBy: decision.id, supersededAt: input.decidedAt });
  const next = list.map((d) => (d === active ? superseded(d) : d));
  return { all: [...next, decision], decision };
}

/** Withdraws an active decision; the record stays for history. */
export function withdrawDecision(all: readonly StoredDecision[], id: string, by: string, at: string, reason?: string): { all: Decision[]; decision?: WithdrawnDecision } {
  const list = all.map(normalizeDecision);
  const target = list.find((d): d is ActiveDecision => d.id === id && d.status === 'active');
  if (!target) return { all: list };
  const withdrawReason = reason?.trim() || undefined;
  const decision: WithdrawnDecision = { ...target, status: 'withdrawn', withdrawnBy: by, withdrawnAt: at, ...(withdrawReason && { withdrawReason }) };
  return { all: list.map((d) => (d === target ? decision : d)), decision };
}
