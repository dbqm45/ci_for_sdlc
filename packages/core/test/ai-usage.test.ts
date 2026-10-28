import { afterEach, describe, expect, it, vi } from 'vitest';
import { aiCallCost, analyzeProject, createSemanticAnalyzer, demoProject, priceOf, summarizeAiCalls, type AiAuditRecord, type SemanticAnalyzer, type SemanticInput } from '../src/index.js';

// Telemetry of AI calls (docs/AI-QUALITY-PLAN.md, step 1): tokens, cost and time of every call that reached a model,
// so the cost and latency of the AI layer are visible per model and comparable in the evaluation report.

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
const output = JSON.stringify({ findings: [], challenges: [] });
const input: SemanticInput = { itemKey: 'PAY-1', itemType: 'story', title: 't', sources: [{ ref: 'S1', entityId: 'jira:PAY-1', source: 'jira', title: 'PAY-1', content: 'Body' }], knownFindings: [], knownQuestions: [] };

afterEach(() => vi.unstubAllGlobals());

describe('TEL: price and cost of one call', () => {
  it('TEL-01: cost adds input, output and cache tokens at the per-million rates', () => {
    const price = { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 };
    expect(aiCallCost({ inputTokens: 1000, outputTokens: 500, cacheReadTokens: 2000, cacheWriteTokens: 0 }, price)).toBeCloseTo(0.0144, 10);
  });
  it('TEL-02: Claude on the Anthropic API has a default price; other providers only an organization rate', () => {
    expect(priceOf('anthropic', 'claude-opus-5-5')).toEqual({ input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 });
    expect(priceOf('anthropic', 'claude-haiku-5-5')?.input).toBe(0.1);
    expect(priceOf('bedrock', 'anthropic.claude-opus-5-5')).toBeUndefined();
    expect(priceOf('openai', 'gpt-5')).toBeUndefined();
    const own = { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 };
    expect(priceOf('openai', 'gpt-5', { 'openai/gpt-5': own })).toEqual(own);
    expect(priceOf('anthropic', 'claude-opus-5-5', { 'anthropic/claude-opus-5-5': own })).toEqual(own);
  });
  it('TEL-03: a call without a known price has no cost (unknown, not zero)', () => {
    expect(aiCallCost({ inputTokens: 10, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0 }, undefined)).toBeUndefined();
  });
});

describe('TEL: analyzers report the usage of the response', () => {
  it('TEL-04: Claude — input, output and cache tokens', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      json({ id: 'm', type: 'message', role: 'assistant', model: 'claude-haiku-5-5', content: [{ type: 'text', text: output }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 120, output_tokens: 30, cache_read_input_tokens: 400, cache_creation_input_tokens: 50 } }),
    ));
    const out = await createSemanticAnalyzer({ provider: 'anthropic', model: 'claude-haiku-5-5' }, { anthropicApiKey: 'ak' })!.analyze(input);
    expect(out.usage).toEqual({ inputTokens: 120, outputTokens: 30, cacheReadTokens: 400, cacheWriteTokens: 50 });
  });
  it('TEL-05: OpenAI-compatible — prompt and completion tokens; no usage block means no usage', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ choices: [{ message: { content: output } }], usage: { prompt_tokens: 70, completion_tokens: 9 } })));
    const a = createSemanticAnalyzer({ provider: 'openai', model: 'gpt-5' })!;
    expect((await a.analyze(input)).usage).toEqual({ inputTokens: 70, outputTokens: 9, cacheReadTokens: 0, cacheWriteTokens: 0 });
    vi.stubGlobal('fetch', vi.fn(async () => json({ choices: [{ message: { content: output } }] })));
    expect((await a.analyze(input)).usage).toBeUndefined();
  });
});

