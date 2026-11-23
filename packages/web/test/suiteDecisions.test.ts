import { describe, expect, it } from 'vitest';
import type { SuiteDecision } from '@ci/core';
import { SUITE_APPS, copyState, suiteDecisionState } from '../src/lib/suiteDecisions';

// D9 (docs/PDI-D9-PLAN.md): decisions taken elsewhere in the suite, shown on the item page from the copy of pdi's index.

const d = (over: Partial<SuiteDecision> = {}): SuiteDecision => ({ id: 'DEC-1', statement: 'Approve CHG-12', status: 'recorded', app: 'pdi', ...over });

describe('suite decisions on the item page', () => {
  it('SD-UI-01: each app of the suite has its name; an unknown one shows as it is', () => {
    expect(SUITE_APPS.tf).toBe('DI Agent Factory');
    expect(suiteDecisionState(d({ app: 'tf' })).app).toBe('DI Agent Factory');
    expect(suiteDecisionState(d({ app: 'other' })).app).toBe('other');
  });

  it('SD-UI-02: a superseded decision says by what and never looks binding', () => {
    expect(suiteDecisionState(d())).toMatchObject({ binding: true, label: 'binding' });
    expect(suiteDecisionState(d({ status: 'superseded', supersededBy: 'DEC-7' }))).toMatchObject({ binding: false, label: 'superseded by DEC-7' });
    expect(suiteDecisionState(d({ status: 'superseded' }))).toMatchObject({ binding: false, label: 'superseded' });
  });

  it('SD-UI-03: the copy is stale after a failed refresh or when older than a day; never fetched says so', () => {
    const now = new Date('2026-11-23T12:00:00Z').getTime();
    expect(copyState({ enabled: true, count: 0 }, now)).toEqual({ stale: true, text: 'not fetched from pdi yet' });
    expect(copyState({ enabled: true, count: 3, fetchedAt: '2026-11-23T11:50:00Z' }, now)).toEqual({ stale: false, text: 'copy from pdi, 10 min old' });
    expect(copyState({ enabled: true, count: 3, fetchedAt: '2026-11-23T09:00:00Z', error: 'pdi-records changes exited 3' }, now)).toEqual({ stale: true, text: 'stale copy from pdi, 3 h old (pdi-records changes exited 3)' });
    expect(copyState({ enabled: true, count: 3, fetchedAt: '2026-11-20T12:00:00Z' }, now)).toEqual({ stale: true, text: 'stale copy from pdi, 3 days old' });
  });
});
