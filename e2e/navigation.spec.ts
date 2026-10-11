import { expect, test } from '@playwright/test';
import { heading1, nav, resetWorkspace } from './support/helpers';

// User path: moving around the app — sidebar, deep links, breadcrumbs, unknown addresses.

test.beforeEach(async ({ page, request }) => {
  await resetWorkspace(request);
  await page.goto('/');
});

test('NAV-01: every sidebar link opens its page', { tag: '@smoke' }, async ({ page }) => {
  const pages: [RegExp, string, RegExp][] = [
    [/Backlog/, 'Backlog', /#\/backlog$/],
    [/Decisions/, 'Decision debt', /#\/decisions$/],
    [/Drift/, 'Continuous drift detection', /#\/drift$/],
    [/Impact analysis/, 'Impact analysis', /#\/impact$/],
    [/Settings/, 'Settings', /#\/settings$/],
    [/Audit log/, 'Audit log', /#\/audit$/],
    [/Project health/, 'Project health', /#\/overview$/],
  ];
  for (const [link, title, url] of pages) {
    await nav(page, link).click();
    await expect(heading1(page, title)).toBeVisible();
    await expect(page).toHaveURL(url);
  }
});

test('NAV-02: a deep link opens the work item directly', async ({ page }) => {
  await page.goto('/#/item/PAY-123');
  await expect(heading1(page, 'PAY-123 — Save payment method')).toBeVisible();
});

test('NAV-03: a link to an unknown work item explains that it does not exist', async ({ page }) => {
  await page.goto('/#/item/NOPE-1');
  await expect(page.getByText('No work item NOPE-1', { exact: true })).toBeVisible();
});

test('NAV-04: an unknown address falls back to project health', async ({ page }) => {
  await page.goto('/#/nowhere');
  await expect(heading1(page, 'Project health')).toBeVisible();
});

test('NAV-05: the breadcrumb leads from a story to its epic and back to the backlog', async ({ page }) => {
  await page.goto('/#/item/PAY-123');
  await page.getByRole('main').getByRole('link', { name: 'PAY-100', exact: true }).click();
  await expect(heading1(page, 'PAY-100 — Saved Payment Methods')).toBeVisible();

  await page.getByRole('main').getByRole('link', { name: 'Backlog', exact: true }).click();
  await expect(heading1(page, 'Backlog')).toBeVisible();
});
