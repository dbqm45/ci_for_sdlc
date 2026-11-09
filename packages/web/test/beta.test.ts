import { describe, expect, it } from 'vitest';
import { betaNow, inviteFromHash, localPage } from '../src/lib/localBeta';
import { EMPTY_FORM, sampleDataNotice, usageLines, answersBody, applicationBody, betaBlockReason, betaLabel, formProblems, surveyDueText, surveysSummary, unanswered, workspaceIdFrom, type ApplicationForm, type Question } from '../src/lib/beta';

// The closed beta in the UI (docs/BETA-ENROLLMENT-PLAN.md): the application form, workspace ids and days left.
const FILLED: ApplicationForm = {
  ...EMPTY_FORM,
  org: ' Beta Corp ',
  team: 'Payments',
  contactName: 'Bea',
  contactEmail: 'bea@beta.example',
  writers: '3',
  builders: '8',
  sources: ['jira'],
  realData: 'yes',
  terms: true,
  measurement: true,
  surveys: true,
};

describe('the application form', () => {
  it('BUI-01: a filled form has no problems and becomes the API body', () => {
    expect(formProblems(FILLED)).toEqual([]);
    expect(applicationBody(FILLED)).toEqual({
      org: 'Beta Corp',
      team: 'Payments',
      contactName: 'Bea',
      contactEmail: 'bea@beta.example',
      writers: 3,
      builders: 8,
      sources: ['jira'],
      realData: 'yes',
      consents: { terms: true, measurement: true, surveys: true },
    });
  });

  it.each([
    ['an empty form', EMPTY_FORM, 9],
    ['a missing consent', { ...FILLED, measurement: false }, 1],
    ['an e-mail without a domain', { ...FILLED, contactEmail: 'bea@beta' }, 1],
    ['a team size that is not a number', { ...FILLED, writers: 'three' }, 1],
    ['no source', { ...FILLED, sources: [] }, 1],
  ])('BUI-02: %s', (_, form, problems) => {
    expect(formProblems(form)).toHaveLength(problems);
  });
});

describe('workspace ids and the beta label', () => {
  it.each([
    ['Payments', 'payments'],
    ['Zespół Płatności', 'zespol-platnosci'],
    ['  --Team__A!! ', 'team-a'],
    ['!!!', 'team'],
    ['a'.repeat(39) + ' b', 'a'.repeat(39)],
  ])('BUI-03: %s → %s', (name, id) => {
    expect(workspaceIdFrom(name)).toBe(id);
    expect(id).toMatch(/^[a-z0-9][a-z0-9-]{0,39}$/);
  });

  it.each([
    [null, undefined],
    [{ status: 'invited' as const }, undefined],
    [{ status: 'active' as const, daysLeft: 23 }, 'Beta: 23 days left'],
    [{ status: 'active' as const, daysLeft: 1 }, 'Beta: last day'],
    [{ status: 'ended' as const, daysLeft: 0 }, 'Beta ended'],
  ])('BUI-04: %j → %s', (beta, label) => {
    expect(betaLabel(beta)).toBe(label);
  });
});

