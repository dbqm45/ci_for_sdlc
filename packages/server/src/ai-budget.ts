import { AI_EFFORTS, AI_PROVIDERS, aiCallCost, priceOf, type AiEffort, type AiPrices, type AiProviderConfig, type AiProviderKind, type SemanticAnalyzer } from '@ci/core';
import type { Backend } from './backend.js';

/**
 * AI paid by the platform, with a limit per workspace (T4, docs/AI-PLATFORM.md).
 *
 * - **Platform provider** (`CI_AI_PROVIDER`, `CI_AI_MODEL`, `CI_AI_REGION`, …): every workspace uses the provider and
 *   model the operator set; a workspace's own choice is ignored. Otherwise a workspace could point the platform's key
 *   at an endpoint of its own (the `custom` provider) or pick the dearest model.
 * - **Monthly limit** (`CI_AI_MONTHLY_LIMIT_USD`, default 50 with a platform provider): spend per workspace and UTC
 *   month, kept in `_platform` as `ai-budget.json`. Once a workspace reaches its limit, calls to the model stop until
 *   the next month; the analysis runs without AI and results already in the AI cache stay. The operator changes a
 *   workspace's limit at any time (`PUT /api/ai-budget/:workspace`). Up to `concurrency` calls already under way may
 *   finish past the limit.
 * - **Rates** (`CI_AI_PRICES`): `{"provider/model": {input, output, cacheRead, cacheWrite}}` in USD per million
 *   tokens, over the defaults in `@ci/core` (Claude on the Anthropic API and on Bedrock).
 */

export interface AiPlatformConfig {
  provider: AiProviderConfig;
  /** USD per month per workspace; undefined = no limit. */
  defaultLimitUsd?: number;
  prices: AiPrices;
}

const DEFAULT_LIMIT_USD = 50;

const usd = (name: string, raw: string): number => {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 100_000) throw new Error(`${name} must be a number of US dollars from 0 to 100000.`);
  return n;
};

/** Rates from `CI_AI_PRICES`, each checked; a bad entry stops the start rather than counting wrong. */
export function pricesFrom(raw: string | undefined): AiPrices {
  if (!raw) return {};
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    throw new Error('CI_AI_PRICES must be JSON: {"provider/model": {"input": 3, "output": 15, "cacheRead": 0.3, "cacheWrite": 3.75}}.');
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('CI_AI_PRICES must be an object keyed by "provider/model".');
  const out: AiPrices = {};
  for (const [key, p] of Object.entries(v as Record<string, unknown>)) {
    if (!/^[a-z-]+\/.+$/.test(key)) throw new Error(`CI_AI_PRICES: "${key}" is not "provider/model".`);
    const r = p as Record<string, unknown> | null;
    const nums = ['input', 'output', 'cacheRead', 'cacheWrite'].map((f) => r?.[f]);
    if (!nums.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0)) throw new Error(`CI_AI_PRICES: "${key}" needs input, output, cacheRead and cacheWrite as numbers ≥ 0.`);
    out[key] = { input: nums[0] as number, output: nums[1] as number, cacheRead: nums[2] as number, cacheWrite: nums[3] as number };
  }
  return out;
}

/** The platform's AI from the environment, or undefined when each workspace chooses its own (self-hosted). */
export function aiPlatformFrom(env: NodeJS.ProcessEnv): AiPlatformConfig | undefined {
  const provider = env.CI_AI_PROVIDER;
  const prices = pricesFrom(env.CI_AI_PRICES);
  const limitRaw = env.CI_AI_MONTHLY_LIMIT_USD;
  if (!provider) {
    if (limitRaw) throw new Error('CI_AI_MONTHLY_LIMIT_USD needs CI_AI_PROVIDER: a limit is kept for the platform\'s AI.');
    return undefined;
  }
  if (!(AI_PROVIDERS as readonly string[]).includes(provider) || provider === 'none') throw new Error(`CI_AI_PROVIDER must be one of ${AI_PROVIDERS.filter((p) => p !== 'none').join(', ')}.`);
  if (!env.CI_AI_MODEL) throw new Error('Set CI_AI_MODEL: the model every workspace uses (e.g. the Bedrock model or inference profile id).');
  const effort = env.CI_AI_EFFORT;
  if (effort && !(AI_EFFORTS as readonly string[]).includes(effort)) throw new Error(`CI_AI_EFFORT must be one of ${AI_EFFORTS.join(', ')}.`);
  return {
    provider: {
      provider: provider as AiProviderKind,
      model: env.CI_AI_MODEL,
      ...(effort && { effort: effort as AiEffort }),
      ...(env.CI_AI_REGION && { region: env.CI_AI_REGION }),
      ...(env.CI_AI_BASE_URL && { baseUrl: env.CI_AI_BASE_URL }),
      ...(env.CI_AI_API_VERSION && { apiVersion: env.CI_AI_API_VERSION }),
    },
    defaultLimitUsd: limitRaw === undefined || limitRaw === '' ? DEFAULT_LIMIT_USD : usd('CI_AI_MONTHLY_LIMIT_USD', limitRaw),
    prices,
  };
}

/**
 * A workspace's AI settings with the platform's provider over them: provider, model, effort, region and endpoint
 * come from the platform; when the AI runs (`runOn`) stays the workspace's choice.
 */
