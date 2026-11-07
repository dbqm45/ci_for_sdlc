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
 *   npm run analyze -- --repo . --tests reports/junit   # with test results: each criterion's tests (G4)
 *   npm run analyze -- --repo . --openapi api/openapi.yaml   # with the API contract (docs/OPENAPI-PLAN.md)
 *   npm run analyze -- --repo . --send-to-pdi        # also send each change's readiness to pdi (L3)
 *   npm run analyze -- --repo . --sarif reports/security [--base origin/main]
 *                                                    # with a security scan (SARIF): SEC-001…003 (docs/SECURITY-SCAN-PLAN.md)
 *   npm run analyze -- --repo . --coverage reports/lcov.info --mutation reports/stryker.json
 *                                                    # with coverage and mutation reports: TGT-001…TGT-004 (Z7b-1b, docs/TARGETS-PLAN.md)
 *
 * With `--repo`, a change file that cannot be read fails the gate whatever the threshold; so does a `--tests` report
 * (a JUnit XML file, or a directory of them; repeatable) or an `--openapi` contract file (OpenAPI 3.x, a file or a
 * directory; repeatable) or a `--sarif` security scan (SARIF 2.1.0, a file or a directory of `*.sarif`; repeatable; needs
 * `--repo`, else exit 2) that cannot be read. A scan result goes to the slices whose commits (trailer `Change: TSK-n`)
 * changed its file, else to the change of a change file, else with `--base <ref>` to the changes the pull request
 * touches, else to every change; with `--base` git must read `<ref>..HEAD`, else the gate fails. In GitHub Actions
 * (`GITHUB_ACTIONS=true`) the problems and the findings that fail the gate are also error annotations on their files
 * (the file and line of the finding's evidence, else the item's), other open findings on a change file (REL-007,
 * REL-008) and security scan results are warning or notice annotations (one per place and rule, naming every item), and the report is appended to `$GITHUB_STEP_SUMMARY`. Uses the persisted settings / decisions in CI_DATA_DIR (default .ci-data).
 * With `--send-to-pdi` (needs `--repo`, PDI_EVENTS_URL and PDI_SIGNING_SECRET, else exit 2 before the analysis) the
 * readiness of every change of the repository goes to pdi as `readiness.changed`, as the server sends it (pdi.ts): only
 * when it differs from the last one sent, through the queue in CI_DATA_DIR, delivered once within 15 s (5 s per request). What
 * was not delivered stays queued for the next run; delivery never changes the exit code (docs/PDI-L3-PLAN.md).
 * Exit codes: 0 passed, 1 failed, 2 could not run (e.g. no changes folder).
 */
import { appendFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHANGES_DIR, changeReadiness, placeOfResult, readCoverage, readMutation, readOpenApi, readRepoTargets, readSarif, readTestResults, securityByItem, securityRuleOf, targetsByItem, targetsStatusOf, type Finding, type ItemAnalysis, type RepoProblem, type RequirementItem, type SecurityScan, type TargetSummary } from '@ci/core';
import { AtlassianConnection, connectConfigFromEnv } from './connections.js';
import { Engine } from './engine.js';
import { PdiLink } from './pdi.js';
import { readSliceFiles } from './slice-files.js';
import { Store } from './store.js';

export interface GateIo {
  env: Record<string, string | undefined>;
  out: (line: string) => void;
  err: (line: string) => void;
}

