import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { DEMO_SCENARIOS, demoProject, type ProjectContext } from '../../src/index.js';

/**
 * Sandbox control endpoint for the mocks (test data generator, stage E2, section 6.3). A test changes the world the
 * Atlassian and Figma mocks serve with a change scenario, and the control endpoint then notifies the app the way the
 * real source would: a webhook on /api/webhooks/<source> with the test webhook secret. Listens on 127.0.0.1 only; the
 * endpoints exist only here, never in the app.
 */
export interface SandboxControlOptions {
  /** The world the mocks serve; scenarios change it in place, reset restores the demo world. */
  world: ProjectContext;
  /** App base URL that receives the webhooks, e.g. http://127.0.0.1:4398. */
  webhookBase: string;
  /** Sent as x-ci-webhook-secret; the app compares it with CI_WEBHOOK_SECRET. */
  webhookSecret?: string;
  /** Fixed port (e2e web servers need a known URL); 0 or unset picks a free one. */
  port?: number;
}

export interface SandboxMutation {
  scenario: string;
  source: WebhookSource;
  /** What the app answered to the webhook. */
  webhook: { status: number; body: unknown };
}

export interface SandboxControl {
  /** Base URL of the control endpoints (POST /__sandbox/mutate/<scenario>, POST /__sandbox/reset). */
  url: string;
  close(): Promise<void>;
}

export type WebhookSource = 'jira' | 'confluence' | 'figma';

export const DUMMY_WEBHOOK_SECRET = 'dummy-webhook-secret';

/** The source a scenario changes, from its title ("Confluence: …"); every demo scenario changes exactly one. */
export function scenarioSource(title: string): WebhookSource {
  const source = /^(Jira|Confluence|Figma):/.exec(title)?.[1]?.toLowerCase();
  if (!source) throw new Error(`Scenario "${title}" does not name its source`);
  return source as WebhookSource;
}

export async function startSandboxControl(opts: SandboxControlOptions): Promise<SandboxControl> {
  const secret = opts.webhookSecret ?? DUMMY_WEBHOOK_SECRET;

  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const send = (status: number, body?: unknown) => {
      res.writeHead(status, body === undefined ? {} : { 'content-type': 'application/json' });
      res.end(body === undefined ? undefined : JSON.stringify(body));
    };
    if (req.method !== 'POST') return send(405, { error: 'Method not allowed' });
    if (url.pathname === '/__sandbox/reset') {
      Object.assign(opts.world, demoProject());
      return send(204);
    }
    const id = /^\/__sandbox\/mutate\/([^/]+)$/.exec(url.pathname)?.[1];
    const scenario = DEMO_SCENARIOS.find((s) => s.id === decodeURIComponent(id ?? ''));
    if (!scenario) return send(404, { error: `No scenario ${id ?? url.pathname}` });

    scenario.apply(opts.world);
    const source = scenarioSource(scenario.title);
    fetch(`${opts.webhookBase}/api/webhooks/${source}`, { method: 'POST', headers: { 'x-ci-webhook-secret': secret } })
      .then(async (r) => send(200, { scenario: scenario.id, source, webhook: { status: r.status, body: await r.json().catch(() => null) } } satisfies SandboxMutation))
      .catch((e: unknown) => send(502, { error: `Webhook failed: ${e instanceof Error ? e.message : String(e)}` }));
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(opts.port ?? 0, '127.0.0.1', resolve);
  });
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}
