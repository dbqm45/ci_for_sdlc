import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { demoProject, type PdiEvent } from '@ci/core';
import { buildApp } from '../src/app.js';
import { MAX_ATTEMPTS } from '../src/pdi.js';

// F4 (pdi docs/plan-f4-pdi.md): a person asks pdi to decide "Approve for implementation" for a change that is not
// ready; ci_for_sdlc sends gate.requested with what blocks its stories. A ready change goes as readiness.changed only.

let ctx: Awaited<ReturnType<typeof buildApp>> | undefined;
let dir: string;
let now: Date;
let sent: PdiEvent[];
let status: number;
/** The story labelled change:CHG-12. */
let key: string;

const fakeFetch = async (_url: string | URL, init?: { body?: string }) => {
  const e = JSON.parse(String(init?.body)) as PdiEvent;
  sent.push(e);
  const s = e.type === 'gate.requested' ? status : 202;
  return new Response(JSON.stringify(s === 400 ? { error: 'gate: unknown' } : { status: 'created', item: null }), { status: s, headers: { 'content-type': 'application/json' } });
};

afterEach(async () => {
  await ctx?.app.close();
  ctx = undefined;
  rmSync(dir, { recursive: true, force: true });
});

async function start(opts: { pdi?: boolean; ready?: boolean } = {}) {
  dir = mkdtempSync(join(tmpdir(), 'ci-gate-'));
  now = new Date('2026-10-27T12:00:00Z');
  sent = [];
  status = 202;
  ctx = await buildApp({ dataDir: dir, adminToken: '', allowedHosts: [], allowedOrigins: [], connect: undefined, pdi: opts.pdi === false ? { eventsUrl: '', secret: '' } : { eventsUrl: 'https://pdi.example.com', secret: 'shared-with-pdi', fetch: fakeFetch as typeof fetch, clock: () => now } });
  const first = await ctx.engine.analyze('initial');
  key = first.items.find((i) => i.type === 'story' && (i.readiness === 'ready') === !!opts.ready)!.key;
  const project = demoProject();
  project.requirements.find((r) => r.key === key)!.labels.push('change:CHG-12');
  await ctx.store.saveDemoContext(project);
  await ctx.engine.analyze('setup');
  await ctx.pdi.deliver();
  return ctx;
}
async function call(method: 'GET' | 'POST', url: string, payload?: unknown) {
  const res = await ctx!.app.inject({ method, url, payload: payload as object, headers: { 'x-ci-actor': 'Ann' } });
  return { status: res.statusCode, body: res.body ? res.json() : undefined };
}
const gateEvents = () => sent.filter((e) => e.type === 'gate.requested');

describe('request for approval in pdi (gate.requested)', () => {
  it('GQ-01: a change that is not ready goes to pdi with what blocks its stories; the request is remembered', async () => {
    await start();
    const changes = await call('GET', '/api/changes');
    expect(changes.body).toMatchObject({ pdi: true, changes: [{ change: 'CHG-12', readiness: 'not_ready', items: [key] }] });

    const r = await call('POST', '/api/changes/CHG-12/request-approval', { note: 'Ship behind a flag' });
    expect(r.status).toBe(200);
    await ctx!.pdi.deliver();
    const [e] = gateEvents();
    expect(e).toMatchObject({ type: 'gate.requested', source: 'ci_for_sdlc', contract_version: '0.7.0', payload: { change: 'CHG-12', gate: 'approve-for-implementation', artifact: `stories ${key}`, url: `http://localhost:4317/#/item/${key}` } });
    expect(e!.payload.summary).toMatch(/^CHG-12: Ann asks to approve it for implementation although 1 of 1 stories not ready — Ship behind a flag$/);
    expect((e!.payload.questions as string[]).length).toBeGreaterThan(0);
    expect((e!.payload.questions as string[]).every((q) => q.startsWith(`${key}: `))).toBe(true);
    expect((await call('GET', '/api/changes')).body.changes[0].requested).toEqual({ at: '2026-10-27T12:00:00.000Z', by: 'Ann', event: e!.id });
    expect((await ctx!.store.auditLog()).some((a) => a.kind === 'pdi' && a.actor === 'Ann' && /Asked pdi to approve CHG-12/.test(a.summary))).toBe(true);
  });

  it('GQ-02: refusals — unknown change 404, a ready change 409, without the pdi link 409, a key that is not a change 422', async () => {
    await start({ ready: true });
    expect((await call('POST', '/api/changes/CHG-99/request-approval')).status).toBe(404);
    expect((await call('POST', '/api/changes/chg-12/request-approval')).status).toBe(422);
    expect((await call('GET', '/api/changes')).body.changes[0].readiness).toBe('ready');
    expect((await call('POST', '/api/changes/CHG-12/request-approval')).status).toBe(409);
    await ctx!.app.close();
    rmSync(dir, { recursive: true, force: true });
    await start({ pdi: false });
    expect((await call('POST', '/api/changes/CHG-12/request-approval')).status).toBe(409);
    expect(await ctx!.store.pdiOutbox()).toEqual([]);
  });

  it('GQ-03: a request pdi refused stays as failed; one pdi does not answer is never dropped', async () => {
    await start();
    status = 400;
    await call('POST', '/api/changes/CHG-12/request-approval');
    await ctx!.pdi.deliver();
    expect((await ctx!.store.pdiOutbox()).find((e) => e.event.type === 'gate.requested')).toMatchObject({ failed: 'pdi answered 400: gate: unknown' });

    now = new Date(now.getTime() + 60_000);
    status = 503;
    await call('POST', '/api/changes/CHG-12/request-approval');
    for (let i = 0; i < MAX_ATTEMPTS + 1; i++) {
      now = new Date(now.getTime() + 2 * 3600_000);
      await ctx!.pdi.deliver();
    }
    const waiting = (await ctx!.store.pdiOutbox()).filter((e) => e.event.type === 'gate.requested' && !e.failed);
    expect(waiting).toHaveLength(1);
    expect(waiting[0]!.attempts).toBeGreaterThanOrEqual(MAX_ATTEMPTS);
  });
});
