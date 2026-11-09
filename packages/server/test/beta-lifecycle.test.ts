import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DAY_MS, dueReminders, judgeEnrollment } from '../src/beta-lifecycle.js';
import { surveyStates, type BetaEnrollment } from '../src/beta.js';
import { LogMailer, RESEND_URL, ResendMailer, type Mail, type Mailer } from '../src/mailer.js';
import { ADA, browser, fakeAtlassian, login, removeDir, startAccounts, tempDir, type App, type Identity } from './accounts-helpers.js';

/**
 * The beta after a team joined (docs/BETA-ENROLLMENT-PLAN.md, third PR; owner's decisions 2026-11-09: pause after 7
 * days, automatically, mails through Resend): overdue, paused, ended, reminders, the operator's grace and extension.
 */
const BEA: Identity = { account_id: 'acc-bea', name: 'Bea Beta', email: 'bea@beta.example' };
const T0 = Date.parse('2026-11-10T09:00:00Z');
const at = (days: number, hours = 0) => T0 + days * DAY_MS + hours * 3_600_000;
const iso = (t: number) => new Date(t).toISOString();

/** An enrollment that started at T0 and runs 8 weeks; `answered` lists the answered survey ids. */
const enrollment = (answered: string[] = [], extra: Partial<BetaEnrollment> = {}): BetaEnrollment => ({
  id: 'e1',
  status: 'active',
  application: { org: 'Beta Corp', team: 'Payments', contactName: 'Bea', contactEmail: 'bea@beta.example', writers: 1, builders: 1, sources: ['jira'], realData: 'yes' },
  consents: { terms: true, measurement: true, surveys: true, at: iso(T0) },
  appliedAt: iso(T0),
  orgId: 'o1',
  workspace: 'beta-payments',
  startedAt: iso(T0),
  endsAt: iso(at(56)),
  history: [],
  surveys: Object.fromEntries(answered.map((id) => [id, { answeredAt: iso(T0), by: ['u'] }])),
  ...extra,
});
const judge = (e: BetaEnrollment, now: number) => judgeEnrollment(e, surveyStates(e, now), now, 7);

describe('judging a team', () => {
  it.each([
    ['the first day, entry open', [], at(0, 1), 'active', undefined],
    ['entry past due (day 3)', [], at(3, 1), 'overdue', iso(at(10))],
    ['entry 7 days past due', [], at(10), 'paused', undefined],
    ['entry answered, first two-week survey open', ['entry'], at(15), 'active', undefined],
    ['the two-week survey past due', ['entry'], at(19, 1), 'overdue', iso(at(26))],
    ['two surveys past due pause at once', ['entry'], at(33, 1), 'paused', undefined],
    ['all answered', ['entry', 'biweekly-1', 'biweekly-2', 'biweekly-3'], at(50), 'active', undefined],
    ['at the end', ['entry'], at(56), 'ended', undefined],
  ])('LC-01: %s', (_, answered, now, status, pauseOn) => {
    const j = judge(enrollment(answered), now);
    expect(j.status).toBe(status);
    expect(j.pauseOn).toBe(pauseOn);
  });

  it("LC-02: the operator's grace holds off the pause; a team before its start keeps its stored status", () => {
    expect(judge(enrollment([], { graceUntil: iso(at(14)) }), at(12))).toMatchObject({ status: 'overdue', pauseOn: iso(at(14)) });
    expect(judge(enrollment([], { graceUntil: iso(at(14)) }), at(14))).toMatchObject({ status: 'paused', reason: 'Entry survey is 7 days past due' });
    expect(judge(enrollment([], { status: 'invited', startedAt: undefined, endsAt: undefined }), at(30)).status).toBe('invited');
  });
});

