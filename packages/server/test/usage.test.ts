import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FileBackend } from '../src/backend.js';
import { PostHogSink, Usage, cleanProps, triggerOf, usageReport, type UsageEvent, type UsageSink } from '../src/usage.js';
import { ADA, browser, fakeAtlassian, login, removeDir, startAccounts, tempDir, type App, type Identity } from './accounts-helpers.js';

/**
 * Usage measurement of the closed beta (T8, docs/BETA-PLAN.md §8; owner's decision 2026-11-09: our own log plus
 * PostHog when a key is set): a closed list of events and properties, pseudonyms, only teams that measure.
 */
const BEA: Identity = { account_id: 'acc-bea', name: 'Bea Beta', email: 'bea@beta.example' };
const BEN: Identity = { account_id: 'acc-ben', name: 'Ben Beta', email: 'ben@beta.example' };
const DAY = 24 * 3_600_000;

describe('events and measures', () => {
  it('U-01: only the listed properties of the listed type leave the module', () => {
    expect(cleanProps('finding_decided', { rule: 'REQ-001', severity: 'critical', origin: 'ai', effect: 'dismiss', age_hours: 1.234567, title: 'Payment fails', email: 'x@y.z' })).toEqual({
      rule: 'REQ-001',
      severity: 'critical',
      origin: 'ai',
      effect: 'dismiss',
      age_hours: 1.2346,
    });
    expect(cleanProps('item_approved', { forced: 'yes', blocking_findings: Infinity })).toEqual({});
    expect(cleanProps('drift_detected', { kind: 'x'.repeat(200) }).kind).toHaveLength(80);
  });

  it('U-02: pseudonyms are stable, differ per kind and survive a restart; the secret is created once', async () => {
    const dir = tempDir();
    try {
      const a = new Usage(new FileBackend(dir), { enabled: true });
      await a.init();
      const b = new Usage(new FileBackend(dir), { enabled: true });
      await b.init();
      expect(a.pseudonym('user', 'u-1')).toBe(b.pseudonym('user', 'u-1'));
      expect(a.pseudonym('user', 'u-1')).not.toBe(a.pseudonym('org', 'u-1'));
      expect(a.pseudonym('user', 'u-1')).toMatch(/^[0-9a-f]{20}$/);
      const c = new Usage(new FileBackend(tempDir()), { enabled: true, secret: 'dummy-usage-secret' });
      await c.init();
      expect(c.pseudonym('user', 'u-1')).not.toBe(a.pseudonym('user', 'u-1'));
    } finally {
      removeDir(dir);
    }
  });

  it.each([
    ['manual', 'manual'],
    ['scheduled (15 min)', 'schedule'],
    ['jira change', 'webhook'],
    ['approval of PAY-1 from pdi (DEC-4)', 'pdi'],
    ['initial', 'initial'],
    ['decision on PAY-1', 'change'],
    [undefined, 'change'],
  ])('U-03: the trigger of "%s" is %s', (reason, trigger) => {
    expect(triggerOf(reason)).toBe(trigger);
  });

  it('U-04: the measures of BETA-PLAN.md §8 from events, week by week', () => {
    const start = Date.parse('2026-11-10T09:00:00Z');
    const ev = (event: UsageEvent['event'], day: number, props: UsageEvent['props'] = {}, workspace = 'w'): UsageEvent => ({ event, at: new Date(start + day * DAY).toISOString(), orgId: 'o', workspace, props });
    const events = [
      ev('source_connected', 0),
      ev('analysis_completed', 0, { ai_cost_usd: 0.25 }),
      ev('finding_shown', 0, { rule: 'REQ-001', origin: 'rule' }),
      ev('finding_shown', 0, { rule: 'DES-002', origin: 'ai' }),
      ev('finding_decided', 0.5, { rule: 'REQ-001', origin: 'rule', effect: 'resolve' }),
      ev('analysis_completed', 8, { ai_cost_usd: 0.5 }),
      ev('finding_decided', 9, { rule: 'X-1', origin: 'ai', effect: 'dismiss' }),
      ev('finding_decided', 9, { rule: 'X-2', origin: 'ai', effect: 'accept_risk' }),
      ev('analysis_completed', 15),
      ev('answer_proposal_judged', 15, { outcome: 'accept' }),
      ev('answer_proposal_judged', 15, { outcome: 'reject' }),
      ev('item_approved', 16, { forced: true }),
      ev('item_approved', 16, { forced: false }),
      ev('item_approved', 16, { forced: false }),
      ev('survey_answered', 1, { survey: 'entry' }),
    ];
    const r = usageReport(events, new Date(start).toISOString(), start + 20 * DAY);
    expect(r.weeks.map((w) => [w.week, w.analyses, w.decisions, w.active, w.aiCostUsd])).toEqual([
      [1, 1, 1, true, 0.25],
      [2, 1, 2, true, 0.5],
      [3, 1, 0, false, 0],
    ]);
    expect(r).toMatchObject({
      activeWeeks: 2,
      decided: 3,
      accuracy: 0.667,
      falseAlarms: { rule: 0, ai: 0.5 },
      // REQ-001 was decided, DES-002 never: one of the two shown more than 14 days ago.
      unreacted: 0.5,
      hoursToFirstDecision: 12,
      answerAcceptance: 0.5,
      forcedApprovals: 0.333,
      aiCostUsd: 0.75,
      surveysAnswered: 1,
    });
    expect(usageReport([], new Date(start).toISOString(), start + DAY)).toMatchObject({ accuracy: null, hoursToFirstDecision: null, activeWeeks: 0 });
  });

  it('U-05: PostHog gets pseudonyms only, without person profiles for anonymous events and without geo-IP', async () => {
    const calls: { url: string; body: { api_key: string; batch: { event: string; distinct_id: string; properties: Record<string, unknown> }[] } }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => (calls.push({ url, body: JSON.parse(String(init.body)) }), new Response('{}', { status: 200 }))));
    const p = (kind: string, id: string) => `p-${kind}-${id.length}`;
    await new PostHogSink('phc_dummy').send(
      [
        { event: 'finding_decided', at: '2026-11-10T09:00:00.000Z', orgId: 'org-1', workspace: 'beta-payments', user: 'pseudo-user', props: { rule: 'REQ-001' } },
        { event: 'analysis_completed', at: '2026-11-10T09:00:00.000Z', orgId: 'org-1', workspace: 'beta-payments', props: { items: 3 } },
      ],
      p,
    );
    vi.unstubAllGlobals();
    expect(calls[0]!.url).toBe('https://eu.i.posthog.com/batch/');
    expect(calls[0]!.body.api_key).toBe('phc_dummy');
    expect(calls[0]!.body.batch[0]).toMatchObject({ event: 'finding_decided', distinct_id: 'pseudo-user', properties: { rule: 'REQ-001', workspace: 'p-workspace-13', $groups: { organization: 'p-org-5' }, $process_person_profile: true, $geoip_disable: true } });
    expect(calls[0]!.body.batch[1]).toMatchObject({ distinct_id: 'p-workspace-13', properties: { $process_person_profile: false } });
    expect(JSON.stringify(calls)).not.toMatch(/beta-payments|org-1/);
  });
});

