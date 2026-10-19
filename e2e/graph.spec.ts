import { expect, test, type Page } from '@playwright/test';
import { heading1, resetWorkspace } from './support/helpers';

// User path: reading the context graph of a work item. Expected neighbourhood of PAY-123 in the demo
// workspace: parent epic PAY-100, the Confluence page "Saved Payment Methods – Business Rules" and
// 8 Figma frames of "Checkout App / Add card" (1 explicit link, 7 semantic).

test.beforeEach(async ({ request }) => {
  await resetWorkspace(request);
});

async function openGraph(page: Page) {
  await page.goto('/#/item/PAY-123');
  await page.getByRole('button', { name: /^Context \(\d+\)$/ }).click();
  return page.getByRole('group', { name: 'Context graph' }).first();
}

test('GRF-01: every neighbour is shown with its full name and relation, without overlapping labels', async ({ page }) => {
  const graph = await openGraph(page);
  const nodes = graph.getByRole('link');
  await expect(nodes).toHaveCount(10);
  await expect(graph.getByRole('link', { name: 'PAY-100 — Saved Payment Methods belongs to · explicit' })).toBeVisible();
  await expect(graph.getByRole('link', { name: 'Saved Payment Methods – Business Rules documented by · explicit' })).toBeVisible();
  await expect(graph.getByRole('link', { name: 'Checkout App / Add card / Session expired designed by · semantic 85%' })).toBeVisible();

  const boxes = await graph.locator('text.label').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON() as DOMRect));
  expect(boxes).toHaveLength(10);
  for (const [i, a] of boxes.entries())
    for (const b of boxes.slice(i + 1)) {
      const overlap = a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      expect(overlap, `labels overlap: ${JSON.stringify([a, b])}`).toBe(false);
    }
});

test('GRF-02: pointing at a node highlights its links and dims unrelated nodes', async ({ page }) => {
  const graph = await openGraph(page);
  const epic = graph.getByRole('link', { name: /^PAY-100 — / });
  await epic.hover();
  await expect(epic).toHaveClass(/\bon\b/);
  // PAY-100 links to the item, the Confluence page and the "Success" frame, not to "Offline".
  await expect(graph.getByRole('link', { name: /^Saved Payment Methods – Business Rules/ })).not.toHaveClass(/\bdim\b/);
  await expect(graph.getByRole('link', { name: /Add card \/ Offline/ })).toHaveClass(/\bdim\b/);
  await page.mouse.move(0, 0);
  await expect(graph.getByRole('link', { name: /Add card \/ Offline/ })).not.toHaveClass(/\bdim\b/);
});

test('GRF-03: the legend filters sources and link kinds', async ({ page }) => {
  const graph = await openGraph(page);
  const filters = page.getByRole('group', { name: 'Graph filters' }).first();
  const figma = filters.getByRole('button', { name: /Figma/ });
  await figma.click();
  await expect(figma).toHaveAttribute('aria-pressed', 'false');
  await expect(graph.getByRole('link')).toHaveCount(2);
  await figma.click();
  await expect(graph.getByRole('link')).toHaveCount(10);

  // Without semantic links only explicit ones remain: the epic, the page, the "Default" frame and the two frames linked to it.
  await filters.getByRole('button', { name: /semantic/ }).click();
  await expect(graph.getByRole('link')).toHaveCount(5);
  await expect(graph.getByRole('link', { name: /Add card \/ Offline/ })).toHaveCount(0);
  await expect(graph.getByRole('link', { name: /Add card \/ Validation error/ })).toBeVisible();
});

test('GRF-04: the graph zooms in and out and fits back', async ({ page }) => {
  await openGraph(page);
  const viewport = page.getByTestId('graph-viewport').first();
  await page.getByRole('button', { name: 'Zoom in' }).first().click();
  await expect(viewport).toHaveAttribute('transform', /scale\(1\.4\)/);
  await page.getByRole('button', { name: 'Zoom out' }).first().click();
  await expect(viewport).toHaveAttribute('transform', /scale\(1\)/);
  await page.getByRole('button', { name: 'Zoom in' }).first().click();
  await page.getByRole('button', { name: 'Fit' }).first().click();
  await expect(viewport).toHaveAttribute('transform', 'translate(0,0) scale(1)');
});

test('GRF-05: "Enlarge" opens the graph over the whole window and Escape closes it', async ({ page }) => {
  await openGraph(page);
  await page.getByRole('button', { name: /Enlarge/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Context graph (enlarged)' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('link', { name: /Add card \/ Session expired/ })).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box!.width).toBeGreaterThan(page.viewportSize()!.width * 0.9);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('GRF-06: a Jira node opens that work item', async ({ page }) => {
  const graph = await openGraph(page);
  await graph.getByRole('link', { name: /^PAY-100 — / }).click();
  await expect(page).toHaveURL(/#\/item\/PAY-100$/);
  await expect(heading1(page, /^PAY-100/)).toBeVisible();
});
