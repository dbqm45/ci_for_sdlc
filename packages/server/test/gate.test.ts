import { createHmac, randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { runGate } from '../src/gate.js';
import { Store } from '../src/store.js';

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

  it('GATE-13 (PRB-16): a decision in the change\'s decisions.md settles the finding, so the gate passes; a bad entry fails it', async () => {
    const decided = (finding: string) =>
      `# Decyzje zmiany CHG-12\n\n## The list is checked by hand in the review\n- ref: CHG-12/D1\n- id:\n- wyslano: nie\n- kiedy: 2026-10-30\n- kto: Ann\n- rodzaj: product\n- dlaczego: A spike, no criteria yet.\n- zrodlo: claude-cli\n- szkic: human\n- ustalenie: ${finding}\n- skutek: accept_risk\n`;
    const files = (d: string) => ({ [`${C}/CHG-12/intent.md`]: intent('CHG-12'), [`${C}/CHG-12/plan.md`]: plan('CHG-12', ''), [`${C}/CHG-12/decisions.md`]: d });
    const ok = await gate(['--repo', checkout(files(decided('REQ-001:TSK-57'))), '--fail-on', 'critical']);
    expect(ok.code).toBe(0);
    expect(ok.out).not.toMatch(/✗ No acceptance criteria/);
    const bad = await gate(['--repo', checkout(files(decided('REQ-001:TSK-99'))), '--fail-on', 'critical']);
    expect(bad.code).toBe(1);
    expect(`${bad.out}\n${bad.err}`).toMatch(/decisions\.md.*TSK-99, which is not CHG-12 or one of its slices/);
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

describe('analyze --openapi (docs/OPENAPI-PLAN.md)', () => {
  const files = () => ({ [`${C}/CHG-12/intent.md`]: intent('CHG-12'), [`${C}/CHG-12/plan.md`]: plan('CHG-12', 'the list shows the 20 newest orders, newest first') });
  const spec = 'openapi: 3.0.3\ninfo: { title: Orders API, version: "1" }\npaths:\n  /orders:\n    get:\n      x-requirements: [TSK-57]\n      responses:\n        "200": { description: OK }\n';

  it('GATE-11: the operations of the contract join the analysis and are counted', async () => {
    const root = checkout({ ...files(), 'api/openapi.yaml': spec });
    const r = await gate(['--repo', root, '--openapi', join(root, 'api'), '--fail-on', 'critical']);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/API contract: 1 operation read/);
  });

  it('GATE-12: a contract file that cannot be read fails the gate whatever the threshold', async () => {
    const root = checkout({ ...files(), 'api/openapi.yaml': 'swagger: "2.0"' });
    const r = await gate(['--repo', root, '--openapi', join(root, 'api/openapi.yaml')], { GITHUB_ACTIONS: 'true' });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/API contract files that could not be read/);
    expect(r.out).toMatch(/::error file=.*openapi\.yaml,title=API contract::Swagger 2\.0 is not supported/);
    expect(r.err).toMatch(/1 API contract file\(s\) could not be read/);
  });
});

describe('analyze --send-to-pdi (L3, docs/PDI-L3-PLAN.md)', () => {
  // A local pdi-receiver: records each request and answers with `status`.
  const SECRET = randomBytes(16).toString('hex');
  let status = 202;
  let received: { url: string; headers: IncomingHttpHeaders; body: string }[] = [];
  const receiver = createServer((req, res) => {
    let body = '';
    req.on('data', (c: Buffer) => (body += c.toString()));
    req.on('end', () => {
      received.push({ url: req.url ?? '', headers: req.headers, body });
      res.writeHead(status, { 'content-type': 'application/json' }).end(status < 300 ? '{}' : '{"error":"down for maintenance"}');
    });
  });
  let url = '';
  beforeAll(async () => {
    await new Promise<void>((ok) => receiver.listen(0, '127.0.0.1', ok));
    url = `http://127.0.0.1:${(receiver.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((ok) => receiver.close(() => ok())));
  beforeEach(() => {
    status = 202;
    received = [];
  });

  const schema = JSON.parse(readFileSync(fileURLToPath(new URL('../../core/test/fixtures/pdi-contract/0.7.0/event.schema.json', import.meta.url)), 'utf8'));
  const example = JSON.parse(readFileSync(fileURLToPath(new URL('../../core/test/fixtures/pdi-contract/0.4.0/events/event-readiness.changed.json', import.meta.url)), 'utf8'));
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
  const ready = 'the list shows the 20 newest orders, newest first';
  const twoChanges = () =>
    checkout({ [`${C}/CHG-12/intent.md`]: intent('CHG-12'), [`${C}/CHG-12/plan.md`]: plan('CHG-12', ready), [`${C}/CHG-13/intent.md`]: intent('CHG-13'), [`${C}/CHG-13/plan.md`]: plan('CHG-13', '').replace(/TSK-57/g, 'TSK-58') });
  const pdiEnv = (data: string) => ({ CI_DATA_DIR: data, PDI_EVENTS_URL: url, PDI_SIGNING_SECRET: SECRET });
  /** A data dir whose policy only records warnings, so a slice with a verification is ready (Figma links aside). */
  const dataDir = async () => {
    const dir = join(tmp, `data${n++}`);
    const store = new Store(dir);
    await store.init();
    const settings = await store.settings();
    await store.saveSettings({ ...settings, policy: { ...settings.policy, actions: { ...settings.policy.actions, warning: 'record' } } });
    return dir;
  };

  it('L3-01: one signed readiness.changed per change of the repository, in the contract shape, reported as delivered', async () => {
    const root = twoChanges();
    const r = await gate(['--repo', root, '--send-to-pdi'], pdiEnv(await dataDir()));
    expect(r.code).toBe(0);
    expect(received.map((x) => x.url)).toEqual(['/events/ci_for_sdlc', '/events/ci_for_sdlc']);
    const events = received.map((x) => JSON.parse(x.body));
    expect(events.map((e) => [e.payload.change, e.payload.readiness])).toEqual([['CHG-12', 'ready'], ['CHG-13', 'not_ready']]);
    for (const [i, x] of received.entries()) {
      const ts = String(x.headers['x-pdi-timestamp']);
      expect(x.headers['x-pdi-event']).toBe('readiness.changed');
      expect(x.headers['x-pdi-signature']).toBe(`v1=${createHmac('sha256', SECRET).update(`${ts}.${x.body}`).digest('hex')}`);
      expect(validate(events[i]), JSON.stringify(validate.errors)).toBe(true);
      expect(Object.keys(events[i]).sort()).toEqual(Object.keys(example).sort());
      expect(Object.keys(events[i].payload).sort()).toEqual(Object.keys(example.payload).sort());
      expect(events[i]).toMatchObject({ type: 'readiness.changed', source: 'ci_for_sdlc', contract_version: example.contract_version });
    }
    expect(r.out).toContain(`pdi: ${url}`);
    expect(r.out).toMatch(/^ {2}pdi readiness\.changed CHG-12 ready delivered$/m);
    expect(r.out).toMatch(/^ {2}pdi readiness\.changed CHG-13 not_ready delivered$/m);
    expect(r.out + r.err).not.toContain(SECRET);
  });

  it('L3-02: nothing is sent again while the readiness stays the same; a change that moves is sent alone', async () => {
    const root = twoChanges();
    const env = pdiEnv(await dataDir());
    await gate(['--repo', root, '--send-to-pdi'], env);
    received = [];
    const again = await gate(['--repo', root, '--send-to-pdi'], env);
    expect(received).toEqual([]);
    expect(again.out).toMatch(/^ {2}pdi readiness\.changed CHG-12 ready unchanged$/m);
    expect(again.out).toMatch(/^ {2}pdi readiness\.changed CHG-13 not_ready unchanged$/m);
    writeFileSync(join(root, `${C}/CHG-13/plan.md`), plan('CHG-13', ready).replace(/TSK-57/g, 'TSK-58'));
    const moved = await gate(['--repo', root, '--send-to-pdi'], env);
    expect(received.map((x) => JSON.parse(x.body).payload)).toEqual([{ change: 'CHG-13', readiness: 'ready', open_questions: expect.any(Number) }]);
    expect(moved.out).toMatch(/^ {2}pdi readiness\.changed CHG-13 ready delivered$/m);
  });

  it('L3-03: without PDI_EVENTS_URL, PDI_SIGNING_SECRET or --repo it refuses with exit 2 before the analysis', async () => {
    const root = twoChanges();
    const data = await dataDir();
    for (const env of <Record<string, string>[]>[{ CI_DATA_DIR: data, PDI_SIGNING_SECRET: SECRET }, { CI_DATA_DIR: data, PDI_EVENTS_URL: url }, { CI_DATA_DIR: data, PDI_EVENTS_URL: 'http://pdi.example.com', PDI_SIGNING_SECRET: SECRET }]) {
      const r = await gate(['--repo', root, '--send-to-pdi'], env);
      expect(r.code).toBe(2);
      expect(r.err).toMatch(/--send-to-pdi needs PDI_EVENTS_URL \(https, or http on localhost\) and PDI_SIGNING_SECRET/);
      expect(r.out).not.toMatch(/CONTINUOUS INTELLIGENCE/);
    }
    const noRepo = await gate(['--send-to-pdi'], pdiEnv(data));
    expect(noRepo.code).toBe(2);
    expect(noRepo.err).toMatch(/--send-to-pdi needs --repo/);
    expect(received).toEqual([]);
  });

  it('L3-04: a failed delivery is reported and stays queued, but the exit code is that of the gate', async () => {
    const root = twoChanges();
    const data = await dataDir();
    const without = await gate(['--repo', root, '--fail-on', 'critical'], { CI_DATA_DIR: await dataDir() });
    status = 500;
    const r = await gate(['--repo', root, '--fail-on', 'critical', '--send-to-pdi'], pdiEnv(data));
    expect(without.code).toBe(1);
    expect(r.code).toBe(without.code);
    expect(r.out).toMatch(/^ {2}pdi readiness\.changed CHG-12 ready queued \(pdi answered 500: down for maintenance\)$/m);
    expect(r.out).toMatch(/^ {2}pdi queued readiness\.changed CHG-13 attempts=1 next=\S+ \(pdi answered 500: down for maintenance\)$/m);
    const store = new Store(data);
    await store.init();
    expect((await store.pdiOutbox()).map((e) => e.event.payload.change)).toEqual(['CHG-12', 'CHG-13']);

    const closed = createServer();
    await new Promise<void>((ok) => closed.listen(0, '127.0.0.1', ok));
    const gone = `http://127.0.0.1:${(closed.address() as AddressInfo).port}`;
    await new Promise<void>((ok) => closed.close(() => ok()));
    const down = await gate(['--repo', root, '--send-to-pdi'], { ...pdiEnv(await dataDir()), PDI_EVENTS_URL: gone });
    expect(down.code).toBe(0);
    expect(down.out).toMatch(/^ {2}pdi readiness\.changed CHG-12 ready queued \(pdi unreachable: .+\)$/m);
  });

  it('L3-05: without the flag there is no pdi traffic and the output is the same', async () => {
    const root = twoChanges();
    const plain = await gate(['--repo', root], { CI_DATA_DIR: await dataDir() });
    const withEnv = await gate(['--repo', root], pdiEnv(await dataDir()));
    expect(received).toEqual([]);
    expect(withEnv.code).toBe(plain.code);
    const stable = (s: string) => s.replace(/\(\d{4}-\d\d-\d\dT[\d:.]+Z\)/, '(…)');
    expect(stable(withEnv.out)).toBe(stable(plain.out));
    expect(withEnv.out).not.toMatch(/^ *pdi/m);
  });
});

describe('the workflow template for repositories (docs/templates/change-check.yml)', () => {
  it('GATE-07: a pull request that changes only release.yaml or plan.md runs the check on the repository', () => {
    const yml = readFileSync(fileURLToPath(new URL('../../../docs/templates/change-check.yml', import.meta.url)), 'utf8');
    const globs = [...(/^\s+paths: \[(.*)\]$/m.exec(yml)?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]!);
    expect(globs).toEqual(['docs/project/changes/**']);
    const re = (g: string) => new RegExp(`^${g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '.+').replace(/(?<!\.)\*/g, '[^/]*')}$`);
    for (const file of ['release.yaml', 'plan.md']) expect(globs.some((g) => re(g).test(`${C}/CHG-12/${file}`))).toBe(true);
    expect(yml).toMatch(/set -- --repo "\$GITHUB_WORKSPACE"/);
    expect(yml).toMatch(/npm run analyze -- "\$@"/);
  });

  it('GATE-10: test results are opt-in through TEST_REPORTS; once set, a missing report fails the check instead of being skipped', () => {
    const yml = readFileSync(fileURLToPath(new URL('../../../docs/templates/change-check.yml', import.meta.url)), 'utf8');
    expect(yml).toMatch(/^\s+TEST_REPORTS: ''/m);
    expect(yml).toMatch(/if \[ -n "\$TEST_REPORTS" \]; then set -- "\$@" --tests "\$GITHUB_WORKSPACE\/\$TEST_REPORTS"; fi/);
    expect(yml, 'no -e check that would skip a report the tests did not write').not.toMatch(/-e "\$GITHUB_WORKSPACE\/\$TEST_REPORTS"/);
  });
});
