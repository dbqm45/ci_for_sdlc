import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { decisionImpactOf } from '../src/index.js';

// The "Decision impact" section of a pull request description (docs/DECISION-SCOPE-PLAN.md, step 2).

const TEMPLATE = readFileSync(fileURLToPath(new URL('../../../.github/pull_request_template.md', import.meta.url)), 'utf8');
const pl = (decisions: string, answer: string) => `## Podsumowanie\nx\n\n## Wpływ na decyzje\n- Dotyczy decyzji: ${decisions}\n- Czy zmienia przyjętą decyzję: ${answer}\n- Uzasadnienie: bo tak\n`;
const en = (answer: string) => `## Summary\nx\n\n## Decision impact\n- Decisions concerned: DEC-41\n- Changes an accepted decision: ${answer}\n- Reason: x\n`;

describe('decision impact in the PR description', () => {
  it('DI-01: the untouched template is unanswered; no section at all is missing', () => {
    expect(decisionImpactOf(TEMPLATE).answer).toBe('unanswered');
    expect(decisionImpactOf('## Summary\nJust a fix.').answer).toBe('missing');
    expect(decisionImpactOf('').answer).toBe('missing');
  });

  it.each([
    ['nie', 'no'],
    ['Nie — tylko testy', 'no'],
    ['no', 'no'],
    ['nie wiem', 'unknown'],
    ["don't know", 'unknown'],
    ['tak — decyzja zastępująca: DEC-77', 'yes'],
    ['yes — superseding decision: DEC-77', 'yes'],
    ['', 'unanswered'],
    ['nie / tak — decyzja zastępująca: <!-- DEC-n --> / nie wiem', 'unanswered'],
  ])('DI-02: “%s” → %s', (answer, expected) => {
    expect(decisionImpactOf(pl('DEC-41', answer)).answer).toBe(expected);
  });

  it('DI-03: the superseding decisions and the decisions concerned are read; comments do not count', () => {
    const r = decisionImpactOf(pl('DEC-41, DEC-42 <!-- e.g. DEC-9 -->', 'tak — decyzja zastępująca: DEC-77'));
    expect(r).toEqual({ answer: 'yes', superseding: ['DEC-77'], concerned: ['DEC-41', 'DEC-42'] });
    expect(decisionImpactOf(pl('DEC-41', 'tak — decyzja zastępująca: <!-- DEC-n -->')).superseding).toEqual([]);
    expect(decisionImpactOf(en('yes — superseding decision: DEC-5')).superseding).toEqual(['DEC-5']);
  });
});
