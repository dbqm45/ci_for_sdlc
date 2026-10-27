import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { DEMO_SCENARIOS, demoProject, fetchConfluence } from '../src/index.js';
import { DUMMY_ATLASSIAN_EMAIL, DUMMY_ATLASSIAN_TOKEN, startAtlassianMock, type AtlassianMock } from './mocks/atlassian-mock.js';
import { DUMMY_WEBHOOK_SECRET, scenarioSource, startSandboxControl, type SandboxControl, type SandboxMutation } from './mocks/sandbox-control.js';

// Section 6.3: a scenario changes the world the mocks serve and the control endpoint notifies the app by webhook.
// The app is replaced by a receiver that records webhooks and answers like /api/webhooks/:source does.
let control: SandboxControl | undefined;
let atlassian: AtlassianMock | undefined;
let receiver: Server | undefined;

afterEach(async () => {
  await control?.close();
  await atlassian?.close();
  await new Promise((resolve) => (receiver ? receiver.close(resolve) : resolve(undefined)));
  control = atlassian = receiver = undefined;
});

async function startReceiver(status = 202) {
  const hooks: { path: string; headers: IncomingHttpHeaders }[] = [];
  receiver = createServer((req, res) => {
    hooks.push({ path: req.url ?? '', headers: req.headers });
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ accepted: status === 202 }));
  });
  await new Promise<void>((resolve) => receiver!.listen(0, '127.0.0.1', resolve));
  return { base: `http://127.0.0.1:${(receiver.address() as AddressInfo).port}`, hooks };
}

const mutate = (id: string) => fetch(`${control!.url}/__sandbox/mutate/${id}`, { method: 'POST' });

describe('sandbox control endpoint', () => {
  it('SC-01: every demo scenario names the one source it changes', () => {
    expect(DEMO_SCENARIOS.map((s) => [s.id, scenarioSource(s.title)])).toEqual([
      ['timeout-change', 'confluence'],
      ['figma-remove-error', 'figma'],
      ['story-card-limit', 'jira'],
      ['backlog-intake', 'jira'],
      ['api-idempotency', 'confluence'],
      ['answers-in-sources', 'confluence'],
      ['release-planning', 'jira'],
    ]);
  });

  it('SC-02: a scenario changes what the mock serves and sends the webhook with the test secret', async () => {
    const world = demoProject();
    const app = await startReceiver();
    atlassian = await startAtlassianMock({ get requirements() { return world.requirements; }, get documents() { return world.documents; } });
    control = await startSandboxControl({ world, webhookBase: app.base });
    const read = async () => {
      const docs = await fetchConfluence({ baseUrl: atlassian!.baseUrl, email: DUMMY_ATLASSIAN_EMAIL, apiToken: DUMMY_ATLASSIAN_TOKEN, spaceKeys: ['PAY'] });
      return docs.find((d) => d.id === '1001')?.body ?? '';
    };
    // Expected text from DEMO_SCENARIOS "timeout-change": 30 seconds → 60 seconds.
    expect(await read()).toContain('timeout is 30 seconds');

    const res = await mutate('timeout-change');
    expect(res.status).toBe(200);
    expect((await res.json()) as SandboxMutation).toEqual({ scenario: 'timeout-change', source: 'confluence', webhook: { status: 202, body: { accepted: true } } });
    expect(app.hooks.map((h) => [h.path, h.headers['x-ci-webhook-secret']])).toEqual([['/api/webhooks/confluence', DUMMY_WEBHOOK_SECRET]]);
    expect(await read()).toContain('timeout is 60 seconds');

    expect((await fetch(`${control.url}/__sandbox/reset`, { method: 'POST' })).status).toBe(204);
    expect(await read()).toContain('timeout is 30 seconds');
  });

  it('SC-03: the app\'s answer to the webhook is passed back, so a rejected secret is visible to the test', async () => {
    const app = await startReceiver(401);
    control = await startSandboxControl({ world: demoProject(), webhookBase: app.base });
    expect(((await (await mutate('story-card-limit')).json()) as SandboxMutation).webhook.status).toBe(401);
  });

  it('SC-04: an unknown scenario gets 404 and sends no webhook', async () => {
    const app = await startReceiver();
    control = await startSandboxControl({ world: demoProject(), webhookBase: app.base });
    expect((await mutate('no-such-scenario')).status).toBe(404);
    expect(app.hooks).toEqual([]);
  });
});
