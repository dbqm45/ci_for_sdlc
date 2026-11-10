import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { FileBackend } from '../src/backend.js';
import { ERASE_AFTER_DAYS, FileStorage } from '../src/workspaces.js';
import { ADA, browser, fakeAtlassian, login, removeDir, startAccounts, tempDir, type App, type Identity } from './accounts-helpers.js';

/**
 * T7 (docs/DATA-DELETION.md): a deleted workspace is kept 30 days and then erased for good; an operator erases a whole
 * organization on its request, leaving only a record of names and counts.
 */
const BEA: Identity = { account_id: 'acc-bea', name: 'Bea Beta', email: 'bea@gamma.example' };
const saved = process.env.CI_DISABLE_SCHEDULE;
let dir: string;
beforeEach(() => {
  dir = tempDir();
  process.env.CI_DISABLE_SCHEDULE = 'true';
});
afterEach(() => {
  vi.unstubAllGlobals();
  removeDir(dir);
  if (saved === undefined) delete process.env.CI_DISABLE_SCHEDULE;
  else process.env.CI_DISABLE_SCHEDULE = saved;
});

/** Every file under `root` whose text contains `needle`. */
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

describe('the storage', () => {
  it('DEL-01: a document is removed, matching log entries are dropped, and a space is erased', async () => {
    const b = new FileBackend(join(dir, 'space'));
    await b.init();
    await b.write('a.json', { x: 1 });
    await b.append('events', { orgId: 'o1', n: 1 });
    await b.append('events', { orgId: 'o2', n: 2 });
    await b.append('events', { orgId: 'o1', n: 3 });
    expect(await b.dropEntries('events', { orgId: 'o1' })).toBe(2);
    expect(await b.tail('events', 10)).toEqual([{ orgId: 'o2', n: 2 }]);
    expect(await b.dropEntries('events', { orgId: 'nobody' })).toBe(0);
    expect(await b.dropEntries('missing', { orgId: 'o1' })).toBe(0);
    await b.remove('a.json');
    await b.remove('a.json');
    expect(await b.read('a.json')).toBeUndefined();
    await b.erase();
    expect(existsSync(join(dir, 'space'))).toBe(false);
  });
});

