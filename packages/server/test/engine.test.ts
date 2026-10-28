import { mkdtempSync, rmSync } from 'node:fs';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Engine } from '../src/engine.js';
import { DEFAULT_SETTINGS, Store, type Settings } from '../src/store.js';

let dir: string;
let store: Store;
let engine: Engine;

const ENV = ['JIRA_API_TOKEN', 'CONFLUENCE_API_TOKEN', 'FIGMA_TOKEN', 'CUSTOM_AI_API_KEY', 'CI_DISABLE_SCHEDULE'] as const;
const savedEnv = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'ci-engine-'));
  store = new Store(dir);
  await store.init();
  engine = new Engine(store);
  for (const k of ENV) delete process.env[k];
});

afterEach(() => {
  engine.stop();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  rmSync(dir, { recursive: true, force: true });
  for (const k of ENV) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

const settings = (patch: (s: Settings) => void) => {
  const s = structuredClone(DEFAULT_SETTINGS);
  patch(s);
  return s;
};

const liveSettings = settings((s) => {
  s.mode = 'live';
  s.integrations.jira = { enabled: true, baseUrl: 'https://acme.atlassian.net', email: 'bot@acme.test', projectKey: 'PAY' };
  s.integrations.confluence = { enabled: true, baseUrl: 'https://acme.atlassian.net', email: 'bot@acme.test', spaceKeys: ['ARCH'] };
  s.integrations.figma = { enabled: true, fileKeys: ['F1'] };
});

/** Fake for the network port: every request is recorded and answered by the first route whose text occurs in the URL. */
function fakeFetch(routes: [string, unknown][]) {
  const calls: { url: string; headers: Headers }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, headers: new Headers(init?.headers) });
      const route = routes.find(([m]) => url.includes(m));
      return route ? new Response(JSON.stringify(route[1]), { status: 200, headers: { 'content-type': 'application/json' } }) : new Response('not found', { status: 404 });
    }),
  );
  return calls;
}

const basic = (token: string) => `Basic ${Buffer.from(`bot@acme.test:${token}`).toString('base64')}`;

describe('Engine.loadContext (live mode)', () => {
  it.each([
    { id: 'EN-01', env: {}, missing: 'JIRA_API_TOKEN' },
    { id: 'EN-02', env: { JIRA_API_TOKEN: 'j' }, missing: 'FIGMA_TOKEN' },
  ])('$id: fails fast when $missing is not set', async ({ env, missing }) => {
    Object.assign(process.env, env);
    fakeFetch([]);
    await expect(engine.loadContext(liveSettings)).rejects.toThrow(`Missing environment variable ${missing}`);
  });

  it('EN-03: reads all enabled sources, using the Jira token for Confluence when no Confluence token is set', async () => {
    Object.assign(process.env, { JIRA_API_TOKEN: 'jira-tok', FIGMA_TOKEN: 'figma-tok' });
    const calls = fakeFetch([
      ['/search/jql', { issues: [{ key: 'PAY-1', fields: { summary: 'Pay', issuetype: { name: 'Story' } } }] }],
      ['/spaces?keys=ARCH', { results: [{ id: 1 }] }],
      ['/spaces/1/pages', { results: [{ id: 10, title: 'Doc' }] }],
      ['/files/F1/components', { meta: { components: [] } }],
      ['api.figma.com', { name: 'Design', lastModified: '2026-01-01', document: { type: 'DOCUMENT', children: [] } }],
    ]);
    const ctx = await engine.loadContext(liveSettings);
    expect(ctx.project).toEqual(liveSettings.project);
    expect(ctx.requirements.map((r) => r.key)).toEqual(['PAY-1']);
    expect(ctx.documents.map((d) => d.title)).toEqual(['Doc']);
    expect(calls.find((c) => c.url.includes('/wiki/'))?.headers.get('authorization')).toBe(basic('jira-tok'));
    expect(calls.find((c) => c.url.includes('api.figma.com'))?.headers.get('x-figma-token')).toBe('figma-tok');
  });

  it('EN-04: prefers CONFLUENCE_API_TOKEN for Confluence and skips disabled sources', async () => {
    Object.assign(process.env, { CONFLUENCE_API_TOKEN: 'conf-tok' });
    const calls = fakeFetch([['/spaces?keys=ARCH', { results: [] }]]);
    const onlyConfluence = settings((s) => {
      s.mode = 'live';
      s.integrations.confluence = liveSettings.integrations.confluence;
    });
    const ctx = await engine.loadContext(onlyConfluence);
    expect(ctx.requirements).toEqual([]);
    expect(calls.map((c) => c.headers.get('authorization'))).toEqual([basic('conf-tok')]);
  });
});