/** The gate exits after one delivery: at most this long for all of it, and per request (L3). */
const PDI_BUDGET_MS = 15_000;
const PDI_TIMEOUT_MS = 5_000;
/** Rows of the security scan table in the step summary; the rest are counted. */
const SUMMARY_SCAN_ROWS = 200;

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
  const sendToPdi = args.includes('--send-to-pdi');
  if (sendToPdi && !repoPath) {
    io.err('✗ --send-to-pdi needs --repo: the changes sent to pdi are those of the repository');
    return 2;
  }
  const sarifPaths = args.flatMap((a, i) => (a === '--sarif' && args[i + 1] ? [resolve(args[i + 1]!)] : []));
  if (sarifPaths.length && !repoPath) {
    io.err('✗ --sarif needs --repo: the scan results go to the slices and changes of the repository');
    return 2;
  }
  const coveragePaths = args.flatMap((a, i) => (a === '--coverage' && args[i + 1] ? [resolve(args[i + 1]!)] : []));
  if (coveragePaths.length && !repoPath) {
    io.err('✗ --coverage needs --repo: the reports are read against the changes of the repository');
    return 2;
  }
  const mutationPaths = args.flatMap((a, i) => (a === '--mutation' && args[i + 1] ? [resolve(args[i + 1]!)] : []));
  if (mutationPaths.length && !repoPath) {
    io.err('✗ --mutation needs --repo: the reports are read against the changes of the repository');
    return 2;
  }
  const testPaths = args.flatMap((a, i) => (a === '--tests' && args[i + 1] ? [resolve(args[i + 1]!)] : []));
  const testResults = testPaths.length ? await readTestResults(testPaths) : undefined;
  const apiPaths = args.flatMap((a, i) => (a === '--openapi' && args[i + 1] ? [resolve(args[i + 1]!)] : []));
  const apiContract = apiPaths.length ? await readOpenApi(apiPaths) : undefined;
  // Z8c: the scan, and the files of each slice from the repository's history (and the pull request's, with --base).
  const scanRead = sarifPaths.length ? await readSarif(sarifPaths, { root: resolve(repoPath!) }) : undefined;
  // Z7b-1b: slice files also drive target coverage/mutation; read them when needed so TGT rules see the touched files.
  const needSlices = scanRead || coveragePaths.length || mutationPaths.length;
  const slices = needSlices && repoPath ? await readSliceFiles(resolve(repoPath!), { base: arg('base') }) : undefined;
  const security: SecurityScan | undefined = scanRead && slices && { results: scanRead.results, sliceFiles: slices.sliceFiles, ...(slices.pr && { pr: slices.pr }) };
  const coverageRead = coveragePaths.length ? await readCoverage(coveragePaths) : undefined;
  const mutationRead = mutationPaths.length ? await readMutation(mutationPaths) : undefined;
  // Z7b-1b: targets from each change's release.yaml; even without --coverage/--mutation they drive the TGT rules
  // (a target with a missing report becomes a blocking finding).
  const repoTargets = repoPath ? await readRepoTargets(resolve(repoPath)) : undefined;
  const slicesForTargets: SecurityScan | undefined = !security && slices && repoTargets?.targetsByChange.size
    ? { results: [], sliceFiles: slices.sliceFiles, ...(slices.pr && { pr: slices.pr }) }
    : security;
  const repoUrl = arg('repo-url');
  const here = dirname(fileURLToPath(import.meta.url));
  const store = new Store(resolve(io.env.CI_DATA_DIR ?? resolve(here, '../../../.ci-data')));
  await store.init();
  const pdi = sendToPdi ? new PdiLink(store, { timeoutMs: PDI_TIMEOUT_MS }, io.env) : undefined;
  if (pdi && !pdi.enabled) {
    io.err('✗ --send-to-pdi needs PDI_EVENTS_URL (https, or http on localhost) and PDI_SIGNING_SECRET');
    return 2;
  }
  const connect = connectConfigFromEnv();
  const engine = new Engine(
    store,
    connect.mode === 'oauth' && !repoPath ? new AtlassianConnection(store, connect) : undefined,
    repoPath ? { path: resolve(repoPath), repoUrl } : undefined,
    testResults?.tests,
    apiContract?.documents,
    slicesForTargets,
    repoTargets?.targetsByChange.size || coverageRead || mutationRead
      ? {
          ...(repoTargets?.targetsByChange.size && { byChange: repoTargets.targetsByChange }),
          ...((coverageRead || mutationRead) && {
            reports: {
              ...(coverageRead && { coverage: coverageRead }),
              ...(mutationRead && { mutation: mutationRead }),
            },
          }),
        }
      : undefined,
  );
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
  const testProblems = testResults?.problems ?? [];
  if (testResults) {
    const t = testResults.tests;
    io.out(`\nTests: ${t.length} read, ${t.filter((x) => x.status === 'failed').length} failed, ${t.filter((x) => x.refs.length).length} naming a criterion`);
  }
  if (testProblems.length) {
    io.out('\nTest reports that could not be read:');
    for (const p of testProblems) io.out(`  ✗ ${p.path}: ${p.message}`);
  }
  const apiProblems = apiContract?.problems ?? [];
  if (apiContract) {
    const n = apiContract.documents.length;
    io.out(`\nAPI contract: ${n} operation${n === 1 ? '' : 's'} read`);
  }
  if (apiProblems.length) {
    io.out('\nAPI contract files that could not be read:');
    for (const p of apiProblems) io.out(`  ✗ ${p.path}: ${p.message}`);
  }
  const scanProblems = [...(scanRead?.problems ?? []), ...(slices?.problem ? [{ path: '', message: slices.problem }] : [])];
  if (scanRead) {
    const r = scanRead.results;
    const n = (level: string) => r.filter((x) => x.level === level).length;
    io.out(`\nSecurity scan: ${r.length} result${r.length === 1 ? '' : 's'} (${n('error')} error, ${n('warning')} warning, ${n('note')} note) from ${scanRead.reports} file(s)`);
  }
  if (scanProblems.length) {
    io.out('\nSecurity scan reports that could not be read:');
    for (const p of scanProblems) io.out(`  ✗ ${p.path ? `${p.path}: ` : ''}${p.message}`);
  }
  const out = arg('json');
  if (out) await writeFile(out, JSON.stringify(result, null, 2));

  const failOn = arg('fail-on');
  const failing = items.filter((i) => (failOn === 'critical' && i.readiness === 'not_ready') || (failOn === 'warning' && i.readiness !== 'ready'));

  if (io.env.GITHUB_ACTIONS === 'true') for (const p of testProblems) io.out(`::error file=${escProp(p.path)},title=Test report::${escData(p.message)}`);
  if (io.env.GITHUB_ACTIONS === 'true') for (const p of apiProblems) io.out(`::error file=${escProp(p.path)},title=API contract::${escData(p.message)}`);
  if (io.env.GITHUB_ACTIONS === 'true') for (const p of scanProblems) io.out(annotation('error', p.path ? { file: p.path } : {}, 'Security scan', p.message));
  if (repoPath && io.env.GITHUB_ACTIONS === 'true') {
    const byKey = new Map(engine.state.context?.requirements.map((r) => [r.key, r]) ?? []);
    const { actions } = (await store.settings()).policy;
    for (const p of problems) io.out(`::error file=${escProp(p.path)},title=Change file::${escData(p.message)}`);
    // Other open findings: one annotation per level, place, rule and title, naming every item it is open on
    // (a scan result outside the slices' files is every change's).
    const notes = new Map<string, { level: 'warning' | 'notice'; at: Place; ruleId: string; title: string; keys: string[] }>();
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
        const level = f.severity === 'info' ? 'notice' : 'warning';
        const k = [level, e.path, e.line, f.ruleId, f.title].join('\u0000');
        (notes.get(k) ?? notes.set(k, { level, at: { file: e.path, line: e.line }, ruleId: f.ruleId, title: f.title, keys: [] }).get(k)!).keys.push(i.key);
      }
    }
    for (const a of notes.values()) io.out(annotation(a.level, a.at, `${a.ruleId} ${a.keys.join(', ')}`, a.title));
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
        ...(scanRead ? securitySummary(scanRead.results, engine.state.context, scanProblems) : []),
        '',
      ];
      await appendFile(summary, md.join('\n'));
    }
  }

  if (pdi) {
    const readiness = changeReadiness(result.items, engine.state.context?.requirements ?? []);
    const nowIso = new Date().toISOString();
    const targetsByChange = engine.state.context?.targetsByChange;
    const summaries = targetsByChange?.size ? targetsByItem(engine.state.context!) : undefined;
    const statusByChange =
      targetsByChange?.size
        ? new Map(
            [...targetsByChange.entries()].map(([change, targets]) => [
              change,
              targetsStatusOf(change, targets, summaries?.get(change), nowIso) as unknown as Record<string, unknown>,
            ]),
          )
        : undefined;
    await sendReadiness(pdi, store, readiness, io, statusByChange);
  }

  if (failing.length) io.err(`\n✗ Quality gate failed: ${failing.map((i) => i.key).join(', ')}`);
  if (problems.length) io.err(`\n✗ Quality gate failed: ${problems.length} change file(s) could not be read`);
  if (testProblems.length) io.err(`\n✗ Quality gate failed: ${testProblems.length} test report(s) could not be read`);
  if (apiProblems.length) io.err(`\n✗ Quality gate failed: ${apiProblems.length} API contract file(s) could not be read`);
  if (scanProblems.length) io.err(`\n✗ Quality gate failed: ${scanProblems.length} security scan report(s) could not be read`);
  return failing.length || problems.length || testProblems.length || apiProblems.length || scanProblems.length ? 1 : 0;
}

