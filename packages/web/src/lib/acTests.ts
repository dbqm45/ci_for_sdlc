import type { AcTestResult } from '@ci/core';

/** One row of the item page's "Acceptance criteria ↔ tests" card (G4, docs/PDI-G4-PLAN.md). */
export interface AcTestRow extends AcTestResult {
  /** The criterion as written: its scenario's lines joined, else the criterion at its position. */
  text: string;
  icon: 'ok' | 'warn' | 'bad';
}

const ICON = { passed: 'ok', failed: 'bad', untested: 'warn' } as const;

/** Each criterion of `acTests` with its text from the item's scenarios (or its criteria in order) and an icon. */
export function acTestRows(acTests: AcTestResult[], source: { acceptanceCriteria: string[]; acScenarios?: { id: string; text: string }[] }): AcTestRow[] {
  return acTests.map((a) => {
    const scenario = source.acScenarios?.find((s) => s.id === a.ac);
    const index = Number(a.ac.replace(/^AC-/, '')) - 1;
    const text = scenario ? scenario.text.split('\n').map((l) => l.trim()).filter(Boolean).join(' · ') : (source.acceptanceCriteria[index] ?? '');
    return { ...a, text, icon: ICON[a.status] };
  });
}

/** How many criteria pass, of all. */
export function acTestsSummary(acTests: AcTestResult[]): { passing: number; total: number } {
  return { passing: acTests.filter((a) => a.status === 'passed').length, total: acTests.length };
}
