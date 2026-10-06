import { expect, test } from '@playwright/test';
import { card, heading1, nav, resetWorkspace } from './support/helpers';

// User path: before a change — "what would this affect?" from a sentence or an entity id.

test.beforeEach(async ({ page, request }) => {
  await resetWorkspace(request);
  await page.goto('/');
  await nav(page, /Impact analysis/).click();
  await expect(heading1(page, 'Impact analysis')).toBeVisible();
});

test('IMP-01: an example change lists the affected stories, which open on click', async ({ page }) => {
  await page.getByRole('button', { name: 'Allow 10 saved cards' }).click();
  const affected = card(page, 'Affected stories, bugs and epics');
  await expect(affected.getByRole('link', { name: /^PAY-123 / })).toBeVisible();
  await expect(card(page, 'Related artifacts')).toBeVisible();

  await affected.getByRole('link', { name: /^PAY-123 / }).click();
  await expect(heading1(page, 'PAY-123 — Save payment method')).toBeVisible();
});

test('IMP-02: an entity id typed by the user lists everything that depends on it', async ({ page }) => {
  const input = page.getByRole('textbox', { name: 'Planned change' });
  await input.fill('jira:PAY-125');
  await input.press('Enter');

  const affected = card(page, 'Affected stories, bugs and epics');
  for (const key of ['PAY-100', 'PAY-125', 'PAY-127', 'CHK-202']) await expect(affected.getByRole('link', { name: new RegExp(`^${key} `) })).toBeVisible();
});