/** The step summary's security scan section: one row per result with its SEC rule and the items it went to. */
function securitySummary(results: SecurityScan['results'], ctx: Parameters<typeof securityByItem>[0] | undefined, scanProblems: { path: string; message: string }[]): string[] {
  const itemsOf = new Map<SecurityScan['results'][number], string[]>();
  for (const [key, rs] of (ctx && securityByItem(ctx)) ?? []) for (const r of rs) (itemsOf.get(r) ?? itemsOf.set(r, []).get(r)!).push(key);
  const order = { error: 0, warning: 1, note: 2 } as const;
  const rows = [...results].sort((a, b) => order[a.level] - order[b.level] || placeOfResult(a).localeCompare(placeOfResult(b)));
  return [
    '',
    '### Security scan',
    '',
    `${results.length} result${results.length === 1 ? '' : 's'}: SEC-001 (an error, or a warning about an OWASP Top 10 weakness) blocks, SEC-002 and SEC-003 inform.`,
    ...(rows.length
      ? [
          '',
          '| Level | Rule | Scanner rule | Place | Items | Message |',
          '|---|---|---|---|---|---|',
          ...rows.slice(0, SUMMARY_SCAN_ROWS).map((r) => `| ${r.level} | ${securityRuleOf(r)} | \`${cell(r.ruleId)}\` | \`${cell(placeOfResult(r))}\` | ${(itemsOf.get(r) ?? []).join(', ') || '—'} | ${cell(r.message)} |`),
          ...(rows.length > SUMMARY_SCAN_ROWS ? ['', `… and ${rows.length - SUMMARY_SCAN_ROWS} more (\`--json\` has them all).`] : []),
        ]
      : []),
    ...(scanProblems.length ? ['', '**Security scan reports that could not be read** (the gate fails):', '', ...scanProblems.map((p) => `- ${p.path ? `\`${p.path}\`: ` : ''}${cell(p.message)}`)] : []),
  ];
}

/**
 * L3: queue the readiness of the repository's changes, deliver what is due once, and print one line per change
 * (`delivered`, `queued (<why>)` or `unchanged`) and one per entry still queued. Never changes the exit code.
 */
async function sendReadiness(
  pdi: PdiLink,
  store: Store,
  changes: ReturnType<typeof changeReadiness>,
  io: GateIo,
  targetsStatusByChange?: Map<string, Record<string, unknown>>,
) {
  io.out(`\npdi: ${pdi.eventsUrl}`);
  const queuedNow = await pdi.enqueue(changes, targetsStatusByChange);
  await pdi.deliver({ budgetMs: PDI_BUDGET_MS });
  const outbox = await store.pdiOutbox();
  for (const c of changes) {
    const event = queuedNow.find((e) => e.payload.change === c.change);
    const left = event && outbox.find((e) => e.event.id === event.id);
    const state = !event ? 'unchanged' : left ? `queued (${left.lastError ?? 'not attempted yet'})` : 'delivered';
    io.out(`  pdi readiness.changed ${c.change} ${c.readiness} ${state}`);
  }
  for (const e of outbox) {
    const what = String(e.event.payload.change ?? e.event.payload.ref ?? '');
    io.out(`  pdi queued ${e.event.type} ${what} attempts=${e.attempts} next=${e.failed ? 'never (refused)' : e.nextAt}${e.lastError ? ` (${e.lastError})` : ''}`);
  }
}
