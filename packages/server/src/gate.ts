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
 * (`GITHUB_ACTIONS=true`) the problems and the findings that fail the gate are also error annotations on their files
 * (the file and line of the finding's evidence, else the item's), other open findings on a change file (REL-007,
 * REL-008) are warning or notice annotations, and the report is appended to `$GITHUB_STEP_SUMMARY`. Uses the persisted settings / decisions in CI_DATA_DIR (default .ci-data).
 * Exit codes: 0 passed, 1 failed, 2 could not run (e.g. no changes folder).
 */
import { appendFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHANGES_DIR, type Finding, type ItemAnalysis, type RepoProblem, type RequirementItem } from '@ci/core';
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

interface Place {
  file?: string;
  line?: number;
}

/** The change file (and line) an item of a repository comes from. */
const placeOf = (i: ItemAnalysis, byKey: Map<string, RequirementItem>): Place => {
  const r = byKey.get(i.key);
  if (r?.repo) return { file: r.repo.path, line: r.repo.line };
  const change = i.type === 'epic' ? i.key : r?.epicKey;
  return change ? { file: `${CHANGES_DIR}/${change}/${i.type === 'epic' ? 'intent.md' : 'plan.md'}` } : {};
};

/** Where a finding points: its evidence's change file, else the item's. */
const placeOfFinding = (f: Finding, item: Place): Place => {
  const e = f.evidence.find((x) => x.path);
  return e ? { file: e.path, line: e.line } : item;
};

const annotation = (level: 'error' | 'warning' | 'notice', at: Place, title: string, message: string) =>
  `::${level} ${at.file ? `file=${escProp(at.file)},` : ''}${at.line ? `line=${at.line},` : ''}title=${escProp(title)}::${escData(message)}`;

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
    const byKey = new Map(engine.state.context?.requirements.map((r) => [r.key, r]) ?? []);
    const { actions } = (await store.settings()).policy;
    for (const p of problems) io.out(`::error file=${escProp(p.path)},title=Change file::${escData(p.message)}`);
    for (const i of items) {
      const at = placeOf(i, byKey);
      const open = i.findings.filter((f) => f.status === 'open');
      // The findings that make this item fail the gate: blocking ones, and with --fail-on warning those that notify.
      const fails = failing.includes(i) ? open.filter((f) => f.blocks || (failOn === 'warning' && actions[f.severity] === 'notify')) : [];
      const groups = new Map<string, { at: Place; titles: string[] }>();
      for (const f of fails) {
        const p = placeOfFinding(f, at);
        const k = `${p.file}:${p.line}`;
        (groups.get(k) ?? groups.set(k, { at: p, titles: [] }).get(k)!).titles.push(f.title);
      }
      for (const g of groups.values()) io.out(annotation('error', g.at, `${i.key} not ready`, g.titles.join('; ')));
      if (failing.includes(i) && !groups.size) io.out(annotation('error', at, `${i.key} not ready`, i.blockingIssues.join('; ') || `readiness ${i.readiness}`));
      for (const f of open) {
        const e = f.evidence.find((x) => x.path);
        if (!e || fails.includes(f)) continue;
        io.out(annotation(f.severity === 'info' ? 'notice' : 'warning', { file: e.path, line: e.line }, `${f.ruleId} ${i.key}`, f.title));
      }
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