describe('surveys in the UI', () => {
  const Q: Question[] = [
    { id: 'a', type: 'text', maxLength: 10, required: true, text: 'A' },
    { id: 'b', type: 'multi', options: [{ value: 'x', label: 'X' }], required: true, text: 'B' },
    { id: 'c', type: 'number', max: 5, text: 'C' },
  ];
  it('BUI-05: required questions left empty, and the body without blanks', () => {
    expect(unanswered(Q, {})).toEqual(['a', 'b']);
    expect(unanswered(Q, { a: 'x', b: [] })).toEqual(['b']);
    expect(unanswered(Q, { a: 'x', b: ['x'] })).toEqual([]);
    expect(answersBody({ a: 'x', b: [], c: undefined, d: 0 })).toEqual({ a: 'x', d: 0 });
  });

  const NOW = Date.parse('2026-11-20T12:00:00Z');
  it.each([
    [null, undefined],
    [{ status: 'active' as const, surveyDue: null }, undefined],
    [{ status: 'active' as const, surveyDue: { id: 'entry', kind: 'entry' as const, dueAt: '2026-11-20T18:00:00Z' } }, 'The entry survey is due today.'],
    [{ status: 'active' as const, surveyDue: { id: 'biweekly-1', kind: 'biweekly' as const, dueAt: '2026-11-21T18:00:00Z' } }, 'The two-week survey is due tomorrow.'],
    [{ status: 'active' as const, surveyDue: { id: 'biweekly-1', kind: 'biweekly' as const, dueAt: '2026-11-25T12:00:00Z' } }, 'The two-week survey is due in 5 days.'],
    [{ status: 'ended' as const, surveyDue: { id: 'exit', kind: 'exit' as const, dueAt: '2026-11-18T12:00:00Z' } }, 'The exit survey was due on 2026-11-18.'],
  ])('BUI-06: banner for %j', (beta, text) => {
    expect(surveyDueText(beta, NOW)).toBe(text);
  });

  it('BUI-07: analysing waits for a running beta without its entry survey', () => {
    expect(betaBlockReason({ status: 'active', entrySurveyDone: false })).toBe('Fill in the entry survey first');
    expect(betaBlockReason({ status: 'active', entrySurveyDone: true })).toBeUndefined();
    expect(betaBlockReason({ status: 'invited' })).toBeUndefined();
    expect(betaBlockReason(null)).toBeUndefined();
  });

  it('BUI-08: the operator sees answered of opened surveys and how many are overdue', () => {
    const slots = [
      { state: 'answered' as const, dueAt: '2026-11-13T00:00:00Z' },
      { state: 'open' as const, dueAt: '2026-11-19T00:00:00Z' },
      { state: 'open' as const, dueAt: '2026-11-25T00:00:00Z' },
      { state: 'upcoming' as const, dueAt: '2026-12-01T00:00:00Z' },
    ];
    expect(surveysSummary({ surveySlots: slots }, NOW)).toBe('1/3 answered, 1 overdue');
    expect(surveysSummary({ surveySlots: [slots[3]!] }, NOW)).toBe('—');
    expect(surveysSummary({}, NOW)).toBe('—');
  });
});

describe('overdue, paused and ended in the UI', () => {
  const NOW = Date.parse('2026-11-20T12:00:00Z');
  const due = { id: 'entry', kind: 'entry' as const, dueAt: '2026-11-13T09:00:00Z' };
  it('BUI-09: the banner says when analyses pause, and why they are paused', () => {
    expect(surveyDueText({ status: 'overdue', surveyDue: due, pauseOn: '2026-11-20T09:00:00Z' }, NOW)).toBe('The entry survey was due on 2026-11-13. Analyses pause on 2026-11-20 without it.');
    expect(surveyDueText({ status: 'paused', surveyDue: due, pausedReason: 'Entry survey is 7 days past due' }, NOW)).toBe('Analyses are paused: Entry survey is 7 days past due. The entry survey resumes them at once.');
  });

  it('BUI-10: labels and the analyse block follow the status', () => {
    expect(betaLabel({ status: 'paused', daysLeft: 30 })).toBe('Beta paused');
    expect(betaLabel({ status: 'overdue', daysLeft: 30 })).toBe('Beta: 30 days left');
    expect(betaBlockReason({ status: 'paused', entrySurveyDone: true })).toBe('Paused until the overdue survey is answered');
    expect(betaBlockReason({ status: 'ended', entrySurveyDone: true })).toBe('The beta has ended');
    expect(betaBlockReason({ status: 'overdue', entrySurveyDone: false })).toBe('Fill in the entry survey first');
  });
});