describe('TEL: the audit record of an AI call', () => {
  const usage = { inputTokens: 1000, outputTokens: 200, cacheReadTokens: 0, cacheWriteTokens: 0 };
  const fake = (fail = false): SemanticAnalyzer => ({
    provider: 'anthropic',
    model: 'claude-haiku-5-5',
    analyze: async () => {
      if (fail) throw new Error('boom');
      return { findings: [], challenges: [], usage };
    },
  });
  const run = async (analyzer: SemanticAnalyzer, cache = new Map()) => {
    const audits: AiAuditRecord[] = [];
    await analyzeProject(demoProject(), { ai: { analyzer, cache, maxCharsPerSource: 4000, redactPersonalData: true, maxItems: 1, onAudit: (a) => audits.push(a) } });
    return { audits, cache };
  };

  it('TEL-06: a model call records tokens, cost and time; the cached result does not keep the usage', async () => {
    const { audits, cache } = await run(fake());
    expect(audits).toHaveLength(1);
    const [rec] = audits;
    expect(rec).toMatchObject({ cached: false, usage, costUsd: (1000 * 0.1 + 200 * 0.5) / 1e6 });
    expect(rec?.latencyMs).toBeGreaterThanOrEqual(0);
    expect([...cache.values()][0]).not.toHaveProperty('usage');

    const again = await run(fake(), cache);
    expect(again.audits[0]).toMatchObject({ cached: true });
    expect(again.audits[0]).not.toHaveProperty('usage');
    expect(again.audits[0]).not.toHaveProperty('costUsd');
    expect(again.audits[0]).not.toHaveProperty('latencyMs');
  });
  it('TEL-07: a failed call records how long it took', async () => {
    const { audits } = await run(fake(true));
    expect(audits[0]?.error).toBe('boom');
    expect(audits[0]?.latencyMs).toBeGreaterThanOrEqual(0);
  });
  it('TEL-08: an organization rate prices a provider without a default price', async () => {
    const audits: AiAuditRecord[] = [];
    const analyzer: SemanticAnalyzer = { provider: 'openai', model: 'gpt-5', analyze: async () => ({ findings: [], challenges: [], usage }) };
    await analyzeProject(demoProject(), { ai: { analyzer, cache: new Map(), maxCharsPerSource: 4000, redactPersonalData: true, maxItems: 1, prices: { 'openai/gpt-5': { input: 2, output: 8, cacheRead: 0, cacheWrite: 0 } }, onAudit: (a) => audits.push(a) } });
    expect(audits[0]?.costUsd).toBeCloseTo((1000 * 2 + 200 * 8) / 1e6, 10);
  });
});

describe('TEL: summary per provider and model', () => {
  const rec = (over: Partial<AiAuditRecord>): AiAuditRecord => ({ at: '2026-10-28T10:00:00Z', itemKey: 'K', provider: 'anthropic', model: 'claude-haiku-5-5', sources: [], inputHash: 'h', cached: false, findings: 0, discarded: 0, challenges: 0, ...over });
  const u = (i: number, o: number) => ({ inputTokens: i, outputTokens: o, cacheReadTokens: 0, cacheWriteTokens: 0 });

  it('TEL-09: counts calls, errors and cache hits, sums tokens and cost, gives p50 and p95 of time', () => {
    const rows = summarizeAiCalls([
      ...[100, 200, 300, 400].map((ms) => rec({ latencyMs: ms, usage: u(1000, 100), costUsd: 0.01 })),
      rec({ latencyMs: 900, error: 'boom' }),
      rec({ cached: true }),
      rec({ provider: 'openai', model: 'gpt-5', latencyMs: 50, usage: u(10, 1) }),
    ]);
    expect(rows).toEqual([
      { provider: 'anthropic', model: 'claude-haiku-5-5', calls: 5, errors: 1, cacheHits: 1, inputTokens: 4000, outputTokens: 400, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0.04, unpricedCalls: 1, latencyP50Ms: 300, latencyP95Ms: 900 },
      { provider: 'openai', model: 'gpt-5', calls: 1, errors: 0, cacheHits: 0, inputTokens: 10, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0, unpricedCalls: 1, latencyP50Ms: 50, latencyP95Ms: 50 },
    ]);
  });
  it('TEL-10: no records, no rows', () => {
    expect(summarizeAiCalls([])).toEqual([]);
  });
});
