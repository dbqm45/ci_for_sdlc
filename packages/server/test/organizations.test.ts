import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ADA, browser, fakeAtlassian, login, loginError, removeDir, startAccounts, tempDir, type App, type Identity } from './accounts-helpers.js';

/**
 * Organizations (docs/ORGANIZATIONS-PLAN.md): an operator opens an organization with its first workspace and an
 * invitation for its Owner; people see only their organization's workspaces, members, invitations and audit.
 */
const ADAM: Identity = { account_id: 'acc-adam', name: 'Adam Admin', email: 'adam@example.com' };
const BEA: Identity = { account_id: 'acc-bea', name: 'Bea Beta', email: 'bea@beta.example' };
const BEN: Identity = { account_id: 'acc-ben', name: 'Ben Beta', email: 'ben@beta.example' };
const EVE: Identity = { account_id: 'acc-eve', name: 'Eve Other', email: 'eve@example.com' };

let dir: string;
let app: App;
let fake: ReturnType<typeof fakeAtlassian>;
let ada: string;
let adam: string;
const saved = process.env.CI_DISABLE_SCHEDULE;

beforeEach(async () => {
  dir = tempDir();
  process.env.CI_DISABLE_SCHEDULE = 'true';
  fake = fakeAtlassian();
  app = await startAccounts(dir, { bootstrapEmail: ADA.email, operatorEmails: ['ADA@example.com'], adminToken: 'dummy-admin-token' });
  ada = (await login(app.app)).session!;
  await app.accounts.admit({ provider: 'atlassian', subject: ADAM.account_id, name: ADAM.name, email: ADAM.email! }, 'admin');
  fake.state.as = ADAM;
  adam = (await login(app.app)).session!;
});
afterEach(async () => {
  await app.app.close();
  vi.unstubAllGlobals();
  removeDir(dir);
  if (saved === undefined) delete process.env.CI_DISABLE_SCHEDULE;
  else process.env.CI_DISABLE_SCHEDULE = saved;
});

const get = (session: string, url: string) => app.app.inject({ method: 'GET', url, headers: browser(session) });
const send = (session: string, method: 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) => app.app.inject({ method, url, headers: browser(session), payload });
const openOrg = (session: string, payload: object = { name: 'Beta Team', workspace: { id: 'beta-team', name: 'Beta team' }, ownerEmail: BEA.email }) => send(session, 'POST', '/api/orgs', payload);
const tokenOf = (link: string) => new URL(link).searchParams.get('invite')!;
async function accept(who: Identity, link: string) {
  fake.state.as = who;
  const r = await login(app.app, `?invite=${encodeURIComponent(tokenOf(link))}`);
  return { session: r.session, error: r.session ? '' : loginError(r.back.headers.location) };
}
/** Opens the beta organization and logs its Owner in. */
async function betaOwner() {
  const opened = (await openOrg(ada)).json();
  const { session } = await accept(BEA, opened.invitation.link);
  return { opened, bea: session! };
}

