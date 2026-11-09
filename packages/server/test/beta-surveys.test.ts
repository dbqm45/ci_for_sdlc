import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SURVEYS, answerProblems, surveySchedule } from '../src/beta-surveys.js';
import { ADA, browser, fakeAtlassian, login, removeDir, startAccounts, tempDir, type App, type Identity } from './accounts-helpers.js';

/**
 * Beta surveys in the app (docs/BETA-ENROLLMENT-PLAN.md, second PR; questions from docs/BETA-SURVEYS.md): the
 * schedule, the answer checks, the entry survey before the first analysis, and the operator reading the answers.
 */
const ADAM: Identity = { account_id: 'acc-adam', name: 'Adam Admin', email: 'adam@example.com' };
const BEA: Identity = { account_id: 'acc-bea', name: 'Bea Beta', email: 'bea@beta.example' };
const BEN: Identity = { account_id: 'acc-ben', name: 'Ben Beta', email: 'ben@beta.example' };
const DAY = 24 * 3_600_000;

const ENTRY = {
  readiness_today: ['refinement', 'review'],
  who_decides: 'po',
  stories: 12,
  returned: 3,
  hours: '5-10',
  quality: 3,
  returned_example: '  PAY-123: no behaviour for a rejected payment  ',
  pain: 'Stories arrive without edge cases.',
};
const BIWEEKLY = {
  stories_decided: '6-15',
  changed_example: 'PAY-7: added the refund criterion',
  caught: 'yes',
  caught_key: 'PAY-7',
  dismissed: '1-3',
  time_spent: '1-3',
  time_saved: '3-8',
  helped: 4,
  without_quorum: 'worse',
  bother: 'The AI review is slow.',
};

let dir: string;
let app: App;
let fake: ReturnType<typeof fakeAtlassian>;
let ada: string;
let adam: string;
let bea: string;
const saved = process.env.CI_DISABLE_SCHEDULE;

const tokenOf = (link: string) => new URL(link).searchParams.get('invite')!;
async function as(who: Identity, invite?: string) {
  fake.state.as = who;
  return (await login(app.app, invite ? `?invite=${encodeURIComponent(tokenOf(invite))}` : '')).session!;
}

beforeEach(async () => {
  dir = tempDir();
  process.env.CI_DISABLE_SCHEDULE = 'true';
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(Date.parse('2026-11-10T09:00:00Z'));
  fake = fakeAtlassian();
  app = await startAccounts(dir, { bootstrapEmail: ADA.email, operatorEmails: [ADA.email!], betaWeeks: 8, adminToken: 'dummy-admin-token' });
  ada = await as(ADA);
  await app.accounts.admit({ provider: 'atlassian', subject: ADAM.account_id, name: ADAM.name, email: ADAM.email! }, 'admin');
  adam = await as(ADAM);
  // A beta team: applied, approved, and its Owner joined.
  await app.app.inject({
    method: 'POST',
    url: '/api/beta/apply',
    headers: { origin: 'http://localhost:4317', host: 'localhost:4317' },
    payload: { org: 'Beta Corp', team: 'Payments', contactName: 'Bea Beta', contactEmail: BEA.email, writers: 3, builders: 8, sources: ['jira'], realData: 'yes', consents: { terms: true, measurement: true, surveys: true } },
  });
  const [e] = (await app.app.inject({ method: 'GET', url: '/api/beta/enrollments', headers: browser(ada) })).json();
  const { invitation } = (await app.app.inject({ method: 'POST', url: `/api/beta/enrollments/${e.id}/approve`, headers: browser(ada), payload: { workspace: { id: 'beta-payments' } } })).json();
  bea = await as(BEA, invitation.link);
});
afterEach(async () => {
  await app.app.close();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  removeDir(dir);
  if (saved === undefined) delete process.env.CI_DISABLE_SCHEDULE;
  else process.env.CI_DISABLE_SCHEDULE = saved;
});

const surveys = async (session: string) => (await app.app.inject({ method: 'GET', url: '/api/beta/surveys', headers: browser(session) })).json();
const answer = (session: string, id: string, answers: object) => app.app.inject({ method: 'POST', url: `/api/beta/surveys/${id}/answers`, headers: browser(session), payload: { answers } });
const me = async (session: string) => (await app.app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: session } })).json();
const enrollment = async () => (await app.app.inject({ method: 'GET', url: '/api/beta/enrollments', headers: browser(ada) })).json()[0];

