import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEMO_SCENARIOS, RULES, analyzeProject, demoProject, parseJUnit, readRepoChanges, type ProjectContext } from '../src/index.js';

/**
 * Coverage guard for the test data world: every rule must have demo data where it fires
 * and an applicable item where it stays silent. A new rule without such data fails here,
 * so the demo world (and later the sandbox seeder built on it) grows with the rules. Rules of repository mode only
 * (REL-007, REL-008) are covered by the changes in fixtures/repo-changes, read as `analyze --repo` reads a checkout;
 * the test-result rules (TEST-001…003) by the demo project with fixtures/junit/results.xml, as `analyze --tests` reads it.
 */

const NOW = new Date('2026-10-05T10:00:00Z');

// Known gaps in demo data (test-data generator plan, stage E1). The test for each one is
// expected to fail; once data covers the case it passes, the test turns red and the entry goes.
const KNOWN_GAPS = {
  fires: [] as string[],
  silent: [] as string[],
};

async function observe() {
  const fires = new Set<string>();
  const silent = new Set<string>();
  const worlds = [{ id: 'baseline', apply: () => {} }, ...DEMO_SCENARIOS];
  const repo = await readRepoChanges(fileURLToPath(new URL('fixtures/repo-changes', import.meta.url)));
  expect(repo.problems).toEqual([]);
  const repoCtx: ProjectContext = { project: { key: 'PAY', name: 'Payments' }, requirements: repo.requirements, documents: [], frames: [], fetchedAt: NOW.toISOString() };
  const contexts = [
    ...worlds.map((w) => {
      const ctx = demoProject();
      w.apply(ctx);
      return ctx;
    }),
    repoCtx,
    { ...demoProject(), tests: parseJUnit(await readFile(new URL('fixtures/junit/results.xml', import.meta.url), 'utf8'), 'results.xml') },
  ];
  for (const ctx of contexts) {
    const run = await analyzeProject(ctx, { now: NOW });
    for (const item of run.result.items) {
      const fired = new Set(item.findings.map((f) => f.ruleId));
      for (const id of fired) fires.add(id);
      for (const rule of RULES) if (rule.appliesTo.includes(item.type) && !fired.has(rule.id)) silent.add(rule.id);
    }
  }
  return { fires, silent };
}

describe('rule coverage of demo data', async () => {
  const { fires, silent } = await observe();

  for (const { id } of RULES) {
    (KNOWN_GAPS.fires.includes(id) ? it.fails : it)(`${id} fires on some demo item`, () => {
      expect(fires.has(id)).toBe(true);
    });
    (KNOWN_GAPS.silent.includes(id) ? it.fails : it)(`${id} stays silent on some applicable demo item`, () => {
      expect(silent.has(id)).toBe(true);
    });
  }
});
