import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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

  it('accepts webhooks', async () => {
    const res = await ctx.app.inject({ method: 'POST', url: '/api/webhooks/jira', payload: { webhookEvent: 'jira:issue_updated' } });
    expect(res.statusCode).toBe(202);
  });
});
