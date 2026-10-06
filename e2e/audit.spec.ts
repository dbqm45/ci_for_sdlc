import { expect, test } from '@playwright/test';
import { approveViaApi, heading1, nav, resetWorkspace, disableRuleViaApi } from './support/helpers';

// User path: accountability — who approved, decided or changed what. The log is append-only, newest first.

test.beforeEach(async ({ request }) => {
  await resetWorkspace(request);
});

test('AUD-01: an approval is recorded with its actor', async ({ page, request }) => {
  await approveViaApi(request, 'PAY-123');
  await page.goto('/');
  await nav(page, /Audit log/).click();
  await expect(heading1(page, 'Audit log')).toBeVisible();

  const row = page.getByRole('row').filter({ hasText: 'PAY-123 approved as ready for implementation' }).first();
  await expect(row).toContainText('e2e');
});

test('AUD-02: the event kind filter shows only that kind', async ({ page, request }) => {
  await approveViaApi(request, 'PAY-123');
  await page.goto('/#/audit');
  await page.getByRole('combobox', { name: 'Event kind' }).selectOption({ label: 'approval' });

  const rows = page.getByRole('row').filter({ has: page.getByRole('cell') });
  await expect(rows.first()).toContainText('approved');
  await expect(rows.filter({ hasNotText: /approval/ })).toHaveCount(0);
});

test('AUD-03: a settings change expands to show what was changed', async ({ page, request }) => {
  await disableRuleViaApi(request, 'CON-001');
  await page.goto('/#/audit');
  await page.getByRole('combobox', { name: 'Event kind' }).selectOption({ label: 'settings' });

  await page.getByRole('row').filter({ has: page.getByRole('cell') }).first().click();
  await expect(page.locator('pre')).toContainText('disabledRules');
});
