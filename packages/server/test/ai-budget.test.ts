import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SemanticAnalyzer, SemanticOutput } from '@ci/core';
import { AiBudget, AiBudgetExceededError, aiPlatformFrom, budgeted, effectiveAi, pricesFrom, type AiPlatformConfig } from '../src/ai-budget.js';
import { buildApp } from '../src/app.js';
import { FileBackend } from '../src/backend.js';
import { ADA, browser, fakeAtlassian, login, startAccounts } from './accounts-helpers.js';

/** T4 (docs/AI-PLATFORM.md): the platform's AI, and a monthly limit per workspace that the operator can change. */
const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'ci-ai-budget-'));
  dirs.push(d);
  return d;
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('the platform AI from the environment', () => {
  it('AIP-01: none without CI_AI_PROVIDER (each workspace chooses), and a limit alone is refused', () => {
    expect(aiPlatformFrom({})).toBeUndefined();
    expect(() => aiPlatformFrom({ CI_AI_MONTHLY_LIMIT_USD: '50' })).toThrow(/needs CI_AI_PROVIDER/);
  });

  it('AIP-02: Bedrock in the EU with the default limit of $50', () => {
    expect(aiPlatformFrom({ CI_AI_PROVIDER: 'bedrock', CI_AI_MODEL: 'eu.anthropic.claude-sonnet-5-5-v1:0', CI_AI_REGION: 'eu-central-1', CI_AI_EFFORT: 'medium' })).toEqual({
      provider: { provider: 'bedrock', model: 'eu.anthropic.claude-sonnet-5-5-v1:0', region: 'eu-central-1', effort: 'medium' },
      defaultLimitUsd: 50,
      prices: {},
    });
    expect(aiPlatformFrom({ CI_AI_PROVIDER: 'bedrock', CI_AI_MODEL: 'm', CI_AI_MONTHLY_LIMIT_USD: '120.5' })?.defaultLimitUsd).toBe(120.5);
  });

  it.each([
    [{ CI_AI_PROVIDER: 'none', CI_AI_MODEL: 'm' }, /CI_AI_PROVIDER must be one of/],
    [{ CI_AI_PROVIDER: 'gemini', CI_AI_MODEL: 'm' }, /CI_AI_PROVIDER must be one of/],
    [{ CI_AI_PROVIDER: 'bedrock' }, /Set CI_AI_MODEL/],
    [{ CI_AI_PROVIDER: 'bedrock', CI_AI_MODEL: 'm', CI_AI_EFFORT: 'huge' }, /CI_AI_EFFORT/],
    [{ CI_AI_PROVIDER: 'bedrock', CI_AI_MODEL: 'm', CI_AI_MONTHLY_LIMIT_USD: '-1' }, /CI_AI_MONTHLY_LIMIT_USD must be/],
    [{ CI_AI_PROVIDER: 'bedrock', CI_AI_MODEL: 'm', CI_AI_MONTHLY_LIMIT_USD: 'fifty' }, /CI_AI_MONTHLY_LIMIT_USD must be/],
  ])('AIP-03: %j is refused at start', (env, error) => {
    expect(() => aiPlatformFrom(env)).toThrow(error);
  });

  it('AIP-04: rates from CI_AI_PRICES are checked', () => {
    const p = { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 };
    expect(pricesFrom(JSON.stringify({ 'custom/model-x': p }))).toEqual({ 'custom/model-x': p });
    expect(() => pricesFrom('{')).toThrow(/must be JSON/);
    expect(() => pricesFrom('[]')).toThrow(/an object/);
    expect(() => pricesFrom(JSON.stringify({ modelonly: p }))).toThrow(/is not "provider\/model"/);
    expect(() => pricesFrom(JSON.stringify({ 'custom/m': { input: 1 } }))).toThrow(/needs input, output/);
  });

  it("AIP-05: the platform's provider replaces the workspace's; when the AI runs stays the workspace's", () => {
    const platform: AiPlatformConfig = { provider: { provider: 'bedrock', model: 'eu.anthropic.claude-sonnet-5-5-v1:0', region: 'eu-central-1' }, defaultLimitUsd: 50, prices: {} };
    const own = { provider: 'custom' as const, model: 'mine', baseUrl: 'https://attacker.example', temperature: 0.9, effort: 'max' as const, runOn: 'every_analysis' as const };
    expect(effectiveAi(own, platform)).toEqual({ provider: 'bedrock', model: 'eu.anthropic.claude-sonnet-5-5-v1:0', region: 'eu-central-1', effort: 'max', runOn: 'every_analysis' });
    expect(effectiveAi(own, undefined)).toBe(own);
  });
});

