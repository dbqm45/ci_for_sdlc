import { describe, expect, it } from 'vitest';
import { DEFAULT_POLICY, analyzeProject, parseChange, scopeOverlap, type ProjectContext } from '../src/index.js';

// DV5 (docs/SCOPE-PLAN.md): a slice that does what the change's intent puts out of scope (SCOPE-001).

const header = (artifact: string) => `---\nartifact: ${artifact}\nphase: plan\nstatus: accepted\nversion: 1\ncreated: 2026-11-20\nupdated: 2026-11-21\nchange: CHG-12\n---\n\n`;
const INTENT = `${header('intent')}# Zbiorcza zmiana taryfy\n\n## Problem\nOperator zmienia taryfę na wielu ładowarkach po kolei.\n\n## Out of scope\n- Eksport raportów do PDF\n- powiadomienia SMS\n- <Placeholder>\n`;
const PLAN = `${header('plan')}| Cięcie | Wydanie | Flaga | Wartość | Pliki | Weryfikacja |\n|---|---|---|---|---|---|\n| TSK-1 | R1 | bulk | Operator zmienia taryfę grupy ładowarek jedną operacją | | podgląd zmian przed wykonaniem |\n| TSK-2 | R1 | bulk | Operator pobiera raport zmian taryf | | eksport raportu do PDF z listą ładowarek |\n| TSK-3 | R2 | bulk | Operator dostaje powiadomienie SMS o końcu operacji | | |\n`;

async function findings(intent = INTENT) {
  const requirements = parseChange('CHG-12', { intent, plan: PLAN });
  const ctx: ProjectContext = { project: { key: 'CHG', name: 'Repo' }, requirements, documents: [], frames: [], fetchedAt: '2026-11-25T00:00:00Z' };
  const { result } = await analyzeProject(ctx, { policy: DEFAULT_POLICY, now: new Date('2026-11-25T00:00:00Z') });
  return result.items.flatMap((i) => i.findings.filter((f) => f.ruleId === 'SCOPE-001').map((f) => ({ key: i.key, f })));
}

describe('scope beyond the intent (SCOPE-001)', () => {
  it('SC-01: the out-of-scope section of intent.md reaches the change and every slice', () => {
    const [epic, ...stories] = parseChange('CHG-12', { intent: INTENT, plan: PLAN });
    expect(epic!.repo?.outOfScope).toEqual(['Eksport raportów do PDF', 'powiadomienia SMS']);
    expect(stories.map((s) => s.repo?.outOfScope)).toEqual([epic!.repo?.outOfScope, epic!.repo?.outOfScope, epic!.repo?.outOfScope]);
    expect(parseChange('CHG-12', { intent: INTENT.replace('## Out of scope', '## Poza zakresem'), plan: PLAN })[0]!.repo?.outOfScope).toHaveLength(2);
  });

  it('SC-02: a slice matching an out-of-scope item gets a warning with the file, the item and the question', async () => {
    const hits = await findings();
    expect(hits.map((h) => h.key).sort()).toEqual(['TSK-2', 'TSK-3']);
    const { f } = hits.find((h) => h.key === 'TSK-2')!;
    expect(f.severity).toBe('warning');
    expect(f.title).toMatch(/out of scope/i);
    expect(f.explanation).toMatch(/Eksport raportów do PDF/);
    expect(f.evidence.some((e) => e.path?.endsWith('plan.md') && e.line)).toBe(true);
    expect(f.question?.options.map((o) => o.label)).toEqual(['Remove the slice from this change', 'Update the intent: the scope changed', 'Not out of scope (say why in the note)', 'Other']);
  });

  it('SC-03: nothing without the section, and nothing for a slice that only shares a common word', async () => {
    expect(await findings(INTENT.replace(/## Out of scope[\s\S]*$/, ''))).toEqual([]);
    expect((await findings()).map((h) => h.key)).not.toContain('TSK-1');
  });

  it.each([
    ['Eksport raportów do PDF', 'eksport raportu do PDF z listą ładowarek', true],
    ['Eksport raportów do PDF', 'eksport taryf', false],
    ['powiadomienia SMS', 'Operator dostaje powiadomienie SMS', true],
    ['integracja z SAP', 'Operator widzi listę ładowarek', false],
    ['Archiwizacja', 'archiwizacja starych taryf', true],
  ])('SC-04: “%s” vs “%s” → %s', (item, text, match) => {
    expect(scopeOverlap(item, text)).toBe(match);
  });
});