describe('reminders', () => {
  it('LC-03: one at a time per survey; a late run sends only the latest and skips the rest', () => {
    const keys = (e: BetaEnrollment, now: number) => {
      const r = dueReminders(e, judge(e, now), surveyStates(e, now), now);
      return { send: r.send.map((x) => x.key), skip: r.skip };
    };
    expect(keys(enrollment(), at(0, 1))).toEqual({ send: ['entry:open'], skip: [] });
    expect(keys(enrollment([], { reminders: { 'entry:open': 'x' } }), at(2, 1))).toEqual({ send: ['entry:due'], skip: [] });
    // The job did not run for a week: only the latest reminder, plus the pause warning a day before the pause.
    expect(keys(enrollment(), at(9, 1))).toEqual({ send: ['entry:late', `pause:${iso(at(10))}`], skip: ['entry:open', 'entry:due'] });
    expect(keys(enrollment(['entry'], { reminders: { 'entry:open': 'x' } }), at(14, 1))).toEqual({ send: ['biweekly-1:open'], skip: [] });
    // Nothing while paused: the pause mail says it all.
    expect(keys(enrollment(), at(11))).toEqual({ send: [], skip: [] });
  });
});

describe('mail', () => {
  it('LC-04: Resend gets the mail with the key, the sender and an idempotency key; a refusal throws', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => (calls.push({ url, init }), new Response('{}', { status: calls.length === 1 ? 200 : 422 }))));
    const m = new ResendMailer('re_dummy_key', 'Quorum <beta@example.com>');
    await m.send({ to: ['a@example.com'], subject: 'Hi', text: 'Body', key: 'e1:entry:open' });
    expect(calls[0]!.url).toBe(RESEND_URL);
    expect(new Headers(calls[0]!.init.headers).get('authorization')).toBe('Bearer re_dummy_key');
    expect(new Headers(calls[0]!.init.headers).get('idempotency-key')).toBe('e1:entry:open');
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ from: 'Quorum <beta@example.com>', to: ['a@example.com'], subject: 'Hi', text: 'Body' });
    await expect(m.send({ to: ['a@example.com'], subject: 'Hi', text: 'x' })).rejects.toThrow(/HTTP 422/);
    vi.unstubAllGlobals();
  });

  it('LC-05: without Resend the log gets who and the subject, never the body', async () => {
    const log = vi.fn();
    await new LogMailer(log).send({ to: ['a@example.com'], subject: 'Invitation', text: 'secret-link' });
    expect(JSON.stringify(log.mock.calls)).not.toContain('secret-link');
    expect(log).toHaveBeenCalledWith({ to: ['a@example.com'], subject: 'Invitation' }, expect.any(String));
  });
});

