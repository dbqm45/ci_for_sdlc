import { expect, type APIRequestContext, type Page } from '@playwright/test';

// Expected values come from the built-in demo workspace ("Checkout"): 4 epics, 10 stories and 1 bug,
// 4 critical / 4 need attention / 3 healthy. Key items:
//   PAY-123 "Save payment method"  — ready story, one open finding (Figma missing empty state)
//   CHK-201                        — not ready: conflicting order timeout 45 s vs 30 s
//   CHK-204                        — ready story, one open finding (session expiry behavior undefined)
//   ACC-300 "Customer Profile"     — epic with one story, ACC-301

/** Items whose approval a test may change. */
const APPROVABLE = ['PAY-123', 'CHK-201', 'CHK-204', 'PAY-125'];

/**
 * Brings the shared server back to the pristine demo workspace. A demo reset alone keeps approvals,
 * decisions and settings, so those are undone first. History (audit, drift log, withdrawn decisions)
 * is append-only — assertions on it look for the newest matching entry.
 */
export async function resetWorkspace(request: APIRequestContext) {
  const decisions = (await (await request.get('/api/decisions')).json()) as { id: string; status: string }[];
  for (const d of decisions.filter((x) => x.status === 'active')) {
    await expect(await request.delete(`/api/decisions/${encodeURIComponent(d.id)}`, { data: { by: 'e2e' } })).toBeOK();
  }
  for (const key of APPROVABLE) await expect(await request.delete(`/api/items/${key}/approve`)).toBeOK();

  const res = await request.get('/api/settings');
  const { settings } = (await res.json()) as { settings: { policy: { disabledRules: string[] } } };
  if (settings.policy.disabledRules.length > 0) {
    await expect(await request.put('/api/settings', { data: { policy: { disabledRules: [] } }, headers: { 'if-match': res.headers().etag ?? '' } })).toBeOK();
  }
  await expect(await request.post('/api/demo/reset')).toBeOK();
}

/** Disables a policy rule through the API, as another user would. `resetWorkspace` enables it again. */
export async function disableRuleViaApi(request: APIRequestContext, ruleId: string) {
  const res = await request.get('/api/settings');
  await expect(await request.put('/api/settings', { data: { policy: { disabledRules: [ruleId] } }, headers: { 'if-match': res.headers().etag ?? '' } })).toBeOK();
}

export async function approveViaApi(request: APIRequestContext, key: string) {
  await expect(await request.post(`/api/items/${key}/approve`, { data: { by: 'e2e' } })).toBeOK();
}

export async function applyScenarioViaApi(request: APIRequestContext, id: 'timeout-change' | 'figma-remove-error' | 'story-card-limit' | 'api-idempotency' | 'release-planning') {
  await expect(await request.post(`/api/demo/scenarios/${id}`)).toBeOK();
}

interface Question { id: string; text: string; topic: string }
interface ItemFinding { id: string; title: string; status: string; question?: Question }

/** Answers the open question of a finding, as a product owner would on the item page. */
export async function decideViaApi(request: APIRequestContext, itemKey: string, findingTitle: string, answer: string) {
  const { item } = (await (await request.get(`/api/items/${itemKey}`)).json()) as { item: { findings: ItemFinding[] } };
  const f = item.findings.find((x) => x.title === findingTitle && x.status === 'open' && x.question);
  if (!f?.question) throw new Error(`${itemKey} has no open question for "${findingTitle}"`);
  const q = f.question;
  await expect(
    await request.post('/api/decisions', {
      data: { questionId: q.id, findingId: f.id, itemKey, topic: q.topic, question: q.text, answer, decidedBy: 'e2e', effect: 'resolve' },
    }),
  ).toBeOK();
}

export const nav = (page: Page, name: string | RegExp) => page.getByRole('complementary').getByRole('link', { name });
export const toast = (page: Page) => page.getByRole('status');
export const heading1 = (page: Page, name: string | RegExp) => page.getByRole('heading', { level: 1, name });
/** A titled card (`<section>` with an `<h2>`). */
export const card = (page: Page, title: string | RegExp) => page.locator('section').filter({ has: page.getByRole('heading', { level: 2, name: title }) });
