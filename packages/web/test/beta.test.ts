import { describe, expect, it } from 'vitest';
import { EMPTY_FORM, applicationBody, betaLabel, formProblems, workspaceIdFrom, type ApplicationForm } from '../src/lib/beta';

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