export function effectiveAi<T extends AiProviderConfig>(own: T, platform: AiPlatformConfig | undefined): T {
  if (!platform) return own;
  const { temperature: _t, region: _r, baseUrl: _b, apiVersion: _v, ...rest } = own;
  return { ...rest, effort: own.effort, ...platform.provider } as T;
}

export interface MonthSpend {
  costUsd: number;
  calls: number;
  /** Calls with no known rate: counted, not priced (set CI_AI_PRICES). */
  unpricedCalls: number;
}

interface BudgetDoc {
  /** Per workspace; `null` = no limit for it. A workspace not listed has the default. */
  limits: Record<string, number | null>;
  /** `YYYY-MM` (UTC) → workspace → spend. */
  months: Record<string, Record<string, MonthSpend>>;
}

export interface BudgetStatus {
  workspace: string;
  month: string;
  /** undefined = no limit. */
  limitUsd?: number;
  /** Whether the limit is the workspace's own (set by the operator) or the default. */
  custom: boolean;
  spentUsd: number;
  calls: number;
  unpricedCalls: number;
  exhausted: boolean;
}

/** Months of spend kept (the current one and a year back). */
const KEEP_MONTHS = 13;
const monthOf = (at: Date) => at.toISOString().slice(0, 7);
const EMPTY: MonthSpend = { costUsd: 0, calls: 0, unpricedCalls: 0 };

export class AiBudgetExceededError extends Error {}

export class AiBudget {
  private doc: BudgetDoc = { limits: {}, months: {} };
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly backend: Backend,
    readonly defaultLimitUsd: number | undefined,
  ) {}

  async init() {
    await this.backend.init();
    const v = (await this.backend.read('ai-budget.json')) as Partial<BudgetDoc> | undefined;
    this.doc = { limits: v?.limits ?? {}, months: v?.months ?? {} };
  }

  status(workspace: string, at = new Date()): BudgetStatus {
    const month = monthOf(at);
    const own = Object.hasOwn(this.doc.limits, workspace);
    const limit = own ? this.doc.limits[workspace] : this.defaultLimitUsd;
    const spend = this.doc.months[month]?.[workspace] ?? EMPTY;
    return {
      workspace,
      month,
      ...(limit !== null && limit !== undefined && { limitUsd: limit }),
      custom: own,
      spentUsd: round(spend.costUsd),
      calls: spend.calls,
      unpricedCalls: spend.unpricedCalls,
      exhausted: limit !== null && limit !== undefined && spend.costUsd >= limit,
    };
  }

  /** Every workspace with spend or its own limit this month, plus those named. */
  all(workspaces: string[], at = new Date()): BudgetStatus[] {
    const ids = new Set([...workspaces, ...Object.keys(this.doc.limits), ...Object.keys(this.doc.months[monthOf(at)] ?? {})]);
    return [...ids].sort().map((id) => this.status(id, at));
  }

  /** Adds one call that reached the model; `costUsd` undefined = no known rate. */
  record(workspace: string, costUsd: number | undefined, at = new Date()) {
    return this.serial(async () => {
      const month = monthOf(at);
      const m = (this.doc.months[month] ??= {});
      const s = (m[workspace] ??= { ...EMPTY });
      s.calls++;
      if (costUsd === undefined) s.unpricedCalls++;
      else s.costUsd += costUsd;
      for (const old of Object.keys(this.doc.months).sort().slice(0, -KEEP_MONTHS)) delete this.doc.months[old];
      await this.save();
    });
  }

  /** The operator's limit for one workspace: a number, `null` for none, or `undefined` to go back to the default. */
  setLimit(workspace: string, limitUsd: number | null | undefined) {
    return this.serial(async () => {
      if (limitUsd === undefined) delete this.doc.limits[workspace];
      else this.doc.limits[workspace] = limitUsd;
      await this.save();
    });
  }

  private save() {
    return this.backend.write('ai-budget.json', this.doc);
  }

  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn);
    this.queue = run.catch(() => undefined);
    return run;
  }
}

const round = (n: number) => Math.round(n * 1e6) / 1e6;

/** How every refusal of the limit begins (the engine folds them into one note). */
export const BUDGET_PREFIX = 'AI paused: this workspace reached its monthly AI limit';

/** The message shown once in the analysis when the limit stopped the AI. */
export const budgetMessage = (s: BudgetStatus) =>
  `${BUDGET_PREFIX} ($${(s.limitUsd ?? 0).toFixed(2)}, spent $${s.spentUsd.toFixed(2)} in ${s.month}). The analysis ran without AI; ask the operator to raise the limit, or wait for next month.`;

/**
 * The analyzer with the workspace's limit around it: a call is refused once the month's spend reached the limit, and
 * each call that reached the model is added to the spend at its rate.
 */
export function budgeted(inner: SemanticAnalyzer, budget: AiBudget, workspace: string, prices: AiPrices): SemanticAnalyzer {
  const price = priceOf(inner.provider, inner.model, prices);
  return {
    provider: inner.provider,
    model: inner.model,
    async analyze(input) {
      const s = budget.status(workspace);
      if (s.exhausted) throw new AiBudgetExceededError(budgetMessage(s));
      const out = await inner.analyze(input);
      await budget.record(workspace, out.usage ? aiCallCost(out.usage, price) : undefined);
      return out;
    },
  };
}
