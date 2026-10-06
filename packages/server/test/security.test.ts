import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { InjectOptions } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp, type AppOptions } from '../src/app.js';

let ctx: Awaited<ReturnType<typeof buildApp>> | undefined;
let dir: string;

const start = async (opts: Partial<AppOptions> = {}) => {
  dir = mkdtempSync(join(tmpdir(), 'ci-sec-'));
  ctx = await buildApp({ dataDir: dir, adminToken: '', allowedHosts: [], allowedOrigins: [], ...opts });
  return ctx;
};
afterEach(async () => {
  await ctx?.app.close();
  ctx = undefined;
  rmSync(dir, { recursive: true, force: true });
});

const call = async (o: InjectOptions) => {
  const res = await ctx!.app.inject(o);
  return { status: res.statusCode, headers: res.headers, body: res.body ? res.json() : undefined };
};

describe('without CI_ADMIN_TOKEN (local self-hosted mode)', () => {
  it('lets loopback clients change state, as before', async () => {
    await start();
    expect((await call({ method: 'POST', url: '/api/analyze' })).status).toBe(200);
  });

  it('refuses changes from other machines and says how to allow them', async () => {
    await start();
    const r = await call({ method: 'POST', url: '/api/analyze', remoteAddress: '10.0.0.5' });
    expect(r.status).toBe(401);
    expect(r.body.detail).toMatch(/CI_ADMIN_TOKEN/);
  });

  it('rejects a non-local Host header (DNS rebinding)', async () => {
    await start();
    expect((await call({ method: 'GET', url: '/api/analysis', headers: { host: 'evil.example' } })).status).toBe(403);
  });

  it('accepts a Host listed in CI_ALLOWED_HOSTS', async () => {
    await start({ allowedHosts: ['ci.internal:4317'] });
    expect((await call({ method: 'GET', url: '/api/health', headers: { host: 'ci.internal:4317' } })).status).toBe(200);
  });
});

describe('with CI_ADMIN_TOKEN', () => {
  const token = 's3cret-token';

  it('requires the bearer token for changes', async () => {
    await start({ adminToken: token });
    const none = await call({ method: 'POST', url: '/api/analyze' });
    expect(none.status).toBe(401);
    expect(none.headers['www-authenticate']).toMatch(/Bearer/);
    expect((await call({ method: 'POST', url: '/api/analyze', headers: { authorization: 'Bearer wrong' } })).status).toBe(401);
    expect((await call({ method: 'POST', url: '/api/analyze', headers: { authorization: `Bearer ${token}` }, remoteAddress: '10.0.0.5' })).status).toBe(200);
  });

  it('keeps reads open and webhooks on their own secret', async () => {
    await start({ adminToken: token });
    expect((await call({ method: 'GET', url: '/api/health' })).status).toBe(200);
    expect((await call({ method: 'POST', url: '/api/webhooks/jira', payload: {} })).status).toBe(202);
  });

  it('treats prototype keys as unknown webhook sources', async () => {
    await start({ adminToken: token });
    for (const source of ['constructor', 'toString', '__proto__']) {
      expect((await call({ method: 'POST', url: `/api/webhooks/${source}`, payload: {} })).status).toBe(404);
    }
    expect((await ctx!.store.auditLog()).filter((a) => a.kind === 'webhook')).toHaveLength(0);
  });

  it('records who acted and that the admin token was used', async () => {
    await start({ adminToken: token });
    await call({ method: 'DELETE', url: '/api/items/PAY-123/approve', headers: { authorization: `Bearer ${token}`, 'x-ci-actor': encodeURIComponent('Łucja') } });
    const entry = (await ctx!.store.auditLog()).find((a) => a.kind === 'approval_removed')!;
    expect(entry.actor).toBe('Łucja');
    expect(entry.via).toBe('admin_token');
  });
});

describe('Origin check (CSRF)', () => {
  it('rejects a change from a foreign page', async () => {
    await start();
    expect((await call({ method: 'POST', url: '/api/analyze', headers: { origin: 'https://evil.example' } })).status).toBe(403);
  });

  it('accepts the Vite dev server and the same origin', async () => {
    await start();
    expect((await call({ method: 'POST', url: '/api/analyze', headers: { origin: 'http://localhost:5173', host: '127.0.0.1:4317' } })).status).toBe(200);
    expect((await call({ method: 'POST', url: '/api/analyze', headers: { origin: 'http://localhost:80', host: 'localhost:80' } })).status).toBe(200);
  });

  it('accepts an origin listed in CI_ALLOWED_ORIGINS', async () => {
    await start({ adminToken: 't', allowedOrigins: ['https://ci.example.com'] });
    const r = await call({ method: 'POST', url: '/api/analyze', headers: { origin: 'https://ci.example.com', host: 'ci-backend:4317', authorization: 'Bearer t' } });
    expect(r.status).toBe(200);
  });
});

