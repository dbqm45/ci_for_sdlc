import { expect, test } from '@playwright/test';
import { applyScenarioViaApi, card, nav, resetWorkspace } from './support/helpers';

// User path (A2a, docs/AUTO-CLOSE-A2A-PLAN.md): Confluence already answers a finding's question — the item offers the
// answer with its quote, one click closes the finding, it is listed under "Auto-closed" and "Reopen" opens it again
// for good. The scenario "answers-in-sources" documents what CHK-202 asks about a provider timeout.

const QUOTE = 'If the payment provider does not respond within 30 seconds, the app shows a timeout message and the customer can try the payment again.';

test.beforeEach(async ({ request }) => {
  await resetWorkspace(request);
  await applyScenarioViaApi(request, 'answers-in-sources');
});

test('AUTO-01: accept an answer found in Confluence, see it auto-closed, then reopen it', async ({ page }) => {
  await page.goto('/#/item/CHK-202');
  const found = page.getByRole('group', { name: 'Answer found in a source' }).filter({ hasText: QUOTE });
  await expect(found).toContainText('Answer found in Payment Failure Handling');
  await found.getByRole('button', { name: 'Accept' }).click();
  await expect(found).toHaveCount(0);

  await page.getByRole('button', { name: /resolved \/ accepted finding/ }).click();
  await expect(page.getByText(`Decided: ${QUOTE} — Answer found in Payment Failure Handling`)).toBeVisible();

  await nav(page, /Decisions/).click();
  const autoClosed = card(page, 'Auto-closed (1)');
  await expect(autoClosed.getByRole('row').filter({ hasText: 'CHK-202' })).toContainText(QUOTE);
  await expect(autoClosed.getByLabel('Acceptance of finding.auto_close')).toContainText('Accepted unedited 1 (100%)');

  page.once('dialog', (d) => void d.accept('Wrong flow'));
  await autoClosed.getByRole('button', { name: 'Reopen' }).click();
  await expect(card(page, 'Auto-closed (0)')).toBeVisible();
  await expect(card(page, 'Auto-closed (0)').getByLabel('Acceptance of finding.auto_close')).toContainText('Reopened 1');

  await page.goto('/#/item/CHK-202');
  await expect(page.locator('.finding .title').filter({ hasText: 'Timeout behavior undefined' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Answer found in a source' }).filter({ hasText: QUOTE })).toHaveCount(0);
});
