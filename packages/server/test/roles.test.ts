import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { explicitRole, requiredRole, type Role } from '../src/roles.js';
import { ADA, browser, fakeAtlassian, login, removeDir, startAccounts, tempDir, type App, type Identity } from './accounts-helpers.js';

const PEOPLE: Record<Exclude<Role, 'owner'>, Identity> = {
  admin: { account_id: 'acc-adam', name: 'Adam Admin', email: 'adam@example.com' },
  member: { account_id: 'acc-mia', name: 'Mia Member', email: 'mia@example.com' },
  viewer: { account_id: 'acc-vic', name: 'Vic Viewer' },
};

let dir: string;
let app: App;
let fake: ReturnType<typeof fakeAtlassian>;
/** The session cookie of each role's person. */
const s = {} as Record<Role, string>;
const saved = process.env.CI_DISABLE_SCHEDULE;

beforeEach(async () => {
  dir = tempDir();
  process.env.CI_DISABLE_SCHEDULE = 'true';
  fake = fakeAtlassian();
  app = await startAccounts(dir, { bootstrapEmail: ADA.email, adminToken: 'dummy-admin' });
  s.owner = (await login(app.app)).session!;
  for (const [role, who] of Object.entries(PEOPLE) as [Exclude<Role, 'owner'>, Identity][]) {
    await app.accounts.admit({ provider: 'atlassian', subject: who.account_id, name: who.name, email: who.email ?? '' }, role);
    fake.state.as = who;
    s[role] = (await login(app.app)).session!;
  }
});
afterEach(async () => {
  await app.app.close();
  vi.unstubAllGlobals();
  removeDir(dir);
  if (saved === undefined) delete process.env.CI_DISABLE_SCHEDULE;
  else process.env.CI_DISABLE_SCHEDULE = saved;
});

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
const as = (role: Role, method: Method, url: string, payload?: object, headers: Record<string, string> = {}) => app.app.inject({ method, url, headers: { ...browser(s[role]), ...headers }, ...(payload && { payload }) });

/** PUT /api/settings with the current ETag, as the web client does. */
async function putSettings(role: Role) {
  const current = await as(role, 'GET', '/api/settings');
  return as(role, 'PUT', '/api/settings', { schedule: current.json().settings.schedule }, { 'if-match': String(current.headers.etag) });
}

async function members(): Promise<{ id: string; name: string; email: string; role: Role; lastLoginAt: string }[]> {
  return (await as('owner', 'GET', '/api/members')).json();
}
const idOf = async (name: string) => (await members()).find((m) => m.name === name)!.id;

describe('role × route', () => {
  it('RL-01: a Viewer reads but changes nothing', async () => {
    expect((await as('viewer', 'GET', '/api/settings')).statusCode).toBe(200);
    expect((await as('viewer', 'GET', '/api/w/default/analysis')).statusCode).toBe(200);
    const r = await as('viewer', 'POST', '/api/analyze');
    expect(r.statusCode).toBe(403);
    expect(r.json().detail).toMatch(/member/i);
    expect((await as('viewer', 'POST', '/api/decisions', { key: 'X-1' })).statusCode).toBe(403);
  });

  it('RL-02: a Member analyses but does not change settings, connections or workspaces', async () => {
    expect((await as('member', 'POST', '/api/analyze')).statusCode).toBe(200);
    const r = await putSettings('member');
    expect(r.statusCode).toBe(403);
    expect(r.json().detail).toMatch(/admin/i);
    expect((await as('member', 'POST', '/api/workspaces', { id: 'team-a' })).statusCode).toBe(403);
    expect((await as('member', 'POST', '/api/demo/reset')).statusCode).toBe(403);
    expect((await as('member', 'GET', '/api/members')).statusCode).toBe(403);
  });

  it('RL-03: an Admin changes settings and workspaces', async () => {
    expect((await putSettings('admin')).statusCode).toBe(200);
    expect((await as('admin', 'POST', '/api/workspaces', { id: 'team-a' })).statusCode).toBe(201);
    expect((await as('admin', 'POST', '/api/w/team-a/analyze')).statusCode).toBe(200);
    expect((await as('admin', 'GET', '/api/members')).statusCode).toBe(200);
  });

  it('RL-04: with a session a change needs the Origin header, and it has to be ours', async () => {
    const r = await app.app.inject({ method: 'POST', url: '/api/analyze', headers: { cookie: s.owner, host: 'localhost:4317' } });
    expect(r.statusCode).toBe(403);
    expect(r.json().detail).toMatch(/origin/i);
    expect((await as('owner', 'POST', '/api/analyze', undefined, { origin: 'https://evil.example' })).statusCode).toBe(403);
    expect((await as('owner', 'POST', '/api/analyze')).statusCode).toBe(200);
    // Reads need no Origin.
    expect((await app.app.inject({ method: 'GET', url: '/api/settings', headers: { cookie: s.viewer } })).statusCode).toBe(200);
  });

  it('RL-05: every route that changes state has a role in roles.ts; one that is not listed needs Owner', () => {
    const paths = (app.app.swagger() as { paths: Record<string, Record<string, unknown>> }).paths;
    const missing: string[] = [];
    for (const [path, ops] of Object.entries(paths)) {
      if (!path.startsWith('/api/') || path.includes('/webhooks/')) continue;
      for (const method of Object.keys(ops)) {
        if (['post', 'put', 'patch', 'delete'].includes(method) && !explicitRole(method.toUpperCase(), path)) missing.push(`${method.toUpperCase()} ${path}`);
      }
    }
    expect(missing).toEqual([]);
    expect(requiredRole('POST', '/api/something-new')).toBe('owner');
    expect(requiredRole('POST', '/api/w/team-a/analyze')).toBe('member');
    expect(requiredRole('PUT', '/api/w/team-a/settings')).toBe('admin');
    expect(requiredRole('GET', '/api/w/team-a/settings')).toBe('viewer');
  });

  it('RL-06: machines with the admin token keep full access', async () => {
    const bearer = { authorization: 'Bearer dummy-admin' };
    expect((await app.app.inject({ method: 'POST', url: '/api/analyze', headers: bearer, remoteAddress: '10.0.0.5' })).statusCode).toBe(200);
    expect((await app.app.inject({ method: 'GET', url: '/api/members', headers: bearer, remoteAddress: '10.0.0.5' })).statusCode).toBe(200);
  });
});