describe('the monthly limit', () => {
  const at = (iso: string) => new Date(iso);

  it('AIB-01: spend per workspace and UTC month; reaching the limit stops; a new month starts again', async () => {
    const backend = new FileBackend(tmp());
    const b = new AiBudget(backend, 1);
    await b.init();
    await b.record('team-a', 0.6, at('2026-11-09T10:00:00Z'));
    expect(b.status('team-a', at('2026-11-09T10:00:00Z'))).toMatchObject({ month: '2026-11', limitUsd: 1, custom: false, spentUsd: 0.6, calls: 1, exhausted: false });
    await b.record('team-a', 0.5, at('2026-11-30T23:59:00Z'));
    await b.record('team-a', undefined, at('2026-11-30T23:59:30Z'));
    expect(b.status('team-a', at('2026-11-30T23:59:59Z'))).toMatchObject({ spentUsd: 1.1, calls: 3, unpricedCalls: 1, exhausted: true });
    expect(b.status('team-b', at('2026-11-30T23:59:59Z')).exhausted).toBe(false);
    expect(b.status('team-a', at('2026-12-01T00:00:00Z'))).toMatchObject({ month: '2026-12', spentUsd: 0, exhausted: false });

    // Kept in `_platform` and read back after a restart.
    const again = new AiBudget(backend, 1);
    await again.init();
    expect(again.status('team-a', at('2026-11-15T00:00:00Z')).spentUsd).toBe(1.1);
  });

  it("AIB-02: the operator's limit for one workspace: a number, none, or back to the default", async () => {
    const b = new AiBudget(new FileBackend(tmp()), 50);
    await b.init();
    await b.record('team-a', 60);
    expect(b.status('team-a').exhausted).toBe(true);
    await b.setLimit('team-a', 100);
    expect(b.status('team-a')).toMatchObject({ limitUsd: 100, custom: true, exhausted: false });
    await b.setLimit('team-a', null);
    expect(b.status('team-a')).toMatchObject({ custom: true, exhausted: false });
    expect(b.status('team-a')).not.toHaveProperty('limitUsd');
    await b.setLimit('team-a', 0);
    expect(b.status('team-a').exhausted).toBe(true);
    await b.setLimit('team-a', undefined);
    expect(b.status('team-a')).toMatchObject({ limitUsd: 50, custom: false, exhausted: true });
    expect(b.all(['team-b']).map((s) => s.workspace)).toEqual(['team-a', 'team-b']);
  });

  it('AIB-03: the analyzer refuses a call once the limit is reached and adds each call at its Bedrock rate', async () => {
    const b = new AiBudget(new FileBackend(tmp()), 0.05);
    await b.init();
    const out: SemanticOutput = { findings: [], challenges: [], answers: [], usage: { inputTokens: 10_000, outputTokens: 2_000, cacheReadTokens: 0, cacheWriteTokens: 0 } };
    const inner: SemanticAnalyzer = { provider: 'bedrock', model: 'eu.anthropic.claude-sonnet-5-5-v1:0', analyze: vi.fn(async () => out) };
    const a = budgeted(inner, b, 'team-a', {});
    const input = { itemKey: 'PAY-1', itemType: 'story', title: 't', sources: [], knownFindings: [], knownQuestions: [], openQuestions: [] };
    await a.analyze(input);
    // 10k input × $2/M + 2k output × $10/M = $0.04 (Claude Sonnet 5.5 list rates).
    expect(b.status('team-a').spentUsd).toBeCloseTo(0.04, 10);
    await a.analyze(input);
    await expect(a.analyze(input)).rejects.toBeInstanceOf(AiBudgetExceededError);
    await expect(a.analyze(input)).rejects.toThrow(/AI paused: this workspace reached its monthly AI limit \(\$0\.05, spent \$0\.08 in \d{4}-\d{2}\)/);
    expect(inner.analyze).toHaveBeenCalledTimes(2);
  });
});

