import { describe, expect, it } from 'vitest';
import { EMPTY_FORM, answersBody, applicationBody, betaBlockReason, betaLabel, formProblems, surveyDueText, surveysSummary, unanswered, workspaceIdFrom, type ApplicationForm, type Question } from '../src/lib/beta';

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

  it('BUI-07: analysing waits only for an active beta without its entry survey', () => {
    expect(betaBlockReason({ status: 'active', entrySurveyDone: false })).toBe('Fill in the entry survey first');
    expect(betaBlockReason({ status: 'active', entrySurveyDone: true })).toBeUndefined();
    expect(betaBlockReason({ status: 'ended', entrySurveyDone: false })).toBeUndefined();
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
