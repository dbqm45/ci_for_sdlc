import { describe, expect, it } from 'vitest';
import { parseRepoDecisions } from '../src/index.js';

// PRB-16 (docs/REPO-DECISIONS-PLAN.md): a decision on a finding of a change from a repository is an entry of the
// change's decisions.md, in tf's format with `ustalenie: <finding>`; it is reviewed in the pull request with the change.

const PATH = 'docs/project/changes/CHG-12/decisions.md';
const items = new Set(['CHG-12', 'TSK-1', 'TSK-2']);
const entry = (heading: string, fields: Record<string, string>) => `## ${heading}\n${Object.entries(fields).map(([k, v]) => `- ${k}: ${v}`).join('\n')}\n`;
const base = { ref: 'CHG-12/D2', id: 'DEC-41', wyslano: 'tak', kiedy: '2026-10-30', kto: 'Ann', rodzaj: 'product', dlaczego: 'Agreed with support.', zrodlo: 'claude-cli', szkic: 'human' };
const parse = (text: string) => parseRepoDecisions(text, { change: 'CHG-12', path: PATH, items });

describe('decisions.md of a change (PRB-16)', () => {
  it('RD-01: an entry with ustalenie answers that finding\'s question, as a decision in the UI does', () => {
    const r = parse(`# Decyzje zmiany CHG-12\n\n${entry('Errors show the support contact', { ...base, ustalenie: 'DES-001:TSK-1' })}`);
    expect(r.problems).toEqual([]);
    expect(r.decisions).toEqual([
      expect.objectContaining({
        id: 'repo:CHG-12/D2',
        questionId: 'q:DES-001:TSK-1',
        findingId: 'DES-001:TSK-1',
        itemKey: 'TSK-1',
        answer: 'Errors show the support contact',
        note: 'Agreed with support.',
        decidedBy: 'Ann',
        decidedAt: '2026-10-30T00:00:00.000Z',
        effect: 'resolve',
        status: 'active',
        draftedBy: 'human',
        pdiDecision: 'DEC-41',
        evidence: [expect.objectContaining({ source: 'decision', path: PATH, line: 3 })],
      }),
    ]);
  });

  it('RD-02: the change\'s other decisions, the template\'s sample in a comment and a finding with a detail part', () => {
    const sample = '<!-- Wzór wpisu:\n## <co zdecydowano>\n- ustalenie: DES-001:TSK-1\n- kto: x\n- kiedy: 2026-10-30\n-->\n';
    const r = parse(`${sample}${entry('Ship behind a flag', base)}${entry('Not a spike', { ...base, ref: 'CHG-12/D3', ustalenie: 'CON-001:TSK-2:timeout', skutek: 'accept_risk' })}`);
    expect(r.problems).toEqual([]);
    expect(r.decisions.map((d) => [d.findingId, d.effect])).toEqual([['CON-001:TSK-2:timeout', 'accept_risk']]);
  });

  it('RD-03: a later entry for the same finding replaces the earlier one', () => {
    const r = parse(`${entry('First answer', { ...base, ustalenie: 'DES-001:TSK-1' })}${entry('Changed answer', { ...base, ref: 'CHG-12/D5', kiedy: '2026-10-31', ustalenie: 'DES-001:TSK-1' })}`);
    expect(r.decisions.map((d) => [d.id, d.answer])).toEqual([['repo:CHG-12/D5', 'Changed answer']]);
  });

  it.each([
    ['a malformed finding', { ustalenie: 'des-1' }, /not a finding id like DES-001:TSK-1/],
    ['another change\'s item', { ustalenie: 'DES-001:TSK-9' }, /TSK-9, which is not CHG-12 or one of its slices/],
    ['no one who decided', { ustalenie: 'DES-001:TSK-1', kto: '' }, /kto is missing/],
    ['a bad date', { ustalenie: 'DES-001:TSK-1', kiedy: '30.10.2026' }, /kiedy must be a date/],
    ['an unknown effect', { ustalenie: 'DES-001:TSK-1', skutek: 'ignore' }, /skutek must be one of resolve, accept_risk, dismiss, confirm/],
  ])('RD-04: %s is a problem with its line, and the entry is skipped', (_, fields, message) => {
    const r = parse(entry('An answer', { ...base, ...fields }));
    expect(r.decisions).toEqual([]);
    expect(r.problems).toEqual([{ path: PATH, message: expect.stringMatching(message) }]);
    expect(r.problems[0]!.message).toMatch(/^line \d+, "An answer": /);
  });
});