describe('errors as application/problem+json (RFC 9457)', () => {
  it('describes a 404', async () => {
    await start();
    const r = await call({ method: 'GET', url: '/api/items/NOPE-1' });
    expect(r.status).toBe(404);
    expect(r.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(r.body).toMatchObject({ status: 404, title: 'Not Found', instance: '/api/items/NOPE-1' });
    expect(r.body.detail).toBeTruthy();
  });

  it('uses the same shape for unknown API routes', async () => {
    await start();
    const r = await call({ method: 'GET', url: '/api/nope' });
    expect(r.status).toBe(404);
    expect(r.headers['content-type']).toMatch(/application\/problem\+json/);
  });

  it('hides internal details of a 500', async () => {
    await start();
    vi.spyOn(ctx!.engine, 'analyze').mockRejectedValueOnce(new Error('ENOENT /srv/secret/path'));
    const r = await call({ method: 'POST', url: '/api/analyze' });
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toMatch(/secret/);
    expect(r.body.title).toBe('Internal Server Error');
  });
});

describe('request schemas', () => {
  it('rejects a decision with wrong types, listing the fields', async () => {
    await start();
    const r = await call({ method: 'POST', url: '/api/decisions', payload: { questionId: 'q', itemKey: 'PAY-124', answer: 42 } });
    expect(r.status).toBe(422);
    expect(r.body.errors.map((e: { field: string }) => e.field)).toContain('/answer');
  });

  it('rejects unknown and mistyped settings', async () => {
    await start();
    const etag = (await call({ method: 'GET', url: '/api/settings' })).headers.etag as string;
    const put = (payload: unknown) => call({ method: 'PUT', url: '/api/settings', headers: { 'if-match': etag }, payload: payload as object });
    expect((await put({ schedule: { intervalMinutes: 'soon' } })).status).toBe(422);
    expect((await put({ unknownSection: true })).status).toBe(422);
    expect((await put({ policy: { aiFindings: 'always' } })).status).toBe(422);
  });

  it('limits the impact query', async () => {
    await start();
    expect((await call({ method: 'GET', url: `/api/impact?q=${'x'.repeat(501)}` })).status).toBe(422);
  });
});

describe('settings.json from an older version', () => {
  const legacy = {
    mode: 'live',
    integrations: { jira: { enabled: true, baseUrl: 'https://x.atlassian.net', apiToken: 'old-secret', issueTypeMap: { Epic: 'epic', Saga: 'legend' } }, slack: { webhook: 'x' } },
    schedule: { mode: 'hourly', intervalMinutes: 15 },
    removedSection: true,
  };
  const startWithLegacy = async () => {
    dir = mkdtempSync(join(tmpdir(), 'ci-sec-'));
    writeFileSync(join(dir, 'settings.json'), JSON.stringify(legacy));
    ctx = await buildApp({ dataDir: dir, adminToken: '', allowedHosts: [], allowedOrigins: [] });
  };

  it('drops unknown and invalid fields, keeping the valid ones', async () => {
    await startWithLegacy();
    const s = (await call({ method: 'GET', url: '/api/settings' })).body.settings;
    expect(s.removedSection).toBeUndefined();
    expect(s.integrations.slack).toBeUndefined();
    expect(s.integrations.jira.apiToken).toBeUndefined();
    expect(s.integrations.jira.baseUrl).toBe('https://x.atlassian.net');
    expect(s.integrations.jira.issueTypeMap).toEqual({ Epic: 'epic' });
    expect(s.schedule.mode).toBe('on_demand');
    expect(s.schedule.intervalMinutes).toBe(15);
  });

  it('lets the UI save the whole object back', async () => {
    await startWithLegacy();
    const got = await call({ method: 'GET', url: '/api/settings' });
    const put = await call({ method: 'PUT', url: '/api/settings', headers: { 'if-match': got.headers.etag as string }, payload: got.body.settings });
    expect(put.status).toBe(200);
  });

  it('rewrites the file on start, so stale fields such as old secrets leave the disk', async () => {
    await startWithLegacy();
    const onDisk = readFileSync(join(dir, 'settings.json'), 'utf8');
    expect(onDisk).not.toContain('old-secret');
    expect(onDisk).not.toContain('removedSection');
  });

  it('records the cleanup in the audit log with field paths but no values', async () => {
    await startWithLegacy();
    const entries = (await ctx!.store.auditLog()).filter((a) => a.kind === 'settings');
    expect(entries).toHaveLength(1);
    expect(entries[0]?.actor).toBe('system');
    expect(entries[0]?.details).toEqual({
      removed: expect.arrayContaining(['integrations.jira.apiToken', 'integrations.jira.issueTypeMap.Saga', 'integrations.slack', 'schedule.mode', 'removedSection']),
    });
    expect(JSON.stringify(entries[0])).not.toContain('old-secret');
  });

  it('leaves a current settings.json and the audit log untouched', async () => {
    await start();
    await ctx!.app.close();
    ctx = await buildApp({ dataDir: dir, adminToken: '', allowedHosts: [], allowedOrigins: [] });
    expect((await ctx.store.auditLog()).filter((a) => a.kind === 'settings')).toHaveLength(0);
  });
});

describe('settings concurrency (ETag / If-Match)', () => {
  it('requires If-Match and rejects a stale version', async () => {
    await start();
    const first = await call({ method: 'GET', url: '/api/settings' });
    const etag = first.headers.etag as string;
    expect(etag).toBeTruthy();
    const patch = { schedule: { intervalMinutes: 45 } };
    expect((await call({ method: 'PUT', url: '/api/settings', payload: patch })).status).toBe(428);
    const ok = await call({ method: 'PUT', url: '/api/settings', headers: { 'if-match': etag }, payload: patch });
    expect(ok.status).toBe(200);
    expect(ok.headers.etag).not.toBe(etag);
    expect((await call({ method: 'PUT', url: '/api/settings', headers: { 'if-match': etag }, payload: patch })).status).toBe(412);
  });
});

describe('OpenAPI', () => {
  it('publishes the contract at /api/openapi.json', async () => {
    await start();
    const r = await call({ method: 'GET', url: '/api/openapi.json' });
    expect(r.status).toBe(200);
    expect(r.body.openapi).toMatch(/^3\./);
    expect(Object.keys(r.body.paths)).toEqual(expect.arrayContaining(['/api/decisions', '/api/settings', '/api/items/{key}/approve']));
    expect(r.body.components.securitySchemes.adminToken).toMatchObject({ type: 'http', scheme: 'bearer' });
  });
});
