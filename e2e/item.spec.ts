import { expect, test } from '@playwright/test';
import { applyScenarioViaApi, approveViaApi, card, heading1, nav, resetWorkspace, toast } from './support/helpers';

// User path: reviewing a work item — readiness, approval (normal, forced, re-approval), tabs and evidence.

test.beforeEach(async ({ request }) => {
  await resetWorkspace(request);
});

test('ITM-01: approving a ready story freezes the baseline, is audited and can be withdrawn', { tag: '@smoke' }, async ({ page }) => {
  await page.goto('/#/item/PAY-123');
  await expect(page.getByText('READY FOR IMPLEMENTATION')).toBeVisible();
  await page.getByRole('button', { name: 'Approve for implementation' }).click();

  await expect(toast(page)).toHaveText('PAY-123 approved — drift will be monitored from now on');
  await expect(page.getByText(/Approved .* · drift monitored/)).toBeVisible();

  await page.getByRole('button', { name: 'Withdraw approval' }).click();
  await expect(page.getByRole('button', { name: 'Approve for implementation' })).toBeVisible();
  await expect(page.getByText(/· drift monitored/)).not.toBeVisible();

  await nav(page, /Audit log/).click();
  // The audit log is append-only and newest first.
  await expect(page.getByRole('row').filter({ hasText: 'PAY-123 approved as ready for implementation' }).first()).toBeVisible();
});

test('ITM-02: a not-ready story can be force-approved only with a reason', async ({ page }) => {
  await page.goto('/#/item/CHK-201');
  await expect(page.getByText('NOT READY', { exact: true })).toBeVisible();
  await expect(page.getByText(/^1 blocking issue:/)).toBeVisible();

  await page.getByRole('button', { name: 'Force approve…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Force approve CHK-201?' });
  await dialog.getByLabel(/Why approve it anyway/).fill('Pilot release, timeout confirmed by phone');
  await dialog.getByRole('button', { name: 'Force approve', exact: true }).click();

  await expect(toast(page)).toHaveText('CHK-201 approved — drift will be monitored from now on');
  await expect(page.getByText(/Force-approved .* · drift monitored/)).toBeVisible();
  await expect(page.getByText('Reason: Pilot release, timeout confirmed by phone')).toBeVisible();
});

test('ITM-03: cancelling the force-approval reason leaves the story unapproved', async ({ page }) => {
  await page.goto('/#/item/CHK-201');
  await page.getByRole('button', { name: 'Force approve…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Force approve CHK-201?' });
  await dialog.getByLabel(/Why approve it anyway/).fill('Pilot release, timeout confirmed by phone');
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Force approve…' })).toBeVisible();
  await expect(page.getByText(/drift monitored/)).not.toBeVisible();
});

test('ITM-04: an epic shows its stories and cannot be approved itself', async ({ page }) => {
  await page.goto('/#/item/ACC-300');
  await expect(heading1(page, 'ACC-300 — Customer Profile')).toBeVisible();
  await expect(page.getByRole('button', { name: /Approve/ })).toHaveCount(0);

  await card(page, 'Epic analysis · 1 stories').getByText('ACC-301').click();
  await expect(heading1(page, 'ACC-301 — Upload profile photo')).toBeVisible();
});

test('ITM-05: the analysis tabs show findings, states, context, claims and drift', async ({ page }) => {
  await page.goto('/#/item/PAY-123');
  await expect(page.getByText('Figma missing empty state')).toBeVisible();

  await page.getByRole('button', { name: 'States & journeys' }).click();
  await expect(page.getByRole('heading', { name: 'State machine coverage' })).toBeVisible();

  await page.getByRole('button', { name: /^Context \(\d+\)$/ }).click();
  await expect(page.getByRole('heading', { level: 3, name: 'Confluence' })).toBeVisible();

  await page.getByRole('button', { name: 'Claims (4)' }).click();
  await expect(page.getByRole('columnheader', { name: 'Statement' })).toBeVisible();

  // Drift history survives demo resets, so the count is not fixed here (DRF-04 covers the content).
  const drift = page.getByRole('button', { name: /^Drift \(\d+\)$/ });
  await drift.click();
  await expect(drift).toHaveClass(/active/);
});

test('ITM-06: "WHY?" reveals the evidence behind a finding', async ({ page }) => {
  await page.goto('/#/item/PAY-123');
  // The first finding with three sources; AC-001 (AC not in GWT) cites three criteria too.
  const why = page.getByRole('button', { name: 'WHY? — 3 sources' }).first();
  await expect(page.locator('.evidence .ev')).toHaveCount(0);
  await why.click();
  await expect(page.locator('.evidence .ev')).toHaveCount(3);
});

test('ITM-07: "AI review" without a configured provider explains what to do', async ({ page }) => {
  await page.goto('/#/item/PAY-123');
  await page.getByRole('button', { name: /AI review/ }).click();

  const dialog = page.getByRole('dialog', { name: 'AI review of PAY-123' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/No AI provider is configured/)).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Open Settings' })).toBeVisible();
});

test('ITM-08: an approved story changed in a source system can be re-approved after review', async ({ page, request }) => {
  await approveViaApi(request, 'PAY-123');
  await applyScenarioViaApi(request, 'figma-remove-error');
  await page.goto('/#/item/PAY-123');

  await expect(page.getByText('NOT READY', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Re-approve after review' }).click();

  await expect(toast(page)).toHaveText('PAY-123 approved — drift will be monitored from now on');
  await expect(page.getByRole('button', { name: 'Re-approve after review' })).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Withdraw approval' })).toBeVisible();
});

test('ITM-09: an epic shows its release plan; a plan against the dependency order makes it NOT READY', async ({ page, request }) => {
  await page.goto('/#/item/CHK-200');
  const plan = card(page, 'Release plan');
  // No story carries release:R1 yet (REL-001).
  await expect(plan.getByText('No MVP yet: none of the 4 stories is in release line R1.')).toBeVisible();
  await expect(plan.getByText('MVP is not designated')).toBeVisible();

  await applyScenarioViaApi(request, 'release-planning');
  await page.reload();
  await expect(plan.getByText('MVP (R1) holds 2 of 4 stories (50%).')).toBeVisible();
  await expect(plan.getByRole('row', { name: /R1 · MVP/ }).getByRole('button')).toHaveText(['CHK-201', 'CHK-202']);
  await expect(plan.getByRole('row', { name: /^R2/ }).getByRole('button')).toHaveText(['CHK-203', 'CHK-204']);

  await page.goto('/#/item/PAY-110');
  await expect(card(page, 'Release plan').getByText('PAY-128 (R1) is blocked by PAY-125 (R2)')).toBeVisible();
  await expect(page.getByText('NOT READY').first()).toBeVisible();
});
