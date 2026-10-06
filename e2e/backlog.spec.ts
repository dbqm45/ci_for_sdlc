import { expect, test } from '@playwright/test';
import { heading1, nav, resetWorkspace } from './support/helpers';

// User path: finding work in the backlog — search, type and health filters, dimensions at a glance.

test.beforeEach(async ({ page, request }) => {
  await resetWorkspace(request);
  await page.goto('/');
  await nav(page, /Backlog/).click();
  await expect(heading1(page, 'Backlog')).toBeVisible();
});

/** Data rows (the header row has no cells). */
const rows = (page: import('@playwright/test').Page) => page.getByRole('row').filter({ has: page.getByRole('cell') });

test('BKL-01: search narrows the list and opens the work item', async ({ page }) => {
  const search = page.getByRole('textbox', { name: 'Search' });
  await search.fill('no such item');
  await expect(page.getByText('No items match the filter.')).toBeVisible();

  await search.fill('Save payment');
  await expect(rows(page)).toHaveCount(1);
  await rows(page).first().click();

  await expect(page).toHaveURL(/#\/item\/PAY-123$/);
  await expect(heading1(page, 'PAY-123 — Save payment method')).toBeVisible();
});

test('BKL-02: the type filter shows only epics', async ({ page }) => {
  await page.getByRole('combobox', { name: 'Item type' }).selectOption({ label: 'Epics' });
  await expect(rows(page)).toHaveCount(4);
  for (const key of ['PAY-100', 'PAY-110', 'CHK-200', 'ACC-300']) await expect(rows(page).filter({ hasText: key })).toHaveCount(1);
});

test('BKL-03: the "Critical" filter lists the four critical stories', async ({ page }) => {
  await page.getByRole('button', { name: '🔴 Critical' }).click();
  await expect(rows(page)).toHaveCount(4);
  for (const key of ['PAY-125', 'PAY-128', 'CHK-201', 'CHK-202']) await expect(rows(page).filter({ hasText: key })).toHaveCount(1);

  await page.getByRole('button', { name: 'All', exact: true }).click();
  await expect(rows(page).filter({ hasText: 'PAY-123' })).toHaveCount(1);
});

test('BKL-04: the first cell expands the readiness dimensions without leaving the backlog', async ({ page }) => {
  await page.getByRole('combobox', { name: 'Item type' }).selectOption({ label: 'Bugs' });
  await page.getByTitle('Show dimensions').first().click();
  await expect(page.getByText('Error handling')).toBeVisible();
  await expect(page).toHaveURL(/#\/backlog$/);
});