describe('a deleted workspace', () => {
  const admin = { authorization: 'Bearer dummy-admin-token', origin: 'http://localhost:4317', host: 'localhost:4317' };

  it('DEL-02: is kept 30 days without its Atlassian connection, can be restored, and is then erased for good', async () => {
    const ctx = await buildApp({ dataDir: dir, adminToken: 'dummy-admin-token', allowedHosts: [], allowedOrigins: [], pdi: { eventsUrl: '', secret: '' } });
    try {
      const call = (method: 'GET' | 'POST' | 'DELETE' | 'PUT', url: string, payload?: object) => ctx.app.inject({ method, url, headers: admin, ...(payload && { payload }) });
      expect((await call('POST', '/api/workspaces', { id: 'mobile', name: 'Mobile' })).statusCode).toBe(201);
      const w = ctx.workspaces.get('mobile')!;
      await w.store.saveSettings({ ...(await w.store.settings()), project: { key: 'MOB', name: 'Mobile app' } });
      await new FileBackend(join(dir, 'workspaces', 'mobile')).write('connections.json', { atlassian: { refresh: 'dummy-sealed-token' } });

      const deleted = (await call('DELETE', '/api/workspaces/mobile', { confirm: 'mobile' })).json();
      expect(Date.parse(deleted.eraseAfter) - Date.now()).toBeGreaterThan((ERASE_AFTER_DAYS - 1) * 86_400_000);
      const listed = (await call('GET', '/api/workspaces-deleted')).json();
      expect(listed).toMatchObject([{ id: 'mobile', name: 'Mobile', archivedAs: deleted.archivedTo }]);
      // The archive keeps the work, never the access to the team's site.
      expect(existsSync(join(dir, deleted.archivedTo, 'settings.json'))).toBe(true);
      expect(filesContaining(dir, 'dummy-sealed-token')).toEqual([]);

      expect((await call('POST', '/api/workspaces-deleted/restore', { archivedAs: deleted.archivedTo })).json()).toEqual({ id: 'mobile', name: 'Mobile' });
      expect((await ctx.workspaces.get('mobile')!.store.settings()).project.name).toBe('Mobile app');
      expect((await call('GET', '/api/workspaces-deleted')).json()).toEqual([]);

      const again = (await call('DELETE', '/api/workspaces/mobile', { confirm: 'mobile' })).json();
      expect(await ctx.workspaces.purge(new Date())).toEqual([]);
      const due = await ctx.workspaces.purge(new Date(Date.now() + (ERASE_AFTER_DAYS + 1) * 86_400_000));
      expect(due.map((d) => d.id)).toEqual(['mobile']);
      expect(existsSync(join(dir, again.archivedTo))).toBe(false);
      expect(filesContaining(dir, 'Mobile app')).toEqual([]);
      expect((await call('POST', '/api/workspaces-deleted/restore', { archivedAs: again.archivedTo })).statusCode).toBe(404);
    } finally {
      await ctx.app.close();
    }
  });

  it('DEL-03: the operator erases one before its date; the record keeps the id and dates only', async () => {
    const ctx = await buildApp({ dataDir: dir, adminToken: 'dummy-admin-token', allowedHosts: [], allowedOrigins: [], pdi: { eventsUrl: '', secret: '' } });
    try {
      const call = (method: 'GET' | 'POST' | 'DELETE', url: string, payload?: object) => ctx.app.inject({ method, url, headers: admin, ...(payload && { payload }) });
      await call('POST', '/api/workspaces', { id: 'web', name: 'Web' });
      const d = (await call('DELETE', '/api/workspaces/web', { confirm: 'web' })).json();
      expect((await call('POST', '/api/workspaces-deleted/erase', { archivedAs: d.archivedTo })).json()).toEqual({ erased: 'web' });
      expect(existsSync(join(dir, d.archivedTo))).toBe(false);
      expect((await call('POST', '/api/workspaces-deleted/erase', { archivedAs: d.archivedTo })).statusCode).toBe(404);
      expect((await call('GET', '/api/erasures')).json()).toMatchObject([{ kind: 'workspace_erased', workspace: 'web', reason: 'operator' }]);
      // Without the admin token nothing is restored or erased.
      expect((await ctx.app.inject({ method: 'POST', url: '/api/workspaces-deleted/erase', headers: { origin: 'http://localhost:4317', host: 'localhost:4317' }, payload: { archivedAs: 'x' } })).statusCode).toBe(401);
    } finally {
      await ctx.app.close();
    }
  });
});

