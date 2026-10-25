import { expect, test } from '@playwright/test';
import { card, heading1, nav, resetWorkspace, disableRuleViaApi, toast } from './support/helpers';

// User path: configuring the workspace — integrations, policy rules, the reviewer's name, concurrent edits.

test.beforeEach(async ({ page, request }) => {
  await resetWorkspace(request);
  await page.goto('/');
  await nav(page, /Settings/).click();
  await expect(heading1(page, 'Settings')).toBeVisible();
});

test('SET-01: "Test connections" reports that the demo workspace has no integration', async ({ page }) => {
  const integrations = card(page, 'Integrations');
  await integrations.getByRole('button', { name: 'Test connections' }).click();
  await expect(integrations.getByText('No integration enabled.')).toBeVisible();
});

test('SET-02: disabling a policy rule re-analyzes the backlog', { tag: '@smoke' }, async ({ page }) => {
  await page.getByRole('checkbox', { name: /^Enable CON-001 / }).uncheck();
  await page.getByRole('button', { name: 'Save & re-analyze' }).click();

  await expect(toast(page)).toHaveText('Settings saved');
  // CON-001 (cross-source conflicts) produces the blocking finding of CHK-201.
  await expect(page.getByRole('banner').getByText('3 critical')).toBeVisible();
});

test('SET-03: the reviewer name is recorded on decisions', async ({ page }) => {
  await page.getByLabel('Your name (recorded on decisions)').fill('E2E Tester');
  await page.getByRole('button', { name: 'Save & re-analyze' }).click();
  await expect(toast(page)).toHaveText('Settings saved');

  await page.goto('/#/item/CHK-201');
  // Every open question shows the reviewer; CHK-201 has several.
  await expect(page.getByText('Decision by E2E Tester').first()).toBeVisible();
  await expect(page.getByText('the human owns the decision').first()).toBeVisible();
});

test('SET-04: saving over a change made elsewhere reloads the settings instead of overwriting them', async ({ page, request }) => {
  // Someone else saves the settings after this page loaded.
  await disableRuleViaApi(request, 'CON-001');

  await page.getByLabel('Project name').fill('Renamed by e2e');
  await page.getByRole('button', { name: 'Save & re-analyze' }).click();
  await expect(toast(page)).toHaveText('Settings were changed elsewhere and have been reloaded. Apply your change again.');
  await expect(page.getByLabel('Project name')).not.toHaveValue('Renamed by e2e');
  await expect(page.getByRole('checkbox', { name: /^Enable CON-001 / })).not.toBeChecked();
});
