/**
 * Telemetry of AI calls (docs/AI-QUALITY-PLAN.md, step 1): tokens, cost and time of every call that reached a model.
 * Default prices are the Anthropic API rates (USD per million tokens) as listed on 2026-10-06; a cache write is
 * priced at 1.25 × input (5-minute TTL). Bedrock, Vertex and OpenAI-compatible providers have other or unknown
 * rates: without an organization rate their cost is unknown, never zero.
 */

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/** USD per million tokens. */
export interface AiPrice {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

/** Organization rates by `provider/model`; they win over the defaults. */
export type AiPrices = Record<string, AiPrice>;

const claude = (input: number, output: number, cacheRead: number): AiPrice => ({ input, output, cacheRead, cacheWrite: input * 1.25 });

const ANTHROPIC_PRICES: Record<string, AiPrice> = {
  'claude-fable-5-1': claude(10, 50, 0.25),
  'claude-opus-5-5': claude(4, 20, 0.2),
  'claude-opus-5': claude(5, 25, 0.5),
  'claude-sonnet-5-5': claude(2, 10, 0.2),
  'claude-sonnet-5': claude(2, 10, 0.2),
  'claude-haiku-5-5': claude(0.1, 0.5, 0.01),
};

export function priceOf(provider: string, model: string, own: AiPrices = {}): AiPrice | undefined {
  return own[`${provider}/${model}`] ?? (provider === 'anthropic' ? ANTHROPIC_PRICES[model] : undefined);
}

export function aiCallCost(usage: AiUsage, price: AiPrice | undefined): number | undefined {
  if (!price) return undefined;
  return (usage.inputTokens * price.input + usage.outputTokens * price.output + usage.cacheReadTokens * price.cacheRead + usage.cacheWriteTokens * price.cacheWrite) / 1e6;
}

/** The telemetry part of an AI audit record (see AiAuditRecord). */
export interface AiCallRecord {
  provider: string;
  model: string;
  cached: boolean;
  error?: string;
  latencyMs?: number;
  usage?: AiUsage;
  costUsd?: number;
}

export interface AiUsageRow extends AiUsage {
  provider: string;
  model: string;
  /** Calls that reached the model (cache hits excluded), failed ones included. */
  calls: number;
  errors: number;
  cacheHits: number;
  /** Sum over priced calls; see unpricedCalls. */
  costUsd: number;
  unpricedCalls: number;
  latencyP50Ms?: number;
  latencyP95Ms?: number;
}

/** Nearest-rank percentile of sorted values. */
const percentile = (sorted: number[], p: number) => sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];

export function summarizeAiCalls(records: readonly AiCallRecord[]): AiUsageRow[] {
  const groups = new Map<string, AiCallRecord[]>();
  for (const r of records) {
    const key = `${r.provider}/${r.model}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups.values()].map((rs) => {
    const calls = rs.filter((r) => !r.cached);
    const sum = (f: (u: AiUsage) => number) => calls.reduce((n, r) => n + (r.usage ? f(r.usage) : 0), 0);
    const times = calls.flatMap((r) => (r.latencyMs === undefined ? [] : [r.latencyMs])).sort((a, b) => a - b);
    return {
      provider: rs[0]!.provider,
      model: rs[0]!.model,
      calls: calls.length,
      errors: calls.filter((r) => r.error).length,
      cacheHits: rs.length - calls.length,
      inputTokens: sum((u) => u.inputTokens),
      outputTokens: sum((u) => u.outputTokens),
      cacheReadTokens: sum((u) => u.cacheReadTokens),
      cacheWriteTokens: sum((u) => u.cacheWriteTokens),
      costUsd: calls.reduce((n, r) => n + (r.costUsd ?? 0), 0),
      unpricedCalls: calls.filter((r) => r.costUsd === undefined).length,
      latencyP50Ms: percentile(times, 0.5),
      latencyP95Ms: percentile(times, 0.95),
    };
  });
}
