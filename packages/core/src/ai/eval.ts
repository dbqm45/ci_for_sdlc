/**
 * Evaluation of the AI specification reviewer (docs/AI-QUALITY-PLAN.md, step 2). A case is one reviewer input with
 * labeled expectations; scoring needs no model, so it is deterministic and runs in the regular tests. A finding hits
 * an expectation when it has an expected category, cites an expected source and names one of the keywords.
 * Labeled precision is a lower bound: a finding without a label may still be right.
 */
import { isVerbatimQuote } from '../analysis/auto-close.js';
import type { FindingCategory } from '../model.js';
import type { AiEffort, AiProviderKind } from './providers.js';
import { SYSTEM_PROMPT, renderUserPrompt, type SemanticFinding, type SemanticInput, type SemanticOutput } from './types.js';
import { aiCallCost, priceOf, summarizeAiCalls, type AiPrices, type AiUsage, type AiUsageRow } from './usage.js';

export type EvalKind = 'gap' | 'conflict' | 'ambiguity' | 'outdated' | 'missing_coverage' | 'decision' | 'answer' | 'no_answer' | 'clean' | 'injection';

export interface ExpectedFinding {
  id: string;
  categories: FindingCategory[];
  /** At least one of these sources must be cited. */
  refs: string[];
  /** At least one must appear in the title or explanation (case-insensitive). */
  keywords: string[];
}

export interface EvalCase {
  id: string;
  kind: EvalKind;
  description: string;
  input: SemanticInput;
  expect: {
    findings?: ExpectedFinding[];
    /** Open questions a source answers, and the source that does. */
    answers?: { questionId: string; ref: string }[];
    /** Open questions no source answers: any answer is invented. */
    noAnswer?: string[];
    /** A well-defined item: every critical finding is a false alarm. */
    clean?: boolean;
  };
}

export interface AnswerScore {
  expected: number;
  correct: number;
  wrong: number;
  invented: number;
}

export interface CaseScore {
  caseId: string;
  expected: number;
  matched: string[];
  missed: string[];
  reported: number;
  /** Reported findings that hit an expectation. */
  labeled: number;
  quotes: number;
  badQuotes: number;
  falseCritical: number;
  answers: AnswerScore;
  error?: string;
}

const hits = (e: ExpectedFinding, f: SemanticFinding) => {
  const text = `${f.title}\n${f.explanation}`.toLowerCase();
  return e.categories.includes(f.category) && f.evidence.some((x) => e.refs.includes(x.ref)) && e.keywords.some((k) => text.includes(k.toLowerCase()));
};

export function scoreCase(c: EvalCase, output: SemanticOutput | undefined, error?: string): CaseScore {
  const expected = c.expect.findings ?? [];
  const findings = output?.findings ?? [];
  const content = new Map(c.input.sources.map((s) => [s.ref, s.content]));
  const used = new Set<number>();
  const matched: string[] = [];
  for (const e of expected) {
    const i = findings.findIndex((f, n) => !used.has(n) && hits(e, f));
    if (i < 0) continue;
    used.add(i);
    matched.push(e.id);
  }
  const quotes = findings.flatMap((f) => f.evidence);
  const answerable = new Map((c.expect.answers ?? []).map((a) => [a.questionId, a.ref]));
  const unanswerable = new Set(c.expect.noAnswer ?? []);
  const answers: AnswerScore = { expected: answerable.size, correct: 0, wrong: 0, invented: 0 };
  for (const a of output?.answers ?? []) {
    if (unanswerable.has(a.questionId)) answers.invented++;
    else if (answerable.get(a.questionId) === a.ref && isVerbatimQuote(content.get(a.ref) ?? '', a.quote)) answers.correct++;
    else answers.wrong++;
  }
  return {
    caseId: c.id,
    expected: expected.length,
    matched,
    missed: expected.filter((e) => !matched.includes(e.id)).map((e) => e.id),
    reported: findings.length,
    labeled: used.size,
    quotes: quotes.length,
    badQuotes: quotes.filter((q) => !isVerbatimQuote(content.get(q.ref) ?? '', q.quote)).length,
    falseCritical: c.expect.clean ? findings.filter((f) => f.severity === 'critical').length : 0,
    answers,
    ...(error === undefined ? {} : { error }),
  };
}

export interface EvalConfig {
  provider: AiProviderKind | string;
  model: string;
  effort?: AiEffort;
}

export interface CaseRun {
  case: EvalCase;
  output?: SemanticOutput;
  error?: string;
  latencyMs?: number;
  usage?: AiUsage;
}

export interface RunScore {
  label: string;
  config: EvalConfig;
  cases: CaseScore[];
  recall: number;
  labeledPrecision: number;
  quoteValidity: number;
  falseCritical: number;
  cleanCases: number;
  answers: AnswerScore;
  errors: number;
  usage: AiUsageRow;
}

export const configLabel = (c: EvalConfig) => [c.provider, c.model, c.effort].filter(Boolean).join(':');

const ratio = (a: number, b: number) => (b === 0 ? 1 : a / b);
const total = <T>(xs: T[], f: (x: T) => number) => xs.reduce((n, x) => n + f(x), 0);

