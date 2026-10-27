import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { runGate } from '../src/gate.js';

// The quality gate on a pull request (pdi plan "one SDLC flow", F2; docs/PDI-F2-PLAN.md): `analyze --repo <checkout>`
// reads the repository's docs/project/changes only, prints the report and fails on the threshold or on a bad file;
// in GitHub Actions it also writes annotations and a step summary.

const tmp = mkdtempSync(join(tmpdir(), 'ci-gate-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const head = (artifact: string, change: string) => `---\nartifact: ${artifact}\nphase: plan\nstatus: accepted\nversion: 1\ncreated: 2026-10-20\nupdated: 2026-10-21\nchange: ${change}\n---\n\n`;
const intent = (change: string) => `${head('intent', change)}# Order history\n\n## Problem\nCustomers cannot see what they ordered before.\n`;
const plan = (change: string, verification: string) =>
  `${head('plan', change)}| Cięcie | Wydanie | Flaga | Wartość | Pliki | Weryfikacja |\n|---|---|---|---|---|---|\n| TSK-57 | R1 | order-history | Customer sees the list of their last orders | web/ | ${verification} |\n`;

let n = 0;
function checkout(files: Record<string, string>): string {
  const root = join(tmp, `repo${n++}`);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

async function gate(args: string[], env: Record<string, string> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runGate(args, { env: { CI_DATA_DIR: join(tmp, `data${n++}`), ...env }, out: (s) => out.push(s), err: (s) => err.push(s) });
  return { code, out: out.join('\n'), err: err.join('\n') };
}

const C = 'docs/project/changes';

describe('analyze --repo', () => {
  it('GATE-01: reads only the repository\'s changes and passes when nothing blocks', async () => {
    const root = checkout({ [`${C}/CHG-12/intent.md`]: intent('CHG-12'), [`${C}/CHG-12/plan.md`]: plan('CHG-12', 'the list shows the 20 newest orders, newest first') });
    const r = await gate(['--repo', root, '--fail-on', 'critical']);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/epic\s+CHG-12/);
    expect(r.out).toMatch(/story\s+TSK-57/);
    expect(r.out).not.toMatch(/PAY-\d+/);
  });

  it('GATE-02: a slice without verification is not ready, so the gate fails naming it', async () => {
    const root = checkout({ [`${C}/CHG-12/intent.md`]: intent('CHG-12'), [`${C}/CHG-12/plan.md`]: plan('CHG-12', '') });
    const r = await gate(['--repo', root, '--fail-on', 'critical']);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/✗ No acceptance criteria/);
    expect(r.err).toMatch(/Quality gate failed: .*TSK-57/);
    expect((await gate(['--repo', root])).code).toBe(0);
  });

  it('GATE-03: a bad file fails the gate whatever the threshold, and its change is left out', async () => {
    const root = checkout({ [`${C}/CHG-12/intent.md`]: intent('CHG-12'), [`${C}/CHG-13/intent.md`]: intent('CHG-14') });
    const r = await gate(['--repo', root]);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/Problems in docs\/project\/changes/);
    expect(r.out).toContain(`${C}/CHG-13/intent.md: the header names change CHG-14, but the folder is CHG-13`);
    expect(r.out).not.toMatch(/epic\s+CHG-13/);
    expect((await gate(['--repo', join(tmp, 'nowhere')])).code).toBe(2);
  });

  it('GATE-04: in GitHub Actions: annotations on the files and a Markdown summary', async () => {
    const root = checkout({ [`${C}/CHG-12/intent.md`]: intent('CHG-12'), [`${C}/CHG-12/plan.md`]: plan('CHG-12', ''), [`${C}/CHG-13/intent.md`]: 'no header' });
    const summary = join(tmp, 'summary.md');
    writeFileSync(summary, '');
    const r = await gate(['--repo', root, '--fail-on', 'critical'], { GITHUB_ACTIONS: 'true', GITHUB_STEP_SUMMARY: summary });
    expect(r.code).toBe(1);
    expect(r.out).toContain(`::error file=${C}/CHG-13/intent.md,title=Change file::no YAML header (--- … ---) at the top`);
    expect(r.out).toContain(`::error file=${C}/CHG-12/plan.md,line=13,title=TSK-57 not ready::No acceptance criteria`);
    const md = readFileSync(summary, 'utf8');
    expect(md).toMatch(/^## Definition check/m);
    expect(md).toMatch(/\| 🔴 \| TSK-57 \| story \| Customer sees the list of their last orders \| No acceptance criteria \|/);
    expect(md).toContain(`- \`${C}/CHG-13/intent.md\`: no YAML header`);
  });

  // G1.4: the plan rules of repository mode. REL-008 is a warning (needs attention), REL-007 only info.
  const kinds = (change: string) =>
    `${head('plan', change)}| Cięcie | Rodzaj | Wydanie | Flaga | Wartość | Odblokowuje | Weryfikacja |\n|---|---|---|---|---|---|---|\n` +
    `| TSK-56 | F-01 | R1 | — | (fundament) Order index is ready | — | the index answers in 50 ms |\n` +
    `| TSK-57 | S-01 | R1 | order-history | Customer sees the list of their last orders | — | the list shows the 20 newest orders |\n`;
  const release = (change: string) => `change: ${change}\nreleases:\n  - { id: R1, tasks: [TSK-56, TSK-57] }\nflags:\n  - key: order-history\n    tasks: [TSK-57]\n    rollout:\n      - { stage: internal, exit: no errors for a week }\n`;

  it('GATE-05: --fail-on warning fails on REL-008; the info of REL-007 does not fail --fail-on critical', async () => {
    const root = checkout({ [`${C}/CHG-12/intent.md`]: intent('CHG-12'), [`${C}/CHG-12/plan.md`]: kinds('CHG-12'), [`${C}/CHG-12/release.yaml`]: release('CHG-12') });
    const critical = await gate(['--repo', root, '--fail-on', 'critical']);
    expect(critical.code).toBe(0);
    const warning = await gate(['--repo', root, '--fail-on', 'warning']);
    expect(warning.code).toBe(1);
    expect(warning.err).toMatch(/Quality gate failed: .*CHG-12/);
  });

  it('GATE-06: in GitHub Actions the plan findings are annotations on release.yaml and plan.md, at the flag and the row', async () => {
    const root = checkout({ [`${C}/CHG-12/intent.md`]: intent('CHG-12'), [`${C}/CHG-12/plan.md`]: kinds('CHG-12'), [`${C}/CHG-12/release.yaml`]: release('CHG-12') });
    const critical = await gate(['--repo', root, '--fail-on', 'critical'], { GITHUB_ACTIONS: 'true' });
    expect(critical.code).toBe(0);
    expect(critical.out).toContain(`::notice file=${C}/CHG-12/release.yaml,line=5,title=REL-007 CHG-12::Flag order-history has no plan`);
    expect(critical.out).toContain(`::warning file=${C}/CHG-12/plan.md,line=13,title=REL-008 CHG-12::Foundation TSK-56 does not say what it unblocks`);
    expect(critical.out).not.toMatch(/::error/);
    const warning = await gate(['--repo', root, '--fail-on', 'warning'], { GITHUB_ACTIONS: 'true' });
    expect(warning.out).toContain(`::error file=${C}/CHG-12/plan.md,line=13,title=CHG-12 not ready::Foundation TSK-56 does not say what it unblocks`);
    expect(warning.out).toContain(`::notice file=${C}/CHG-12/release.yaml,line=5,title=REL-007 CHG-12::Flag order-history has no plan`);
  });
});

describe('analyze --tests (G4, docs/PDI-G4-PLAN.md)', () => {
  const junit = (cases: string) => `<?xml version="1.0"?><testsuite name="web/history.test.ts">${cases}</testsuite>`;
  const files = () => ({ [`${C}/CHG-12/intent.md`]: intent('CHG-12'), [`${C}/CHG-12/plan.md`]: plan('CHG-12', 'the list shows the 20 newest orders, newest first') });

  it('GATE-08: the criteria of the items get their tests; a failing one is reported, warnings fail only --fail-on warning', async () => {
    const root = checkout({ ...files(), 'reports/junit.xml': junit('<testcase classname="web/history.test.ts" name="TSK-57/AC-1 shows the newest orders"><failure message="expected 20 rows, got 0"/></testcase>') });
    const r = await gate(['--repo', root, '--tests', join(root, 'reports'), '--fail-on', 'critical']);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/Tests: 1 read, 1 failed, 1 naming a criterion/);
    const warn = await gate(['--repo', root, '--tests', join(root, 'reports/junit.xml'), '--fail-on', 'warning'], { GITHUB_ACTIONS: 'true' });
    expect(warn.code).toBe(1);
    expect(warn.out).toMatch(/::error file=web\/history\.test\.ts,title=TSK-57 not ready::Test of AC-1 fails/);
  });

  it('GATE-09: a test report that cannot be read fails the gate whatever the threshold', async () => {
    const root = checkout({ ...files(), 'reports/bad.xml': 'not xml' });
    const r = await gate(['--repo', root, '--tests', join(root, 'reports'), '--tests', join(root, 'missing')], { GITHUB_ACTIONS: 'true' });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/Test reports that could not be read/);
    expect(r.out).toMatch(/::error file=.*bad\.xml,title=Test report::Not a JUnit XML report/);
    expect(r.err).toMatch(/2 test report\(s\) could not be read/);
  });
});

describe('the workflow template for repositories (docs/templates/change-check.yml)', () => {
  it('GATE-07: a pull request that changes only release.yaml or plan.md runs the check on the repository', () => {
    const yml = readFileSync(fileURLToPath(new URL('../../../docs/templates/change-check.yml', import.meta.url)), 'utf8');
    const globs = [...(/^\s+paths: \[(.*)\]$/m.exec(yml)?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]!);
    expect(globs).toEqual(['docs/project/changes/**']);
    const re = (g: string) => new RegExp(`^${g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '.+').replace(/(?<!\.)\*/g, '[^/]*')}$`);
    for (const file of ['release.yaml', 'plan.md']) expect(globs.some((g) => re(g).test(`${C}/CHG-12/${file}`))).toBe(true);
    expect(yml).toMatch(/npm run analyze -- --repo "\$GITHUB_WORKSPACE"/);
  });
});