describe('usage in the operator panel', () => {
  it('BUI-11: the measures read as label and value; missing values show a dash', () => {
    const lines = usageLines({
      weeks: [
        { week: 1, from: '', analyses: 1, decisions: 1, active: true, aiCostUsd: 0.25 },
        { week: 2, from: '', analyses: 0, decisions: 0, active: false, aiCostUsd: 0 },
      ],
      activeWeeks: 1,
      decided: 3,
      accuracy: 0.667,
      falseAlarms: { ai: 0.5, rule: 0 },
      unreacted: null,
      hoursToFirstDecision: 72,
      answerAcceptance: null,
      forcedApprovals: 0.333,
      aiCostUsd: 0.25,
      surveysAnswered: 1,
    });
    expect(Object.fromEntries(lines)).toEqual({
      'Active weeks': '1 of 2',
      'Findings decided': '3',
      'Accuracy (resolved or risk accepted)': '67%',
      'False alarms (ai)': '50%',
      'False alarms (rule)': '0%',
      'Findings without a reaction after 14 days': '—',
      'Time to the first decision': '3 days',
      'Answers from sources accepted as they were': '—',
      'Forced approvals': '33%',
      'AI cost': '$0.25',
      'Surveys answered': '1',
    });
  });
});

describe('the local walkthrough pages', () => {
  it.each([
    ['#/dev/login', 'login'],
    ['#/dev/login?invite=abc', 'login'],
    ['#/dev/mail', 'mail'],
    ['#/w/payments/dev/mail', 'mail'],
    ['#/w/payments/dev/login?invite=x', 'login'],
    ['#/devices', undefined],
    ['#/overview', undefined],
  ])('BUI-12: %s → %s', (hash, page) => {
    expect(localPage(hash)).toBe(page);
  });

  it('BUI-13: the invitation rides along in the local login address', () => {
    expect(inviteFromHash('#/dev/login?invite=tok_1-2')).toBe('tok_1-2');
    expect(inviteFromHash('#/dev/login')).toBeUndefined();
  });
});

describe("the beta's clock in the local walkthrough", () => {
  it("BUI-14: the server's moved clock wins over the browser's", () => {
    expect(betaNow({ now: '2026-12-05T14:00:00.000Z' })).toBe(Date.parse('2026-12-05T14:00:00.000Z'));
    expect(Math.abs(betaNow(undefined) - Date.now())).toBeLessThan(1000);
  });
});

describe('fixes from the local walkthrough', () => {
  const base = { weeks: [], activeWeeks: 0, accuracy: null, falseAlarms: {}, hoursToFirstDecision: null, answerAcceptance: null, forcedApprovals: null, aiCostUsd: 0, surveysAnswered: 0 };
  const unreacted = (r: Partial<Parameters<typeof usageLines>[0]>) => Object.fromEntries(usageLines({ ...base, decided: 0, unreacted: null, ...r }))['Findings without a reaction after 14 days'];
  it('BUI-15: findings without a reaction read as counts; without decisions it says so instead of 100%', () => {
    expect(unreacted({ decided: 0, unreacted: 1, unreactedCount: 12, shownOver14Days: 12 })).toBe('12 of 12 — no decisions yet');
    expect(unreacted({ decided: 4, unreacted: 0.25, unreactedCount: 3, shownOver14Days: 12 })).toBe('3 of 12 (25%)');
    expect(unreacted({ decided: 4, unreacted: null, unreactedCount: 0, shownOver14Days: 0 })).toBe('—');
  });

  it('BUI-16: a beta team on the demo project is told what it sees and who connects Jira', () => {
    const active = { status: 'active' as const };
    expect(sampleDataNotice(active, true, true)).toMatch(/sample data.*Connect your Jira in Settings/);
    expect(sampleDataNotice(active, true, false)).toMatch(/Ask an Admin/);
    expect(sampleDataNotice(active, false, true)).toBeUndefined();
    expect(sampleDataNotice(null, true, true)).toBeUndefined();
    expect(sampleDataNotice({ status: 'ended' }, true, true)).toBeUndefined();
  });
});
