import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_RELEASE, DEFAULT_STORY_SHAPE, DEMO_SCENARIOS, RULES } from '@ci/core';
import { buildApp } from '../src/app.js';
import { putSettings } from './helpers.js';

let ctx: Awaited<ReturnType<typeof buildApp>>;
const dir = mkdtempSync(join(tmpdir(), 'ci-test-'));

beforeAll(async () => {
  ctx = await buildApp({ dataDir: dir });
});
afterAll(async () => {
  await ctx.app.close();
  rmSync(dir, { recursive: true, force: true });
});

const json = async (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown) => {
  const res = await ctx.app.inject({ method, url, payload: payload as any });
  return { status: res.statusCode, body: res.json() };
};

describe('API', () => {
  it('VER-01: health and OpenAPI report the package.json version', async () => {
    const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
    expect((await json('GET', '/api/health')).body.version).toBe(version);
    expect((await json('GET', '/api/openapi.json')).body.info.version).toBe(version);
  });

  it('API-07: the AI usage summary is empty when no AI call was made', async () => {
    expect(await json('GET', '/api/ai/usage')).toEqual({ status: 200, body: [] });
  });

  it('analyzes the demo workspace', async () => {
    const { status, body } = await json('GET', '/api/analysis');
    expect(status).toBe(200);
    expect(body.project.name).toBe('Checkout');
    expect(body.counts.critical).toBeGreaterThan(0);
  });

  it('returns item details with context graph', async () => {
    const { body } = await json('GET', '/api/items/PAY-125');
    expect(body.item.readiness).toBe('not_ready');
    expect(body.children).toEqual([]);
    const graph = await json('GET', '/api/items/PAY-125/graph');
    expect(graph.body.nodes.length).toBeGreaterThan(3);
  });

  it('records a decision and re-analyzes', async () => {
    const { body } = await json('GET', '/api/items/PAY-124');
    const f = body.item.findings.find((x: any) => x.ruleId === 'ERR-004');
    const res = await json('POST', '/api/decisions', { questionId: f.question.id, findingId: f.id, itemKey: 'PAY-124', question: f.question.text, topic: f.question.topic, answer: 'Confirmation dialog', decidedBy: 'Anna (PO)' });
    expect(res.status).toBe(200);
    expect(res.body.item.findings.find((x: any) => x.id === f.id).status).toBe('resolved');
    const audit = await json('GET', '/api/audit');
    expect(audit.body.some((a: any) => a.kind === 'decision' && a.actor === 'Anna (PO)')).toBe(true);
  });

  it('refuses to approve a NOT READY item and detects drift after approval', async () => {
    expect((await json('POST', '/api/items/PAY-125/approve', { by: 'po' })).status).toBe(409);
    expect((await json('POST', '/api/items/PAY-123/approve', { by: 'po' })).status).toBe(200);
    const res = await json('POST', '/api/demo/scenarios/timeout-change');
    expect(res.body.drift.some((d: any) => d.kind === 'claim_changed')).toBe(true);
    const log = await json('GET', '/api/drift');
    expect(log.body.map((d: any) => d.id)).toEqual(expect.arrayContaining(res.body.drift.map((d: any) => d.id)));
    const item = await json('GET', '/api/items/PAY-123');
    expect(item.body.item.findings.some((f: any) => f.category === 'DRIFT')).toBe(true);
    expect(item.body.drift.length).toBeGreaterThan(0);
  });

  it('runs impact analysis', async () => {
    const { body } = await json('GET', '/api/impact?q=' + encodeURIComponent('payment timeout'));
    expect(body.bySource.confluence.length).toBeGreaterThan(0);
  });

  it('updates settings and validates AI review prerequisites', async () => {
    const res = await putSettings(ctx.app, { schedule: { mode: 'interval', intervalMinutes: 30 } });
    expect(res.json().settings.schedule.mode).toBe('interval');
    expect((await json('POST', '/api/items/PAY-125/ai-review')).status).toBe(400);
  });

  it('API-02: the story-shape policy is stored, merged with the defaults and used by the next analysis', async () => {
    expect((await json('GET', '/api/settings')).body.settings.policy.storyShape).toEqual(DEFAULT_STORY_SHAPE);
    const ac001 = async () => (await json('GET', '/api/items/PAY-123')).body.item.findings.some((f: any) => f.ruleId === 'AC-001');
    expect(await ac001()).toBe(true);

    const res = await putSettings(ctx.app, { policy: { storyShape: { acFormat: 'off' } } });
    expect(res.statusCode).toBe(200);
    expect(res.json().settings.policy.storyShape).toEqual({ ...DEFAULT_STORY_SHAPE, acFormat: 'off' });
    await json('POST', '/api/analyze');
    expect(await ac001()).toBe(false);
    await putSettings(ctx.app, { policy: { storyShape: { acFormat: 'gwt' } } });
  });

  it.each([
    ['an unknown AC format', { acFormat: 'list' }],
    ['zero scenarios', { maxScenarios: 0 }],
    ['a fractional threshold', { maxActions: 2.5 }],
    ['an unknown field', { maxEpics: 3 }],
  ])('API-03: the story-shape policy refuses %s', async (_, storyShape) => {
    expect((await putSettings(ctx.app, { policy: { storyShape } })).statusCode).toBe(422);
  });

  it('API-05: the claim pack of the project is stored, refused when unknown, and given to the next analysis', async () => {
    expect((await json('GET', '/api/settings')).body.settings.project.claimPack).toBe('general');
    const res = await putSettings(ctx.app, { project: { claimPack: 'ev' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().settings.project).toMatchObject({ name: 'Checkout', claimPack: 'ev' });
    expect((await json('GET', '/api/settings')).body.settings.project.claimPack).toBe('ev');
    await json('POST', '/api/analyze');
    expect(ctx.engine.state.context?.project.claimPack).toBe('ev');
    expect((await putSettings(ctx.app, { project: { claimPack: 'retail' } })).statusCode).toBe(422);
    await putSettings(ctx.app, { project: { claimPack: 'general' } });
  });

  it('API-04: the release-plan policy and the Jira release conventions are stored; wrong values are refused', async () => {
    expect((await json('GET', '/api/settings')).body.settings.policy.release).toEqual(DEFAULT_RELEASE);
    const res = await putSettings(ctx.app, { policy: { release: { maxMvpPercent: 50 } }, integrations: { jira: { releaseLineSource: 'fixVersion', flagLabelPrefix: 'ff:' } } });
    expect(res.statusCode).toBe(200);
    expect(res.json().settings.policy.release).toEqual({ ...DEFAULT_RELEASE, maxMvpPercent: 50 });
    expect(res.json().settings.integrations.jira).toMatchObject({ releaseLineSource: 'fixVersion', flagLabelPrefix: 'ff:' });
    for (const bad of [{ policy: { release: { maxMvpPercent: 0 } } }, { policy: { release: { requireFlag: 'some' } } }, { integrations: { jira: { releaseLineSource: 'sprint' } } }]) {
      expect((await putSettings(ctx.app, bad)).statusCode).toBe(422);
    }
    await putSettings(ctx.app, { policy: { release: DEFAULT_RELEASE }, integrations: { jira: { releaseLineSource: 'label', flagLabelPrefix: 'flag:' } } });
  });

  it('API-05: tf reconstruction from code joins the analysis: the code contradicting PAY-123 is a CON-001 conflict', async () => {
    const reconstructionPath = fileURLToPath(new URL('../../core/test/fixtures/tf-reconstruction/reconstruction.json', import.meta.url));
    expect((await putSettings(ctx.app, { integrations: { code: { enabled: true, reconstructionPath, repoUrl: 'https://github.com/acme/shop' } } })).statusCode).toBe(200);
    expect((await json('POST', '/api/settings/test-connections')).body.code).toBe('OK — 8 items reconstructed from code');
    await json('POST', '/api/analyze');
    const conflict = (await json('GET', '/api/items/PAY-123')).body.item.findings.find((f: any) => f.ruleId === 'CON-001' && f.evidence.some((e: any) => e.source === 'code'));
    expect(conflict.evidence.find((e: any) => e.source === 'code')).toMatchObject({ title: 'Code src/payments/gateway.ts:1', url: 'https://github.com/acme/shop/blob/3f2a9c1/src/payments/gateway.ts#L1' });

    await putSettings(ctx.app, { integrations: { code: { reconstructionPath: '/etc/passwd' } } });
    expect((await json('POST', '/api/settings/test-connections')).body.error).toBe('the reconstruction path must point to a .json file');
    expect((await putSettings(ctx.app, { integrations: { code: { repoUrl: 'javascript:alert(1)' } } })).statusCode).toBe(422);
    await putSettings(ctx.app, { integrations: { code: { enabled: false, reconstructionPath: '' } } });
    await json('POST', '/api/analyze');
  });

  it('API-06: test results (JUnit XML) join the analysis: each criterion of PAY-124 gets its tests (G4)', async () => {
    const reportsPath = fileURLToPath(new URL('../../core/test/fixtures/junit/results.xml', import.meta.url));
    expect((await putSettings(ctx.app, { integrations: { tests: { enabled: true, reportsPath } } })).statusCode).toBe(200);
    expect((await json('POST', '/api/settings/test-connections')).body.tests).toBe('OK — 9 test cases, 1 failed, 8 naming a criterion');
    await json('POST', '/api/analyze');
    const item = (await json('GET', '/api/items/PAY-124')).body.item;
    expect(item.acTests.map((a: any) => [a.ac, a.status])).toEqual([['AC-1', 'passed'], ['AC-2', 'failed'], ['AC-3', 'untested']]);
    expect(item.findings.filter((f: any) => f.ruleId.startsWith('TEST-')).map((f: any) => f.ruleId).sort()).toEqual(['TEST-001', 'TEST-002']);

    await putSettings(ctx.app, { integrations: { tests: { reportsPath: '/nonexistent/reports' } } });
    expect((await json('POST', '/api/settings/test-connections')).body.error).toBe('Test results: /nonexistent/reports: Cannot read the file');
    await putSettings(ctx.app, { integrations: { tests: { enabled: false, reportsPath: '' } } });
    await json('POST', '/api/analyze');
    expect((await json('GET', '/api/items/PAY-124')).body.item.acTests).toBeUndefined();
  });

  it('API-01: lists the rules and the demo scenarios', async () => {
    const rules = await json('GET', '/api/rules');
    expect(rules.body.map((r: any) => r.id)).toEqual(RULES.map((r) => r.id));
    expect(Object.keys(rules.body[0]).sort()).toEqual(['appliesTo', 'description', 'id', 'name']);
    const scenarios = await json('GET', '/api/demo/scenarios');
    expect(scenarios.body.map((s: any) => s.id)).toEqual(DEMO_SCENARIOS.map((s) => s.id));
    expect(scenarios.body[0]).not.toHaveProperty('apply');
  });

  it('accepts webhooks', async () => {
    const res = await ctx.app.inject({ method: 'POST', url: '/api/webhooks/jira', payload: { webhookEvent: 'jira:issue_updated' } });
    expect(res.statusCode).toBe(202);
  });
});

describe('live updates (SSE)', () => {
  it('SSE-01: /api/events answers at once, so the client knows it is subscribed before the first event', async () => {
    // A fresh app with nothing running: any event written by an analysis would send the headers along with it.
    const sseDir = mkdtempSync(join(tmpdir(), 'ci-test-sse-'));
    const { app } = await buildApp({ dataDir: sseDir });
    const address = await app.listen({ port: 0, host: '127.0.0.1' });
    const abort = new AbortController();
    // Shorter than the 25 s keep-alive ping, which used to be the first thing the client received.
    const timer = setTimeout(() => abort.abort(), 2_000);
    try {
      const res = await fetch(`${address}/api/events`, { signal: abort.signal });
      expect(res.headers.get('content-type')).toBe('text/event-stream');
    } finally {
      clearTimeout(timer);
      abort.abort();
      await app.close();
      rmSync(sseDir, { recursive: true, force: true });
    }
  });
});
