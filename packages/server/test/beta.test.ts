import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applicationLimiter, daysLeft, statusAt } from '../src/beta.js';
import { ADA, allText, browser, fakeAtlassian, login, removeDir, startAccounts, tempDir, type App, type Identity } from './accounts-helpers.js';

/**
 * Closed beta enrollment (docs/BETA-ENROLLMENT-PLAN.md, first PR): the public application form, the operator's
 * approval that opens the team's organization with an Owner invitation, and the beta period from the Owner's join.
 */
const ADAM: Identity = { account_id: 'acc-adam', name: 'Adam Admin', email: 'adam@example.com' };
const BEA: Identity = { account_id: 'acc-bea', name: 'Bea Beta', email: 'bea@beta.example' };
const EVE: Identity = { account_id: 'acc-eve', name: 'Eve Other', email: 'eve@other.example' };
const DAY = 24 * 3_600_000;

const APPLICATION = {
  org: 'Beta Corp',
  team: 'Payments',
  contactName: 'Bea Beta',
  contactEmail: 'bea@beta.example',
  contactRole: 'Product Owner',
  writers: 3,
  builders: 8,
  sources: ['jira', 'confluence'],
  realData: 'yes',
  reference: 'ask_first',
  consents: { terms: true, measurement: true, surveys: true },
};

let dir: string;
let app: App;
let fake: ReturnType<typeof fakeAtlassian>;
let ada: string;
let adam: string;
const saved = process.env.CI_DISABLE_SCHEDULE;

async function start(opts: Parameters<typeof startAccounts>[1] = {}) {
  app = await startAccounts(dir, { bootstrapEmail: ADA.email, operatorEmails: [ADA.email!], betaWeeks: 8, ...opts });
  fake.state.as = ADA;
  ada = (await login(app.app)).session!;
  await app.accounts.admit({ provider: 'atlassian', subject: ADAM.account_id, name: ADAM.name, email: ADAM.email! }, 'admin');
  fake.state.as = ADAM;
  adam = (await login(app.app)).session!;
}

beforeEach(async () => {
  dir = tempDir();
  process.env.CI_DISABLE_SCHEDULE = 'true';
  fake = fakeAtlassian();
  await start();
});
afterEach(async () => {
  await app.app.close();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  removeDir(dir);
  if (saved === undefined) delete process.env.CI_DISABLE_SCHEDULE;
  else process.env.CI_DISABLE_SCHEDULE = saved;
});

/** The form posts from the app's own page, without a session. */
const apply = (payload: object, ip = '203.0.113.7') =>
  app.app.inject({ method: 'POST', url: '/api/beta/apply', remoteAddress: ip, headers: { origin: 'http://localhost:4317', host: 'localhost:4317' }, payload });
const enrollments = async (session = ada) => (await app.app.inject({ method: 'GET', url: '/api/beta/enrollments', headers: browser(session) })).json();
const approve = (id: string, payload: object = { workspace: { id: 'beta-payments' } }, session = ada) =>
  app.app.inject({ method: 'POST', url: `/api/beta/enrollments/${id}/approve`, headers: browser(session), payload });
const tokenOf = (link: string) => new URL(link).searchParams.get('invite')!;
const join = async (who: Identity, link: string) => {
  fake.state.as = who;
  return (await login(app.app, `?invite=${encodeURIComponent(tokenOf(link))}`)).session;
};
const me = async (session: string) => (await app.app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: session } })).json();

