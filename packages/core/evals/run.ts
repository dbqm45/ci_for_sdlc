/**
 * Runs the evaluation of the AI specification reviewer (docs/AI-QUALITY-PLAN.md, step 2).
 *
 *   npm run eval:ai                                    # dry run: checks the cases, estimates input tokens and cost
 *   npm run eval:ai -- --paid --config anthropic:claude-haiku-5-5:low --config anthropic:claude-opus-5-5:high
 *   npm run eval:ai -- --replay docs/evals/<file>.json # scores saved outputs again, without a model
 *
 * Options: --cases <file> (default evals/spec-review.cases.json), --only <id,id>, --out <path without extension>
 * (default docs/evals/<date>-spec-review). A paid run calls the model once per case and configuration and needs
 * --paid; keys come from the same environment variables as the server (ANTHROPIC_API_KEY, OPENAI_API_KEY, …).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AI_EFFORTS, AI_PROVIDERS, configLabel, createSemanticAnalyzer, estimateInputTokens, priceOf, renderEvalReport, scoreRun, validateCases, type AiEffort, type AiProviderKind, type CaseRun, type EvalCase, type EvalConfig } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');

interface Saved {
  date: string;
  cases: string;
  configs: { config: EvalConfig; runs: (Omit<CaseRun, 'case'> & { caseId: string })[] }[];
}

function args(argv: string[]) {
  const opts = { configs: [] as EvalConfig[], paid: false, cases: resolve(here, 'spec-review.cases.json'), only: undefined as Set<string> | undefined, out: undefined as string | undefined, replay: undefined as string | undefined };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === '--paid') opts.paid = true;
    else if (a === '--config') opts.configs.push(parseConfig(value()));
    else if (a === '--cases') opts.cases = resolve(value());
    else if (a === '--only') opts.only = new Set(value().split(','));
    else if (a === '--out') opts.out = resolve(value());
    else if (a === '--replay') opts.replay = resolve(value());
    else throw new Error(`unknown option ${a}`);
  }
  return opts;
}

function parseConfig(text: string): EvalConfig {
  const [provider = '', model = '', effort] = text.split(':');
  if (!(AI_PROVIDERS as readonly string[]).includes(provider) || provider === 'none') throw new Error(`--config ${text}: provider must be one of ${AI_PROVIDERS.filter((p) => p !== 'none').join(', ')}`);
  if (effort !== undefined && !(AI_EFFORTS as readonly string[]).includes(effort)) throw new Error(`--config ${text}: effort must be one of ${AI_EFFORTS.join(', ')}`);
  return { provider, model, ...(effort ? { effort: effort as AiEffort } : {}) };
}

async function pool<T>(items: T[], size: number, fn: (x: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    for (let x = queue.shift(); x !== undefined; x = queue.shift()) await fn(x);
  }));
}

async function runConfig(config: EvalConfig, cases: EvalCase[]): Promise<CaseRun[]> {
  const analyzer = createSemanticAnalyzer(
    { provider: config.provider as AiProviderKind, model: config.model, ...(config.effort ? { effort: config.effort } : {}) },
    { anthropicApiKey: process.env.ANTHROPIC_API_KEY, openaiApiKey: process.env.OPENAI_API_KEY, azureOpenaiApiKey: process.env.AZURE_OPENAI_API_KEY, customApiKey: process.env.CUSTOM_AI_API_KEY },
  );
  if (!analyzer) throw new Error(`no analyzer for ${configLabel(config)}`);
  const runs = new Map<string, CaseRun>();
  await pool(cases, 3, async (c) => {
    const started = performance.now();
    try {
      const { usage, ...output } = await analyzer.analyze(c.input);
      runs.set(c.id, { case: c, output, latencyMs: Math.round(performance.now() - started), ...(usage ? { usage } : {}) });
    } catch (e) {
      runs.set(c.id, { case: c, error: e instanceof Error ? e.message : String(e), latencyMs: Math.round(performance.now() - started) });
    }
    process.stderr.write(`  ${configLabel(config)} ${c.id}: ${runs.get(c.id)?.error ? 'error' : 'ok'}\n`);
  });
  return cases.map((c) => runs.get(c.id)!);
}

async function main() {
  const opts = args(process.argv.slice(2));
  const date = new Date().toISOString().slice(0, 10);
  const all = JSON.parse(readFileSync(opts.cases, 'utf8')) as EvalCase[];
  const problems = validateCases(all);
  if (problems.length) {
    console.error(`The case file is not valid:\n${problems.map((p) => `- ${p}`).join('\n')}`);
    process.exit(1);
  }
  const cases = opts.only ? all.filter((c) => opts.only!.has(c.id)) : all;

  if (opts.replay) {
    const saved = JSON.parse(readFileSync(opts.replay, 'utf8')) as Saved;
    const byId = new Map(all.map((c) => [c.id, c]));
    const scores = saved.configs.map(({ config, runs }) => scoreRun(config, runs.flatMap((r) => (byId.has(r.caseId) ? [{ ...r, case: byId.get(r.caseId)! }] : []))));
    console.log(renderEvalReport(scores, { date: saved.date, cases: scores[0]?.cases.length ?? 0 }));
    return;
  }

  const tokens = estimateInputTokens(cases);
  console.log(`Cases: ${cases.length} (${[...new Set(cases.map((c) => c.kind))].join(', ')}). Input per configuration: about ${tokens} tokens.`);
  for (const config of opts.configs) {
    const price = priceOf(config.provider, config.model);
    console.log(`  ${configLabel(config)}: ${price ? `input about $${((tokens * price.input) / 1e6).toFixed(4)} (+ output, usually up to 2000 tokens per case)` : 'no known price'}`);
  }
  if (!opts.paid) {
    console.log(opts.configs.length ? 'Dry run: add --paid to call the models (this costs money).' : 'Dry run: the case file is valid. Name configurations with --config and add --paid to call the models.');
    return;
  }
  if (!opts.configs.length) throw new Error('--paid needs at least one --config');

  const saved: Saved = { date, cases: opts.cases, configs: [] };
  const scores = [];
  for (const config of opts.configs) {
    const runs = await runConfig(config, cases);
    saved.configs.push({ config, runs: runs.map(({ case: c, ...r }) => ({ caseId: c.id, ...r })) });
    scores.push(scoreRun(config, runs));
  }
  const out = opts.out ?? resolve(root, 'docs/evals', `${date}-spec-review`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(`${out}.json`, `${JSON.stringify(saved, null, 2)}\n`);
  writeFileSync(`${out}.md`, renderEvalReport(scores, { date, cases: cases.length }));
  console.log(`Report: ${out}.md (raw outputs for --replay: ${out}.json)`);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
