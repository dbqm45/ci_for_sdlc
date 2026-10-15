import { mkdtempSync, rmSync } from 'node:fs';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearFigmaCache, demoProject, type DesignFrame } from '@ci/core';
import { DUMMY_FIGMA_TOKEN, startFigmaMock, type FigmaMock } from '../../core/test/mocks/figma-mock.js';
import { buildApp } from '../src/app.js';
import { putSettings } from './helpers.js';

// Live mode with only Figma enabled, read by the real connector from the local Figma mock.
const ENV = ['FIGMA_TOKEN', 'CI_FIGMA_API_BASE', 'CI_WEBHOOK_SECRET'] as const;
const savedEnv = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));

let dir: string;
let mock: FigmaMock;
let ctx: Awaited<ReturnType<typeof buildApp>>;
let frames: DesignFrame[];

beforeEach(async () => {
  frames = demoProject().frames;
  // The mock reads this array on every request, so changing it is the designer's edit in Figma.
  mock = await startFigmaMock({ frames });
  for (const k of ENV) delete process.env[k];
  Object.assign(process.env, { FIGMA_TOKEN: DUMMY_FIGMA_TOKEN, CI_FIGMA_API_BASE: mock.apiBase });
  dir = mkdtempSync(join(tmpdir(), 'ci-test-figma-webhook-'));
  ctx = await buildApp({ dataDir: dir });
  const fileKeys = [...new Set(frames.map((f) => f.fileKey))];
  const integrations = { jira: { enabled: false }, confluence: { enabled: false }, figma: { enabled: true, fileKeys } };
  expect((await putSettings(ctx.app, { mode: 'live', integrations })).statusCode).toBe(200);
});

afterEach(async () => {
  await ctx.app.close();
  await mock.close();
  clearFigmaCache();
  rmSync(dir, { recursive: true, force: true });
  for (const k of ENV) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

const analyzedFrameIds = () => ctx.engine.state.context?.frames.map((f) => f.id) ?? [];

describe('Figma webhook', () => {
  it('FW-01: the analysis started by a Figma webhook reads the file fresh, not from the connector cache', async () => {
    await ctx.app.inject({ method: 'POST', url: '/api/analyze' });
    expect(analyzedFrameIds()).toContain('1:4');

    // DEMO_SCENARIOS "figma-remove-error": the designer deletes the "Add card / Error" frame.
    frames.splice(frames.findIndex((f) => f.id === '1:4'), 1);
    const requestsBefore = mock.requests.length;
    await ctx.app.inject({ method: 'POST', url: '/api/analyze' });
    // A manual analysis within the cache TTL still sees the old file: the cache protects the rate limits.
    expect(mock.requests.length).toBe(requestsBefore);
    expect(analyzedFrameIds()).toContain('1:4');

    const analysis = once(ctx.engine, 'analysis');
    const res = await ctx.app.inject({ method: 'POST', url: '/api/webhooks/figma', payload: { event_type: 'FILE_UPDATE' } });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ accepted: true });
    const [event] = (await analysis) as [{ reason: string }];
    expect(event.reason).toBe('figma change');
    expect(mock.requests.length).toBeGreaterThan(requestsBefore);
    expect(analyzedFrameIds()).not.toContain('1:4');
  });

  it('FW-02: a webhook naming a file clears only that file, so other files stay cached', async () => {
    await ctx.app.inject({ method: 'POST', url: '/api/analyze' });
    const requestsBefore = mock.requests.length;
    const analysis = once(ctx.engine, 'analysis');
    await ctx.app.inject({ method: 'POST', url: '/api/webhooks/figma', payload: { event_type: 'FILE_UPDATE', file_key: 'NOT-WATCHED' } });
    await analysis;
    expect(mock.requests.length).toBe(requestsBefore);
  });
});
