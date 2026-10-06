import { expect, test } from '@playwright/test';
import { applyScenarioViaApi, approveViaApi, card, heading1, resetWorkspace, toast } from './support/helpers';

// User path: after approval — a change in Jira, Confluence or Figma is detected, shown on the drift page and on the item.
// The change log is append-only across demo resets, so rows are matched as the newest entry (`.first()`).

test.beforeEach(async ({ request }) => {
  await resetWorkspace(request);
});

test('DRF-01: a change to an approved story is flagged as drift on that story', async ({ page, request }) => {
  await approveViaApi(request, 'PAY-123');
  await page.goto('/');

  // Scenario tiles have no landmark or heading of their own; the tile is the closest card around the title.
  const scenario = page.locator('.card.row').filter({ hasText: 'Jira: PAY-123 allows 10 saved cards' });
  await scenario.getByRole('button', { name: 'Apply' }).click();

  await expect(toast(page)).toHaveText(/^Change applied — \d+ drift events detected$/);
  await expect(page).toHaveURL(/#\/drift$/);
  await expect(heading1(page, 'Continuous drift detection')).toBeVisible();

  await expect(card(page, '🟡 Impact detected on approved items (1)')).toBeVisible();
  await expect(page.getByText('Impact detected: 1 related artifact changed since approval')).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'card max items changed from 5 cards to 10 cards in "PAY-123"' }).first()).toBeVisible();
});

test('DRF-02: informational events are hidden until the filter is switched off', async ({ page, request }) => {
  await applyScenarioViaApi(request, 'api-idempotency');
  await page.goto('/#/drift');
  const info = card(page, 'Change log').getByRole('row').filter({ hasText: 'Confluence changed: Payments API Reference' });

  const hide = page.getByRole('checkbox', { name: 'Hide informational events' });
  await expect(hide).toBeChecked();
  await expect(info).toHaveCount(0);

  await hide.uncheck();
  await expect(info.first()).toBeVisible();
});

test('DRF-03: an approved story that regresses is reported as "DRIFT DETECTED" and links to the story', async ({ page, request }) => {
  await approveViaApi(request, 'PAY-123');
  await applyScenarioViaApi(request, 'timeout-change');
  await page.goto('/#/drift');

  const row = card(page, 'Change log').getByRole('row').filter({ hasText: 'PAY-123 regressed: READY → NOT READY' }).first();
  await expect(row.getByText('🔴 DRIFT DETECTED')).toBeVisible();

  await row.getByRole('link', { name: 'PAY-123' }).click();
  await expect(heading1(page, 'PAY-123 — Save payment method')).toBeVisible();
  await expect(page.getByText('🔴 NOT READY')).toBeVisible();
});

test('DRF-04: the impacted item opens with its drift history', async ({ page, request }) => {
  await approveViaApi(request, 'PAY-123');
  await applyScenarioViaApi(request, 'figma-remove-error');
  await page.goto('/#/drift');

  await card(page, /^🟡 Impact detected on approved items/).getByText('PAY-123', { exact: true }).click();
  await expect(page).toHaveURL(/#\/item\/PAY-123$/);

  await page.getByRole('button', { name: /^Drift \(\d+\)$/ }).click();
  await expect(page.getByText('No drift recorded for this item.')).toHaveCount(0);
  await expect(page.locator('.li').first()).toBeVisible();
});