describe('Engine.analyze', () => {
  it('EN-05: records the error and emits a status event when loading the context fails', async () => {
    await store.saveSettings(liveSettings);
    const statuses: unknown[] = [];
    engine.on('status', (s) => statuses.push(s));
    await expect(engine.analyze('manual')).rejects.toThrow('Missing environment variable JIRA_API_TOKEN');
    expect(engine.state).toMatchObject({ running: false, lastError: 'Missing environment variable JIRA_API_TOKEN' });
    expect(statuses).toEqual([
      { running: true, reason: 'manual' },
      { running: false, error: 'Missing environment variable JIRA_API_TOKEN' },
    ]);
  });

  const aiReply = {
    choices: [{ message: { content: JSON.stringify({ findings: [], challenges: [{ question: 'What if the bank times out?', rationale: 'r', options: ['Retry'], topic: 'timeouts' }] }) } }],
    usage: { prompt_tokens: 1200, completion_tokens: 80 },
  };
  const withAi = (recordEvidenceSources: boolean) =>
    settings((s) => {
      s.ai = { ...s.ai, provider: 'custom', model: 'local', baseUrl: 'http://llm.local/v1' };
      s.security.recordEvidenceSources = recordEvidenceSources;
    });

  it.each([
    { id: 'EN-06', recordEvidenceSources: true, detailKeys: expect.arrayContaining(['itemKey', 'inputHash', 'provider']) },
    // Telemetry is numbers, not source content: it stays when evidence sources are not recorded.
    { id: 'EN-07', recordEvidenceSources: false, detailKeys: ['inputHash', 'latencyMs', 'usage'] },
  ])('$id: on-demand AI reviews only the requested item, audits it and saves the cache (evidence sources: $recordEvidenceSources)', async ({ recordEvidenceSources, detailKeys }) => {
    process.env.CUSTOM_AI_API_KEY = 'llm-key';
    await store.saveSettings(withAi(recordEvidenceSources));
    const calls = fakeFetch([['llm.local', aiReply]]);

    const result = await engine.analyze('manual', { aiKeys: ['PAY-125'] });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.headers.get('authorization')).toBe('Bearer llm-key');
    expect(result.items.find((i) => i.key === 'PAY-125')?.challenges.some((c) => c.origin === 'ai')).toBe(true);
    const aiAudits = (await store.auditLog()).filter((a) => a.kind === 'ai_call');
    expect(aiAudits).toHaveLength(1);
    expect(aiAudits[0]).toMatchObject({ actor: 'custom/local', summary: 'AI reviewed PAY-125: 0 findings (0 discarded without evidence), 1 questions; 1200 input / 80 output tokens' });
    expect(Object.keys(aiAudits[0]?.details as object)).toEqual(detailKeys);
    expect((await store.aiCache()).size).toBe(1);
  });

  it('EN-08: a cached AI answer is reused without a new call or audit entry', async () => {
    await store.saveSettings(withAi(true));
    const calls = fakeFetch([['llm.local', aiReply]]);
    await engine.analyze('first', { aiKeys: ['PAY-125'] });
    await engine.analyze('second', { aiKeys: ['PAY-125'] });
    expect(calls).toHaveLength(1);
    expect((await store.auditLog()).filter((a) => a.kind === 'ai_call')).toHaveLength(1);
  });

  it('EN-17: the AI usage summary counts the audited calls per provider and model', async () => {
    await store.saveSettings(withAi(false));
    fakeFetch([['llm.local', aiReply]]);
    await engine.analyze('manual', { aiKeys: ['PAY-125'] });
    const [row] = await store.aiUsage();
    expect(row).toMatchObject({ provider: 'custom', model: 'local', calls: 1, errors: 0, inputTokens: 1200, outputTokens: 80, costUsd: 0, unpricedCalls: 1 });
    expect(row?.latencyP50Ms).toBeGreaterThanOrEqual(0);
  });

  it('EN-09: a failed AI call is audited as a failure and does not fail the analysis', async () => {
    await store.saveSettings(withAi(true));
    fakeFetch([]);
    await engine.analyze('manual', { aiKeys: ['PAY-125'] });
    const [audit] = (await store.auditLog()).filter((a) => a.kind === 'ai_call');
    expect(audit?.summary).toMatch(/^AI review of PAY-125 failed: custom request failed: HTTP 404/);
  });
});

describe('Engine scheduling and demo', () => {
  it.each([
    { id: 'EN-10', schedule: { mode: 'interval' as const, intervalMinutes: 2 }, minutes: 2 },
    { id: 'EN-12', schedule: { mode: 'continuous' as const, intervalMinutes: 30 }, minutes: 5 },
  ])('$id: $schedule.mode every $schedule.intervalMinutes min runs an analysis after $minutes min', async ({ schedule, minutes }) => {
    await store.saveSettings(settings((s) => void Object.assign(s.schedule, schedule)));
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    await engine.reschedule();
    const reasons: string[] = [];
    engine.on('status', (s: { reason?: string }) => s.reason && reasons.push(s.reason));

    vi.advanceTimersByTime(minutes * 60_000 - 1);
    expect(reasons).toEqual([]);
    const done = once(engine, 'analysis');
    vi.advanceTimersByTime(1);
    await done;
    expect(reasons).toEqual([`scheduled (${minutes} min)`]);
  });

  it('EN-13: on-demand mode clears a previously scheduled run', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    await store.saveSettings(settings((s) => void (s.schedule.mode = 'continuous')));
    await engine.reschedule();
    await store.saveSettings(settings((s) => void (s.schedule.mode = 'on_demand')));
    await engine.reschedule();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('EN-14: CI_DISABLE_SCHEDULE disables automatic runs regardless of saved schedule mode', async () => {
    process.env.CI_DISABLE_SCHEDULE = 'true';
    await store.saveSettings(settings((s) => void (s.schedule.mode = 'continuous')));
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    await engine.reschedule();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('EN-15: resetDemo discards the modified demo workspace', async () => {
    await engine.applyDemoScenario('timeout-change');
    expect(await store.demoContext()).not.toBeNull();
    await engine.resetDemo();
    expect(await store.demoContext()).toBeNull();
  });

  it('EN-16: an unknown demo scenario is rejected', async () => {
    await expect(engine.applyDemoScenario('nope')).rejects.toThrow('Unknown scenario nope');
  });
});
