import { createHmac } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { demoProject, type ChangeReadiness } from '@ci/core';
import { buildApp } from '../src/app.js';
import { PdiLink, pdiSignature, type PdiOptions } from '../src/pdi.js';
import { Store } from '../src/store.js';

// F4 with pdi (docs/PDI-F4-PLAN.md): readiness.changed out to pdi-receiver, gate.decided in from pdi.

const SECRET = 'shared-with-pdi';
type Sent = { url: string; headers: Record<string, string>; body: string };

let ctx: Awaited<ReturnType<typeof buildApp>>;
let sent: Sent[] = [];
let answer = 202;
const dir = mkdtempSync(join(tmpdir(), 'ci-pdi-'));
let now = new Date('2026-10-26T10:00:00Z');

const fakeFetch = async (url: string | URL, init?: { headers?: Record<string, string>; body?: string }) => {
  sent.push({ url: String(url), headers: init?.headers ?? {}, body: String(init?.body ?? '') });
  return new Response('{}', { status: answer });
};

/** The demo project with CHG-12 = PAY-123 + PAY-125 (PAY-125 has blocking issues) and CHG-13 = a ready story. */
let readyKey = '';

beforeAll(async () => {
  ctx = await buildApp({ dataDir: dir, pdi: { eventsUrl: 'https://pdi.example.com', secret: SECRET, fetch: fakeFetch as typeof fetch, clock: () => now } });
  const first = await ctx.engine.analyze('setup');
  readyKey = first.items.find((i) => i.type === 'story' && i.readiness === 'ready' && i.key !== 'PAY-123')?.key ?? '';
  const project = demoProject();
  for (const r of project.requirements) {
    if (r.key === 'PAY-123' || r.key === 'PAY-125') r.labels = [...r.labels, 'change:CHG-12'];
    if (r.key === readyKey) r.labels = [...r.labels, 'change:CHG-13'];
  }
  await ctx.store.saveDemoContext(project);
});
afterAll(async () => {
  await ctx.app.close();
  rmSync(dir, { recursive: true, force: true });
});

const sign = (body: string, ts = String(Math.floor(now.getTime() / 1000)), secret = SECRET) => ({
  'content-type': 'application/json',
  'x-pdi-timestamp': ts,
  'x-pdi-event': 'gate.decided',
  'x-pdi-signature': `v1=${createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex')}`,
});
const decided = (p: Partial<{ id: string; change: string; gate: string; outcome: string; decision: string }> = {}) =>
  JSON.stringify({
    id: p.id ?? 'gate.decided-evt-1',
    type: 'gate.decided',
    occurred_at: '2026-10-26T10:00:00Z',
    source: 'pdi',
    contract_version: '0.4.0',
    payload: { change: p.change ?? 'CHG-12', gate: p.gate ?? 'approve-for-implementation', outcome: p.outcome ?? 'approved', decision: p.decision ?? 'DEC-41' },
  });
const post = (body: string, headers: Record<string, string>) => ctx.app.inject({ method: 'POST', url: '/api/webhooks/pdi', payload: body, headers });

describe('readiness.changed to pdi', () => {
  it('sends the readiness of each labelled change after an analysis, signed like pdi-receiver expects', async () => {
    expect(readyKey).not.toBe('');
    sent = [];
    await ctx.engine.analyze('labels');
    await ctx.pdi.deliver();
    const bodies = sent.map((s) => JSON.parse(s.body));
    expect(sent.every((s) => s.url === 'https://pdi.example.com/events/ci_for_sdlc')).toBe(true);
    expect(bodies.map((b) => [b.payload.change, b.payload.readiness])).toEqual([['CHG-12', 'not_ready'], ['CHG-13', 'ready']]);
    for (const s of sent) {
      const ts = s.headers['x-pdi-timestamp'] ?? '';
      expect(s.headers['x-pdi-event']).toBe('readiness.changed');
      expect(s.headers['x-pdi-signature']).toBe(pdiSignature(SECRET, ts, s.body));
      expect(s.headers['x-pdi-signature']).toBe(`v1=${createHmac('sha256', SECRET).update(`${ts}.${s.body}`).digest('hex')}`);
    }
  });

  it('sends nothing new when the readiness did not change', async () => {
    sent = [];
    await ctx.engine.analyze('again');
    await ctx.pdi.deliver();
    expect(sent).toEqual([]);
  });

  it('keeps a failed delivery queued and retries it after the backoff', async () => {
    const project = (await ctx.store.demoContext())!;
    for (const r of project.requirements) if (r.key === readyKey) r.labels = r.labels.map((l) => (l === 'change:CHG-13' ? 'change:CHG-14' : l));
    await ctx.store.saveDemoContext(project);
    answer = 500;
    sent = [];
    await ctx.engine.analyze('new change');
    await ctx.pdi.deliver();
    expect(sent).toHaveLength(1);
    const state = (await ctx.app.inject({ method: 'GET', url: '/api/pdi' })).json();
    expect(state.outbox).toHaveLength(1);
    expect(state.outbox[0]).toMatchObject({ attempts: 1, lastError: 'pdi answered 500' });
    expect(JSON.stringify(state)).not.toContain(SECRET);
    answer = 202;
    await ctx.pdi.deliver();
    expect(sent).toHaveLength(1); // not due yet
    now = new Date(now.getTime() + 61_000);
    await ctx.pdi.deliver();
    expect(sent).toHaveLength(2);
    expect((await ctx.app.inject({ method: 'GET', url: '/api/pdi' })).json().outbox).toEqual([]);
  });
});