export function scoreRun(config: EvalConfig, runs: CaseRun[], prices?: AiPrices): RunScore {
  const cases = runs.map((r) => scoreCase(r.case, r.output, r.error));
  const price = priceOf(config.provider, config.model, prices);
  const [usage] = summarizeAiCalls(
    runs.map((r) => ({ provider: config.provider, model: config.model, cached: false, error: r.error, latencyMs: r.latencyMs, usage: r.usage, costUsd: r.usage ? aiCallCost(r.usage, price) : undefined })),
  );
  return {
    label: configLabel(config),
    config,
    cases,
    recall: ratio(total(cases, (c) => c.matched.length), total(cases, (c) => c.expected)),
    labeledPrecision: ratio(total(cases, (c) => c.labeled), total(cases, (c) => c.reported)),
    quoteValidity: ratio(total(cases, (c) => c.quotes - c.badQuotes), total(cases, (c) => c.quotes)),
    falseCritical: total(cases, (c) => c.falseCritical),
    cleanCases: runs.filter((r) => r.case.expect.clean).length,
    answers: {
      expected: total(cases, (c) => c.answers.expected),
      correct: total(cases, (c) => c.answers.correct),
      wrong: total(cases, (c) => c.answers.wrong),
      invented: total(cases, (c) => c.answers.invented),
    },
    errors: cases.filter((c) => c.error !== undefined).length,
    usage: usage ?? { provider: config.provider, model: config.model, calls: 0, errors: 0, cacheHits: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0, unpricedCalls: 0 },
  };
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const caseCell = (s: CaseScore) => (s.error ? `błąd` : `${s.matched.length}/${s.expected}${s.badQuotes ? ` ⚠${s.badQuotes} cyt.` : ''}${s.falseCritical ? ` ✗${s.falseCritical} alarm` : ''}${s.answers.invented ? ` ✗${s.answers.invented} zmyśl.` : ''}`);

/** Markdown report: configurations side by side, then the cases whose result differs between them (or every case of a single run). */
export function renderEvalReport(runs: RunScore[], meta: { date: string; cases: number }): string {
  const lines = [
    `# Ewaluacja recenzenta specyfikacji — ${meta.date}`,
    '',
    `Przypadki: ${meta.cases}. Miary: \`packages/core/src/ai/eval.ts\`, plan: \`docs/AI-QUALITY-PLAN.md\`.`,
    '',
    '| Konfiguracja | Czułość | Trafność wg etykiet | Cytaty poprawne | Fałszywe alarmy (critical na poprawnych) | Odpowiedzi trafne | Odpowiedzi błędne / zmyślone | Błędy wywołań | Tokeny we / wy | Koszt USD | Czas p50 / p95 |',
    '|---|---|---|---|---|---|---|---|---|---|---|',
    ...runs.map((r) => {
      const u = r.usage;
      const cost = u.unpricedCalls ? 'nieznany' : u.costUsd.toFixed(4);
      const time = u.latencyP50Ms === undefined ? '—' : `${(u.latencyP50Ms / 1000).toFixed(1)} s / ${((u.latencyP95Ms ?? 0) / 1000).toFixed(1)} s`;
      return `| ${r.label} | ${pct(r.recall)} | ${pct(r.labeledPrecision)} | ${pct(r.quoteValidity)} | ${r.falseCritical} na ${r.cleanCases} | ${r.answers.correct}/${r.answers.expected} | ${r.answers.wrong} / ${r.answers.invented} | ${r.errors} | ${u.inputTokens} / ${u.outputTokens} | ${cost} | ${time} |`;
    }),
  ];
  const ids = runs[0]?.cases.map((c) => c.caseId) ?? [];
  const rows = ids.flatMap((id) => {
    const cells = runs.map((r) => caseCell(r.cases.find((c) => c.caseId === id)!));
    return runs.length === 1 || new Set(cells).size > 1 ? [`| ${id} | ${cells.join(' | ')} |`] : [];
  });
  if (rows.length) lines.push('', runs.length === 1 ? '## Przypadki' : '## Przypadki z różnym wynikiem', '', `| Przypadek | ${runs.map((r) => r.label).join(' | ')} |`, `|---|${runs.map(() => '---').join('|')}|`, ...rows);
  lines.push('', 'Komórka: trafione / oczekiwane ustalenia; ⚠ cytaty spoza źródła, ✗ fałszywe alarmy i zmyślone odpowiedzi.', '');
  return lines.join('\n');
}

/** Problems of the case file, each naming the case; empty when the set is valid. */
export function validateCases(cases: EvalCase[]): string[] {
  const seen = new Set<string>();
  return cases.flatMap((c) => {
    const out: string[] = [];
    if (seen.has(c.id)) out.push(`${c.id}: duplicate id`);
    seen.add(c.id);
    const refs = new Set(c.input.sources.map((s) => s.ref));
    const questions = new Set((c.input.openQuestions ?? []).map((q) => q.id));
    for (const e of c.expect.findings ?? []) {
      for (const r of e.refs) if (!refs.has(r)) out.push(`${c.id}: finding ${e.id} cites ${r}, which is not a source`);
      if (!e.keywords.length) out.push(`${c.id}: finding ${e.id} has no keywords`);
    }
    for (const a of c.expect.answers ?? []) {
      if (!questions.has(a.questionId)) out.push(`${c.id}: answer to ${a.questionId}, which is not an open question`);
      if (!refs.has(a.ref)) out.push(`${c.id}: answer to ${a.questionId} cites ${a.ref}, which is not a source`);
    }
    for (const q of c.expect.noAnswer ?? []) if (!questions.has(q)) out.push(`${c.id}: no-answer ${q} is not an open question`);
    if (c.expect.clean && c.expect.findings?.length) out.push(`${c.id}: a clean case expects no findings`);
    if (!c.expect.findings?.length && !c.expect.answers?.length && !c.expect.noAnswer?.length && !c.expect.clean) out.push(`${c.id}: no expectation`);
    return out;
  });
}

/** Rough input size of a run over the cases (about 4 characters per token), for the cost estimate of a dry run. */
export const estimateInputTokens = (cases: EvalCase[]) => Math.ceil(total(cases, (c) => SYSTEM_PROMPT.length + renderUserPrompt(c.input).length) / 4);
