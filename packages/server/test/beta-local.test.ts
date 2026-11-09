import { afterEach, describe, expect, it } from 'vitest';
import { localBetaMode, shiftedClock } from '../src/beta-local.js';
import { removeDir, startAccounts, tempDir, type App } from './accounts-helpers.js';

/**
 * The local beta walkthrough (docs/BETA-LOCAL.md): a fake login, an in-app mailbox and a clock that moves forward,
 * only on loopback outside production.
 */
const OPERATOR = { name: 'Olga Operator', email: 'operator@quorum.local' };
const BEA = { name: 'Bea Beta', email: 'bea@beta.local' };

describe('when the local mode may run', () => {
  const ok = { publicUrl: 'http://localhost:4317', authMode: 'accounts' };
  it.each([
    ['off unless asked', {}, ok, { enabled: false }],
    ['on for localhost', { CI_BETA_LOCAL: '1' }, ok, { enabled: true }],
    ['on for 127.0.0.1', { CI_BETA_LOCAL: '1' }, { ...ok, publicUrl: 'http://127.0.0.1:5173/' }, { enabled: true }],
    ['never in production', { CI_BETA_LOCAL: '1', NODE_ENV: 'production' }, ok, { enabled: false, refused: expect.stringMatching(/production/) }],
    ['never on a public address', { CI_BETA_LOCAL: '1' }, { ...ok, publicUrl: 'https://quorum.example' }, { enabled: false, refused: expect.stringMatching(/localhost/) }],
    ['never listening beyond loopback', { CI_BETA_LOCAL: '1', HOST: '0.0.0.0' }, ok, { enabled: false, refused: expect.stringMatching(/loopback/) }],
    ['only with accounts', { CI_BETA_LOCAL: '1' }, { ...ok, authMode: 'token' }, { enabled: false, refused: expect.stringMatching(/accounts/) }],
  ])('BL-01: %s', (_, env, o, expected) => {
    expect(localBetaMode(env, o)).toEqual(expected);
  });

  it('BL-02: the clock moves forward only, for Date.now() and new Date(), and comes back', () => {
    const before = Date.now();
    const clock = shiftedClock();
    try {
      clock.forward(3 * 86_400_000);
      clock.forward(-5 * 86_400_000);
      expect(Date.now() - before).toBeGreaterThanOrEqual(3 * 86_400_000);
      expect(new Date().getTime() - before).toBeGreaterThanOrEqual(3 * 86_400_000);
      expect(new Date('2026-01-01T00:00:00Z').toISOString()).toBe('2026-01-01T00:00:00.000Z');
      expect(Date.parse('2026-01-01T00:00:00Z')).toBe(1767225600000);
    } finally {
      clock.restore();
    }
    expect(Date.now() - before).toBeLessThan(86_400_000);
  });
});

