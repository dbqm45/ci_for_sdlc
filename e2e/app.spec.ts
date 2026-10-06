import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// Expected values come from the built-in demo workspace ("Checkout"): 4 epics, 10 stories,
// 4 critical / 4 need attention / 3 healthy; PAY-123 "Save payment method" is a ready story.

/** Every test starts from the pristine demo workspace: no simulated changes, no approval of PAY-123. */
async function resetWorkspace(request: APIRequestContext) {
  await expect(await request.post('/api/demo/reset')).toBeOK();
  await expect(await request.delete('/api/items/PAY-123/approve')).toBeOK();
}

const nav = (page: Page, name: string | RegExp) => page.getByRole('complementary').getByRole('link', { name });
const toast = (page: Page) => page.getByRole('status');

test.beforeEach(async ({ page, request }) => {
  await resetWorkspace(request);
  await page.goto('/');
});

test('E2E-01: project health shows the demo project and its health counts', async ({ page }) => {
  await expect(page.getByRole('heading', { level: 1, name: 'Continuous Intelligence — Checkout' })).toBeVisible();
  const banner = page.getByRole('banner');
  await expect(banner.getByText('4 critical')).toBeVisible();
  await expect(banner.getByText('4 need attention')).toBeVisible();
  await expect(banner.getByText('3 healthy')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Demo workspace — simulate a change in a source system' })).toBeVisible();
});

test('E2E-02: backlog search narrows the list and opens the work item', async ({ page }) => {
  await nav(page, /Backlog/).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Backlog' })).toBeVisible();

  const search = page.getByPlaceholder('Search key, title, domain…');
  await search.fill('no such item');
  await expect(page.getByText('No items match the filter.')).toBeVisible();

  await search.fill('Save payment');
  const rows = page.getByRole('row').filter({ hasText: 'PAY-' });
  await expect(rows).toHaveCount(1);
  await rows.first().click();

  await expect(page).toHaveURL(/#\/item\/PAY-123$/);
  await expect(page.getByRole('heading', { level: 1, name: 'PAY-123 — Save payment method' })).toBeVisible();
});

test('E2E-03: "Analyze now" re-runs the analysis and reports the result', async ({ page }) => {
  await page.getByRole('button', { name: 'Analyze now' }).click();
  await expect(toast(page)).toHaveText(/^Analysis complete — 4 critical, \d+ drift events$/);
});

test('E2E-04: approving a ready story freezes the baseline and is audited', async ({ page }) => {
  await page.goto('/#/item/PAY-123');
  await page.getByRole('button', { name: 'Approve for implementation' }).click();

  await expect(toast(page)).toHaveText('PAY-123 approved — drift will be monitored from now on');
  await expect(page.getByText(/✓ Approved .* · drift monitored/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Withdraw approval' })).toBeVisible();

  await nav(page, /Audit log/).click();
  // The audit log is append-only and newest first.
  await expect(page.getByRole('row').filter({ hasText: 'PAY-123 approved as ready for implementation' }).first()).toBeVisible();
});

test('E2E-05: a change to an approved story is flagged as drift on that story', async ({ page, request }) => {
  await expect(await request.post('/api/items/PAY-123/approve', { data: { by: 'e2e' } })).toBeOK();
  await page.reload();

  // Scenario tiles have no landmark or heading of their own; the tile is the closest card around the title.
  const scenario = page.locator('.card.row').filter({ hasText: 'Jira: PAY-123 allows 10 saved cards' });
  await scenario.getByRole('button', { name: 'Apply' }).click();

  await expect(toast(page)).toHaveText(/^Change applied — \d+ drift events detected$/);
  await expect(page).toHaveURL(/#\/drift$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Continuous drift detection' })).toBeVisible();

  const impact = page.getByRole('heading', { name: '🟡 Impact detected on approved items (1)' });
  await expect(impact).toBeVisible();
  await expect(page.getByText('Impact detected: 1 related artifact changed since approval')).toBeVisible();
  // The change log keeps history across demo resets, so look for the newest matching entry.
  await expect(page.getByRole('row').filter({ hasText: 'card max items changed from 5 cards to 10 cards in "PAY-123"' }).first()).toBeVisible();
});
