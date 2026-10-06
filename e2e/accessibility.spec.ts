import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { heading1, resetWorkspace } from './support/helpers';

// Accessibility regression: axe (WCAG 2 A/AA) on every page, plus aria snapshots of the app's structure.

const PAGES: [string, string, string][] = [
  ['overview', '/#/overview', 'Continuous Intelligence — Checkout'],
  ['backlog', '/#/backlog', 'Backlog'],
  ['item', '/#/item/PAY-123', 'PAY-123 — Save payment method'],
  ['decisions', '/#/decisions', 'Decision debt'],
  ['drift', '/#/drift', 'Continuous drift detection'],
  ['impact', '/#/impact', 'Impact analysis'],
  ['settings', '/#/settings', 'Settings'],
  ['audit', '/#/audit', 'Audit log'],
];

/**
 * Known defect: these text/background pairs from the current palette fail WCAG AA contrast (4.5:1).
 * The visual style stays as it is for now (docs/TESTING-REGRESSION.md → Dostępność), so the test only
 * stops new low-contrast pairs. Remove a pair once its colors are fixed — never add one to get green.
 */
const KNOWN_LOW_CONTRAST = new Set([
  '#b7791f on #fdf3e1', // warning badge
  '#b7791f on #ffffff', // warning text
  '#667085 on #f1f3f6', // muted chip
  '#667085 on #eef0ff', // muted text on selected row
  '#d92d20 on #fdecea', // critical badge
  '#12945a on #e5f6ee', // healthy badge
  '#12945a on #ffffff', // healthy text
  '#98a2b3 on #ffffff', // hint text
]);

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const axe = (page: Page) => new AxeBuilder({ page }).withTags(WCAG);

test.beforeEach(async ({ request }) => {
  await resetWorkspace(request);
});

for (const [name, url, title] of PAGES) {
  test(`A11Y-${name}: no WCAG 2 A/AA violations`, { tag: '@a11y' }, async ({ page }) => {
    await page.goto(url);
    await expect(heading1(page, title)).toBeVisible();
    await expectAccessible(page);
  });
}

test('A11Y-item-context: the context graph and its controls have no WCAG 2 A/AA violations', { tag: '@a11y' }, async ({ page }) => {
  await page.goto('/#/item/PAY-123');
  await page.getByRole('button', { name: /^Context \(\d+\)$/ }).click();
  await expect(page.getByRole('group', { name: 'Context graph' })).toBeVisible();
  await expectAccessible(page);
  await page.getByRole('button', { name: /Enlarge/ }).click();
  await expect(page.getByRole('dialog', { name: 'Context graph (enlarged)' })).toBeVisible();
  await expectAccessible(page);
});

async function expectAccessible(page: Page) {
  const { violations } = await axe(page).disableRules(['color-contrast']).analyze();
  expect(violations.map((v) => `${v.id}: ${v.help} → ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);

  const contrast = await axe(page).withRules(['color-contrast']).analyze();
  const pairs = contrast.violations.flatMap((v) =>
    v.nodes.map((n) => {
      const d = n.any[0]?.data as { fgColor?: string; bgColor?: string } | undefined;
      return { pair: `${d?.fgColor} on ${d?.bgColor}`, target: n.target.join(' ') };
    }),
  );
  expect(pairs.filter((p) => !KNOWN_LOW_CONTRAST.has(p.pair)), 'new low-contrast colors').toEqual([]);
}

test('A11Y-SNAP-01: the sidebar exposes every section as a named link', { tag: '@a11y' }, async ({ page }) => {
  await page.goto('/#/overview');
  await expect(page.getByRole('complementary')).toMatchAriaSnapshot(`
    - complementary:
      - link /Project health/
      - link /Backlog \\d+/
      - link /Decisions \\d+/
      - link /Drift/
      - link /Impact analysis/
      - text: Administration
      - link /Settings/
      - link /Audit log/
  `);
});

test('A11Y-SNAP-02: the work item page keeps its heading, actions and sections', { tag: '@a11y' }, async ({ page }) => {
  await page.goto('/#/item/PAY-123');
  await expect(page.getByRole('main')).toMatchAriaSnapshot(`
    - main:
      - link "Backlog"
      - link "PAY-100"
      - heading "PAY-123 — Save payment method" [level=1]
      - button /AI review/
      - button "Approve for implementation"
      - heading "Specification (Jira)" [level=2]
      - heading "Acceptance criteria" [level=3]
      - list
      - heading "Business rules" [level=3]
      - button /Findings \\(\\d+\\)/
      - button /Challenge this feature/
      - button "States & journeys"
      - button /Context/
      - button /Claims/
      - button /Drift/
  `);
});

test('A11Y-SNAP-03: project health names its headline sections', { tag: '@a11y' }, async ({ page }) => {
  await page.goto('/#/overview');
  await expect(page.getByRole('main')).toMatchAriaSnapshot(`
    - main:
      - heading "Continuous Intelligence — Checkout" [level=1]
      - heading "Backlog health" [level=2]
      - heading "Where is the biggest risk?" [level=2]
  `);
});
