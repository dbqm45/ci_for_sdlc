import { describe, expect, it } from 'vitest';
import { withRepoDecisions } from '../src/engine.js';

// PRB-16 (docs/REPO-DECISIONS-PLAN.md): a decision in the repository answers its question in place of a stored one.

describe('decisions from the repository', () => {
  it('RDS-01: replace a stored decision on the same question and add to the others', () => {
    const stored = [{ id: 'd1', questionId: 'q:DES-001:TSK-1', answer: 'stored' }, { id: 'd2', questionId: 'q:REQ-001:TSK-2', answer: 'kept' }];
    const fromRepo = [{ id: 'repo:CHG-12/D1', questionId: 'q:DES-001:TSK-1', answer: 'from the repo' }];
    expect(withRepoDecisions(stored, { decisions: fromRepo as never }).map((d) => d.id)).toEqual(['d2', 'repo:CHG-12/D1']);
    expect(withRepoDecisions(stored, {})).toBe(stored);
  });
});
