/**
 * Headless quality gate — "Semantic CI/CD" for product definition.
 *
 *   npm run analyze                       # demo workspace, human-readable report
 *   npm run analyze -- --json report.json # also write the full result
 *   npm run analyze -- --fail-on critical # exit 1 if any item is NOT READY (use in CI pipelines)
 *   npm run analyze -- --items PAY-125,PAY-126
 *
 * Uses the persisted settings / decisions in CI_DATA_DIR (default .ci-data).
 */
import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Engine } from './engine.js';
import { Store } from './store.js';

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const here = dirname(fileURLToPath(import.meta.url));
const store = new Store(resolve(process.env.CI_DATA_DIR ?? resolve(here, '../../../.ci-data')));
await store.init();
const engine = new Engine(store);
const result = await engine.analyze('cli');

const only = arg('items')?.split(',').map((s) => s.trim());
const items = result.items.filter((i) => i.type !== 'task' && (!only || only.includes(i.key)));
const icon = { healthy: '🟢', needs_attention: '🟡', critical: '🔴' } as const;

console.log(`\nCONTINUOUS INTELLIGENCE — ${result.project.name}  (${result.analyzedAt})`);
console.log(`Stories ${result.counts.stories} · Healthy ${result.counts.healthy} · Needs attention ${result.counts.needsAttention} · Critical ${result.counts.critical}`);
console.log(`Readiness ${result.metrics.readiness}% · Spec health ${result.metrics.specificationHealth} · Journey coverage ${result.metrics.journeyCoverage}% · Decision debt ${result.metrics.decisionDebt.critical}/${result.metrics.decisionDebt.important}/${result.metrics.decisionDebt.minor}\n`);
for (const i of items) {
  console.log(`${icon[i.healthStatus]} ${i.type.padEnd(5)} ${i.key.padEnd(8)} ${String(i.health).padStart(3)}  ${i.title}`);
  for (const b of i.blockingIssues) console.log(`      ✗ ${b}`);
}
if (result.drift.length) {
  console.log('\nDrift since last analysis:');
  for (const d of result.drift) console.log(`  [${d.severity}] ${d.summary}${d.impactedItems.length ? ` → ${d.impactedItems.join(', ')}` : ''}`);
}
const out = arg('json');
if (out) await writeFile(out, JSON.stringify(result, null, 2));

const failOn = arg('fail-on');
const failing = items.filter((i) => (failOn === 'critical' && i.readiness === 'not_ready') || (failOn === 'warning' && i.readiness !== 'ready'));
if (failOn && failing.length) {
  console.error(`\n✗ Quality gate failed: ${failing.map((i) => i.key).join(', ')}`);
  process.exit(1);
}
