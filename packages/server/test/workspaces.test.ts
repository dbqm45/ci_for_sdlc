import { createHmac } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { demoProject, type ActiveDecision, type Finding, type PdiEvent } from '@ci/core';
import { buildApp } from '../src/app.js';

// F5 (docs/WORKSPACES-F5-PLAN.md): several workspaces in one installation, each with its own sources, analysis and
// decisions; /api/… is the workspace "default", /api/w/:ws/… any workspace; pdi sees one change across all of them.

const SECRET = 'shared-with-pdi';
let ctx: Awaited<ReturnType<typeof buildApp>> | undefined;
let dir: string;
let sent: PdiEvent[];
const now = new Date('2026-10-27T12:00:00Z');
const fakeFetch = async (_url: string | URL, init?: { body?: string }) => {
  const e = JSON.parse(String(init?.body)) as PdiEvent;
  sent.push(e);
  const body = e.type === 'decision.recorded' ? { status: 'recorded', item: null, decision: 'DEC-77' } : { status: 'created', item: null };
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
};

afterEach(async () => {
  await ctx?.app.close();
  ctx = undefined;
  rmSync(dir, { recursive: true, force: true });
});

async function start(opts: { pdi?: boolean; keepDir?: boolean } = {}) {
  if (!opts.keepDir) dir = mkdtempSync(join(tmpdir(), 'ci-ws-'));
  sent = [];
  ctx = await buildApp({ dataDir: dir, adminToken: '', allowedHosts: [], allowedOrigins: [], connect: undefined, pdi: opts.pdi ? { eventsUrl: 'https://pdi.example.com', secret: SECRET, fetch: fakeFetch as typeof fetch, clock: () => now } : { eventsUrl: '', secret: '' } });
  return ctx;
}
async function call(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: unknown, headers: Record<string, string> = {}) {
  const res = await ctx!.app.inject({ method, url, payload: payload as object, headers: { 'x-ci-actor': 'Ann', ...headers } });
  return { status: res.statusCode, body: res.body ? res.json() : undefined, headers: res.headers };
}
/** Labels `key` with change:CHG-12 in the workspace's demo project and analyses it again. */
async function label(ws: string, key: string) {
  const w = ctx!.workspaces.get(ws)!;
  const project = (await w.store.demoContext()) ?? demoProject();
  project.requirements.find((r) => r.key === key)!.labels.push('change:CHG-12');
  await w.store.saveDemoContext(project);
  await w.engine.analyze('label');
}
const storyKeys = async (ws: string, ready: boolean) => (await ctx!.workspaces.get(ws)!.engine.analyze('setup')).items.filter((i) => i.type === 'story' && (i.readiness === 'ready') === ready).map((i) => i.key);

