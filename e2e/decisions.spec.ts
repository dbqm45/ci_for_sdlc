import { expect, test, type Page } from '@playwright/test';
import { card, decideViaApi, heading1, nav, resetWorkspace } from './support/helpers';

// User path: closing decision debt — answering a finding's question (option, free text, accept risk, not applicable),
// re-opening a decision, the Decisions page and the adversarial "Challenge this feature" questions.

const TIMEOUT_FINDING = 'Conflicting order timeout: 45 s vs 30 s';
const TIMEOUT_QUESTION = 'Which timeout is correct for order?';

test.beforeEach(async ({ request }) => {
  await resetWorkspace(request);
});

/** The question box of an open finding or challenge. */
const question = (page: Page, text: string) => page.locator('.question').filter({ hasText: text });
/** The decision log row of the newest decision for a question (the log is append-only, newest first). */
const logRow = (page: Page, text: string) => card(page, 'Decision log').getByRole('row').filter({ hasText: text }).first();

test('DEC-01: choosing an answer resolves the conflict and makes the story ready', { tag: '@smoke' }, async ({ page }) => {
  await page.goto('/#/item/CHK-201');
  const q = question(page, TIMEOUT_QUESTION);
  await expect(q.getByRole('button', { name: 'Record decision' })).toBeDisabled();
  await q.getByRole('button', { name: '30 s (as in Checkout API)' }).click();
  await q.getByPlaceholder('Note / rationale (optional) — becomes part of the specification').fill('Checkout API is the contract');
  await q.getByRole('button', { name: 'Record decision' }).click();

  await expect(page.getByText('READY FOR IMPLEMENTATION', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /resolved \/ accepted finding/ }).click();
  await expect(page.getByText('Decided: 30 s (as in Checkout API)')).toBeVisible();

  await nav(page, /Decisions/).click();
  await expect(logRow(page, TIMEOUT_QUESTION)).toContainText('30 s (as in Checkout API)');
  await expect(logRow(page, TIMEOUT_QUESTION)).toContainText('Checkout API is the contract');
});

test('DEC-02: "Other" records a free-text answer', async ({ page }) => {
  await page.goto('/#/item/CHK-201');
  const q = question(page, TIMEOUT_QUESTION);
  await q.getByRole('button', { name: 'Other' }).click();
  await expect(q.getByRole('button', { name: 'Record decision' })).toBeDisabled();
  await q.getByPlaceholder('Describe what should happen…').fill('40 s, agreed with the payments team');
  await q.getByRole('button', { name: 'Record decision' }).click();

  await expect(page.getByText('READY FOR IMPLEMENTATION', { exact: true })).toBeVisible();
  await nav(page, /Decisions/).click();
  await expect(logRow(page, TIMEOUT_QUESTION)).toContainText('40 s, agreed with the payments team');
});

test('DEC-03: accepting the risk closes the finding and keeps the story ready', async ({ page }) => {
  await page.goto('/#/item/CHK-204');
  const finding = page.locator('.finding').filter({ hasText: 'Session expiry behavior undefined' });
  await finding.getByRole('button', { name: 'Accept risk' }).click();

  // The accepted finding leaves the open list; the story's AC-001 (info: AC not in GWT) stays open and does not block.
  await expect(page.locator('.finding').filter({ hasText: 'Session expiry behavior undefined' }).getByRole('button', { name: 'Accept risk' })).toHaveCount(0);
  await expect(page.getByText('READY FOR IMPLEMENTATION', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /resolved \/ accepted finding/ }).click();
  await expect(page.getByText('Risk accepted: Risk accepted')).toBeVisible();

  await nav(page, /Decisions/).click();
  const row = card(page, 'Decision log').getByRole('row').filter({ hasText: 'CHK-204' }).first();
  await expect(row.getByText('accept risk', { exact: true })).toBeVisible();
});

