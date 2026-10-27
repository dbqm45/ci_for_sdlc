import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { analyzeProject, demoProject, parseJUnit, readRepoChanges, type ProjectContext } from '../src/index.js';

/** G4 (docs/PDI-G4-PLAN.md): each criterion's tests and outcome, and the TEST rules. */

const NOW = new Date('2026-10-05T10:00:00Z');
const junit = async () => parseJUnit(await readFile(new URL('fixtures/junit/results.xml', import.meta.url), 'utf8'), 'results.xml');
const run = async (ctx: ProjectContext) => (await analyzeProject(ctx, { now: NOW })).result;
const item = (r: Awaited<ReturnType<typeof run>>, key: string) => r.items.find((i) => i.key === key)!;
const rules = (r: Awaited<ReturnType<typeof run>>, key: string) => item(r, key).findings.filter((f) => f.ruleId.startsWith('TEST-')).map((f) => f.ruleId).sort();

describe('criteria and their tests', () => {
  it('passed, failed or untested per criterion (skipped tests do not count)', async () => {
    const r = await run({ ...demoProject(), tests: await junit() });
    expect(item(r, 'PAY-124').acTests).toEqual([
      { ac: 'AC-1', status: 'passed', tests: [{ name: 'PAY-124/AC-1 deletes a saved card from the list', status: 'passed' }] },
      { ac: 'AC-2', status: 'failed', tests: [{ name: 'PAY-124/AC-2 the card disappears after confirming', status: 'failed', message: 'expected 1 card, got 2' }] },
      { ac: 'AC-3', status: 'untested', tests: [] },
    ]);
    expect(item(r, 'PAY-125').acTests!.map((a) => a.status)).toEqual(['passed', 'passed', 'passed', 'passed']);
    expect(item(r, 'PAY-123').acTests, 'no test names it').toBeUndefined();
  });

  it('TEST-001 a criterion without a test, TEST-002 a failing one, TEST-003 a criterion the item lacks', async () => {
    const r = await run({ ...demoProject(), tests: await junit() });
    expect(rules(r, 'PAY-124')).toEqual(['TEST-001', 'TEST-002']);
    expect(rules(r, 'PAY-125'), 'all green').toEqual([]);
    expect(rules(r, 'PAY-126'), 'its tests name AC-5 only').toEqual(['TEST-001', 'TEST-003']);
    expect(rules(r, 'PAY-123'), 'not started: no test yet is normal').toEqual([]);
    const missing = item(r, 'PAY-124').findings.find((f) => f.ruleId === 'TEST-001')!;
    expect(missing).toMatchObject({ category: 'MISSING_COVERAGE', severity: 'warning', dimension: 'requirements' });
    expect(missing.explanation).toMatch(/AC-3/);
    const failing = item(r, 'PAY-124').findings.find((f) => f.ruleId === 'TEST-002')!;
    expect(failing).toMatchObject({ category: 'CONFLICT', severity: 'warning' });
    expect(failing.explanation).toMatch(/expected 1 card, got 2/);
    expect(failing.evidence[0]).toMatchObject({ source: 'test', title: 'PAY-124/AC-2 the card disappears after confirming', path: 'test/cards.test.ts' });
    expect(item(r, 'PAY-126').findings.find((f) => f.ruleId === 'TEST-003')).toMatchObject({ category: 'OUTDATED', severity: 'warning' });
  });

  it('without test results the rules stay silent', async () => {
    const r = await run(demoProject());
    expect(r.items.flatMap((i) => i.findings).filter((f) => f.ruleId.startsWith('TEST-'))).toEqual([]);
  });

  it('a requirement id of a repo slice (US-02 in plan.md) leads to that slice', async () => {
    const repo = await readRepoChanges(new URL('fixtures/repo-changes', import.meta.url).pathname);
    const slice = repo.requirements.find((x) => x.repo?.requirements?.length)!;
    const reqId = slice.repo!.requirements!.find((id) => !id.startsWith('AC-'))!;
    const ctx: ProjectContext = { project: { key: 'PAY', name: 'Payments' }, requirements: repo.requirements, documents: [], frames: [], fetchedAt: NOW.toISOString(),
      tests: parseJUnit(`<testsuite><testcase classname="x" name="${reqId}/AC-1 works"/></testsuite>`, 'r.xml') };
    const r = await run(ctx);
    expect(item(r, slice.key).acTests?.[0]).toMatchObject({ ac: 'AC-1', status: 'passed' });
  });
});
