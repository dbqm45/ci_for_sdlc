import { expect, test, type APIRequestContext } from '@playwright/test';
import { demoProject } from '../../packages/core/src/index.js';
import { mockReview } from '../../packages/core/test/mocks/ai-mock.js';
import { DUMMY_ATLASSIAN_EMAIL } from '../../packages/core/test/mocks/atlassian-mock.js';
import { DUMMY_WEBHOOK_SECRET, type SandboxMutation } from '../../packages/core/test/mocks/sandbox-control.js';
import { approveViaApi, card, heading1, nav, toast } from '../support/helpers';
import { AI_MOCK_API_BASE, ATLASSIAN_MOCK_URL, SANDBOX_CONTROL_URL } from './env';

// User path: a workspace in Live mode — the real connectors read Jira, Confluence and Figma, and an OpenAI-compatible
// endpoint reviews items. Here those are the local mocks (start-mocks.mts) serving the demo world and a deterministic
// review, so the expected values come from that world and mockReview, not from the UI.
const world = demoProject();
const JIRA_PROJECT = 'PAY';
const jiraIssues = world.requirements.filter((r) => r.key.startsWith(`${JIRA_PROJECT}-`));
const spaceKeys = [...new Set(world.documents.map((d) => d.space))];
const fileKeys = [...new Set(world.frames.map((f) => f.fileKey))];
const story = jiraIssues.find((r) => r.key === 'PAY-123');

/** AI off, as on a fresh workspace; LM-04 points the `custom` provider at the AI mock. */
const AI_OFF = { provider: 'none' };
const AI_MOCK = { provider: 'custom', model: 'mock-model', baseUrl: AI_MOCK_API_BASE, runOn: 'on_demand' };

/** Switches the server to Live mode on the mocks, as an admin would on the Settings page. */
async function configureLive(request: APIRequestContext, atlassianEmail = DUMMY_ATLASSIAN_EMAIL, ai: Record<string, unknown> = AI_OFF) {
  const integrations = {
    jira: { enabled: true, baseUrl: ATLASSIAN_MOCK_URL, email: atlassianEmail, projectKey: JIRA_PROJECT },
    confluence: { enabled: true, baseUrl: ATLASSIAN_MOCK_URL, email: atlassianEmail, spaceKeys },
    figma: { enabled: true, fileKeys },
  };
  await expect(await request.put('/api/settings', { data: { mode: 'live', integrations, ai }, headers: { 'if-match': '*' } })).toBeOK();
}

test.describe('Live mode on API mocks @live-mock', () => {
  test.beforeEach(async ({ request }) => {
    // Undo change scenarios of earlier tests: the mocks serve the demo world again.
    await expect(await request.post(`${SANDBOX_CONTROL_URL}/__sandbox/reset`)).toBeOK();
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

  test('LM-04: "AI review" on the custom provider adds the reviewer\'s finding with its evidence', async ({ page, request }) => {
    await configureLive(request, DUMMY_ATLASSIAN_EMAIL, AI_MOCK);
    // The item page reads the provider from the latest analysis; on demand, this one does not call the model yet.
    await expect(await request.post('/api/analyze')).toBeOK();
    // The mock's review depends only on the item key and the first source, so the prompt header is enough here.
    const [finding] = mockReview('Work item: PAY-123 (story)').findings;
    await page.goto('/#/item/PAY-123');
    await expect(heading1(page, `PAY-123 — ${story?.title}`)).toBeVisible();
    await expect(page.getByText(finding!.title)).toHaveCount(0);

    await page.getByRole('button', { name: /AI review/ }).click();
    const dialog = page.getByRole('dialog', { name: 'AI review of PAY-123' });
    await dialog.getByRole('button', { name: 'Run AI review' }).click();
    await expect(dialog.getByText('AI review complete.')).toBeVisible();
    await expect(dialog.getByText(/new AI finding/)).toContainText('1 new AI finding added · 1 AI finding on PAY-123 in total.');

    await page.reload();
    const aiBadge = page.getByTitle('Found by the semantic AI reviewer — backed by cited evidence');
    const findingCard = page.locator('div').filter({ has: aiBadge }).filter({ hasText: finding!.title }).last();
    await expect(findingCard).toContainText(finding!.explanation);
    // The evidence is the first source (the Jira issue), quoted by its first line.
    await findingCard.getByRole('button', { name: 'WHY? — 1 source' }).click();
    await expect(findingCard).toContainText(`Type: ${story?.type}`);
  });

  test('LM-05: a Confluence change announced by webhook is analysed, streamed and shown as drift', async ({ page, request }) => {
    // Baseline read from the mocks, then PAY-123 approved — the change below must be reported against it.
    await expect(await request.post('/api/analyze')).toBeOK();
    await approveViaApi(request, 'PAY-123');
    await page.goto('/#/drift');
    // Listen to live updates (SSE) the way the UI does, before the change happens.
    await page.evaluate(
      () =>
        new Promise<void>((opened) => {
          const events = new EventSource('/api/events');
          (window as unknown as { nextAnalysis: Promise<unknown> }).nextAnalysis = new Promise((resolve) =>
            events.addEventListener('analysis', (e) => {
              events.close();
              resolve(JSON.parse((e as MessageEvent<string>).data));
            }),
          );
          events.addEventListener('open', () => opened());
        }),
    );

    // DEMO_SCENARIOS "timeout-change": Confluence pages now say 60 seconds; the mock sends the Confluence webhook.
    const res = await request.post(`${SANDBOX_CONTROL_URL}/__sandbox/mutate/timeout-change`);
    await expect(res).toBeOK();
    expect((await res.json()) as SandboxMutation).toEqual({ scenario: 'timeout-change', source: 'confluence', webhook: { status: 202, body: { accepted: true } } });

    const analysis = (await page.evaluate(() => (window as unknown as { nextAnalysis: Promise<unknown> }).nextAnalysis)) as { reason: string; drift: number };
    expect(analysis.reason).toBe('confluence change');
    expect(analysis.drift).toBeGreaterThan(0);

    await page.reload();
    const row = card(page, 'Change log').getByRole('row').filter({ hasText: 'PAY-123 regressed: READY → NOT READY' }).first();
    await expect(row.getByText('DRIFT DETECTED')).toBeVisible();
    const audit = (await (await request.get('/api/audit')).json()) as { kind: string; actor: string; summary: string }[];
    expect(audit.filter((a) => a.kind === 'webhook').at(-1)).toMatchObject({ actor: 'confluence', summary: 'Change notification from confluence' });
  });

  test('LM-06: a webhook without the shared secret is rejected and starts no analysis', async ({ request }) => {
    const before = ((await (await request.get('/api/history')).json()) as unknown[]).length;
    for (const headers of [{} as Record<string, string>, { 'x-ci-webhook-secret': `${DUMMY_WEBHOOK_SECRET}-x` }]) {
      expect((await request.post('/api/webhooks/confluence', { headers })).status()).toBe(401);
    }
    expect(((await (await request.get('/api/history')).json()) as unknown[]).length).toBe(before);
  });
});
