import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { Store } from '../src/store.js';
import { SuiteDecisions, splitCommand } from '../src/suite-decisions.js';

// D9 (docs/PDI-D9-PLAN.md): the copy of the suite decision index comes from `pdi-records changes` (pdi D7), here a fake
// that answers from FAKE_INDEX like pdi does (cursor <changed_at>/<id>, pages, complete) and logs its arguments.

const FAKE = `
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify(args) + '\\n');
if (process.env.FAKE_FAIL) { process.stderr.write('registry locked: secret-path'); process.exit(3); }
if (args[0] !== 'changes') process.exit(4);
const at = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const since = at('--since');
const limit = Number(at('--limit') ?? 200);
const key = (d) => [d.changed_at, Number(d.id.split('-')[1])];
const after = (a, b) => a[0] > b[0] || (a[0] === b[0] && a[1] > b[1]);
let rows = JSON.parse(fs.readFileSync(process.env.FAKE_INDEX, 'utf8')).sort((a, b) => (after(key(a), key(b)) ? 1 : -1));
if (since) { const [t, id] = since.split('/'); rows = rows.filter((d) => after(key(d), [t, Number(id.split('-')[1])])); }
const page = rows.slice(0, limit);
const last = page[page.length - 1];
console.log(JSON.stringify({ decisions: page, next: last ? last.changed_at + '/' + last.id : since, complete: rows.length <= limit }));
`;

let dir: string;
let ctx: Awaited<ReturnType<typeof buildApp>> | undefined;
afterEach(async () => {
  await ctx?.app.close();
  ctx = undefined;
  if (dir) rmSync(dir, { recursive: true, force: true });
});

const dec = (id: string, statement: string, changedAt: string, over: Record<string, unknown> = {}) => ({ id, statement, why: 'Agreed.', status: 'recorded', decided_at: changedAt.slice(0, 10), decided_by: 'po', source: { kind: 'manual' }, changed_at: changedAt, text: '---\n', ...over });

function setup(rows: unknown[]) {
  dir = mkdtempSync(join(tmpdir(), 'ci-d9-'));
  const fake = join(dir, 'fake-pdi-records.cjs');
  writeFileSync(fake, FAKE);
  const index = join(dir, 'index.json');
  const log = join(dir, 'calls.jsonl');
  writeFileSync(index, JSON.stringify(rows));
  const env = { ...process.env, FAKE_INDEX: index, FAKE_LOG: log };
  return { cmd: `${process.execPath} ${fake}`, env, index, log, calls: () => (existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as string[]) : []) };
}

