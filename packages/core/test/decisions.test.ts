import { describe, expect, it } from 'vitest';
import { DecisionError, activeDecisions, normalizeDecision, recordDecision, withdrawDecision, type NewDecision, type StoredDecision } from '../src/index.js';

const input: NewDecision = { questionId: 'q1', findingId: 'f1', itemKey: 'PAY-1', topic: 't', question: 'Q?', answer: 'A', decidedBy: 'ann', decidedAt: '2026-10-06T00:00:00Z', effect: 'resolve' };

describe('normalizeDecision', () => {
  it('reads a decision stored before versioning as active version 1', () => {
    const legacy: StoredDecision = { id: 'd1', questionId: 'q1', findingId: 'f1', itemKey: 'PAY-1', topic: 't', question: 'Q?', answer: 'A', decidedBy: 'ann', decidedAt: '2026-01-01T00:00:00Z', effect: 'resolve' };
    expect(normalizeDecision(legacy)).toMatchObject({ version: 1, status: 'active' });
  });

  it('keeps only the fields that belong to the status', () => {
    const stored: StoredDecision = { ...input, id: 'd1', version: 1, status: 'active', withdrawnBy: 'stale', supersededBy: 'stale' };
    const d = normalizeDecision(stored);
    expect(d).not.toHaveProperty('withdrawnBy');
    expect(d).not.toHaveProperty('supersededBy');
  });
});

describe('withdrawDecision', () => {
  it('returns the withdrawn version and leaves the input list untouched', () => {
    const { all } = recordDecision([], input);
    const before = structuredClone(all);
    const r = withdrawDecision(all, all[0].id, 'bob', '2026-10-06T01:00:00Z', ' no longer true ');
    expect(r.decision).toMatchObject({ status: 'withdrawn', withdrawnBy: 'bob', withdrawReason: 'no longer true' });
    expect(all).toEqual(before);
    expect(activeDecisions(r.all)).toHaveLength(0);
  });

  it('returns no decision for an unknown or inactive id', () => {
    const { all } = recordDecision([], input);
    expect(withdrawDecision(all, 'nope', 'bob', 'now').decision).toBeUndefined();
  });
});

describe('recordDecision', () => {
  it('requires a reason to change an active answer, with a domain code', () => {
    const { all } = recordDecision([], input);
    const err = (() => {
      try {
        recordDecision(all, { ...input, answer: 'B' });
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(DecisionError);
    expect((err as DecisionError).code).toBe('change_reason_required');
  });
});