describe('workspaces', () => {
  it('WS-01: default is listed; a new workspace is created once, with a valid id, and stays after a restart', async () => {
    await start();
    expect((await call('GET', '/api/workspaces')).body).toEqual([{ id: 'default', name: 'Default' }]);
    expect((await call('POST', '/api/workspaces', { id: 'mobile', name: 'Mobile app' })).status).toBe(201);
    expect((await call('POST', '/api/workspaces', { id: 'mobile' })).status).toBe(409);
    expect((await call('POST', '/api/workspaces', { id: 'Bad id' })).status).toBe(422);
    expect((await call('POST', '/api/workspaces', { id: 'mobile2' }, { authorization: 'Bearer nope', origin: 'https://evil.example.com' })).status).toBe(403);
    expect(existsSync(join(dir, 'workspaces', 'mobile'))).toBe(true);
    await ctx!.app.close();
    await start({ keepDir: true });
    expect((await call('GET', '/api/workspaces')).body).toEqual([{ id: 'default', name: 'Default' }, { id: 'mobile', name: 'Mobile app' }]);
    expect((await call('GET', '/api/w/mobile/analysis')).status).toBe(200);
  });

  it('WS-02: decisions and settings of one workspace are not seen in another; /api/w/default is /api', async () => {
    await start();
    await call('POST', '/api/workspaces', { id: 'mobile' });
    const r = await call('POST', '/api/w/mobile/decisions', { questionId: 'q-ws', itemKey: 'PAY-123', answer: 'Only in mobile' });
    expect(r.status).toBe(200);
    expect((await call('GET', '/api/w/mobile/decisions')).body.map((d: ActiveDecision) => d.answer)).toEqual(['Only in mobile']);
    expect((await call('GET', '/api/decisions')).body).toEqual([]);
    expect((await call('GET', '/api/w/default/decisions')).body).toEqual([]);

    const etag = (await call('GET', '/api/w/mobile/settings')).headers.etag as string;
    expect((await call('PUT', '/api/w/mobile/settings', { project: { key: 'APP', name: 'Mobile' } }, { 'if-match': etag })).status).toBe(200);
    expect((await call('GET', '/api/w/mobile/settings')).body.settings.project.name).toBe('Mobile');
    expect((await call('GET', '/api/settings')).body.settings.project.name).toBe('Checkout');
    expect((await call('GET', '/api/w/mobile/audit')).body.map((a: { summary: string }) => a.summary)).toContain('Settings updated');
    expect((await call('GET', '/api/audit')).body.map((a: { summary: string }) => a.summary)).not.toContain('Settings updated');
  });

  it('WS-03: an unknown workspace is a 404, a malformed id a 422', async () => {
    await start();
    expect((await call('GET', '/api/w/nope/analysis')).status).toBe(404);
    expect((await call('GET', '/api/w/Bad!/analysis')).status).toBe(422);
  });

  it('WS-04: one change across two workspaces: pdi gets one readiness, /api/changes says where each story is', async () => {
    await start({ pdi: true });
    await call('POST', '/api/workspaces', { id: 'mobile' });
    const [readyHere] = await storyKeys('default', true);
    const [notReadyThere] = await storyKeys('mobile', false);
    await label('default', readyHere!);
    await label('mobile', notReadyThere!);
    await ctx!.pdi.deliver();
    const readiness = sent.filter((e) => e.type === 'readiness.changed');
    expect(readiness.at(-1)!.payload).toMatchObject({ change: 'CHG-12', readiness: 'not_ready' });
    const changes = (await call('GET', '/api/changes')).body.changes;
    expect(changes).toEqual([expect.objectContaining({ change: 'CHG-12', readiness: 'not_ready', items: [readyHere, notReadyThere], workspaces: { [readyHere!]: 'default', [notReadyThere!]: 'mobile' } })]);
    const req = await call('POST', '/api/changes/CHG-12/request-approval');
    expect(req.body.event.payload.url).toBe(`http://localhost:4317/#/item/${readyHere}`);
  });

  it('WS-05: gate.decided approves the change\'s stories in each workspace', async () => {
    await start({ pdi: true });
    await call('POST', '/api/workspaces', { id: 'mobile' });
    const [a] = await storyKeys('default', true);
    const [, b] = await storyKeys('mobile', true);
    await label('default', a!);
    await label('mobile', b!);
    const body = JSON.stringify({ id: 'gd-ws-1', type: 'gate.decided', occurred_at: '2026-10-27T12:00:00Z', source: 'pdi', contract_version: '0.4.0', payload: { change: 'CHG-12', gate: 'approve-for-implementation', outcome: 'approved', decision: 'DEC-41' } });
    const ts = String(Math.floor(now.getTime() / 1000));
    const res = await ctx!.app.inject({ method: 'POST', url: '/api/webhooks/pdi', payload: body, headers: { 'content-type': 'application/json', 'x-pdi-timestamp': ts, 'x-pdi-event': 'gate.decided', 'x-pdi-signature': `v1=${createHmac('sha256', SECRET).update(`${ts}.${body}`).digest('hex')}` } });
    expect(res.json()).toEqual({ approved: [a, b], skipped: [] });
    expect((await ctx!.workspaces.get('default')!.store.approvals()).map((x) => x.itemKey)).toEqual([a]);
    expect((await ctx!.workspaces.get('mobile')!.store.approvals()).map((x) => [x.itemKey, x.decision])).toEqual([[b, 'DEC-41']]);
  });

  it('WS-06: a decision of another workspace goes to pdi with it in the ref and the link, and keeps its DEC there', async () => {
    await start({ pdi: true });
    await call('POST', '/api/workspaces', { id: 'mobile' });
    const mobile = ctx!.workspaces.get('mobile')!;
    await mobile.engine.applyDemoScenario('answers-in-sources');
    await mobile.engine.analyze('setup');
    const f = (await call('GET', '/api/w/mobile/items/CHK-202')).body.item.findings.find((x: Finding) => x.ruleId === 'ERR-003');
    expect((await call('POST', `/api/w/mobile/items/CHK-202/answers/${f.answer.id}`, { action: 'accept' })).status).toBe(200);
    await ctx!.pdi.deliver();
    const e = sent.find((x) => x.type === 'decision.recorded')!;
    expect(e.payload).toMatchObject({ ref: 'mobile/CHK-202/ERR-003:CHK-202', url: 'http://localhost:4317/#/w/mobile/item/CHK-202/ERR-003%3ACHK-202' });
    expect((await mobile.store.decisions()).find((d) => d.findingId === 'ERR-003:CHK-202')).toMatchObject({ pdiDecision: 'DEC-77' });
    expect(await ctx!.store.decisions()).toEqual([]);
  });

  it('WS-07: every route of a workspace answers under /api/w/:ws as it does under /api', async () => {
    await start();
    await call('POST', '/api/workspaces', { id: 'mobile' });
    // The same calls, in the same order, on two fresh demo workspaces: the same handler, so the same statuses.
    const calls: [method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, payload?: unknown][] = [
      ['POST', '/api/w/mobile/analyze'],
      ['GET', '/api/w/mobile/items/PAY-123/graph'],
      ['POST', '/api/w/mobile/items/PAY-123/ai-review'],
      ['POST', '/api/w/mobile/items/PAY-123/approve', { force: true, reason: 'parity' }],
      ['DELETE', '/api/w/mobile/items/PAY-123/approve', null],
      ['POST', '/api/w/mobile/decisions/nope/reopen', null],
      ['GET', '/api/w/mobile/decisions/acceptance'],
      ['DELETE', '/api/w/mobile/decisions/nope', null],
      ['GET', '/api/w/mobile/impact?q=refund'],
      ['GET', '/api/w/mobile/drift'],
      ['GET', '/api/w/mobile/history'],
      ['POST', '/api/w/mobile/settings/test-connections'],
      ['GET', '/api/w/mobile/connections'],
      ['POST', '/api/w/mobile/connections/atlassian/start'],
      ['PUT', '/api/w/mobile/connections/atlassian/site', { cloudId: 'nope' }],
      ['DELETE', '/api/w/mobile/connections/atlassian'],
      ['GET', '/api/w/mobile/demo/scenarios'],
      ['POST', '/api/w/mobile/demo/scenarios/answers-in-sources'],
      ['POST', '/api/w/mobile/demo/reset'],
    ];
    const statuses = async (ws: string) => {
      const out: string[] = [];
      for (const [method, path, payload] of calls) {
        const url = path.replace('/api/w/mobile/', ws === 'default' ? '/api/' : `/api/w/${ws}/`);
        const res = await ctx!.app.inject({ method, url, ...(payload !== undefined && { payload: payload as object }), headers: { 'x-ci-actor': 'Ann' } });
        out.push(`${method} ${path} ${res.statusCode}`);
      }
      return out;
    };
    const there = await statuses('mobile');
    expect(there.every((s) => !s.endsWith(' 404') || s.includes('/nope'))).toBe(true);
    expect(there).toEqual(await statuses('default'));
  });

  it('WS-08: a workspace has its own live updates and its own source webhooks', async () => {
    await start();
    await call('POST', '/api/workspaces', { id: 'mobile' });
    const address = await ctx!.app.listen({ port: 0, host: '127.0.0.1' });
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 2_000);
    const open = (_method: 'GET', url: string) => fetch(`${address}${url}`, { signal: abort.signal });
    try {
      expect((await open('GET', '/api/w/mobile/events')).headers.get('content-type')).toBe('text/event-stream');
    } finally {
      clearTimeout(timer);
      abort.abort();
    }
    // Source webhooks are outside the admin-token guard, under a workspace too.
    expect((await call('POST', '/api/w/mobile/webhooks/jira', {}, { origin: 'https://jira.example.com' })).status).toBe(202);
    expect((await call('GET', '/api/w/mobile/audit')).body[0].summary).toBe('Change notification from jira');
    expect((await call('GET', '/api/audit')).body.some((a: { kind: string }) => a.kind === 'webhook')).toBe(false);
  });

  it('WS-09: a workspace is renamed (default too) and deleted with its id typed back; its data moves aside', async () => {
    await start();
    await call('POST', '/api/workspaces', { id: 'mobile', name: 'Mobile' });
    expect((await call('PATCH', '/api/workspaces/mobile', { name: 'Mobile app' })).body).toEqual({ id: 'mobile', name: 'Mobile app' });
    expect((await call('PATCH', '/api/workspaces/default', { name: 'Web' })).status).toBe(200);
    expect((await call('PATCH', '/api/workspaces/nope', { name: 'X' })).status).toBe(404);

    expect((await call('DELETE', '/api/workspaces/default', { confirm: 'default' })).status).toBe(409);
    expect((await call('DELETE', '/api/workspaces/mobile', { confirm: 'mobil' })).status).toBe(400);
    const del = await call('DELETE', '/api/workspaces/mobile', { confirm: 'mobile' });
    expect(del.status).toBe(200);
    expect(del.body.archivedTo).toMatch(/^workspaces-deleted\/mobile-/);
    expect(existsSync(join(dir, del.body.archivedTo))).toBe(true);
    expect(existsSync(join(dir, 'workspaces', 'mobile'))).toBe(false);
    expect((await call('GET', '/api/w/mobile/analysis')).status).toBe(404);
    expect((await call('GET', '/api/audit')).body.map((a: { summary: string }) => a.summary)).toContain(`Workspace mobile deleted; its data moved to ${del.body.archivedTo}`);

    await ctx!.app.close();
    await start({ keepDir: true });
    expect((await call('GET', '/api/workspaces')).body).toEqual([{ id: 'default', name: 'Web' }]);
    // The same id can be used again, for a fresh workspace.
    expect((await call('POST', '/api/workspaces', { id: 'mobile' })).status).toBe(201);
  });
});
