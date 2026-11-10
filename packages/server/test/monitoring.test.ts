import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiBudget } from '../src/ai-budget.js';
import { buildApp } from '../src/app.js';
import { FileBackend } from '../src/backend.js';
import type { Mail, Mailer } from '../src/mailer.js';
import { Alerts, databaseResponds, heartbeat } from '../src/monitoring.js';

/** T6 (docs/DEPLOYMENT.md, "Monitoring"): the operator hears about a problem before a team does. */
const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'ci-monitoring-'));
  dirs.push(d);
  return d;
};
const saved = process.env.CI_DISABLE_SCHEDULE;
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  if (saved === undefined) delete process.env.CI_DISABLE_SCHEDULE;
  else process.env.CI_DISABLE_SCHEDULE = saved;
});

function testMailer() {
  const sent: Mail[] = [];
  const mailer: Mailer = { kind: 'test', send: vi.fn(async (m: Mail) => void sent.push(m)) };
  return { mailer, sent };
}

describe('alerts', () => {
  it('MON-01: one mail per kind and subject an hour; the next one counts what was held back', async () => {
    const { mailer, sent } = testMailer();
    let now = Date.parse('2026-11-10T08:00:00Z');
    const a = new Alerts(mailer, { to: ['ops@example.com'], publicUrl: 'https://quorum.example.com', now: () => now });
    expect(await a.notify('server_error', 'POST /api/analyze', { status: 500, requestId: 'req-1' })).toBe(true);
    expect(await a.notify('server_error', 'POST /api/analyze', { status: 500, requestId: 'req-2' })).toBe(false);
    expect(await a.notify('server_error', 'POST /api/analyze', { status: 500, requestId: 'req-3' })).toBe(false);
    expect(await a.notify('job_failed', 'beta job')).toBe(true);
    now += 3_600_000;
    expect(await a.notify('server_error', 'POST /api/analyze', { status: 502, requestId: 'req-4' })).toBe(true);
    expect(sent.map((m) => m.subject)).toEqual(['[Quorum] Server error: POST /api/analyze', '[Quorum] Background job failed: beta job', '[Quorum] Server error: POST /api/analyze']);
    expect(sent[0]!.to).toEqual(['ops@example.com']);
    expect(sent[0]!.text).toContain('requestId: req-1');
    expect(sent[2]!.text).toContain('and 2 more of these in the last hour');
  });

  it('MON-02: without recipients nothing is sent, and a failing mailer never throws', async () => {
    const { mailer, sent } = testMailer();
    expect(await new Alerts(mailer, { to: [], publicUrl: 'x' }).notify('job_failed', 'x')).toBe(false);
    expect(sent).toEqual([]);
    const log = vi.fn();
    const broken: Mailer = { kind: 'test', send: async () => Promise.reject(new Error('resend down')) };
    expect(await new Alerts(broken, { to: ['ops@example.com'], publicUrl: 'x', log }).notify('job_failed', 'x')).toBe(false);
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ kind: 'job_failed' }), 'alert not sent');
  });

  it('MON-03: a workspace reaching its AI limit is reported once', async () => {
    const reached = vi.fn();
    const b = new AiBudget(new FileBackend(tmp()), 1, reached);
    await b.init();
    await b.record('team-a', 0.6);
    await b.record('team-a', 0.6);
    await b.record('team-a', 0.6);
    expect(reached).toHaveBeenCalledTimes(1);
    expect(reached.mock.calls[0]![0]).toMatchObject({ workspace: 'team-a', limitUsd: 1, exhausted: true });
  });
});

describe('heartbeats and the database check', () => {
  it('MON-04: a heartbeat is an https GET; no URL is nothing; a failure is logged, not thrown', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 200 }));
    expect(await heartbeat('https://hc-ping.example/abc', undefined, fetchImpl as unknown as typeof fetch)).toBe(true);
    expect(String((fetchImpl.mock.calls[0] as unknown[])[0])).toBe('https://hc-ping.example/abc');
    expect(await heartbeat(undefined)).toBe(false);
    const log = vi.fn();
    expect(await heartbeat('http://hc-ping.example/abc', log, fetchImpl as unknown as typeof fetch)).toBe(false);
    expect(await heartbeat('https://hc-ping.example/abc', log, (async () => new Response('', { status: 500 })) as unknown as typeof fetch)).toBe(false);
    expect(log).toHaveBeenCalledTimes(2);
  });

  it('MON-05: the database counts as down when it fails or takes longer than the limit', async () => {
    expect(await databaseResponds(async () => 1)).toBe(true);
    expect(await databaseResponds(async () => Promise.reject(new Error('ECONNREFUSED')))).toBe(false);
    expect(await databaseResponds(() => new Promise((r) => setTimeout(r, 200)), 20)).toBe(false);
  });
});

describe('the server', () => {
  it('MON-06: a 5xx mails the operators with the route and request id, not the error; health says no database in file mode', async () => {
    process.env.CI_DISABLE_SCHEDULE = 'true';
    const { mailer, sent } = testMailer();
    const ctx = await buildApp({ dataDir: tmp(), adminToken: 'dummy-admin-token', allowedHosts: [], allowedOrigins: [], pdi: { eventsUrl: '', secret: '' }, mailer, alertEmails: ['ops@example.com'] });
    try {
      vi.spyOn(ctx.engine, 'analyze').mockRejectedValue(new Error('secret story text in an error'));
      const r = await ctx.app.inject({ method: 'POST', url: '/api/analyze', headers: { authorization: 'Bearer dummy-admin-token', origin: 'http://localhost:4317', host: 'localhost:4317' } });
      expect(r.statusCode).toBe(500);
      await ctx.alerts.notify('job_failed', 'flush');
      const alert = sent.find((m) => m.subject.startsWith('[Quorum] Server error'))!;
      expect(alert.subject).toBe('[Quorum] Server error: POST /api/analyze');
      expect(alert.text).toMatch(/requestId: req-/);
      expect(alert.text).not.toContain('secret story text');

      const health = await ctx.app.inject({ method: 'GET', url: '/api/health' });
      expect(health.statusCode).toBe(200);
      expect(health.json()).toMatchObject({ ok: true, database: 'none', storage: 'files' });
      expect(health.json()).not.toHaveProperty('lastError');
    } finally {
      await ctx.app.close();
    }
  });
});
