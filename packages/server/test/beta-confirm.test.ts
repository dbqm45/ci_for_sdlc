import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FileBackend } from '../src/backend.js';
import { BetaEnrollments, type BetaApplication } from '../src/beta.js';
import type { Mail, Mailer } from '../src/mailer.js';
import { ADA, browser, fakeAtlassian, login, removeDir, startAccounts, tempDir, type App } from './accounts-helpers.js';

/**
 * T9 findings F5 and F6 (docs/SECURITY-REVIEW.md): the beta form mails an address only to ask for its confirmation,
 * in a fixed text, before anything reaches the operator; an operator is the Atlassian account bound to the e-mail.
 */
const APPLICATION: BetaApplication = {
  org: 'Evil <a href=x>Corp</a>',
  team: 'Click here to win',
  contactName: 'Bea Beta',
  contactEmail: 'bea@beta.example',
  writers: 2,
  builders: 3,
  sources: ['jira'],
  realData: 'yes',
} as BetaApplication;

let dir: string;
const saved = process.env.CI_DISABLE_SCHEDULE;
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

describe('the beta form confirms the address first (F5)', () => {
  let app: App;
  const sent: Mail[] = [];
  const mailer: Mailer = { kind: 'test', send: async (m) => void sent.push(m) };
  beforeEach(async () => {
    sent.length = 0;
    fakeAtlassian();
    app = await startAccounts(dir, { bootstrapEmail: ADA.email, operatorEmails: [ADA.email!], mailer, betaConfirm: true });
  });
  afterEach(async () => {
    await app.app.close();
  });
  const apply = () =>
    app.app.inject({ method: 'POST', url: '/api/beta/apply', headers: { origin: 'http://localhost:4317', host: 'localhost:4317' }, payload: { ...APPLICATION, consents: { terms: true, measurement: true, surveys: true } } });
  const confirm = (token: string) => app.app.inject({ method: 'POST', url: '/api/beta/confirm', headers: { origin: 'http://localhost:4317', host: 'localhost:4317' }, payload: { token } });
  const settle = async () => {
    await app.settle();
    await new Promise((r) => setTimeout(r, 20));
  };

  it('BC-01: one fixed-text mail to the address, nothing for the operator, until the link is used', async () => {
    expect((await apply()).json()).toEqual({ received: true, confirm: true });
    await settle();
    expect(sent.map((m) => [m.to, m.subject])).toEqual([[['bea@beta.example'], 'Quorum beta: confirm your application']]);
    expect(sent[0]!.text).not.toMatch(/Evil|Click here|Bea/);
    const token = /#\/beta\/confirm\/([\w-]+)/.exec(sent[0]!.text)![1]!;
    const ada = (await login(app.app)).session!;
    expect((await app.app.inject({ method: 'GET', url: '/api/beta/enrollments', headers: browser(ada) })).json()).toEqual([]);

    expect((await confirm(token)).json()).toEqual({ confirmed: true });
    await settle();
    expect(sent.slice(1).map((m) => m.subject).sort()).toEqual(['Quorum beta: new application from Evil <a href=x>Corp</a>', 'Quorum beta: we have your application']);
    expect((await app.app.inject({ method: 'GET', url: '/api/beta/enrollments', headers: browser(ada) })).json()).toMatchObject([{ status: 'applied', application: { contactEmail: 'bea@beta.example' } }]);
    // The link works once.
    expect((await confirm(token)).statusCode).toBe(404);
  });

  it('BC-02: applying again at once sends no second mail to the same address', async () => {
    await apply();
    await apply();
    await settle();
    expect(sent).toHaveLength(1);
  });
});

describe('the pending application (F5)', () => {
  it('BC-03: a link lapses after 24 hours; a new request after 10 minutes replaces the old link; lapsed ones are dropped', async () => {
    const backend = new FileBackend(dir);
    const b = new BetaEnrollments(backend, { weeks: 8, open: true });
    await b.init();
    const first = await b.request(APPLICATION, '2026-11-16T08:00:00.000Z');
    expect(first.token).toBeTruthy();
    expect(await b.request(APPLICATION, '2026-11-16T08:05:00.000Z')).toEqual({});
    const second = await b.request(APPLICATION, '2026-11-16T08:11:00.000Z');
    await expect(b.confirm(first.token!, '2026-11-16T08:12:00.000Z')).rejects.toThrow(/not valid any more/);
    await expect(b.confirm(second.token!, '2026-11-17T08:12:00.000Z')).rejects.toThrow(/not valid any more/);
    const third = await b.request(APPLICATION, '2026-11-17T09:00:00.000Z');
    await b.dropUnconfirmed('2026-11-18T09:00:01.000Z');
    expect(await backend.read('beta-pending.json')).toEqual([]);
    await expect(b.confirm(third.token!, '2026-11-17T10:00:00.000Z')).rejects.toThrow(/not valid any more/);
    // Only a hash of the token is stored.
    const fourth = await b.request(APPLICATION, '2026-11-18T10:00:00.000Z');
    expect(JSON.stringify(await backend.read('beta-pending.json'))).not.toContain(fourth.token!);
    expect((await b.confirm(fourth.token!, '2026-11-18T10:30:00.000Z')).enrollment).toMatchObject({ status: 'applied' });
  });
});

describe('an operator is an Atlassian account, not just an e-mail (F6)', () => {
  it('BC-04: the first account with the operator e-mail is the operator; another account that later has the e-mail is not', async () => {
    const fake = fakeAtlassian();
    const app = await startAccounts(dir, { bootstrapEmail: ADA.email, operatorEmails: [ADA.email!] });
    try {
      const ada = (await login(app.app)).session!;
      expect((await app.app.inject({ method: 'GET', url: '/api/auth/me', headers: browser(ada) })).json().user.operator).toBe(true);
      // Another Atlassian account now carries the same e-mail (e.g. the address moved), and is a member.
      const other = { account_id: 'acc-other', name: 'Someone Else', email: ADA.email! };
      await app.accounts.admit({ provider: 'atlassian', subject: other.account_id, name: other.name, email: other.email }, 'viewer');
      fake.state.as = other;
      const s = (await login(app.app)).session!;
      expect((await app.app.inject({ method: 'GET', url: '/api/auth/me', headers: browser(s) })).json().user.operator).toBe(false);
      expect((await app.app.inject({ method: 'GET', url: '/api/beta/enrollments', headers: browser(s) })).statusCode).toBe(403);
    } finally {
      await app.app.close();
    }
  });
});
