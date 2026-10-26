import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
    expect(r.out).toContain(`::error file=${C}/CHG-12/plan.md,title=TSK-57 not ready::No acceptance criteria`);
    const md = readFileSync(summary, 'utf8');
    expect(md).toMatch(/^## Definition check/m);
    expect(md).toMatch(/\| 🔴 \| TSK-57 \| story \| Customer sees the list of their last orders \| No acceptance criteria \|/);
    expect(md).toContain(`- \`${C}/CHG-13/intent.md\`: no YAML header`);
  });
});
