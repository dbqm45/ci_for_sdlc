import { expect, test } from '@playwright/test';
import { applyScenarioViaApi, card, heading1, resetWorkspace, toast } from './support/helpers';

// User path: project health — the first screen; where the risk is and how to drive the demo workspace.

test.beforeEach(async ({ page, request }) => {
  await resetWorkspace(request);
  await page.goto('/');
});

test('OVR-01: project health shows the demo project and its health counts', { tag: '@smoke' }, async ({ page }) => {
  await expect(heading1(page, 'Project health')).toBeVisible();
  const banner = page.getByRole('banner');
  await expect(banner.getByText('4 critical')).toBeVisible();
  await expect(banner.getByText('4 need attention')).toBeVisible();
  await expect(banner.getByText('3 healthy')).toBeVisible();
  await expect(card(page, 'Demo workspace — simulate a change in a source system')).toBeVisible();
});

test('OVR-02: "Analyze now" re-runs the analysis and reports the result', async ({ page }) => {
  await page.getByRole('button', { name: 'Analyze now' }).click();
  await expect(toast(page)).toHaveText(/^Analysis complete — 4 critical, \d+ drift events$/);
});

test('OVR-03: a row in "Where is the biggest risk?" opens that work item', async ({ page }) => {
  await card(page, 'Where is the biggest risk?').getByText('CHK-201', { exact: true }).click();
  await expect(page).toHaveURL(/#\/item\/CHK-201$/);
  await expect(heading1(page, /^CHK-201 — /)).toBeVisible();
});

test('OVR-04: an epic row opens the epic with its stories', async ({ page }) => {
  await card(page, 'Epics').getByText('ACC-300', { exact: true }).click();
  await expect(heading1(page, 'ACC-300 — Customer Profile')).toBeVisible();
  await expect(card(page, 'Epic analysis · 1 stories')).toBeVisible();
});

test('OVR-05: "All events →" opens the drift page', async ({ page }) => {
  await card(page, 'Recent drift').getByRole('link', { name: 'All events' }).click();
  await expect(heading1(page, 'Continuous drift detection')).toBeVisible();
});

test('OVR-06: "Reset demo data" undoes simulated changes', async ({ page, request }) => {
  await applyScenarioViaApi(request, 'timeout-change');
  await page.reload();
  await expect(page.getByRole('banner').getByText('4 critical')).not.toBeVisible();

  await page.getByRole('button', { name: 'Reset demo data' }).click();
  await expect(toast(page)).toHaveText('Demo workspace reset');
  await expect(page.getByRole('banner').getByText('4 critical')).toBeVisible();
  await expect(page.getByRole('banner').getByText('3 healthy')).toBeVisible();
});
