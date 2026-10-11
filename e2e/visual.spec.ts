import { expect, test, type Page } from '@playwright/test';
import { heading1, resetWorkspace } from './support/helpers';

// Visual regression: full-page screenshots of the key pages on the pristine demo workspace.
// Runs only through playwright.visual.config.ts, inside the pinned Playwright Docker image
// (baselines in e2e/__screenshots__, procedure in docs/TESTING-REGRESSION.md).

const PAGES: [string, string, string][] = [
  ['overview', '/#/overview', 'Project health'],
  ['backlog', '/#/backlog', 'Backlog'],
  ['item-pay-123', '/#/item/PAY-123', 'PAY-123 — Save payment method'],
  ['impact', '/#/impact', 'Impact analysis'],
  ['settings', '/#/settings', 'Settings'],
];

/** Text that depends on the clock or on how fast the analysis ran. */
const timeDependent = (page: Page) => [
  page.getByText(/^Last analysis:/),
  page.getByText(/^Analyzed .* in \d+ ms$/),
  page.getByText(/(Approved|Force-approved) .* drift monitored/),
];

test.beforeEach(async ({ request }) => {
  await resetWorkspace(request);
});

for (const [name, url, title] of PAGES) {
  test(`VIS-${name}: the page looks as in the approved baseline`, { tag: '@visual' }, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(url);
    await expect(heading1(page, title)).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot(`${name}.png`, { fullPage: true, mask: timeDependent(page) });
  });
}