describe('the schedule and the answer checks', () => {
  it('SV-01: an 8-week beta: entry at once, a two-week survey every 14 days, the exit survey a week before the end', () => {
    const slots = surveySchedule('2026-11-10T09:00:00.000Z', '2027-01-05T09:00:00.000Z');
    expect(slots.map((s) => [s.id, s.opensAt.slice(0, 10), s.dueAt.slice(0, 10)])).toEqual([
      ['entry', '2026-11-10', '2026-11-13'],
      ['biweekly-1', '2026-11-24', '2026-11-29'],
      ['biweekly-2', '2026-12-08', '2026-12-13'],
      ['biweekly-3', '2026-12-22', '2026-12-27'],
      ['exit', '2026-12-29', '2027-01-12'],
    ]);
    // A 3-week beta has no room for a two-week survey before the exit week.
    expect(surveySchedule('2026-11-10T00:00:00Z', '2026-12-01T00:00:00Z').map((s) => s.id)).toEqual(['entry', 'exit']);
  });

  it('SV-02: valid answers pass; every problem is named', () => {
    expect(answerProblems(SURVEYS.entry, ENTRY)).toEqual([]);
    expect(answerProblems(SURVEYS.entry, { ...ENTRY, returned: 'unknown' })).toEqual([]);
    expect(answerProblems(SURVEYS.biweekly, BIWEEKLY)).toEqual([]);
    expect(
      answerProblems(SURVEYS.entry, {
        ...ENTRY,
        pain: undefined,
        who_decides: 'ceo',
        readiness_today: ['review', 'review'],
        quality: 6,
        stories: 2.5,
        returned_example: 'x'.repeat(301),
        extra: 'x',
      }),
    ).toEqual([
      'extra: not a question of this survey',
      'readiness_today: pick from dor_doc, jira_template, refinement, review, none, other',
      'who_decides: pick one of po, team, tech_lead, nobody',
      'stories: a whole number from 0 to 1000',
      'quality: a whole number from 1 to 5',
      'returned_example: text up to 300 characters',
      'pain: an answer is required',
    ]);
    expect(answerProblems(SURVEYS.exit, { price_bargain: -1 })).toContain('price_bargain: an amount from 0 to 100000');
  });

  it('SV-03: every question id is unique within its survey', () => {
    for (const def of Object.values(SURVEYS)) expect(new Set(def.questions.map((q) => q.id)).size).toBe(def.questions.length);
  });
});

describe('the entry survey before the first analysis', () => {
  it('SV-04: until it is answered the team may look but not analyse or connect Atlassian', async () => {
    expect((await me(bea)).beta).toMatchObject({ status: 'active', entrySurveyDone: false, surveyDue: { id: 'entry', kind: 'entry', dueAt: '2026-11-13T09:00:00.000Z' } });
    expect((await app.app.inject({ method: 'GET', url: '/api/w/beta-payments/analysis', headers: browser(bea) })).statusCode).toBe(200);
    for (const url of ['/api/w/beta-payments/analyze', '/api/w/beta-payments/connections/atlassian/start']) {
      const r = await app.app.inject({ method: 'POST', url, headers: browser(bea) });
      expect(r.statusCode, url).toBe(403);
      expect(r.json().detail).toMatch(/entry survey/);
    }
    // The first organization has no beta and is never held back.
    expect((await app.app.inject({ method: 'POST', url: '/api/analyze', headers: browser(adam) })).statusCode).toBe(200);

    const r = await answer(bea, 'entry', ENTRY);
    expect(r.statusCode).toBe(201);
    expect(r.json().beta).toMatchObject({ entrySurveyDone: true, surveyDue: null });
    expect((await app.app.inject({ method: 'POST', url: '/api/w/beta-payments/analyze', headers: browser(bea) })).statusCode).toBe(200);
  });
});

