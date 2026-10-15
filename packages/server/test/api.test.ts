import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEMO_SCENARIOS, RULES } from '@ci/core';
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