describe('gate.decided from pdi', () => {
  it('refuses a bad, stale or missing signature', async () => {
    const body = decided();
    expect((await post(body, { ...sign(body), 'x-pdi-signature': 'v1=00' })).statusCode).toBe(401);
    expect((await post(body, sign(body, undefined, 'other'))).statusCode).toBe(401);
    expect((await post(body, sign(body, String(Math.floor(now.getTime() / 1000) - 3600)))).statusCode).toBe(401);
    expect((await post(body, { 'content-type': 'application/json' })).statusCode).toBe(401);
  });

  it('refuses an event that is not a gate.decided from pdi', async () => {
    const body = decided({ change: 'chg-1' });
    const res = await post(body, sign(body));
    expect(res.statusCode).toBe(400);
    expect(res.json().detail).toMatch(/change/);
  });

  it('approves the stories of the change without blocking issues and records the pdi decision', async () => {
    const body = decided();
    const res = await post(body, sign(body));
    expect(res.statusCode).toBe(200);
    expect(res.json().approved).toEqual(['PAY-123']);
    expect(res.json().skipped).toEqual([{ key: 'PAY-125', reason: expect.stringMatching(/blocking/) }]);
    const item = (await ctx.app.inject({ method: 'GET', url: '/api/items/PAY-123' })).json();
    expect(item.approval).toMatchObject({ approvedBy: 'pdi', decision: 'DEC-41' });
    expect((await ctx.app.inject({ method: 'GET', url: '/api/items/PAY-125' })).json().approval).toBeUndefined();
    const audit = (await ctx.app.inject({ method: 'GET', url: '/api/audit' })).json();
    expect(audit.some((a: { kind: string; summary: string; via?: string }) => a.kind === 'approval' && a.summary.includes('DEC-41') && a.via === 'pdi_signature')).toBe(true);
  });

  it('does nothing twice for the same event', async () => {
    const body = decided();
    const res = await post(body, sign(body));
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ duplicate: true, approved: [] });
  });

  it('only records other gates and outcomes', async () => {
    const before = (await ctx.store.approvals()).length;
    for (const [id, p] of [['e2', { gate: 'B2' }], ['e3', { outcome: 'changes_requested', change: 'CHG-14' }]] as const) {
      const body = decided({ id, ...p });
      const res = await post(body, sign(body));
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ approved: [], recorded: true });
    }
    expect((await ctx.store.approvals()).length).toBe(before);
  });
});

describe('without pdi configured', () => {
  it('has no webhook and sends nothing', async () => {
    const other = mkdtempSync(join(tmpdir(), 'ci-pdi-off-'));
    const off = await buildApp({ dataDir: other, pdi: { fetch: fakeFetch as typeof fetch } });
    const body = decided();
    expect((await off.app.inject({ method: 'POST', url: '/api/webhooks/pdi', payload: body, headers: sign(body) })).statusCode).toBe(404);
    sent = [];
    await off.engine.analyze('x');
    await off.pdi.deliver();
    expect(sent).toEqual([]);
    expect((await off.app.inject({ method: 'GET', url: '/api/pdi' })).json()).toMatchObject({ enabled: false });
    await off.app.close();
    rmSync(other, { recursive: true, force: true });
  });
});

describe('bounded delivery for the CLI gate (L3, docs/PDI-L3-PLAN.md)', () => {
  const change = (id: string, readiness: ChangeReadiness['readiness']): ChangeReadiness => ({ change: id, readiness, openQuestions: 0, items: [] });
  const link = async (f: typeof fetch, opts: Partial<PdiOptions> = {}) => {
    const store = new Store(mkdtempSync(join(tmpdir(), 'ci-pdi-cli-')));
    await store.init();
    return { store, pdi: new PdiLink(store, { eventsUrl: 'https://pdi.example.com', secret: SECRET, fetch: f, ...opts }, {}) };
  };

  it('enqueue returns the events it queued, none when the readiness did not change', async () => {
    const { pdi } = await link(fakeFetch as typeof fetch);
    const first = await pdi.enqueue([change('CHG-1', 'ready'), change('CHG-2', 'not_ready')]);
    expect(first.map((e) => [e.type, e.payload.change, e.payload.readiness])).toEqual([['readiness.changed', 'CHG-1', 'ready'], ['readiness.changed', 'CHG-2', 'not_ready']]);
    expect(await pdi.enqueue([change('CHG-1', 'ready'), change('CHG-2', 'not_ready')])).toEqual([]);
  });

  it('gives up on a receiver that does not answer within timeoutMs, and leaves what is past budgetMs queued without an attempt', async () => {
    const calls: string[] = [];
    const hang = ((_url: string, init?: { body?: string; signal?: AbortSignal }) => {
      calls.push(JSON.parse(String(init?.body)).payload.change);
      return new Promise((_ok, fail) => init?.signal?.addEventListener('abort', () => fail(init.signal?.reason)));
    }) as unknown as typeof fetch;
    const { store, pdi } = await link(hang, { timeoutMs: 100 });
    await pdi.enqueue([change('CHG-1', 'ready'), change('CHG-2', 'ready'), change('CHG-3', 'ready')]);
    const started = Date.now();
    await pdi.deliver({ budgetMs: 150 });
    expect(Date.now() - started).toBeLessThan(1000);
    expect(calls).toEqual(['CHG-1', 'CHG-2']);
    const outbox = await store.pdiOutbox();
    expect(outbox.map((e) => [e.event.payload.change, e.attempts])).toEqual([['CHG-1', 1], ['CHG-2', 1], ['CHG-3', 0]]);
    expect(outbox[0]?.lastError).toMatch(/^pdi unreachable: /);
  });
});