describe('an organization erased on its request', () => {
  let app: App;
  let fake: ReturnType<typeof fakeAtlassian>;
  let ada: string;
  beforeEach(async () => {
    fake = fakeAtlassian();
    app = await startAccounts(dir, { bootstrapEmail: ADA.email, operatorEmails: [ADA.email!], adminToken: 'dummy-admin-token' });
    ada = (await login(app.app)).session!;
  });
  afterEach(async () => {
    await app.app.close();
  });
  const send = (session: string, method: 'POST' | 'PUT' | 'DELETE', url: string, payload?: object, headers: Record<string, string> = {}) => app.app.inject({ method, url, headers: { ...browser(session), ...headers }, payload });

  it('DEL-04: workspaces, people, invitations, usage, AI spend, the application and survey answers go; a record of counts stays', async () => {
    // A team applies, the operator approves, its Owner joins and works in its workspace.
    const applied = await app.app.inject({
      method: 'POST',
      url: '/api/beta/apply',
      headers: { origin: 'http://localhost:4317', host: 'localhost:4317' },
      payload: { org: 'Gamma Org', team: 'Payments', contactName: 'Bea Beta', contactEmail: BEA.email, writers: 2, builders: 3, sources: ['jira'], realData: 'yes', consents: { terms: true, measurement: true, surveys: true } },
    });
    expect(applied.statusCode).toBe(202);
    const enrollment = (await app.app.inject({ method: 'GET', url: '/api/beta/enrollments', headers: browser(ada) })).json()[0];
    const approved = (await send(ada, 'POST', `/api/beta/enrollments/${enrollment.id}/approve`, { workspace: { id: 'gamma' } })).json();
    fake.state.as = BEA;
    const bea = (await login(app.app, `?invite=${encodeURIComponent(new URL(approved.invitation.link).searchParams.get('invite')!)}`)).session!;
    const settings = await app.app.inject({ method: 'GET', url: '/api/w/gamma/settings', headers: browser(bea) });
    expect((await send(bea, 'PUT', '/api/w/gamma/settings', { project: { key: 'GAM', name: 'Gamma payments' } }, { 'if-match': String(settings.headers.etag) })).statusCode).toBe(200);
    expect((await send(bea, 'POST', '/api/invitations', { role: 'member', email: 'ben@gamma.example' })).statusCode).toBe(201);
    const orgId = enrollment.orgId ?? approved.enrollment.orgId;
    // A survey answer and a usage event of the team, as the beta would have kept them.
    const platform = new FileStorage(dir).backend('_platform');
    await platform.append('beta-survey-answers', { enrollmentId: enrollment.id, orgId, survey: 's1', name: 'Bea Beta', answers: { q1: 'yes' } });
    await platform.append('usage-events', { event: 'analysis_completed', orgId, workspace: 'gamma', props: {} });
    expect(filesContaining(dir, BEA.email!).length).toBeGreaterThan(0);

    expect((await send(ada, 'POST', `/api/orgs/${orgId}/erase`, { confirm: 'Gamma' })).statusCode).toBe(400);
    expect((await send(bea, 'POST', `/api/orgs/${orgId}/erase`, { confirm: 'Gamma Org' })).statusCode).toBe(403);
    const erased = await send(ada, 'POST', `/api/orgs/${orgId}/erase`, { confirm: 'Gamma Org' });
    expect(erased.json()).toEqual({ erased: 'Gamma Org', workspaces: 1, people: 1, invitations: 1, usageEvents: 1, surveyAnswers: 1, betaEnrollments: 1 });

    // Nothing of the team is left anywhere in the data directory: no e-mail, no name, no work.
    expect(filesContaining(dir, BEA.email!)).toEqual([]);
    expect(filesContaining(dir, 'Bea Beta')).toEqual([]);
    expect(filesContaining(dir, 'ben@gamma.example')).toEqual([]);
    expect(filesContaining(dir, 'Gamma payments')).toEqual([]);
    expect((await app.app.inject({ method: 'GET', url: '/api/w/gamma/settings', headers: browser(ada) })).statusCode).toBe(404);
    expect((await app.app.inject({ method: 'GET', url: '/api/auth/me', headers: browser(bea) })).json().user).toBeFalsy();
    expect((await app.app.inject({ method: 'GET', url: '/api/orgs', headers: browser(ada) })).json().map((o: { name: string }) => o.name)).not.toContain('Gamma Org');
    expect((await app.app.inject({ method: 'GET', url: '/api/beta/enrollments', headers: browser(ada) })).json()).toEqual([]);
    const record = (await app.app.inject({ method: 'GET', url: '/api/erasures', headers: browser(ada) })).json();
    expect(record[0]).toMatchObject({ kind: 'org_erased', org: 'Gamma Org', workspaces: 1, people: 1 });

    // The first organization is never erased.
    const home = (await app.app.inject({ method: 'GET', url: '/api/orgs', headers: browser(ada) })).json()[0];
    expect((await send(ada, 'POST', `/api/orgs/${home.id}/erase`, { confirm: home.name })).statusCode).toBe(409);
  });
});
