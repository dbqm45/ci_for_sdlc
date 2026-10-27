import type { AcScenario, AcTestResult, Evidence, RequirementItem, TestCase } from '../model.js';
import { parseAcceptanceCriteria } from './acceptance.js';
import type { ItemCtx } from './context.js';
import type { Rule } from './rules.js';

/**
 * Acceptance criterion → test → result (G4, docs/PDI-G4-PLAN.md). A test names a criterion as `<KEY>/AC-n`
 * (connectors/tests.ts); KEY is an item key or a requirement id a repo slice lists in its `plan.md` row (`US-02`).
 * The rules run only when the analysis got test results, and none is critical: a red test already stops CI, these say
 * which criterion it is about and what is missing.
 */

/** Tests per item key and criterion, with requirement ids of repo slices resolved to the slice. */
export function testsByItem(requirements: RequirementItem[], tests: TestCase[] | undefined): Map<string, { ac: string; test: TestCase }[]> | undefined {
  if (!tests) return undefined;
  const keys = new Set(requirements.map((r) => r.key));
  const alias = new Map<string, string>();
  for (const r of requirements) for (const id of r.repo?.requirements ?? []) if (!keys.has(id) && !alias.has(id)) alias.set(id, r.key);
  const out = new Map<string, { ac: string; test: TestCase }[]>();
  for (const test of tests) {
    for (const ref of test.refs) {
      const key = keys.has(ref.itemKey) ? ref.itemKey : alias.get(ref.itemKey);
      if (key) (out.get(key) ?? out.set(key, []).get(key)!).push({ ac: ref.ac, test });
    }
  }
  return out;
}

const scenariosOf = (r: RequirementItem): AcScenario[] => r.acScenarios ?? parseAcceptanceCriteria(r.acceptanceCriteria);

/** Each criterion of the item with its tests, when some test names the item. */
export function acTestsOf(r: RequirementItem, linked: { ac: string; test: TestCase }[] | undefined): AcTestResult[] | undefined {
  if (!linked?.length) return undefined;
  return scenariosOf(r).map((sc) => {
    const tests = linked.filter((l) => l.ac === sc.id).map(({ test: t }) => ({ name: t.name, status: t.status, ...(t.message && { message: t.message }) }));
    const ran = tests.filter((t) => t.status !== 'skipped');
    const status = ran.some((t) => t.status === 'failed') ? 'failed' : ran.length ? 'passed' : 'untested';
    return { ac: sc.id, status, tests };
  });
}

const evTest = (t: TestCase): Evidence => ({
  source: 'test',
  entityId: `test:${t.report}#${t.classname ?? ''}#${t.name}`,
  title: t.name,
  ...(t.file && { path: t.file }),
  ...(t.message && { excerpt: t.message }),
});

const linkedOf = (c: ItemCtx) => c.env.testsByItem?.get(c.r.key);
const list = (ids: string[]) => ids.join(', ');

export const TEST_RULES: Rule[] = [
  {
    id: 'TEST-001',
    name: 'Acceptance criterion without a test',
    description: 'Tests already name the item, but some of its acceptance criteria have none (or only skipped ones). Silent while no test names the item.',
    appliesTo: ['story', 'bug', 'task', 'subtask'],
    run: (c) => {
      const results = acTestsOf(c.r, linkedOf(c));
      const missing = results?.filter((a) => a.status === 'untested').map((a) => a.ac) ?? [];
      if (!missing.length) return [];
      return [
        {
          category: 'MISSING_COVERAGE',
          severity: 'warning',
          dimension: 'requirements',
          title: `${missing.length} acceptance criteri${missing.length === 1 ? 'on has' : 'a have'} no test`,
          explanation: `Tests name ${c.r.key}, but none checks ${list(missing)}. Name an acceptance test after its criterion (${c.r.key}/${missing[0]}) so each criterion has one.`,
          evidence: linkedOf(c)!.slice(0, 3).map((l) => evTest(l.test)),
          question: { text: `How is ${list(missing)} of ${c.r.key} checked?`, options: ['Add a test named after the criterion', 'Checked by hand (add a note how)'], topic: 'test coverage' },
        },
      ];
    },
  },
  {
    id: 'TEST-002',
    name: 'Failing test of an acceptance criterion',
    description: 'A test that names one of the item\'s acceptance criteria failed.',
    appliesTo: ['story', 'bug', 'task', 'subtask'],
    run: (c) => {
      const failing = (linkedOf(c) ?? []).filter((l) => l.test.status === 'failed' && scenariosOf(c.r).some((sc) => sc.id === l.ac));
      if (!failing.length) return [];
      const acs = [...new Set(failing.map((l) => l.ac))];
      return [
        {
          category: 'CONFLICT',
          severity: 'warning',
          dimension: 'requirements',
          title: `Test of ${list(acs)} fails`,
          explanation: failing.map((l) => `"${l.test.name}" failed${l.test.message ? `: ${l.test.message}` : ''}`).join('; ') + '. The code does not do what the criterion says yet.',
          evidence: failing.slice(0, 3).map((l) => evTest(l.test)),
        },
      ];
    },
  },
  {
    id: 'TEST-003',
    name: 'Test of a criterion the item does not have',
    description: 'A test names an acceptance criterion the item no longer has: the criteria were renumbered or removed.',
    appliesTo: ['story', 'bug', 'task', 'subtask'],
    run: (c) => {
      const ids = new Set(scenariosOf(c.r).map((sc) => sc.id));
      const stray = (linkedOf(c) ?? []).filter((l) => !ids.has(l.ac));
      if (!stray.length) return [];
      const acs = [...new Set(stray.map((l) => l.ac))];
      return [
        {
          category: 'OUTDATED',
          severity: 'warning',
          dimension: 'requirements',
          title: `Tests name ${list(acs)}, which ${c.r.key} does not have`,
          explanation: `${c.r.key} has ${ids.size} acceptance criteri${ids.size === 1 ? 'on' : 'a'}, but ${stray.map((l) => `"${l.test.name}"`).join(', ')} name${stray.length === 1 ? 's' : ''} ${list(acs)}. The criteria were renumbered or removed after the test was written.`,
          evidence: stray.slice(0, 3).map((l) => evTest(l.test)),
          question: { text: `Which criterion do the tests of ${list(acs)} check now?`, options: ['Rename the tests to the current criterion', 'The criterion was dropped: remove the tests'], topic: 'test coverage' },
        },
      ];
    },
  },
];
