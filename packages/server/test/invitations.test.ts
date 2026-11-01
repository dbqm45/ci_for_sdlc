import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ADA, allText, browser, fakeAtlassian, login, loginError, removeDir, startAccounts, tempDir, type App, type Identity } from './accounts-helpers.js';

/** Invitations (docs/ACCOUNTS-PLAN.md, "Zaproszenia"): a one-time link, valid 7 days, only its hash is stored. */
const ADAM: Identity = { account_id: 'acc-adam', name: 'Adam Admin', email: 'adam@example.com' };
const MIA: Identity = { account_id: 'acc-mia', name: 'Mia Member', email: 'mia@example.com' };
const BOB: Identity = { account_id: 'acc-bob', name: 'Bob Stranger', email: 'bob@example.com' };
const HIDDEN: Identity = { account_id: 'acc-hid', name: 'Hidden Mail' };

let dir: string;
let app: App;
let fake: ReturnType<typeof fakeAtlassian>;
let owner: string;
let admin: string;
const saved = process.env.CI_DISABLE_SCHEDULE;

beforeEach(async () => {
  dir = tempDir();
  process.env.CI_DISABLE_SCHEDULE = 'true';
  fake = fakeAtlassian();
  app = await startAccounts(dir, { bootstrapEmail: ADA.email });
  owner = (await login(app.app)).session!;
  await app.accounts.admit({ provider: 'atlassian', subject: ADAM.account_id, name: ADAM.name, email: ADAM.email! }, 'admin');
  fake.state.as = ADAM;
  admin = (await login(app.app)).session!;
});
afterEach(async () => {
  await app.app.close();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  removeDir(dir);
  if (saved === undefined) delete process.env.CI_DISABLE_SCHEDULE;
  else process.env.CI_DISABLE_SCHEDULE = saved;
});

const invite = (session: string, payload: object) => app.app.inject({ method: 'POST', url: '/api/invitations', headers: browser(session), payload });
const invitations = async () => (await app.app.inject({ method: 'GET', url: '/api/invitations', headers: browser(admin) })).json();
const tokenOf = (link: string) => new URL(link).searchParams.get('invite')!;
/** Logs `who` in through an invitation link; returns the session (if any) and the login error (if any). */
async function accept(who: Identity, link: string) {
  fake.state.as = who;
  const r = await login(app.app, `?invite=${encodeURIComponent(tokenOf(link))}`);
  return { session: r.session, error: r.session ? '' : loginError(r.back.headers.location) };
}
const roleOf = async (session: string) => (await app.app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: session } })).json().user?.role;

describe('invitations', () => {
  it('IN-01: an Admin gets a one-time link; the list and the data keep only a hash of its token', async () => {
    const r = await invite(admin, { role: 'member', email: 'mia@example.com' });
    expect(r.statusCode).toBe(201);
    const body = r.json();
    expect(body).toMatchObject({ id: expect.any(String), role: 'member', email: 'mia@example.com', invitedBy: 'Adam Admin', expiresAt: expect.any(String) });
    expect(body.link).toMatch(/^http:\/\/localhost:4317\/api\/auth\/login\?invite=[\w-]{40,}$/);
    expect(Date.parse(body.expiresAt) - Date.now()).toBeGreaterThan(7 * 24 * 3_600_000 - 60_000);

    const list = await invitations();
    expect(list).toEqual([expect.objectContaining({ id: body.id, role: 'member', email: 'mia@example.com', invitedBy: 'Adam Admin' })]);
    const token = tokenOf(body.link);
    expect(JSON.stringify(list)).not.toContain(token);
    expect(list[0]).not.toHaveProperty('link');
    expect(allText(dir)).not.toContain(token);
  });

  it('IN-02: the link lets a new person in with its role, once', async () => {
    const { link } = (await invite(admin, { role: 'member' })).json();
    const mia = await accept(MIA, link);
    expect(mia.session).toBeDefined();
    expect(await roleOf(mia.session!)).toBe('member');
    expect(await invitations()).toEqual([]);

    const bob = await accept(BOB, link);
    expect(bob.session).toBeUndefined();
    expect(bob.error).toMatch(/no longer valid/i);
  });

  it('IN-03: the link expires after 7 days', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const t0 = Date.now();
    vi.setSystemTime(t0);
    const { link } = (await invite(owner, { role: 'viewer' })).json();
    vi.setSystemTime(t0 + 7 * 24 * 3_600_000 + 60_000);
    const late = await accept(MIA, link);
    expect(late.session).toBeUndefined();
    expect(late.error).toMatch(/no longer valid/i);
  });

  it('IN-04: with an e-mail the Atlassian e-mail must match; a hidden e-mail is enough with the link', async () => {
    const { link } = (await invite(admin, { role: 'viewer', email: 'Mia@Example.com' })).json();
    const bob = await accept(BOB, link);
    expect(bob.session).toBeUndefined();
    expect(bob.error).toMatch(/different e-mail/i);
    expect(await invitations()).toHaveLength(1);
    expect((await accept(MIA, link)).session).toBeDefined();

    const other = (await invite(admin, { role: 'viewer', email: 'someone@example.com' })).json();
    const hidden = await accept(HIDDEN, other.link);
    expect(hidden.session).toBeDefined();
    expect(await roleOf(hidden.session!)).toBe('viewer');
  });

  it('IN-05: a revoked link stops working', async () => {
    const { id, link } = (await invite(admin, { role: 'member' })).json();
    const del = await app.app.inject({ method: 'DELETE', url: `/api/invitations/${id}`, headers: browser(admin) });
    expect(del.statusCode).toBe(204);
    expect(await invitations()).toEqual([]);
    expect((await accept(MIA, link)).session).toBeUndefined();
    expect((await app.app.inject({ method: 'DELETE', url: `/api/invitations/${id}`, headers: browser(admin) })).statusCode).toBe(404);
  });

  it('IN-06: only an Admin invites, never as Owner; invitations are audited', async () => {
    const { link } = (await invite(admin, { role: 'member' })).json();
    const mia = (await accept(MIA, link)).session!;
    expect((await invite(mia, { role: 'viewer' })).statusCode).toBe(403);
    expect((await app.app.inject({ method: 'GET', url: '/api/invitations', headers: browser(mia) })).statusCode).toBe(403);
    expect((await invite(owner, { role: 'owner' })).statusCode).toBe(422);
    expect((await invite(admin, { role: 'viewer', email: 'not-an-email' })).statusCode).toBe(422);

    const audit = (await app.app.inject({ method: 'GET', url: '/api/audit', headers: browser(owner) })).json();
    expect(audit.map((a: { summary: string }) => a.summary)).toEqual(expect.arrayContaining([expect.stringMatching(/Mia Member joined as member/), expect.stringMatching(/Invitation.*member/i)]));
  });

  it('IN-07: a person who is already a member logs in normally and the link stays unused', async () => {
    const { link } = (await invite(admin, { role: 'viewer' })).json();
    const again = await accept(ADAM, link);
    expect(again.session).toBeDefined();
    expect(await roleOf(again.session!)).toBe('admin');
    expect(await invitations()).toHaveLength(1);
  });
});