describe('the server', () => {
  /** An OpenAI-compatible endpoint that answers every review with no findings and 1000/500 tokens. */
  function fakeModel() {
    const calls: string[] = [];
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      calls.push(String(url));
      const content = JSON.stringify({ findings: [], challenges: [], answers: [] });
      return new Response(JSON.stringify({ choices: [{ message: { content } }], usage: { prompt_tokens: 1000, completion_tokens: 500 } }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    return calls;
  }
  // $1 per million input and $2 per million output: one review costs $0.002.
  const platform: AiPlatformConfig = {
    provider: { provider: 'custom', model: 'platform-model', baseUrl: 'https://ai.platform.example/v1' },
    defaultLimitUsd: 0.005,
    prices: { 'custom/platform-model': { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 } },
  };
  const start = (dir: string, aiPlatform: AiPlatformConfig | false = platform) => buildApp({ dataDir: dir, adminToken: 'dummy-admin-token', allowedHosts: [], allowedOrigins: [], pdi: { eventsUrl: '', secret: '' }, aiPlatform });
  const admin = { authorization: 'Bearer dummy-admin-token' };

  it("AIS-01: every workspace uses the platform's model, stops at its limit with one note, and goes on once the operator raises it", async () => {
    const calls = fakeModel();
    const ctx = await start(tmp());
    try {
      const call = (method: 'GET' | 'PUT' | 'POST', url: string, payload?: object, headers: Record<string, string> = {}) => ctx.app.inject({ method, url, headers: { ...admin, ...headers }, ...(payload && { payload }) });
      // The workspace asks for a provider of its own, with an endpoint elsewhere: ignored.
      const etag = String((await call('GET', '/api/settings')).headers.etag);
      expect((await call('PUT', '/api/settings', { ai: { provider: 'custom', model: 'own', baseUrl: 'https://elsewhere.example/v1', runOn: 'every_analysis' } }, { 'if-match': etag })).statusCode).toBe(200);

      const first = (await call('POST', '/api/analyze')).json();
      expect(first.ai).toMatchObject({ enabled: true, provider: 'custom', model: 'platform-model' });
      expect(calls.length).toBeGreaterThanOrEqual(3);
      expect(calls.every((u) => u === 'https://ai.platform.example/v1/chat/completions')).toBe(true);
      const errors: string[] = first.ai.errors;
      expect(errors.filter((e) => e.includes('AI paused'))).toHaveLength(1);
      expect(errors.at(-1)).toMatch(/^AI paused: this workspace reached its monthly AI limit \(\$0\.01, spent \$0\.0\d+ in /);
      const made = calls.length;

      const settings = (await call('GET', '/api/settings')).json();
      expect(settings.aiPlatform).toMatchObject({ provider: 'custom', model: 'platform-model', budget: { limitUsd: 0.005, exhausted: true } });

      // A new analysis makes no call while the limit stands.
      await call('POST', '/api/analyze');
      expect(calls.length).toBe(made);

      const budget = (await call('GET', '/api/ai-budget')).json();
      expect(budget).toMatchObject({ provider: 'custom', model: 'platform-model', defaultLimitUsd: 0.005 });
      expect(budget.workspaces[0]).toMatchObject({ workspace: 'default', exhausted: true, custom: false, calls: made });

      expect((await call('PUT', '/api/ai-budget/default', { limitUsd: 10 })).json()).toMatchObject({ limitUsd: 10, custom: true, exhausted: false });
      expect((await call('PUT', '/api/ai-budget/default', { limitUsd: -1 })).statusCode).toBe(422);
      expect((await call('PUT', '/api/ai-budget/nope', { limitUsd: 1 })).statusCode).toBe(404);
      const audit = (await call('GET', '/api/audit')).json() as { summary: string }[];
      expect(audit.some((a) => a.summary === 'Monthly AI limit changed by the operator: $0.01 → $10.00')).toBe(true);
      expect(audit.some((a) => a.summary.includes('AI paused'))).toBe(false);

      // With the higher limit the next analysis reaches the model again.
      await call('POST', '/api/analyze');
      expect(calls.length).toBeGreaterThan(made);
    } finally {
      await ctx.app.close();
    }
  });

  it('AIS-02: a change needs the admin token; with accounts only an operator sees the limits; without a platform AI there are none', async () => {
    fakeModel();
    const ctx = await start(tmp());
    try {
      expect((await ctx.app.inject({ method: 'PUT', url: '/api/ai-budget/default', payload: { limitUsd: 1000 }, headers: { origin: 'http://localhost:4317', host: 'localhost:4317' } })).statusCode).toBe(401);
      expect((await ctx.app.inject({ method: 'GET', url: '/api/ai-budget', headers: admin })).statusCode).toBe(200);
    } finally {
      await ctx.app.close();
    }
    fakeAtlassian();
    const acc = await startAccounts(tmp(), { bootstrapEmail: ADA.email, aiPlatform: platform });
    try {
      const owner = browser((await login(acc.app)).session!);
      expect((await acc.app.inject({ method: 'GET', url: '/api/settings', headers: owner })).json().aiPlatform).toMatchObject({ model: 'platform-model', budget: { limitUsd: 0.005, spentUsd: 0 } });
      expect((await acc.app.inject({ method: 'GET', url: '/api/ai-budget', headers: owner })).statusCode).toBe(403);
    } finally {
      await acc.app.close();
    }
    const own = await start(tmp(), false);
    try {
      expect((await own.app.inject({ method: 'GET', url: '/api/ai-budget', headers: admin })).statusCode).toBe(404);
      expect((await own.app.inject({ method: 'GET', url: '/api/settings', headers: admin })).json()).not.toHaveProperty('aiPlatform');
    } finally {
      await own.app.close();
    }
  });
});
