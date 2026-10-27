import { describe, expect, it } from 'vitest';
import { acTestRows, acTestsSummary } from '../src/lib/acTests';

describe('acTestRows (G4)', () => {
  const acTests = [
    { ac: 'AC-1', status: 'passed' as const, tests: [{ name: 'PAY-124/AC-1 deletes', status: 'passed' as const }] },
    { ac: 'AC-2', status: 'failed' as const, tests: [{ name: 'PAY-124/AC-2 disappears', status: 'failed' as const, message: 'expected 1 card, got 2' }] },
    { ac: 'AC-3', status: 'untested' as const, tests: [] },
  ];

  it('gives each criterion its text from the scenarios, else from the criteria in order, and an icon status', () => {
    const rows = acTestRows(acTests, { acceptanceCriteria: ['Deletes a card', 'The card disappears', 'Asks to confirm'] });
    expect(rows.map((r) => [r.ac, r.text, r.icon])).toEqual([
      ['AC-1', 'Deletes a card', 'ok'],
      ['AC-2', 'The card disappears', 'bad'],
      ['AC-3', 'Asks to confirm', 'warn'],
    ]);
    const byScenario = acTestRows(acTests.slice(0, 1), { acceptanceCriteria: ['Given a card', 'When I delete it', 'Then it is gone'], acScenarios: [{ id: 'AC-1', text: 'Given a card\nWhen I delete it\nThen it is gone' }] });
    expect(byScenario[0]!.text).toBe('Given a card · When I delete it · Then it is gone');
    expect(acTestRows(acTests.slice(2), { acceptanceCriteria: [] })[0]!.text).toBe('');
  });

  it('sums up: passing criteria of all', () => {
    expect(acTestsSummary(acTests)).toEqual({ passing: 1, total: 3 });
  });
});