describe('the application form', () => {
  it('BETA-01: anyone may read whether applications are open and apply without logging in', async () => {
    const info = await app.app.inject({ method: 'GET', url: '/api/beta' });
    expect(info.statusCode).toBe(200);
    expect(info.json()).toEqual({ open: true, weeks: 8 });

    const r = await apply(APPLICATION);
    expect(r.statusCode).toBe(202);
    expect(r.json()).toEqual({ received: true });
    const [e] = await enrollments();
    expect(e).toMatchObject({ status: 'applied', application: { org: 'Beta Corp', team: 'Payments', contactEmail: 'bea@beta.example', sources: ['jira', 'confluence'] }, consents: { terms: true, measurement: true, surveys: true } });
    expect(e.history).toEqual([expect.objectContaining({ status: 'applied', by: 'Bea Beta' })]);
  });

  it.each([
    ['without the measurement consent', { consents: { terms: true, measurement: false, surveys: true } }],
    ['without consents', { consents: undefined }],
    ['without a source', { sources: [] }],
    ['with an unknown source', { sources: ['jira', 'slack'] }],
    ['with a blank team', { team: '   ' }],
    ['with an e-mail without a domain', { contactEmail: 'bea@beta' }],
    ['with an unknown field', { extra: 'x' }],
    ['with a negative team size', { writers: -1 }],
  ])('BETA-02: an application %s is refused with 422 and nothing is stored', async (_, change) => {
    const r = await apply({ ...APPLICATION, ...change });
    expect(r.statusCode).toBe(422);
    expect(await enrollments()).toEqual([]);
  });

  it('BETA-03: a filled honeypot or a repeated contact gets the same answer and stores nothing', async () => {
    expect((await apply({ ...APPLICATION, website: 'https://spam.example' })).statusCode).toBe(202);
    expect(await enrollments()).toEqual([]);
    expect((await apply(APPLICATION)).statusCode).toBe(202);
    expect((await apply({ ...APPLICATION, contactEmail: 'BEA@beta.example', team: 'Again' })).statusCode).toBe(202);
    expect(await enrollments()).toHaveLength(1);
  });

  it('BETA-04: at most 5 applications per address per hour', async () => {
    for (let i = 0; i < 5; i++) expect((await apply({ ...APPLICATION, contactEmail: `p${i}@beta.example` })).statusCode).toBe(202);
    const r = await apply({ ...APPLICATION, contactEmail: 'p6@beta.example' });
    expect(r.statusCode).toBe(429);
    expect(r.headers['retry-after']).toBe('3600');
    expect((await apply({ ...APPLICATION, contactEmail: 'other@beta.example' }, '198.51.100.1')).statusCode).toBe(202);
  });

  it('BETA-05: a foreign Origin is refused; closed applications answer 410', async () => {
    const foreign = await app.app.inject({ method: 'POST', url: '/api/beta/apply', headers: { origin: 'https://evil.example', host: 'localhost:4317' }, payload: APPLICATION });
    expect(foreign.statusCode).toBe(403);
    await app.app.close();
    await start({ betaApplicationsOpen: false });
    expect((await app.app.inject({ method: 'GET', url: '/api/beta' })).json()).toEqual({ open: false, weeks: 8 });
    expect((await apply(APPLICATION)).statusCode).toBe(410);
  });
});