describe('suite decisions copy in DI Definition (D9)', () => {
  it('D9-01: the command is split like a shell would, without running one', () => {
    expect(splitCommand(`uv run --directory "/srv/my pdi" pdi-records`)).toEqual(['uv', 'run', '--directory', '/srv/my pdi', 'pdi-records']);
    expect(splitCommand(`node 'a b.js' x`)).toEqual(['node', 'a b.js', 'x']);
    expect(splitCommand('  ')).toEqual([]);
  });

  it('D9-02: off without a command; the first refresh copies the index without our own decisions', async () => {
    const f = setup([
      dec('DEC-1', 'Approve CHG-12 for implementation', '2026-11-20T09:00:00Z', { links: { chg: 'CHG-12' }, source: { kind: 'manual', url: 'https://pdi.example.com/d/1' } }),
      dec('DEC-2', 'Ours', '2026-11-21T09:00:00Z', { origin: { app: 'ci_for_sdlc', scope: 'default', local_id: 'PAY-1/ERR-001:PAY-1' } }),
      dec('DEC-3', 'Event queue on Postgres', '2026-11-22T09:00:00Z', { origin: { app: 'tf', scope: 'dbqm45/shop', local_id: 'D-001' } }),
    ]);
    const store = new Store(dir);
    const off = new SuiteDecisions(store, { cmd: '', env: f.env });
    expect(off.enabled).toBe(false);
    expect(await off.refresh()).toEqual({ ok: false });
    expect(f.calls()).toEqual([]);

    const s = new SuiteDecisions(store, { cmd: f.cmd, env: f.env, clock: () => new Date('2026-11-23T10:00:00Z') });
    expect(await s.refresh()).toEqual({ ok: true });
    expect(f.calls()).toEqual([['changes', '--limit', '200']]);
    const cache = await store.suiteDecisions();
    expect(cache.decisions.map((d) => [d.id, d.app])).toEqual([['DEC-1', 'pdi'], ['DEC-3', 'tf']]);
    expect(cache).toMatchObject({ next: '2026-11-22T09:00:00Z/DEC-3', fetchedAt: '2026-11-23T10:00:00.000Z' });
    expect(await s.status()).toEqual({ enabled: true, fetchedAt: '2026-11-23T10:00:00.000Z', count: 2 });
  });

  it('D9-03: the next refresh asks only for what changed, in pages; a supersession replaces the state', async () => {
    const rows = [dec('DEC-1', 'Free delivery from 199', '2026-11-20T09:00:00Z')];
    const f = setup(rows);
    const store = new Store(dir);
    const s = new SuiteDecisions(store, { cmd: f.cmd, env: f.env, pageSize: 2 });
    await s.refresh();
    rows[0] = dec('DEC-1', 'Free delivery from 199', '2026-11-22T09:00:00Z', { status: 'superseded', superseded_by: 'DEC-5' });
    rows.push(...[5, 6, 7, 8].map((n) => dec(`DEC-${n}`, `Decision ${n}`, '2026-11-22T09:00:00Z')));
    writeFileSync(f.index, JSON.stringify(rows));
    await s.refresh();
    const calls = f.calls();
    expect(calls[1]).toEqual(['changes', '--since', '2026-11-20T09:00:00Z/DEC-1', '--limit', '2']);
    expect(calls).toHaveLength(4);
    const cache = await store.suiteDecisions();
    expect(cache.decisions.find((d) => d.id === 'DEC-1')).toMatchObject({ status: 'superseded', supersededBy: 'DEC-5' });
    expect(cache.decisions).toHaveLength(5);
  });

  it('D9-04: pdi unavailable — the last copy stays, the state says why without the command output', async () => {
    const f = setup([dec('DEC-1', 'Free delivery from 199', '2026-11-20T09:00:00Z')]);
    const store = new Store(dir);
    await new SuiteDecisions(store, { cmd: f.cmd, env: f.env }).refresh();
    const s = new SuiteDecisions(store, { cmd: f.cmd, env: { ...f.env, FAKE_FAIL: '1' } });
    expect(await s.refresh()).toEqual({ ok: false });
    const status = await s.status();
    expect(status).toMatchObject({ enabled: true, count: 1, error: 'pdi-records changes exited 3' });
    expect(JSON.stringify(status)).not.toContain('secret-path');
    expect((await store.suiteDecisions()).decisions.map((d) => d.id)).toEqual(['DEC-1']);
  });

  it('D9-05: GET /api/suite-decisions selects by change and words; refresh on demand; off without a command', async () => {
    const f = setup([
      dec('DEC-1', 'Approve CHG-12 for implementation', '2026-11-20T09:00:00Z', { links: { chg: 'CHG-12' } }),
      dec('DEC-3', 'Event queue on Postgres', '2026-11-22T09:00:00Z', { origin: { app: 'tf', scope: 'dbqm45/shop', local_id: 'D-001' } }),
    ]);
    ctx = await buildApp({ dataDir: dir, adminToken: '', allowedHosts: [], allowedOrigins: [], connect: undefined, suiteDecisions: { cmd: f.cmd, env: f.env } });
    await ctx.settle();
    const api = { get: async (url: string) => (await ctx!.app.inject({ method: 'GET', url })).json() };
    expect(await api.get('/api/suite-decisions?change=CHG-12')).toMatchObject({ enabled: true, count: 2, decisions: [{ id: 'DEC-1', app: 'pdi', change: 'CHG-12' }] });
    expect((await api.get('/api/suite-decisions?q=postgres')).decisions.map((d: { id: string }) => d.id)).toEqual(['DEC-3']);
    expect((await api.get('/api/suite-decisions')).decisions).toEqual([]);

    writeFileSync(f.index, JSON.stringify([dec('DEC-9', 'Retry payments twice', '2026-11-23T09:00:00Z')]));
    const r = await ctx.app.inject({ method: 'POST', url: '/api/suite-decisions/refresh' });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ enabled: true, count: 3 });
    await ctx.app.close();

    ctx = await buildApp({ dataDir: dir, adminToken: '', allowedHosts: [], allowedOrigins: [], connect: undefined, suiteDecisions: { cmd: '' } });
    expect(await api.get('/api/suite-decisions?q=postgres')).toEqual({ enabled: false, count: 0, decisions: [] });
    expect((await ctx.app.inject({ method: 'POST', url: '/api/suite-decisions/refresh' })).statusCode).toBe(409);
  });
});