describe('measuring a beta team', () => {
  let dir: string;
  let app: App;
  let fake: ReturnType<typeof fakeAtlassian>;
  let ada: string;
  let bea: string;
  let sent: UsageEvent[];
  let sinkDown: boolean;
  const saved = process.env.CI_DISABLE_SCHEDULE;
  const sink: UsageSink = {
    send: async (events) => {
      if (sinkDown) throw new Error('posthog down');
      sent.push(...events);
    },
  };
  const as = async (who: Identity, query = '') => {
    fake.state.as = who;
    return (await login(app.app, query)).session!;
  };
  const tokenOf = (link: string) => encodeURIComponent(new URL(link).searchParams.get('invite')!);
  const ENTRY = { readiness_today: ['refinement'], who_decides: 'po', stories: 5, returned: 1, hours: '2-5', quality: 3, pain: 'Edge cases.' };
  const events = async () => app.usage.eventsOf((await app.app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: bea } })).json().org.id);
  const names = async () => (await events()).map((e) => e.event);
  const enrollmentId = async () => (await app.app.inject({ method: 'GET', url: '/api/beta/enrollments', headers: browser(ada) })).json()[0].id;

  beforeEach(async () => {
    dir = tempDir();
    process.env.CI_DISABLE_SCHEDULE = 'true';
    fake = fakeAtlassian();
    sent = [];
    sinkDown = false;
    app = await startAccounts(dir, { bootstrapEmail: ADA.email, operatorEmails: [ADA.email!], usageSink: sink, mailer: { kind: 'test', send: async () => undefined } });
    ada = await as(ADA);
    await app.app.inject({
      method: 'POST',
      url: '/api/beta/apply',
      headers: { origin: 'http://localhost:4317', host: 'localhost:4317' },
      payload: { org: 'Beta Corp', team: 'Payments', contactName: 'Bea Beta', contactEmail: BEA.email, writers: 3, builders: 8, sources: ['jira'], realData: 'yes', consents: { terms: true, measurement: true, surveys: true } },
    });
    const { invitation } = (await app.app.inject({ method: 'POST', url: `/api/beta/enrollments/${await enrollmentId()}/approve`, headers: browser(ada), payload: { workspace: { id: 'beta-payments' } } })).json();
    bea = await as(BEA, `?invite=${tokenOf(invitation.link)}`);
    expect((await app.app.inject({ method: 'POST', url: '/api/beta/surveys/entry/answers', headers: browser(bea), payload: { answers: ENTRY } })).statusCode).toBe(201);
  });
  afterEach(async () => {
    await app.app.close();
    vi.unstubAllGlobals();
    removeDir(dir);
    if (saved === undefined) delete process.env.CI_DISABLE_SCHEDULE;
    else process.env.CI_DISABLE_SCHEDULE = saved;
  });

  const analyze = async () => {
    const r = await app.app.inject({ method: 'POST', url: '/api/w/beta-payments/analyze', headers: browser(bea) });
    expect(r.statusCode).toBe(200);
    await new Promise((res) => setTimeout(res, 50));
    return r.json();
  };

  it('U-06: an analysis is measured once, with each finding shown once; the first organization is not measured', async () => {
    await analyze();
    const first = await names();
    expect(first).toEqual(expect.arrayContaining(['survey_answered', 'analysis_completed', 'finding_shown']));
    const shown = first.filter((n) => n === 'finding_shown').length;
    expect(shown).toBeGreaterThan(0);
    await analyze();
    const second = await names();
    expect(second.filter((n) => n === 'analysis_completed')).toHaveLength(2);
    expect(second.filter((n) => n === 'finding_shown')).toHaveLength(shown);
    const done = (await events()).find((e) => e.event === 'analysis_completed')!;
    expect(done.props).toMatchObject({ trigger: 'manual', ai: false, items: expect.any(Number), findings_open: expect.any(Number) });
    expect(done.user).toBeUndefined();

    const homeOrg = (await app.app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: ada } })).json().org.id;
    await app.app.inject({ method: 'POST', url: '/api/analyze', headers: browser(ada) });
    expect(await app.usage.eventsOf(homeOrg)).toEqual([]);
  });

  it('U-07: decisions, item views, approvals and surveys are measured with the person as a pseudonym; no names, e-mails or content', async () => {
    const result = await analyze();
    const item = result.items.find((i: { findings: { question?: unknown; status: string }[] }) => i.findings.some((f) => f.question && f.status === 'open'));
    const f = item.findings.find((x: { question?: unknown; status: string }) => x.question && x.status === 'open');
    expect((await app.app.inject({ method: 'GET', url: `/api/w/beta-payments/items/${item.key}`, headers: browser(bea) })).statusCode).toBe(200);
    const decided = await app.app.inject({ method: 'POST', url: '/api/w/beta-payments/decisions', headers: browser(bea), payload: { questionId: f.question.id ?? f.id, findingId: f.id, itemKey: item.key, answer: 'Out of scope for this release', effect: 'dismiss' } });
    expect(decided.statusCode).toBe(200);
    await new Promise((res) => setTimeout(res, 50));
    const all = await events();
    const d = all.find((e) => e.event === 'finding_decided')!;
    expect(d.props).toMatchObject({ rule: f.ruleId, severity: f.severity, origin: f.origin, effect: 'dismiss', age_hours: expect.any(Number) });
    expect(all.find((e) => e.event === 'item_viewed')!.props).toEqual({ type: item.type });
    expect(d.user).toMatch(/^[0-9a-f]{20}$/);
    const text = JSON.stringify(all);
    for (const leak of ['Bea Beta', 'bea@beta.example', 'Out of scope for this release', f.title]) expect(text).not.toContain(leak);
    expect(all.find((e) => e.event === 'survey_answered')!.props).toEqual({ survey: 'entry' });
  });

  it('U-08: the operator reads the measures; the team never does', async () => {
    await analyze();
    const id = await enrollmentId();
    const r = await app.app.inject({ method: 'GET', url: `/api/beta/enrollments/${id}/usage`, headers: browser(ada) });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ measurement: true, report: { weeks: [expect.objectContaining({ week: 1, analyses: 1 })], surveysAnswered: 1 } });
    expect((await app.app.inject({ method: 'GET', url: `/api/beta/enrollments/${id}/usage`, headers: browser(bea) })).statusCode).toBe(403);
  });

  it("U-09: the team's Admin switches measurement off and on; a member cannot", async () => {
    const inv = (await app.app.inject({ method: 'POST', url: '/api/invitations', headers: browser(bea), payload: { role: 'member' } })).json();
    const ben = await as(BEN, `?invite=${tokenOf(inv.link)}`);
    expect((await app.app.inject({ method: 'PUT', url: '/api/beta/measurement', headers: browser(ben), payload: { on: false } })).statusCode).toBe(403);
    const off = await app.app.inject({ method: 'PUT', url: '/api/beta/measurement', headers: browser(bea), payload: { on: false } });
    expect(off.json()).toEqual({ measurement: false });
    expect((await app.app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: bea } })).json().beta.measurement).toBe(false);
    const before = (await names()).length;
    await analyze();
    expect(await names()).toHaveLength(before);
    expect((await app.app.inject({ method: 'GET', url: `/api/beta/enrollments/${await enrollmentId()}/usage`, headers: browser(ada) })).json().measurement).toBe(false);
    await app.app.inject({ method: 'PUT', url: '/api/beta/measurement', headers: browser(bea), payload: { on: true } });
    await analyze();
    expect((await names()).length).toBeGreaterThan(before);
    expect((await app.app.inject({ method: 'PUT', url: '/api/beta/measurement', headers: browser(ada), payload: { on: true } })).statusCode).toBe(404);
  });

  it('U-10: events reach the sink on flush; a failed batch is kept for the next try', async () => {
    sinkDown = true;
    await analyze();
    await app.usage.flush();
    expect(sent).toEqual([]);
    sinkDown = false;
    await app.usage.flush();
    expect(sent.map((e) => e.event)).toEqual(expect.arrayContaining(['survey_answered', 'analysis_completed']));
  });
});

describe('switched off', () => {
  it('U-11: CI_USAGE=off records nothing', async () => {
    const dir = tempDir();
    const saved = process.env.CI_USAGE;
    process.env.CI_USAGE = 'off';
    try {
      const a = await startAccounts(dir, { bootstrapEmail: ADA.email });
      expect(a.usage.cfg.enabled).toBe(false);
      await a.usage.track('item_viewed', { orgId: 'o', workspace: 'w' }, { type: 'story' });
      expect(await a.usage.eventsOf('o')).toEqual([]);
      await a.app.close();
    } finally {
      if (saved === undefined) delete process.env.CI_USAGE;
      else process.env.CI_USAGE = saved;
      removeDir(dir);
    }
  });
});