describe('members and roles', () => {
  it('ME-01: the list shows each person with role and last login, never a session', async () => {
    const list = await members();
    expect(list.map((m) => [m.name, m.role]).sort()).toEqual([
      ['Ada Owner', 'owner'],
      ['Adam Admin', 'admin'],
      ['Mia Member', 'member'],
      ['Vic Viewer', 'viewer'],
    ]);
    expect(list.find((m) => m.name === 'Vic Viewer')).toMatchObject({ email: '', lastLoginAt: expect.any(String) });
    expect(JSON.stringify(list)).not.toMatch(/hash|session/i);
  });

  it('ME-02: a role change works from the next request', async () => {
    const mia = await idOf('Mia Member');
    expect((await as('admin', 'PATCH', `/api/members/${mia}`, { role: 'viewer' })).statusCode).toBe(200);
    expect((await as('member', 'POST', '/api/analyze')).statusCode).toBe(403);
    expect((await as('member', 'GET', '/api/auth/me')).json().user.role).toBe('viewer');
  });

  it('ME-03: an Admin cannot take or give the Owner role', async () => {
    const ada = await idOf('Ada Owner');
    const mia = await idOf('Mia Member');
    expect((await as('admin', 'PATCH', `/api/members/${ada}`, { role: 'viewer' })).statusCode).toBe(403);
    expect((await as('admin', 'DELETE', `/api/members/${ada}`)).statusCode).toBe(403);
    expect((await as('admin', 'PATCH', `/api/members/${mia}`, { role: 'owner' })).statusCode).toBe(403);
    expect((await members()).find((m) => m.id === ada)!.role).toBe('owner');
  });

  it('ME-04: the last Owner can be neither demoted nor removed', async () => {
    const ada = await idOf('Ada Owner');
    const adam = await idOf('Adam Admin');
    expect((await as('owner', 'PATCH', `/api/members/${ada}`, { role: 'admin' })).statusCode).toBe(409);
    expect((await as('owner', 'DELETE', `/api/members/${ada}`)).statusCode).toBe(409);
    expect((await as('owner', 'PATCH', `/api/members/${adam}`, { role: 'owner' })).statusCode).toBe(200);
    expect((await as('owner', 'PATCH', `/api/members/${ada}`, { role: 'admin' })).statusCode).toBe(200);
    expect((await as('admin', 'GET', '/api/auth/me')).json().user.role).toBe('owner');
  });

  it('ME-05: a removed person loses access at once and cannot log in again without an invitation', async () => {
    const mia = await idOf('Mia Member');
    expect((await as('admin', 'DELETE', `/api/members/${mia}`)).statusCode).toBe(204);
    expect((await as('member', 'GET', '/api/settings')).statusCode).toBe(401);
    fake.state.as = PEOPLE.member;
    expect((await login(app.app)).session).toBeUndefined();
  });

  it('ME-06: an unknown member is 404 and an unknown role is refused', async () => {
    expect((await as('owner', 'PATCH', '/api/members/nobody', { role: 'viewer' })).statusCode).toBe(404);
    const mia = await idOf('Mia Member');
    expect((await as('owner', 'PATCH', `/api/members/${mia}`, { role: 'god' })).statusCode).toBe(422);
  });

  it('ME-07: role changes and removals are audited with who did them', async () => {
    const mia = await idOf('Mia Member');
    await as('admin', 'PATCH', `/api/members/${mia}`, { role: 'viewer' });
    const audit = (await as('owner', 'GET', '/api/audit')).json();
    expect(audit[0]).toMatchObject({ kind: 'member', actor: 'Adam Admin', via: 'session' });
    expect(audit[0].summary).toMatch(/Mia Member.*viewer/);
  });
});
