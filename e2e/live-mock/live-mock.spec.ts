import { expect, test, type APIRequestContext } from '@playwright/test';
import { demoProject } from '../../packages/core/src/index.js';
import { DUMMY_ATLASSIAN_EMAIL } from '../../packages/core/test/mocks/atlassian-mock.js';
import { card, heading1, nav, toast } from '../support/helpers';
import { ATLASSIAN_MOCK_URL } from './env';

// User path: a workspace in Live mode — the real connectors read Jira, Confluence and Figma. Here the sources are the
// local mocks (start-mocks.mts) serving the demo world, so the expected values come from that world, not from the UI.
const world = demoProject();
const JIRA_PROJECT = 'PAY';
const jiraIssues = world.requirements.filter((r) => r.key.startsWith(`${JIRA_PROJECT}-`));
const spaceKeys = [...new Set(world.documents.map((d) => d.space))];
const fileKeys = [...new Set(world.frames.map((f) => f.fileKey))];
const story = jiraIssues.find((r) => r.key === 'PAY-123');

/** Switches the server to Live mode on the mocks, as an admin would on the Settings page. */
async function configureLive(request: APIRequestContext, atlassianEmail = DUMMY_ATLASSIAN_EMAIL) {
  const integrations = {
    jira: { enabled: true, baseUrl: ATLASSIAN_MOCK_URL, email: atlassianEmail, projectKey: JIRA_PROJECT },
    confluence: { enabled: true, baseUrl: ATLASSIAN_MOCK_URL, email: atlassianEmail, spaceKeys },
    figma: { enabled: true, fileKeys },
  };
  await expect(await request.put('/api/settings', { data: { mode: 'live', integrations }, headers: { 'if-match': '*' } })).toBeOK();
}

test.describe('Live mode on API mocks @live-mock', () => {
  test.beforeEach(async ({ request }) => {
    await configureLive(request);
  });

  test('LM-01: "Test connections" reads every source through the real connectors', { tag: '@smoke' }, async ({ page }) => {
    await page.goto('/');
    await nav(page, /Settings/).click();
    const integrations = card(page, 'Integrations');
    await integrations.getByRole('button', { name: 'Test connections' }).click();

    await expect(integrations.getByText(`OK — ${jiraIssues.length} issues`)).toBeVisible();
    await expect(integrations.getByText(`OK — ${world.documents.length} pages`)).toBeVisible();
    await expect(integrations.getByText(`OK — ${world.frames.length} frames`)).toBeVisible();
  });

  test('LM-02: an analysis in Live mode shows Jira issues read from the source', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Analyze now' }).click();
    await expect(toast(page)).toHaveText(/^Analysis complete — \d+ critical, \d+ drift events$/);

    await page.goto('/#/item/PAY-123');
    await expect(heading1(page, `PAY-123 — ${story?.title}`)).toBeVisible();
  });

  test('LM-03: credentials the source rejects are reported, not ignored', async ({ page, request }) => {
    // The mock accepts only the dummy email/token pair, so a different email proves the app sends Basic auth.
    await configureLive(request, 'someone-else@example.test');
    await page.goto('/');
    await nav(page, /Settings/).click();
    const integrations = card(page, 'Integrations');
    await integrations.getByRole('button', { name: 'Test connections' }).click();

    await expect(integrations.getByText(/HTTP 401/)).toBeVisible();
  });
});