describe('the walkthrough through the API', () => {
  let dir: string;
  let app: App | undefined;
  const saved = { CI_DISABLE_SCHEDULE: process.env.CI_DISABLE_SCHEDULE };
  afterEach(async () => {
    await app?.app.close();
    app = undefined;
    removeDir(dir);
    if (saved.CI_DISABLE_SCHEDULE === undefined) delete process.env.CI_DISABLE_SCHEDULE;
    else process.env.CI_DISABLE_SCHEDULE = saved.CI_DISABLE_SCHEDULE;
  });
  const headers = (cookie = '') => ({ origin: 'http://localhost:4317', host: 'localhost:4317', cookie });
  const login = async (who: { name: string; email: string }, invite?: string) => {
    const r = await app!.app.inject({ method: 'POST', url: '/api/dev/login', headers: headers(), payload: { ...who, ...(invite && { invite }) } });
    expect(r.statusCode, r.body).toBe(200);
    return String(r.headers['set-cookie']).split(';')[0]!;
  };
  const mails = async () => (await app!.app.inject({ method: 'GET', url: '/api/dev/mails', headers: headers() })).json() as { to: string[]; subject: string; text: string }[];
  const move = (days: number) => app!.app.inject({ method: 'POST', url: '/api/dev/clock', headers: headers(), payload: { days } });

  it('BL-03: application, approval, invitation, entry survey, reminders and the pause, without Atlassian or Resend', async () => {
    dir = tempDir();
    process.env.CI_DISABLE_SCHEDULE = 'true';
    app = await startAccounts(dir, { betaLocal: true, bootstrapEmail: OPERATOR.email, operatorEmails: [OPERATOR.email] });
    const info = (await app.app.inject({ method: 'GET', url: '/api/dev/beta' })).json();
    expect(info.people.map((p: { email: string }) => p.email)).toEqual(['operator@quorum.local', 'bea@beta.local', 'ben@beta.local']);
    expect((await app.app.inject({ method: 'GET', url: '/api/auth/me' })).json()).toMatchObject({ user: null, local: { offsetDays: 0 } });

    const operator = await login(OPERATOR);
    await app.app.inject({
      method: 'POST',
      url: '/api/beta/apply',
      headers: headers(),
      payload: { org: 'Beta Corp', team: 'Payments', contactName: BEA.name, contactEmail: BEA.email, writers: 2, builders: 5, sources: ['jira'], realData: 'yes', consents: { terms: true, measurement: true, surveys: true } },
    });
    expect((await mails()).map((m) => m.subject)).toEqual(['Quorum beta: new application from Beta Corp', 'Quorum beta: we have your application']);

    const [e] = (await app.app.inject({ method: 'GET', url: '/api/beta/enrollments', headers: headers(operator) })).json();
    await app.app.inject({ method: 'POST', url: `/api/beta/enrollments/${e.id}/approve`, headers: headers(operator), payload: { workspace: { id: 'payments' } } });
    const invitation = (await mails())[0]!;
    expect(invitation.subject).toBe('Quorum beta: your invitation');
    const link = /http:\/\/localhost:4317\/api\/auth\/login\?invite=([\w-]+)/.exec(invitation.text)!;
    // The invitation link leads to the local login page instead of Atlassian.
    const follow = await app.app.inject({ method: 'GET', url: `/api/auth/login?invite=${link[1]}` });
    expect(follow.headers.location).toBe(`/#/dev/login?invite=${link[1]}`);
    // Someone else cannot use it, Bea can.
    expect((await app.app.inject({ method: 'POST', url: '/api/dev/login', headers: headers(), payload: { name: 'Eve', email: 'eve@x.local', invite: link[1] } })).statusCode).toBe(403);
    const bea = await login(BEA, link[1]);
    expect((await app.app.inject({ method: 'GET', url: '/api/auth/me', headers: headers(bea) })).json()).toMatchObject({ home: 'payments', beta: { status: 'active', entrySurveyDone: false } });

    expect((await move(2.5)).json()).toMatchObject({ offsetDays: 2.5 });
    expect((await mails())[0]!.subject).toBe('Quorum beta: the entry survey is due ' + (await app.app.inject({ method: 'GET', url: '/api/auth/me', headers: headers(bea) })).json().beta.surveyDue.dueAt.slice(0, 10));
    await move(8);
    expect((await mails()).map((m) => m.subject)).toEqual(expect.arrayContaining(['Quorum beta: analyses are paused', 'Quorum beta: Beta Corp is paused']));
    // Sessions survive the jumps: the walkthrough does not log people out every few days.
    expect((await app.app.inject({ method: 'GET', url: '/api/auth/me', headers: headers(bea) })).json()).toMatchObject({ user: { name: 'Bea Beta' }, beta: { status: 'paused' } });
    // Switching person works from a paused team's session too (the browser still sends its cookie).
    const back = await app.app.inject({ method: 'POST', url: '/api/dev/login', headers: headers(bea), payload: OPERATOR });
    expect(back.statusCode, back.body).toBe(200);
  });

  it('BL-04: without the local mode the walkthrough does not exist and refuses a public address', async () => {
    dir = tempDir();
    app = await startAccounts(dir, {});
    expect((await app.app.inject({ method: 'GET', url: '/api/dev/beta' })).statusCode).toBe(401);
    expect((await app.app.inject({ method: 'POST', url: '/api/dev/login', headers: headers(), payload: OPERATOR })).statusCode).toBe(401);
    await app.app.close();
    app = undefined;
    await expect(startAccounts(dir, { betaLocal: true, connect: { mode: 'token', publicUrl: 'https://quorum.example', atlassian: { clientId: 'dummy', clientSecret: 'dummy', scopes: [] } } })).rejects.toThrow(/localhost/);
  });
});