test('DEC-04: "Not applicable" dismisses the finding', async ({ page }) => {
  await page.goto('/#/item/PAY-123');
  const finding = page.locator('.finding').filter({ hasText: 'Figma missing empty state' });
  await finding.getByRole('button', { name: 'Not applicable' }).click();

  await page.getByRole('button', { name: /resolved \/ accepted finding/ }).click();
  await expect(page.getByText('Dismissed: Not applicable')).toBeVisible();

  await nav(page, /Decisions/).click();
  const row = card(page, 'Decision log').getByRole('row').filter({ hasText: 'PAY-123' }).first();
  await expect(row.getByText('dismiss', { exact: true })).toBeVisible();
});

test('DEC-05: re-opening a decision on the item page brings the question back', async ({ page, request }) => {
  await decideViaApi(request, 'CHK-201', TIMEOUT_FINDING, '30 s (as in Checkout API)');
  await page.goto('/#/item/CHK-201');
  await expect(page.getByText('READY FOR IMPLEMENTATION', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: /resolved \/ accepted finding/ }).click();
  page.once('dialog', (d) => d.accept('Payments team disagrees'));
  await page.locator('.resolution').filter({ hasText: '30 s (as in Checkout API)' }).getByRole('button', { name: 'Re-open' }).click();

  await expect(page.getByText('NOT READY', { exact: true })).toBeVisible();
  await expect(question(page, TIMEOUT_QUESTION)).toBeVisible();
});

test('DEC-06: re-opening a decision from the decision log marks it withdrawn', async ({ page, request }) => {
  await decideViaApi(request, 'CHK-201', TIMEOUT_FINDING, '30 s (as in Checkout API)');
  await page.goto('/#/decisions');

  page.once('dialog', (d) => d.accept('Payments team disagrees'));
  await logRow(page, TIMEOUT_QUESTION).getByRole('button', { name: 'Re-open' }).click();

  await expect(logRow(page, TIMEOUT_QUESTION).getByText('withdrawn', { exact: true })).toBeVisible();
  await expect(logRow(page, TIMEOUT_QUESTION)).toContainText('Payments team disagrees');
  await expect(card(page, /^Open questions/).getByText(TIMEOUT_QUESTION)).toBeVisible();
});

test('DEC-07: cancelling a re-open keeps the decision in force', async ({ page, request }) => {
  await decideViaApi(request, 'CHK-201', TIMEOUT_FINDING, '30 s (as in Checkout API)');
  await page.goto('/#/decisions');

  page.once('dialog', (d) => d.dismiss());
  await logRow(page, TIMEOUT_QUESTION).getByRole('button', { name: 'Re-open' }).click();

  await expect(logRow(page, TIMEOUT_QUESTION).getByRole('button', { name: 'Re-open' })).toBeVisible();
  await expect(logRow(page, TIMEOUT_QUESTION).getByText('withdrawn', { exact: true })).toHaveCount(0);
});

test('DEC-08: open questions can be filtered by topic and lead to the item', async ({ page }) => {
  await page.goto('/#/decisions');
  await expect(heading1(page, 'Decision debt')).toBeVisible();

  await page.getByRole('button', { name: 'order timeout · 1' }).click();
  const open = card(page, 'Open questions (1)');
  await expect(open).toBeVisible();
  await open.getByText(TIMEOUT_QUESTION).click();

  await expect(page).toHaveURL(/#\/item\/CHK-201$/);
});

test('DEC-09: answering a "Challenge this feature" question moves it to Answered', async ({ page }) => {
  const text = 'What does the user see when there are no items?';
  await page.goto('/#/item/PAY-123');
  await page.getByRole('button', { name: /^Challenge this feature \(\d+\)$/ }).click();

  const q = question(page, text);
  await q.getByRole('button', { name: 'Empty state with call to action' }).click();
  await q.getByRole('button', { name: 'Record decision' }).click();

  await expect(question(page, text)).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 3, name: 'Answered' })).toBeVisible();
  await expect(page.locator('.check-item').filter({ hasText: text })).toContainText('Decision: Empty state with call to action');
});