describe('organizations', () => {
  it('ORG-01: an operator opens an organization with its first workspace and a one-time Owner invitation', async () => {
    const r = await openOrg(ada);
    expect(r.statusCode).toBe(201);
    const body = r.json();
    expect(body).toMatchObject({ org: { id: expect.any(String), name: 'Beta Team' }, workspace: { id: 'beta-team', name: 'Beta team' }, invitation: { role: 'owner', email: BEA.email, link: expect.stringMatching(/invite=/) } });

    const orgs = (await app.app.inject({ method: 'GET', url: '/api/orgs', headers: browser(ada) })).json();
    expect(orgs).toEqual([
      expect.objectContaining({ home: true, workspaces: [{ id: 'default', name: 'Default' }], members: 2 }),
      expect.objectContaining({ id: body.org.id, home: false, workspaces: [{ id: 'beta-team', name: 'Beta team' }], members: 0, invitations: 1 }),
    ]);
    // The first organization's own invitations do not show the new Owner's.
    expect((await get(ada, '/api/invitations')).json()).toEqual([]);
  });

  it('ORG-02: only an operator or the admin token may open or list organizations; a taken workspace id is a 409', async () => {
    expect((await openOrg(adam)).statusCode).toBe(403);
    expect((await get(adam, '/api/orgs')).statusCode).toBe(403);
    const byToken = await app.app.inject({ method: 'POST', url: '/api/orgs', headers: { authorization: 'Bearer dummy-admin-token' }, payload: { name: 'Gamma', workspace: { id: 'gamma' }, ownerEmail: 'g@gamma.example' } });
    expect(byToken.statusCode).toBe(201);
    expect((await openOrg(ada, { name: 'Again', workspace: { id: 'gamma' }, ownerEmail: 'x@gamma.example' })).statusCode).toBe(409);
    expect((await openOrg(ada, { name: 'Bad', workspace: { id: 'Bad Id' }, ownerEmail: 'x@y.example' })).statusCode).toBe(422);
    expect((await openOrg(ada, { name: 'Bad', workspace: { id: 'bad' }, ownerEmail: 'not-an-email' })).statusCode).toBe(422);
  });

  it('ORG-03: the invited Owner joins the new organization and the app opens on its workspace', async () => {
    const { opened, bea } = await betaOwner();
    const me = (await get(bea, '/api/auth/me')).json();
    expect(me).toMatchObject({ user: { name: BEA.name, role: 'owner', operator: false }, org: { id: opened.org.id, name: 'Beta Team' }, home: 'beta-team' });
    expect((await get(ada, '/api/auth/me')).json()).toMatchObject({ user: { operator: true }, home: 'default' });
    expect((await get(bea, '/api/workspaces')).json()).toEqual([{ id: 'beta-team', name: 'Beta team' }]);
    expect((await get(ada, '/api/workspaces')).json()).toEqual([{ id: 'default', name: 'Default' }]);
    // The invitation was used up.
    expect((await accept(EVE, opened.invitation.link)).error).toMatch(/no longer valid/i);
  });

  it("ORG-04: a person never reaches another organization's workspaces, by /api or by /api/w/:ws", async () => {
    const { bea } = await betaOwner();
    expect((await get(bea, '/api/w/beta-team/audit')).statusCode).toBe(200);
    for (const url of ['/api/audit', '/api/settings', '/api/w/default/audit', '/api/decisions']) expect((await get(bea, url)).statusCode, url).toBe(404);
    expect((await get(adam, '/api/w/beta-team/audit')).statusCode).toBe(404);
    expect((await send(bea, 'POST', '/api/analyze')).statusCode).toBe(404);
    expect((await send(adam, 'PATCH', '/api/workspaces/beta-team', { name: 'Taken over' })).statusCode).toBe(404);
    expect((await send(adam, 'DELETE', '/api/workspaces/beta-team', { confirm: 'beta-team' })).statusCode).toBe(404);
    expect((await send(bea, 'DELETE', '/api/workspaces/default', { confirm: 'default' })).statusCode).toBe(404);
    // Machines with the admin token still see every workspace.
    const all = await app.app.inject({ method: 'GET', url: '/api/workspaces', headers: { authorization: 'Bearer dummy-admin-token' } });
    expect(all.json().map((w: { id: string }) => w.id).sort()).toEqual(['beta-team', 'default']);
  });

  it('ORG-05: a workspace created by a person belongs to their organization', async () => {
    const { bea } = await betaOwner();
    expect((await send(bea, 'POST', '/api/workspaces', { id: 'beta-mobile', name: 'Beta mobile' })).statusCode).toBe(201);
    expect((await get(bea, '/api/workspaces')).json().map((w: { id: string }) => w.id)).toEqual(['beta-team', 'beta-mobile']);
    expect((await get(ada, '/api/workspaces')).json().map((w: { id: string }) => w.id)).toEqual(['default']);
    expect((await get(adam, '/api/w/beta-mobile/audit')).statusCode).toBe(404);
  });

  it("ORG-06: members and invitations are the organization's own", async () => {
    const { opened, bea } = await betaOwner();
    const inv = await send(bea, 'POST', '/api/invitations', { role: 'member', email: BEN.email });
    expect(inv.statusCode).toBe(201);
    expect((await get(bea, '/api/invitations')).json()).toHaveLength(1);
    expect((await get(adam, '/api/invitations')).json()).toEqual([]);
    const ben = (await accept(BEN, inv.json().link)).session!;
    expect((await get(ben, '/api/auth/me')).json()).toMatchObject({ user: { role: 'member' }, org: { id: opened.org.id }, home: 'beta-team' });

    const names = (s: string) => get(s, '/api/members').then((r) => r.json().map((m: { name: string }) => m.name).sort());
    expect(await names(bea)).toEqual([BEA.name, BEN.name]);
    expect(await names(adam)).toEqual([ADA.name, ADAM.name]);
    const adamId = (await get(adam, '/api/members')).json().find((m: { name: string }) => m.name === ADAM.name).id;
    const benId = (await get(bea, '/api/members')).json().find((m: { name: string }) => m.name === BEN.name).id;
    expect((await send(bea, 'PATCH', `/api/members/${adamId}`, { role: 'viewer' })).statusCode).toBe(404);
    expect((await send(bea, 'DELETE', `/api/members/${adamId}`)).statusCode).toBe(404);
    expect((await send(adam, 'DELETE', `/api/members/${benId}`)).statusCode).toBe(404);
    const homeInvitation = (await send(adam, 'POST', '/api/invitations', { role: 'viewer' })).json();
    expect((await send(bea, 'DELETE', `/api/invitations/${homeInvitation.id}`)).statusCode).toBe(404);
  });

  it('ORG-07: each organization keeps its last Owner', async () => {
    const { bea } = await betaOwner();
    const beaId = (await get(bea, '/api/members')).json()[0].id;
    expect((await send(bea, 'PATCH', `/api/members/${beaId}`, { role: 'admin' })).statusCode).toBe(409);
  });

  it("ORG-08: the organization's events are audited in its own workspace, not in the first organization's", async () => {
    const { bea } = await betaOwner();
    await send(bea, 'POST', '/api/invitations', { role: 'viewer' });
    const own = (await get(bea, '/api/w/beta-team/audit')).json().map((e: { summary: string }) => e.summary);
    expect(own).toEqual(expect.arrayContaining([expect.stringMatching(/Organization Beta Team opened/), `${BEA.name} joined as owner`, 'Invitation as viewer created']));
    const home = (await get(adam, '/api/audit')).json().map((e: { summary: string }) => e.summary);
    expect(home).toContainEqual(expect.stringMatching(/Organization Beta Team opened/));
    expect(home.join('\n')).not.toContain(BEA.name);
    expect(home).not.toContain('Invitation as viewer created');
  });

  it('ORG-09: pdi belongs to the first organization: its routes do not exist for another one', async () => {
    const { bea } = await betaOwner();
    expect((await get(bea, '/api/pdi')).statusCode).toBe(404);
    expect((await get(bea, '/api/changes')).statusCode).toBe(404);
    expect((await send(bea, 'POST', '/api/changes/CHG-1/request-approval', {})).statusCode).toBe(404);
    expect((await get(adam, '/api/pdi')).statusCode).toBe(200);
  });

  it('ORG-10: a person already in an organization keeps it when they open another one\'s invitation', async () => {
    const opened = (await openOrg(ada, { name: 'Beta Team', workspace: { id: 'beta-team' }, ownerEmail: ADAM.email })).json();
    const r = await accept(ADAM, opened.invitation.link);
    expect((await get(r.session!, '/api/auth/me')).json()).toMatchObject({ user: { role: 'admin' }, home: 'default' });
  });
});

describe('organizations in token mode', () => {
  it('ORG-11: without accounts there are no organizations', async () => {
    const tokenDir = tempDir();
    const { buildApp } = await import('../src/app.js');
    const t = await buildApp({ dataDir: tokenDir, adminToken: 'dummy-admin-token', readToken: '', allowedHosts: [], allowedOrigins: [], authMode: 'token' });
    try {
      const r = await t.app.inject({ method: 'POST', url: '/api/orgs', headers: { authorization: 'Bearer dummy-admin-token' }, payload: { name: 'X', workspace: { id: 'x' }, ownerEmail: 'x@y.example' } });
      expect(r.statusCode).toBe(404);
      expect((await t.app.inject({ method: 'GET', url: '/api/workspaces' })).json()).toEqual([{ id: 'default', name: 'Default' }]);
    } finally {
      await t.app.close();
      removeDir(tokenDir);
    }
  });
});