describe('the job and the app', () => {
  let dir: string;
  let app: App;
  let fake: ReturnType<typeof fakeAtlassian>;
  let mails: Mail[];
  let failing: boolean;
  const saved = process.env.CI_DISABLE_SCHEDULE;
  const mailer: Mailer = {
    kind: 'test',
    send: async (m) => {
      if (failing) throw new Error('mail down');
      mails.push(m);
    },
  };
  const as = async (who: Identity, query = '') => {
    fake.state.as = who;
    return (await login(app.app, query)).session!;
  };
  const operator = async () => as(ADA);
  const subjects = () => mails.map((m) => `${m.to.join(',')}: ${m.subject}`);

  beforeEach(async () => {
    dir = tempDir();
    process.env.CI_DISABLE_SCHEDULE = 'true';
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0);
    fake = fakeAtlassian();
    mails = [];
    failing = false;
    app = await startAccounts(dir, { bootstrapEmail: ADA.email, operatorEmails: [ADA.email!], betaWeeks: 8, mailer });
    const ada = await operator();
    await app.app.inject({
      method: 'POST',
      url: '/api/beta/apply',
      headers: { origin: 'http://localhost:4317', host: 'localhost:4317' },
      payload: { org: 'Beta Corp', team: 'Payments', contactName: 'Bea Beta', contactEmail: BEA.email, writers: 3, builders: 8, sources: ['jira'], realData: 'yes', consents: { terms: true, measurement: true, surveys: true } },
    });
    const [e] = (await app.app.inject({ method: 'GET', url: '/api/beta/enrollments', headers: browser(ada) })).json();
    const { invitation } = (await app.app.inject({ method: 'POST', url: `/api/beta/enrollments/${e.id}/approve`, headers: browser(ada), payload: { workspace: { id: 'beta-payments' } } })).json();
    await as(BEA, `?invite=${encodeURIComponent(new URL(invitation.link).searchParams.get('invite')!)}`);
  });
  afterEach(async () => {
    await app.app.close();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    removeDir(dir);
    if (saved === undefined) delete process.env.CI_DISABLE_SCHEDULE;
    else process.env.CI_DISABLE_SCHEDULE = saved;
  });

  const enrollmentNow = async () => (await app.app.inject({ method: 'GET', url: '/api/beta/enrollments', headers: browser(await operator()) })).json()[0];
  const runAt = async (t: number) => {
    vi.setSystemTime(t);
    await app.betaJob(t);
  };
  const ENTRY = { readiness_today: ['refinement'], who_decides: 'po', stories: 5, returned: 1, hours: '2-5', quality: 3, pain: 'Edge cases.' };

  it('LC-06: the application, the invitation and every reminder go out, each once', async () => {
    expect(subjects()).toEqual([
      'bea@beta.example: Quorum beta: we have your application',
      'ada@example.com: Quorum beta: new application from Beta Corp',
      'bea@beta.example: Quorum beta: your invitation',
    ]);
    expect(mails[2]!.text).toMatch(/\/api\/auth\/login\?invite=/);
    mails = [];
    await runAt(at(0, 1));
    await runAt(at(0, 2));
    expect(subjects()).toEqual(['bea@beta.example: Quorum beta: the entry survey is open']);
    expect(mails[0]!.text).toContain('http://localhost:4317/#/w/beta-payments/survey/entry');
    mails = [];
    await runAt(at(2, 10));
    await runAt(at(6, 10));
    await runAt(at(9, 10));
    expect(subjects()).toEqual([
      'bea@beta.example: Quorum beta: the entry survey is due 2026-11-13',
      'bea@beta.example: Quorum beta: the entry survey is overdue',
      'bea@beta.example: Quorum beta: analyses pause on 2026-11-20',
      'ada@example.com: Quorum beta: Beta Corp pauses on 2026-11-20',
    ]);
  });

  it('LC-07: 7 days past due the team is paused: analyses and changes wait, surveys stay open; answering resumes it', async () => {
    await runAt(at(10, 1));
    const e = await enrollmentNow();
    expect(e).toMatchObject({ status: 'paused', pausedReason: 'Entry survey is 7 days past due' });
    expect(e.history.at(-1)).toMatchObject({ status: 'paused', by: 'beta job' });
    expect(subjects()).toEqual(expect.arrayContaining(['bea@beta.example: Quorum beta: analyses are paused', 'ada@example.com: Quorum beta: Beta Corp is paused']));
    expect(app.workspaces.get('beta-payments')!.engine.hold).toMatch(/beta paused/);

    const bea = await as(BEA);
    const analyze = await app.app.inject({ method: 'POST', url: '/api/w/beta-payments/analyze', headers: browser(bea) });
    expect(analyze.statusCode).toBe(403);
    expect(analyze.json().detail).toMatch(/paused/);
    expect((await app.app.inject({ method: 'POST', url: '/api/invitations', headers: browser(bea), payload: { role: 'viewer' } })).statusCode).toBe(403);
    expect((await app.app.inject({ method: 'GET', url: '/api/w/beta-payments/analysis', headers: browser(bea) })).statusCode).toBe(200);
    expect((await app.app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: bea } })).json().beta).toMatchObject({ status: 'paused', surveyDue: { id: 'entry' } });

    expect((await app.app.inject({ method: 'POST', url: '/api/beta/surveys/entry/answers', headers: browser(bea), payload: { answers: ENTRY } })).statusCode).toBe(201);
    expect((await app.app.inject({ method: 'POST', url: '/api/w/beta-payments/analyze', headers: browser(bea) })).statusCode).toBe(200);
    mails = [];
    await runAt(at(10, 2));
    expect((await enrollmentNow()).status).toBe('active');
    expect(subjects()).toEqual(['bea@beta.example: Quorum beta: analyses resumed']);
    expect(app.workspaces.get('beta-payments')!.engine.hold).toBeUndefined();
    const audit = (await app.app.inject({ method: 'GET', url: '/api/w/beta-payments/audit', headers: browser(bea) })).json().map((x: { summary: string }) => x.summary);
    expect(audit).toEqual(expect.arrayContaining(['Beta paused: Entry survey is 7 days past due', 'Beta resumed']));
  });

  it("LC-08: the operator's grace resumes a paused team at once; extending moves the end", async () => {
    await runAt(at(10, 1));
    const ada = await operator();
    const e = await enrollmentNow();
    const grace = await app.app.inject({ method: 'POST', url: `/api/beta/enrollments/${e.id}/grace`, headers: browser(ada), payload: { days: 5, reason: 'Holiday' } });
    expect(grace.statusCode).toBe(200);
    expect(grace.json()).toMatchObject({ status: 'overdue', pauseOn: iso(at(15, 1)), graceUntil: iso(at(15, 1)) });
    expect((await enrollmentNow()).status).toBe('overdue');
    expect(app.workspaces.get('beta-payments')!.engine.hold).toBeUndefined();

    const ext = await app.app.inject({ method: 'POST', url: `/api/beta/enrollments/${e.id}/extend`, headers: browser(ada), payload: { days: 14 } });
    expect(ext.json()).toMatchObject({ endsAt: iso(at(70)) });
    expect((await app.app.inject({ method: 'POST', url: `/api/beta/enrollments/${e.id}/grace`, headers: browser(ada), payload: { days: 31 } })).statusCode).toBe(422);
    const bea = await as(BEA);
    expect((await app.app.inject({ method: 'POST', url: `/api/beta/enrollments/${e.id}/extend`, headers: browser(bea), payload: { days: 1 } })).statusCode).toBe(403);
  });

  it('LC-09: at the end the team is read-only, gets the exit survey mail and may still answer it', async () => {
    await runAt(at(56, 1));
    expect((await enrollmentNow()).status).toBe('ended');
    expect(subjects()).toContain('bea@beta.example: Quorum beta: the beta has ended — one last survey');
    expect(app.workspaces.get('beta-payments')!.engine.hold).toBe('beta ended');
    const bea = await as(BEA);
    expect((await app.app.inject({ method: 'POST', url: '/api/w/beta-payments/analyze', headers: browser(bea) })).json().detail).toMatch(/ended/);
    expect((await app.app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: bea } })).json().beta).toMatchObject({ status: 'ended', surveyDue: { id: 'exit' } });
    const exit = await app.app.inject({ method: 'GET', url: '/api/beta/surveys', headers: browser(bea) });
    expect(exit.json().find((s: { id: string }) => s.id === 'exit')).toMatchObject({ state: 'open', questions: expect.any(Array) });
  });

  it('LC-10: a failed mail is tried again on the next run; the status change is recorded anyway', async () => {
    mails = [];
    failing = true;
    await runAt(at(0, 1));
    expect((await enrollmentNow()).reminders ?? {}).toEqual({});
    failing = false;
    await runAt(at(0, 2));
    expect(subjects()).toEqual(['bea@beta.example: Quorum beta: the entry survey is open']);
    failing = true;
    await runAt(at(10, 1));
    expect((await enrollmentNow()).status).toBe('paused');
  });
});
