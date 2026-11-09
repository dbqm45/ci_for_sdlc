import { expect, test, type Page } from '@playwright/test';

/**
 * BETA-E2E: the closed beta from the application to the pause and back (docs/BETA-LOCAL.md, scenario in §3), on a
 * server in the local walkthrough mode. One test, in order, because the clock only moves forward.
 */
const OPERATOR = /Olga Operator/;
const BEA = /Bea Beta/;

async function loginAs(page: Page, who: RegExp, address = '/#/dev/login') {
  await page.goto(address);
  await page.getByRole('button', { name: who }).click();
  await expect(page.getByRole('region', { name: 'Local walkthrough' })).toBeVisible();
}

async function mailbox(page: Page) {
  await page.goto('/#/dev/mail');
  await expect(page.getByRole('heading', { name: 'Mailbox (local)' })).toBeVisible();
  return page.locator('li strong');
}

async function moveClock(page: Page, label: '+1 day' | '+3 days' | '+7 days', times = 1) {
  for (let i = 0; i < times; i++) {
    const answered = page.waitForResponse((r) => r.url().endsWith('/api/dev/clock') && r.ok());
    await page.getByRole('region', { name: 'Local walkthrough' }).getByRole('button', { name: label }).click();
    await answered;
  }
}

test('BETA-E2E-01: apply, approve, join, entry survey, overdue, pause, answer, resume', async ({ page }) => {
  test.setTimeout(120_000);

  // The operator logs in first and becomes the first Owner.
  await loginAs(page, OPERATOR, '/');
  await expect(page.getByRole('link', { name: 'Beta operator' })).toBeVisible();

  // The public application form.
  await page.goto('/#/beta');
  await page.getByLabel('Organization').fill('Beta Corp');
  await page.getByLabel('Team', { exact: true }).fill('Payments');
  await page.getByLabel('Your name').fill('Bea Beta');
  await page.getByLabel(/Work e-mail/).fill('bea@beta.local');
  await page.getByLabel('People who write and refine stories').fill('3');
  await page.getByLabel('People who build them').fill('8');
  await page.getByRole('checkbox', { name: 'Jira Cloud' }).check();
  await page.getByLabel(/real data/).selectOption('yes');
  for (const c of await page.getByRole('group', { name: /Consents/ }).getByRole('checkbox').all()) await c.check();
  await page.getByRole('button', { name: 'Apply for the beta' }).click();
  await expect(page.getByRole('status')).toContainText('Thank you');
  await expect(await mailbox(page)).toHaveText(['Quorum beta: new application from Beta Corp', 'Quorum beta: we have your application']);

  // The operator approves; the invitation goes by mail.
  await page.goto('/#/operator');
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByLabel('Invitation link')).toHaveValue(/\/api\/auth\/login\?invite=/);
  await mailbox(page);
  await page.getByRole('button', { name: /your invitation/ }).click();
  await page.getByRole('link', { name: /api\/auth\/login\?invite=/ }).click();

  // The contact joins through the link and lands in the team's workspace; analyses wait for the entry survey.
  await page.getByRole('button', { name: BEA }).click();
  const banner = page.getByRole('status').filter({ hasText: 'entry survey' });
  await expect(banner).toBeVisible();
  await expect(page.locator('header.topbar').getByRole('button', { name: /Analyze now/ })).toBeDisabled();
  await expect(page.locator('header.topbar').getByText('Beta: 56 days left')).toBeVisible();

  await banner.getByRole('link', { name: 'Fill in' }).click();
  await page.getByRole('checkbox', { name: 'Refinement without a checklist' }).check();
  await page.getByRole('radio', { name: 'The PO' }).check();
  await page.getByRole('spinbutton', { name: /went into development/ }).fill('12');
  await page.getByRole('spinbutton', { name: /came back from development/ }).fill('3');
  await page.getByRole('radio', { name: '5–10 h' }).check();
  await page.getByRole('radio', { name: '3', exact: true }).check();
  await page.getByRole('textbox', { name: /one problem/ }).fill('Edge cases are missing');
  await page.getByRole('button', { name: 'Send answers' }).click();
  await expect(page.locator('header.topbar').getByRole('button', { name: /Analyze now/ })).toBeEnabled();
  // The workspace still shows the demo project: the team is told so, and its Owner gets the way to connect Jira.
  const sample = page.getByRole('note').filter({ hasText: 'sample data' });
  await expect(sample).toBeVisible();
  await expect(sample.getByRole('link', { name: 'Connect Jira' })).toHaveAttribute('href', /\/settings$/);
  await page.screenshot({ path: test.info().outputPath('sample-data-notice.png') });

  // Two weeks on: the two-week survey opens; a week after its due date the team is paused.
  await moveClock(page, '+7 days', 2);
  await moveClock(page, '+3 days', 4);
  await expect(page.getByRole('status').filter({ hasText: 'Analyses are paused' })).toBeVisible();
  await expect(page.locator('header.topbar').getByText('Beta paused')).toBeVisible();
  await expect(page.locator('header.topbar').getByRole('button', { name: /Analyze now/ })).toBeDisabled();
  const subjects = await (await mailbox(page)).allInnerTexts();
  expect(subjects).toEqual(
    expect.arrayContaining([
      'Quorum beta: the entry survey is open',
      'Quorum beta: the two-week survey is open',
      'Quorum beta: the two-week survey is overdue',
      'Quorum beta: analyses are paused',
      'Quorum beta: Beta Corp is paused',
    ]),
  );

  // Answering the overdue survey resumes the team at once.
  await page.goto('/#/survey/biweekly-1');
  await page.getByRole('radio', { name: '1–5' }).first().check();
  await page.getByRole('textbox', { name: /a Quorum finding changed something/ }).fill('none');
  await page.getByRole('radio', { name: 'No', exact: true }).first().check();
  await page.getByRole('group', { name: /dismiss as false/ }).getByRole('radio', { name: '0', exact: true }).check();
  await page.getByRole('group', { name: /spend in Quorum/ }).getByRole('radio', { name: '1–3 h' }).check();
  await page.getByRole('group', { name: /did it save/ }).getByRole('radio', { name: '1–3 h' }).check();
  await page.getByRole('group', { name: /How much did Quorum help/ }).getByRole('radio', { name: '4', exact: true }).check();
  await page.getByRole('radio', { name: 'A minor inconvenience' }).check();
  await page.getByRole('textbox', { name: /got in the way most/ }).fill('Nothing yet');
  await page.getByRole('button', { name: 'Send answers' }).click();
  await expect(page.locator('header.topbar').getByRole('button', { name: /Analyze now/ })).toBeEnabled();

  // The operator sees the team's surveys and usage.
  await loginAs(page, OPERATOR);
  await page.goto('/#/operator');
  await page.getByRole('button', { name: 'Usage' }).click();
  await expect(page.getByText('Usage of Beta Corp')).toBeVisible();
  await expect(page.getByRole('row', { name: /Surveys answered/ })).toContainText('2');
});
