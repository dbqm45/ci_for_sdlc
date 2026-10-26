/**
 * The headless quality gate behind `npm run analyze` (cli.ts): one analysis, a human-readable report, and an exit code
 * for CI pipelines.
 *
 *   npm run analyze                                  # configured sources (demo by default)
 *   npm run analyze -- --json report.json            # also write the full result
 *   npm run analyze -- --fail-on critical            # exit 1 if any item is NOT READY
 *   npm run analyze -- --items PAY-125,PAY-126
 *   npm run analyze -- --repo . [--repo-url https://github.com/acme/pay] --fail-on critical
 *                                                    # a pull request's docs/project/changes only (F2)
 *
 * With `--repo`, a change file that cannot be read fails the gate whatever the threshold. In GitHub Actions
 * (`GITHUB_ACTIONS=true`) the problems and the blocking findings are also annotations on their files, and the report is
 * appended to `$GITHUB_STEP_SUMMARY`. Uses the persisted settings / decisions in CI_DATA_DIR (default .ci-data).
 * Exit codes: 0 passed, 1 failed, 2 could not run (e.g. no changes folder).
 */
import { appendFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHANGES_DIR, type ItemAnalysis, type RepoProblem } from '@ci/core';
import { AtlassianConnection, connectConfigFromEnv } from './connections.js';
import { Engine } from './engine.js';
import { Store } from './store.js';

export interface GateIo {
  env: Record<string, string | undefined>;
  out: (line: string) => void;
  err: (line: string) => void;
}

const icon = { healthy: '🟢', needs_attention: '🟡', critical: '🔴' } as const;

/** GitHub's workflow-command escaping: data for the message, properties also without `:` and `,`. */
const escData = (s: string) => s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
const escProp = (s: string) => escData(s).replace(/:/g, '%3A').replace(/,/g, '%2C');
const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

/** The change file an item of a repository comes from. */
const fileOf = (i: ItemAnalysis, epicOf: Map<string, string | undefined>) => {
  const change = i.type === 'epic' ? i.key : epicOf.get(i.key);
  return change ? `${CHANGES_DIR}/${change}/${i.type === 'epic' ? 'intent.md' : 'plan.md'}` : undefined;
};

/** Runs one analysis and reports it; returns the exit code. */
export async function runGate(args: string[], io: GateIo): Promise<number> {
  const arg = (name: string) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const repoPath = arg('repo');
  const repoUrl = arg('repo-url');
  const here = dirname(fileURLToPath(import.meta.url));
  const store = new Store(resolve(io.env.CI_DATA_DIR ?? resolve(here, '../../../.ci-data')));
  await store.init();
  const connect = connectConfigFromEnv();
  const engine = new Engine(store, connect.mode === 'oauth' && !repoPath ? new AtlassianConnection(store, connect) : undefined, repoPath ? { path: resolve(repoPath), repoUrl } : undefined);
  let result;
  try {
    result = await engine.analyze('cli');
  } catch (e) {
    io.err(`✗ ${(e as Error).message}`);
    return 2;
  }
  const problems: RepoProblem[] = engine.state.repoProblems ?? [];

  const only = arg('items')?.split(',').map((s) => s.trim());
  const items = result.items.filter((i) => i.type !== 'task' && (!only || only.includes(i.key)));
  io.out(`\nCONTINUOUS INTELLIGENCE — ${result.project.name}  (${result.analyzedAt})`);
  io.out(`Stories ${result.counts.stories} · Healthy ${result.counts.healthy} · Needs attention ${result.counts.needsAttention} · Critical ${result.counts.critical}`);
  io.out(`Readiness ${result.metrics.readiness}% · Spec health ${result.metrics.specificationHealth} · Journey coverage ${result.metrics.journeyCoverage}% · Decision debt ${result.metrics.decisionDebt.critical}/${result.metrics.decisionDebt.important}/${result.metrics.decisionDebt.minor}\n`);
  for (const i of items) {
    io.out(`${icon[i.healthStatus]} ${i.type.padEnd(5)} ${i.key.padEnd(8)} ${String(i.health).padStart(3)}  ${i.title}`);
    for (const b of i.blockingIssues) io.out(`      ✗ ${b}`);
  }
  if (result.drift.length) {
    io.out('\nDrift since last analysis:');
    for (const d of result.drift) io.out(`  [${d.severity}] ${d.summary}${d.impactedItems.length ? ` → ${d.impactedItems.join(', ')}` : ''}`);
  }
  if (problems.length) {
    io.out(`\nProblems in ${CHANGES_DIR} (these changes were left out):`);
    for (const p of problems) io.out(`  ✗ ${p.path}: ${p.message}`);
  }
  const out = arg('json');
  if (out) await writeFile(out, JSON.stringify(result, null, 2));

  const failOn = arg('fail-on');
  const failing = items.filter((i) => (failOn === 'critical' && i.readiness === 'not_ready') || (failOn === 'warning' && i.readiness !== 'ready'));

  if (repoPath && io.env.GITHUB_ACTIONS === 'true') {
    const epicOf = new Map(engine.state.context?.requirements.map((r) => [r.key, r.epicKey]) ?? []);
    for (const p of problems) io.out(`::error file=${escProp(p.path)},title=Change file::${escData(p.message)}`);
    for (const i of failing) {
      const file = fileOf(i, epicOf);
      io.out(`::error ${file ? `file=${escProp(file)},` : ''}title=${escProp(`${i.key} not ready`)}::${escData(i.blockingIssues.join('; ') || `readiness ${i.readiness}`)}`);
    }
    const summary = io.env.GITHUB_STEP_SUMMARY;
    if (summary) {
      const md = [
        '## Definition check',
        '',
        `Readiness ${result.metrics.readiness}% · ${result.counts.critical} not ready · ${result.counts.needsAttention} need attention`,
        '',
        '| | Item | Type | Title | Blocking |',
        '|---|---|---|---|---|',
        ...items.map((i) => `| ${icon[i.healthStatus]} | ${i.key} | ${i.type} | ${cell(i.title)} | ${cell(i.blockingIssues.join('; '))} |`),
        ...(problems.length ? ['', `**Files that could not be read** (their changes were left out):`, '', ...problems.map((p) => `- \`${p.path}\`: ${cell(p.message)}`)] : []),
        '',
      ];
      await appendFile(summary, md.join('\n'));
    }
  }

  if (failing.length) io.err(`\n✗ Quality gate failed: ${failing.map((i) => i.key).join(', ')}`);
  if (problems.length) io.err(`\n✗ Quality gate failed: ${problems.length} change file(s) could not be read`);
  return failing.length || problems.length ? 1 : 0;
}
