import { describe, expect, it } from 'vitest';
import type { Decision } from '@ci/core';
import { autoClosedDecisions, pdiDecisionLabel, sharePercent } from '../src/lib/autoClose';

// A2a: the "Auto-closed" list on the Decisions page (docs/AUTO-CLOSE-A2A-PLAN.md).

const d = (over: Partial<Decision>): Decision =>
  ({ id: 'd', questionId: 'q', findingId: 'f', itemKey: 'PAY-1', topic: 't', question: 'Q?', answer: 'A', decidedBy: 'Ann', decidedAt: '2026-10-27T10:00:00.000Z', effect: 'resolve', version: 1, status: 'active', ...over }) as Decision;

describe('auto-closed decisions', () => {
  it('AUC-01: only active finding.auto_close decisions, newest first', () => {
    const list = [
      d({ id: 'a', decisionType: 'finding.auto_close', decidedAt: '2026-10-27T09:00:00.000Z' }),
      d({ id: 'b', decisionType: 'finding.auto_close', decidedAt: '2026-10-27T11:00:00.000Z', automation: { level: 1, rule: 'auto-close:ERR-003' } }),
      d({ id: 'c' }),
      { ...d({ id: 'e', decisionType: 'finding.auto_close' }), status: 'withdrawn', withdrawnBy: 'Bob', withdrawnAt: '2026-10-27T12:00:00.000Z' } as Decision,
    ];
    expect(autoClosedDecisions(list).map((x) => x.id)).toEqual(['b', 'a']);
  });

  it('AUC-02: shares as whole or one-decimal percentages, none without data', () => {
    expect(sharePercent(null)).toBe('—');
    expect(sharePercent(29 / 30)).toBe('96.7%');
    expect(sharePercent(0.5)).toBe('50%');
  });
});

describe('the decision in pdi (A2b)', () => {
  it('AUC-PDI: the DEC pdi gave, else "not in pdi"', () => {
    expect(pdiDecisionLabel(d({ pdiDecision: 'DEC-41' }))).toBe('DEC-41');
    expect(pdiDecisionLabel(d({}))).toBe('not in pdi');
  });
});
