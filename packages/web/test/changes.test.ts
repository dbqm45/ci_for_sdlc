import { describe, expect, it } from 'vitest';
import { canAskPdi, changeLabel, changeOfItem, type ChangeState } from '../src/lib/changes';

// F4: on a story of a pdi change, "Ask pdi to approve" sends gate.requested for a change that is not ready.

const c = (readiness: ChangeState['readiness'], items = ['PAY-1', 'PAY-2']): ChangeState => ({ change: 'CHG-12', readiness, openQuestions: 0, items });

describe('changes on the item page', () => {
  it('CHG-UI-01: the change of a story, or none', () => {
    expect(changeOfItem([c('ready')], 'PAY-2')?.change).toBe('CHG-12');
    expect(changeOfItem([c('ready')], 'PAY-9')).toBeUndefined();
  });

  it.each([
    ['not ready, with pdi', true, c('not_ready'), true],
    ['drift, with pdi', true, c('drift'), true],
    ['ready: pdi has it already', true, c('ready'), false],
    ['without the pdi link', false, c('not_ready'), false],
    ['no change', true, undefined, false],
  ])('CHG-UI-02: ask pdi — %s', (_, pdi, change, expected) => {
    expect(canAskPdi(pdi, change)).toBe(expected);
  });

  it('CHG-UI-03: the badge', () => {
    expect(changeLabel(c('not_ready'))).toBe('CHG-12 · not ready · 2 stories');
    expect(changeLabel(c('drift', ['PAY-1']))).toBe('CHG-12 · drift · 1 story');
  });
});
