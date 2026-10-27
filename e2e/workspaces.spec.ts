import { expect, test } from '@playwright/test';

// F5 (docs/WORKSPACES-F5-PLAN.md): a second workspace has its own settings and analysis; the address names it.
// (In demo mode the header shows the demo project's name in every workspace, so the settings tell them apart.)

test('WSE-01: another workspace shows its own settings; links stay in it; switching back shows default\'s', async ({ page, request }) => {
  const id = `e2e-${Date.now().toString(36)}`;
  expect((await request.post('/api/workspaces', { data: { id, name: 'Mobile app' } })).status()).toBe(201);
  const etag = (await request.get(`/api/w/${id}/settings`)).headers().etag!;
  expect((await request.put(`/api/w/${id}/settings`, { data: { project: { key: 'APP', name: 'Mobile' } }, headers: { 'if-match': etag } })).ok()).toBe(true);

  await page.goto(`/#/w/${id}/settings`);
  const header = page.getByRole('banner');
  await expect(header.getByRole('combobox', { name: 'Workspace' })).toHaveValue(id);
  await expect(page.getByLabel('Project name')).toHaveValue('Mobile');

  // A link inside the page keeps the workspace in the address.
  await page.getByRole('link', { name: /Decisions/ }).click();
  await expect(page).toHaveURL(new RegExp(`#/w/${id}/decisions$`));

  await header.getByRole('combobox', { name: 'Workspace' }).selectOption('default');
  await expect(page).toHaveURL(/#\/overview$/);
  await page.getByRole('link', { name: /Settings/ }).click();
  await expect(page).toHaveURL(/#\/settings$/);
  await expect(page.getByLabel('Project name')).toHaveValue('Checkout');
});
