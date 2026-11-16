import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { ADA, browser, fakeAtlassian, login, removeDir, startAccounts, tempDir } from './accounts-helpers.js';

/**
 * Confidentiality in the hosted service (docs/TRUST.md): every workspace encrypted at rest, a workspace may keep all
 * its content away from AI, and a team sees when the platform operator reached its workspace.
 */
function filesContaining(root: string, needle: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else if (readFileSync(p, 'utf8').includes(needle)) out.push(p.slice(root.length + 1));
    }
  };
  walk(root);
  return out;
}

let dir: string;
const saved = { key: process.env.CI_ENCRYPTION_KEY, node: process.env.NODE_ENV, schedule: process.env.CI_DISABLE_SCHEDULE };
beforeEach(() => {
  dir = tempDir();
  process.env.CI_DISABLE_SCHEDULE = 'true';
});
afterEach(() => {
  vi.unstubAllGlobals();
  removeDir(dir);
  for (const [k, v] of [['CI_ENCRYPTION_KEY', saved.key], ['NODE_ENV', saved.node], ['CI_DISABLE_SCHEDULE', saved.schedule]] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe('encryption at rest in the hosted service', () => {
  it('TR-01: decisions, analysis, drift and audit are on disk only as ciphertext, and read back', async () => {
    process.env.CI_ENCRYPTION_KEY = 'dummy-encryption-key-for-tests';
    fakeAtlassian();
    const app = await startAccounts(dir, { bootstrapEmail: ADA.email });
    try {
      const ada = (await login(app.app)).session!;
      const answer = 'Refunds go back to the original card within 5 days';
      expect((await app.app.inject({ method: 'POST', url: '/api/decisions', headers: browser(ada), payload: { questionId: 'q-trust', itemKey: 'PAY-123', answer } })).statusCode).toBe(200);
      const settings = (await app.app.inject({ method: 'GET', url: '/api/settings', headers: browser(ada) })).json();
      expect(settings.encryptionForced).toBe(true);
      // The answer and the demo project's story titles appear nowhere in clear on disk.
      expect(filesContaining(dir, 'Refunds go back')).toEqual([]);
      const title = (await app.app.inject({ method: 'GET', url: '/api/analysis', headers: browser(ada) })).json().items[0].title as string;
      expect(filesContaining(dir, title).filter((f) => !f.includes('demo-context'))).toEqual([]);
      // ...and the app reads them back.
      const audit = (await app.app.inject({ method: 'GET', url: '/api/audit', headers: browser(ada) })).json() as { summary: string }[];
      expect(audit.some((a) => a.summary.includes(answer))).toBe(true);
    } finally {
      await app.app.close();
    }
  });

  it('TR-02: production with accounts refuses to start without CI_ENCRYPTION_KEY', async () => {
    delete process.env.CI_ENCRYPTION_KEY;
    process.env.NODE_ENV = 'production';
    fakeAtlassian();
    await expect(startAccounts(dir, { bootstrapEmail: ADA.email })).rejects.toThrow(/CI_ENCRYPTION_KEY is required/);
  });
});

describe('AI: never', () => {
  it('TR-03: a workspace set to never sends nothing to a model, the platform AI included', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | Request) => {
        calls.push(String(url));
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ findings: [], challenges: [], answers: [] }) } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }), { status: 200 });
      }),
    );
    const ctx = await buildApp({
      dataDir: dir,
      adminToken: 'dummy-admin-token',
      allowedHosts: [],
      allowedOrigins: [],
      pdi: { eventsUrl: '', secret: '' },
      aiPlatform: { provider: { provider: 'custom', model: 'm', baseUrl: 'https://ai.platform.example/v1' }, defaultLimitUsd: 50, prices: {} },
    });
    try {
      const admin = { authorization: 'Bearer dummy-admin-token', origin: 'http://localhost:4317', host: 'localhost:4317' };
      const etag = String((await ctx.app.inject({ method: 'GET', url: '/api/settings', headers: admin })).headers.etag);
      expect((await ctx.app.inject({ method: 'PUT', url: '/api/settings', headers: { ...admin, 'if-match': etag }, payload: { ai: { runOn: 'never' } } })).statusCode).toBe(200);
      const result = (await ctx.app.inject({ method: 'POST', url: '/api/analyze', headers: admin })).json();
      expect(result.ai.enabled).toBe(false);
      const review = await ctx.app.inject({ method: 'POST', url: `/api/items/${result.items[0].key}/ai-review`, headers: admin });
      expect(review.statusCode).toBe(400);
      expect(review.json().detail).toMatch(/switched off for this workspace/);
      expect(calls.filter((u) => u.includes('ai.platform.example'))).toEqual([]);
    } finally {
      await ctx.app.close();
    }
  });
});

describe("the operator's access", () => {
  it("TR-04: the admin token on a team's workspace is noted in that team's audit, once per route and hour; the first organization's is not", async () => {
    fakeAtlassian();
    const app = await startAccounts(dir, { bootstrapEmail: ADA.email, operatorEmails: [ADA.email!], adminToken: 'dummy-admin-token' });
    try {
      const ada = (await login(app.app)).session!;
      await app.app.inject({ method: 'POST', url: '/api/orgs', headers: browser(ada), payload: { name: 'Gamma', workspace: { id: 'gamma' }, ownerEmail: 'bea@gamma.example' } });
      const token = { authorization: 'Bearer dummy-admin-token' };
      await app.app.inject({ method: 'GET', url: '/api/w/gamma/settings', headers: token });
      await app.app.inject({ method: 'GET', url: '/api/w/gamma/settings', headers: token });
      await app.app.inject({ method: 'GET', url: '/api/w/default/settings', headers: token });
      const team = (await app.workspaces.get('gamma')!.store.auditLog()).filter((a) => a.kind === 'access');
      expect(team.map((a) => a.summary)).toEqual(['The platform operator used GET /api/w/:ws/settings on this workspace (admin token)']);
      expect((await app.workspaces.default.store.auditLog()).filter((a) => a.kind === 'access')).toEqual([]);
    } finally {
      await app.app.close();
    }
  });
});