describe('the operator', () => {
  it("BETA-06: only an operator sees and decides applications", async () => {
    await apply(APPLICATION);
    expect((await app.app.inject({ method: 'GET', url: '/api/beta/enrollments', headers: browser(adam) })).statusCode).toBe(403);
    const [e] = await enrollments();
    expect((await approve(e.id, undefined, adam)).statusCode).toBe(403);
    expect((await app.app.inject({ method: 'POST', url: `/api/beta/enrollments/${e.id}/reject`, headers: browser(adam), payload: {} })).statusCode).toBe(403);
    expect((await app.app.inject({ method: 'GET', url: '/api/beta/enrollments' })).statusCode).toBe(401);
  });

  it("BETA-07: approving opens the team's organization and workspace with an Owner invitation for the contact", async () => {
    await apply(APPLICATION);
    const [e] = await enrollments();
    const r = await approve(e.id);
    expect(r.statusCode).toBe(201);
    const body = r.json();
    expect(body).toMatchObject({
      enrollment: { status: 'invited', workspace: 'beta-payments', orgId: body.org.id },
      org: { name: 'Beta Corp' },
      workspace: { id: 'beta-payments', name: 'Payments' },
      invitation: { role: 'owner', email: 'bea@beta.example', link: expect.stringMatching(/invite=/) },
    });
    expect((await approve(e.id, { workspace: { id: 'beta-other' } })).statusCode).toBe(409);
    expect(allText(dir)).not.toContain(tokenOf(body.invitation.link));
    const home = (await app.app.inject({ method: 'GET', url: '/api/audit', headers: browser(ada) })).json().map((x: { summary: string }) => x.summary);
    expect(home).toEqual(expect.arrayContaining(['Beta application from Beta Corp (Payments)', 'Beta application from Beta Corp approved']));
  });

  it('BETA-08: the beta starts when the invited Owner joins and ends after the set weeks', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const t0 = Date.now();
    vi.setSystemTime(t0);
    await apply(APPLICATION);
    const [e] = await enrollments();
    const { invitation } = (await approve(e.id)).json();
    const joinedAt = t0 + 3_600_000;
    vi.setSystemTime(joinedAt);
    const bea = (await join(BEA, invitation.link))!;
    const endsAt = new Date(joinedAt + 56 * DAY).toISOString();
    expect(await me(bea)).toMatchObject({ home: 'beta-payments', beta: { status: 'active', startedAt: new Date(joinedAt).toISOString(), endsAt, daysLeft: 56 } });
    expect((await enrollments())[0]).toMatchObject({ status: 'active', daysLeft: 56 });
    const audit = (await app.app.inject({ method: 'GET', url: '/api/w/beta-payments/audit', headers: browser(bea) })).json().map((x: { summary: string }) => x.summary);
    expect(audit).toContain(`Beta started; it ends on ${endsAt.slice(0, 10)}`);

    // Weeks later the sessions have expired: log in again (a known person needs no invitation).
    vi.setSystemTime(Date.parse(endsAt) - 3_600_000);
    fake.state.as = BEA;
    let later = (await login(app.app)).session!;
    // No survey was answered in those weeks, so the team is paused (docs/BETA-ENROLLMENT-PLAN.md, beta-lifecycle.test.ts).
    expect((await me(later)).beta).toMatchObject({ status: 'paused', daysLeft: 1 });
    vi.setSystemTime(Date.parse(endsAt));
    later = (await login(app.app)).session!;
    expect((await me(later)).beta).toMatchObject({ status: 'ended', daysLeft: 0 });
    // The first organization has no beta.
    fake.state.as = ADA;
    expect((await me((await login(app.app)).session!)).beta).toBeNull();
  });

  it("BETA-09: a member the Owner invites later does not restart the beta; the invitation is only for the contact's e-mail", async () => {
    await apply(APPLICATION);
    const [e] = await enrollments();
    const { invitation } = (await approve(e.id)).json();
    fake.state.as = EVE;
    const eve = await login(app.app, `?invite=${encodeURIComponent(tokenOf(invitation.link))}`);
    expect(eve.session).toBeUndefined();
    const bea = (await join(BEA, invitation.link))!;
    const startedAt = (await me(bea)).beta.startedAt;
    const inv = (await app.app.inject({ method: 'POST', url: '/api/invitations', headers: browser(bea), payload: { role: 'member' } })).json();
    const eveSession = (await join(EVE, inv.link))!;
    expect((await me(eveSession)).beta).toMatchObject({ status: 'active', startedAt });
  });

  it('BETA-10: reject keeps the note; reinvite replaces the link of a team that has not joined', async () => {
    await apply(APPLICATION);
    await apply({ ...APPLICATION, org: 'Spam Inc', contactEmail: 'x@spam.example' });
    const [spam, beta] = await enrollments();
    const rejected = await app.app.inject({ method: 'POST', url: `/api/beta/enrollments/${spam.id}/reject`, headers: browser(ada), payload: { note: 'Not a product team' } });
    expect(rejected.statusCode).toBe(200);
    expect(rejected.json()).toMatchObject({ status: 'rejected', history: [expect.anything(), expect.objectContaining({ status: 'rejected', note: 'Not a product team' })] });
    expect((await approve(spam.id)).statusCode).toBe(409);

    const first = (await approve(beta.id)).json().invitation;
    const again = await app.app.inject({ method: 'POST', url: `/api/beta/enrollments/${beta.id}/reinvite`, headers: browser(ada) });
    expect(again.statusCode).toBe(200);
    const second = again.json().invitation;
    expect(second.link).not.toBe(first.link);
    fake.state.as = BEA;
    expect((await login(app.app, `?invite=${encodeURIComponent(tokenOf(first.link))}`)).session).toBeUndefined();
    const bea = (await join(BEA, second.link))!;
    expect((await me(bea)).beta.status).toBe('active');
    expect((await app.app.inject({ method: 'POST', url: `/api/beta/enrollments/${beta.id}/reinvite`, headers: browser(ada) })).statusCode).toBe(409);
  });

  it('BETA-11: a taken workspace id is a 409 and the application still waits', async () => {
    await apply(APPLICATION);
    const [e] = await enrollments();
    expect((await approve(e.id, { workspace: { id: 'default' } })).statusCode).toBe(409);
    expect((await enrollments())[0].status).toBe('applied');
  });

  it('BETA-12: applications survive a restart', async () => {
    await apply(APPLICATION);
    await app.app.close();
    await start();
    expect(await enrollments()).toHaveLength(1);
  });
});

describe('beta rules', () => {
  it.each([
    ['before the start', undefined, 0, undefined, 'invited'],
    ['the first hour', '2026-11-11T09:00:00Z', Date.parse('2026-11-10T10:00:00Z'), 1, 'active'],
    ['one ms before the end', '2026-11-11T09:00:00Z', Date.parse('2026-11-11T08:59:59.999Z'), 1, 'active'],
    ['at the end', '2026-11-11T09:00:00Z', Date.parse('2026-11-11T09:00:00Z'), 0, 'ended'],
    ['long after', '2026-11-11T09:00:00Z', Date.parse('2027-01-01T00:00:00Z'), 0, 'ended'],
  ])('BETA-13: days left and status %s', (_, endsAt, now, days, status) => {
    const e = {
      id: 'e1',
      application: {} as never,
      consents: {} as never,
      appliedAt: '2026-11-01T00:00:00Z',
      history: [],
      status: endsAt ? ('active' as const) : ('invited' as const),
      ...(endsAt && { startedAt: '2026-11-10T09:00:00Z', endsAt, surveys: { entry: { answeredAt: '2026-11-10T09:00:00Z', by: ['u'] } } }),
    };
    expect(daysLeft(e, now)).toBe(days);
    expect(statusAt(e, now)).toBe(status);
  });

  it('BETA-14: the limiter forgets after the window', () => {
    const allow = applicationLimiter(2, 1000);
    expect([allow('a', 0), allow('a', 10), allow('a', 20), allow('b', 20), allow('a', 1011)]).toEqual([true, true, false, true, true]);
  });
});