describe('answering', () => {
  it('SV-05: open surveys come with their questions; upcoming and answered ones without', async () => {
    const before = await surveys(bea);
    expect(before.map((s: { id: string; state: string }) => [s.id, s.state])).toEqual([
      ['entry', 'open'],
      ['biweekly-1', 'upcoming'],
      ['biweekly-2', 'upcoming'],
      ['biweekly-3', 'upcoming'],
      ['exit', 'upcoming'],
    ]);
    expect(before[0]).toMatchObject({ title: 'Entry survey', minutes: 7, version: 1, questions: expect.arrayContaining([expect.objectContaining({ id: 'pain', type: 'text', required: true })]) });
    expect(before[1]).not.toHaveProperty('questions');
    await answer(bea, 'entry', ENTRY);
    expect((await surveys(bea))[0]).toMatchObject({ state: 'answered', mine: true, answeredAt: '2026-11-10T09:00:00.000Z' });
    expect((await surveys(bea))[0]).not.toHaveProperty('questions');
  });

  it('SV-06: once per person; another person of the team may add theirs; upcoming 409, unknown 404, invalid 422', async () => {
    expect((await answer(bea, 'entry', { ...ENTRY, pain: '' })).statusCode).toBe(422);
    expect((await answer(bea, 'entry', { ...ENTRY, pain: '' })).json().detail).toMatch(/pain: an answer is required/);
    expect((await answer(bea, 'entry', ENTRY)).statusCode).toBe(201);
    expect((await answer(bea, 'entry', ENTRY)).statusCode).toBe(409);
    const inv = (await app.app.inject({ method: 'POST', url: '/api/invitations', headers: browser(bea), payload: { role: 'viewer' } })).json();
    const ben = await as(BEN, inv.link);
    expect((await surveys(ben))[0]).toMatchObject({ state: 'answered', mine: false, questions: expect.any(Array) });
    expect((await answer(ben, 'entry', ENTRY)).statusCode).toBe(201);
    expect((await enrollment()).surveys.entry.by).toHaveLength(2);
    expect((await answer(bea, 'biweekly-1', BIWEEKLY)).statusCode).toBe(409);
    expect((await answer(bea, 'biweekly-9', BIWEEKLY)).statusCode).toBe(404);
    expect((await answer(bea, 'nonsense', BIWEEKLY)).statusCode).toBe(422);
  });

  it('SV-07: a two-week survey opens after 14 days and becomes the one due', async () => {
    await answer(bea, 'entry', ENTRY);
    vi.setSystemTime(Date.parse('2026-11-24T10:00:00Z'));
    bea = await as(BEA);
    expect((await me(bea)).beta.surveyDue).toEqual({ id: 'biweekly-1', kind: 'biweekly', dueAt: '2026-11-29T09:00:00.000Z' });
    expect((await answer(bea, 'biweekly-1', BIWEEKLY)).statusCode).toBe(201);
    expect((await me(bea)).beta.surveyDue).toBeNull();
  });

  it('SV-08: only people of a beta team have surveys', async () => {
    expect((await app.app.inject({ method: 'GET', url: '/api/beta/surveys', headers: browser(adam) })).statusCode).toBe(404);
    expect((await app.app.inject({ method: 'GET', url: '/api/beta/surveys', headers: { authorization: 'Bearer dummy-admin-token' } })).statusCode).toBe(404);
    expect((await app.app.inject({ method: 'POST', url: '/api/beta/surveys/entry/answers', headers: browser(adam), payload: { answers: ENTRY } })).statusCode).toBe(404);
  });
});

describe('the operator', () => {
  it('SV-10: the operator reads every survey with its questions; a team member does not', async () => {
    const r = await app.app.inject({ method: 'GET', url: '/api/beta/survey-definitions', headers: browser(ada) });
    expect(r.statusCode).toBe(200);
    expect(r.json().map((s: { kind: string; questions: unknown[] }) => [s.kind, s.questions.length])).toEqual([
      ['entry', SURVEYS.entry.questions.length],
      ['biweekly', SURVEYS.biweekly.questions.length],
      ['exit', SURVEYS.exit.questions.length],
    ]);
    expect((await app.app.inject({ method: 'GET', url: '/api/beta/survey-definitions', headers: browser(bea) })).statusCode).toBe(403);
    expect((await app.app.inject({ method: 'GET', url: '/api/beta/survey-definitions', headers: browser(adam) })).statusCode).toBe(403);
  });

  it('SV-09: reads the answers as stored (trimmed, with the survey version) and each team\'s survey slots', async () => {
    await answer(bea, 'entry', ENTRY);
    const e = await enrollment();
    expect(e.surveySlots.map((s: { id: string; state: string }) => s.state)).toEqual(['answered', 'upcoming', 'upcoming', 'upcoming', 'upcoming']);
    const r = await app.app.inject({ method: 'GET', url: `/api/beta/enrollments/${e.id}/answers`, headers: browser(ada) });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual([
      expect.objectContaining({ survey: 'entry', kind: 'entry', version: 1, name: 'Bea Beta', answers: { ...ENTRY, returned_example: 'PAY-123: no behaviour for a rejected payment' } }),
    ]);
    expect((await app.app.inject({ method: 'GET', url: `/api/beta/enrollments/${e.id}/answers`, headers: browser(adam) })).statusCode).toBe(403);
    const audit = (await app.app.inject({ method: 'GET', url: '/api/w/beta-payments/audit', headers: browser(bea) })).json().map((x: { summary: string }) => x.summary);
    expect(audit).toContain('Entry survey answered (entry)');
  });
});
