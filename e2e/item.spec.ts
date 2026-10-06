import { expect, test } from '@playwright/test';
import { applyScenarioViaApi, approveViaApi, card, heading1, nav, resetWorkspace, toast } from './support/helpers';

// User path: reviewing a work item — readiness, approval (normal, forced, re-approval), tabs and evidence.

test.beforeEach(async ({ request }) => {
  await resetWorkspace(request);
});

test('ITM-01: approving a ready story freezes the baseline, is audited and can be withdrawn', async ({ page }) => {
  await page.goto('/#/item/PAY-123');
  await expect(page.getByText('🟢 READY FOR IMPLEMENTATION')).toBeVisible();
  await page.getByRole('button', { name: 'Approve for implementation' }).click();

  await expect(toast(page)).toHaveText('PAY-123 approved — drift will be monitored from now on');
  await expect(page.getByText(/✓ Approved .* · drift monitored/)).toBeVisible();

  await page.getByRole('button', { name: 'Withdraw approval' }).click();
  await expect(page.getByRole('button', { name: 'Approve for implementation' })).toBeVisible();
  await expect(page.getByText(/· drift monitored/)).not.toBeVisible();

  await nav(page, /Audit log/).click();
  // The audit log is append-only and newest first.
  await expect(page.getByRole('row').filter({ hasText: 'PAY-123 approved as ready for implementation' }).first()).toBeVisible();
});

test('ITM-02: a not-ready story can be force-approved only with a reason', async ({ page }) => {
  await page.goto('/#/item/CHK-201');
  await expect(page.getByText('🔴 NOT READY')).toBeVisible();
  await expect(page.getByText(/^1 blocking issue:/)).toBeVisible();

  page.once('dialog', (d) => d.accept('Pilot release, timeout confirmed by phone'));
  await page.getByRole('button', { name: 'Force approve…' }).click();

  await expect(toast(page)).toHaveText('CHK-201 approved — drift will be monitored from now on');
  await expect(page.getByText(/✓ Force-approved .* · drift monitored/)).toBeVisible();
  await expect(page.getByText('Reason: Pilot release, timeout confirmed by phone')).toBeVisible();
});

test('ITM-03: cancelling the force-approval reason leaves the story unapproved', async ({ page }) => {
  await page.goto('/#/item/CHK-201');
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('button', { name: 'Force approve…' }).click();

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
  const why = page.getByRole('button', { name: '▸ WHY? — 3 sources' });
  await why.click();
  await expect(page.getByRole('button', { name: '▾ WHY? — 3 sources' })).toBeVisible();
  await expect(page.locator('.evidence .ev')).toHaveCount(3);
});

test('ITM-07: "AI review" without a configured provider explains what to do', async ({ page }) => {
  await page.goto('/#/item/PAY-123');
  await page.getByRole('button', { name: /AI review/ }).click();
  await expect(toast(page)).toHaveText(/No AI provider configured/);
});

test('ITM-08: an approved story changed in a source system can be re-approved after review', async ({ page, request }) => {
  await approveViaApi(request, 'PAY-123');
  await applyScenarioViaApi(request, 'figma-remove-error');
  await page.goto('/#/item/PAY-123');

  await expect(page.getByText('🔴 NOT READY')).toBeVisible();
  await page.getByRole('button', { name: 'Re-approve after review' }).click();

  await expect(toast(page)).toHaveText('PAY-123 approved — drift will be monitored from now on');
  await expect(page.getByRole('button', { name: 'Re-approve after review' })).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Withdraw approval' })).toBeVisible();
});
