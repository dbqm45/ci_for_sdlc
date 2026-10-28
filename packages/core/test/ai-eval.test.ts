import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SYSTEM_PROMPT, estimateInputTokens, renderEvalReport, renderUserPrompt, scoreCase, scoreRun, validateCases, type EvalCase, type SemanticFinding, type SemanticOutput } from '../src/index.js';

// Evaluation of the AI specification reviewer (docs/AI-QUALITY-PLAN.md, step 2): a fixed set of cases with expected
// findings and answers, scored without a model. These tests check the scoring and the data set; a paid run against a
// model goes through `npm run eval:ai` and only with the owner's consent.

const CASES = JSON.parse(readFileSync(new URL('../evals/spec-review.cases.json', import.meta.url), 'utf8')) as EvalCase[];

const base: EvalCase = {
  id: 'timeout-conflict',
  kind: 'conflict',
  description: 'Story and documentation give different session timeouts.',
  input: {
    itemKey: 'ACC-1',
    itemType: 'story',
    title: 'Session timeout',
    sources: [
      { ref: 'S1', entityId: 'jira:ACC-1', source: 'jira', title: 'ACC-1', content: 'The session expires after 30 minutes of inactivity.' },
      { ref: 'S2', entityId: 'confluence:1', source: 'confluence', title: 'Security policy', content: 'Sessions end after 15 minutes without activity.' },
    ],
    knownFindings: [],
    knownQuestions: [],
    openQuestions: [
      { id: 'q1', text: 'How long does a session last?' },
      { id: 'q2', text: 'Which browsers are supported?' },
    ],
  },
  expect: {
    findings: [{ id: 'timeout', categories: ['CONFLICT'], refs: ['S1', 'S2'], keywords: ['15 minutes', '30 minutes'] }],
    answers: [{ questionId: 'q1', ref: 'S2' }],
    noAnswer: ['q2'],
  },
};

const f = (over: Partial<SemanticFinding>): SemanticFinding => ({
  category: 'CONFLICT',
  severity: 'warning',
  dimension: 'requirements',
  title: 'Session timeout differs',
  explanation: 'The story says 30 minutes, the policy 15 minutes.',
  evidence: [{ ref: 'S2', quote: 'Sessions end after 15 minutes without activity.' }],
  ...over,
});
const out = (findings: SemanticFinding[], answers: SemanticOutput['answers'] = []): SemanticOutput => ({ findings, challenges: [], answers });

describe('EVAL: scoring one case', () => {
  it('EVAL-01: a finding of the expected category that cites an expected source and names a keyword is a hit', () => {
    const s = scoreCase(base, out([f({})]));
    expect(s).toMatchObject({ expected: 1, matched: ['timeout'], missed: [], reported: 1, labeled: 1, quotes: 1, badQuotes: 0 });
  });
  it.each([
    { id: 'EVAL-02', why: 'another category', finding: f({ category: 'GAP' }) },
    { id: 'EVAL-03', why: 'no expected source cited', finding: f({ evidence: [{ ref: 'S9', quote: 'x' }] }) },
    { id: 'EVAL-04', why: 'no keyword', finding: f({ title: 'Inconsistent rule', explanation: 'They differ.' }) },
  ])('$id: $why is not a hit', ({ finding }) => {
    expect(scoreCase(base, out([finding]))).toMatchObject({ matched: [], missed: ['timeout'], reported: 1, labeled: 0 });
  });
  it('EVAL-05: one finding covers at most one expectation and a duplicate is reported but not labeled', () => {
    const two: EvalCase = { ...base, expect: { findings: [base.expect.findings![0]!, { id: 'again', categories: ['CONFLICT'], refs: ['S2'], keywords: ['15 minutes'] }] } };
    expect(scoreCase(two, out([f({})]))).toMatchObject({ matched: ['timeout'], missed: ['again'], labeled: 1 });
    expect(scoreCase(base, out([f({}), f({})]))).toMatchObject({ matched: ['timeout'], reported: 2, labeled: 1 });
  });
  it('EVAL-06: a quote that is not in the cited source counts as a bad quote', () => {
    const s = scoreCase(base, out([f({ evidence: [{ ref: 'S2', quote: 'Sessions end after 10 minutes.' }, { ref: 'S1', quote: 'expires after 30 minutes' }] })]));
    expect(s).toMatchObject({ quotes: 2, badQuotes: 1 });
  });
  it('EVAL-07: answers — right source and verbatim quote is correct, an answer to an unanswerable question is invented', () => {
    const s = scoreCase(
      base,
      out([], [
        { questionId: 'q1', ref: 'S2', quote: 'Sessions end after 15 minutes without activity.' },
        { questionId: 'q2', ref: 'S1', quote: 'The session expires after 30 minutes of inactivity.' },
      ]),
    );
    expect(s.answers).toEqual({ expected: 1, correct: 1, wrong: 0, invented: 1 });
  });
  it('EVAL-08: an answer from the wrong source or with a quote not in it is wrong', () => {
    const wrongRef = scoreCase(base, out([], [{ questionId: 'q1', ref: 'S1', quote: 'The session expires after 30 minutes of inactivity.' }]));
    const badQuote = scoreCase(base, out([], [{ questionId: 'q1', ref: 'S2', quote: 'Sessions end after 20 minutes.' }]));
    expect(wrongRef.answers).toEqual({ expected: 1, correct: 0, wrong: 1, invented: 0 });
    expect(badQuote.answers).toEqual({ expected: 1, correct: 0, wrong: 1, invented: 0 });
  });
  it('EVAL-09: on a clean case every critical finding is a false alarm', () => {
    const clean: EvalCase = { ...base, expect: { clean: true } };
    expect(scoreCase(clean, out([f({ severity: 'critical' }), f({ severity: 'info' })]))).toMatchObject({ falseCritical: 1, reported: 2, labeled: 0 });
    expect(scoreCase(base, out([f({ severity: 'critical' })])).falseCritical).toBe(0);
  });
  it('EVAL-10: a failed call scores as a miss of everything with the error kept', () => {
    expect(scoreCase(base, undefined, 'HTTP 500')).toMatchObject({ matched: [], missed: ['timeout'], reported: 0, error: 'HTTP 500' });
  });
});

describe('EVAL: a run and the report', () => {
  const clean: EvalCase = { ...base, id: 'clean', expect: { clean: true } };
  const usage = { inputTokens: 1000, outputTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 0 };

  it('EVAL-11: run measures are sums over cases; cost and time come from the calls', () => {
    const run = scoreRun({ provider: 'anthropic', model: 'claude-haiku-5-5', effort: 'low' }, [
      { case: base, output: out([f({}), f({ category: 'GAP', title: 'Other' })], [{ questionId: 'q1', ref: 'S2', quote: 'Sessions end after 15 minutes without activity.' }]), latencyMs: 100, usage },
      { case: clean, output: out([f({ severity: 'critical' })]), latencyMs: 300, usage },
    ]);
    expect(run).toMatchObject({
      label: 'anthropic:claude-haiku-5-5:low',
      recall: 1,
      labeledPrecision: 1 / 3,
      quoteValidity: 1,
      falseCritical: 1,
      cleanCases: 1,
      answers: { expected: 1, correct: 1, wrong: 0, invented: 0 },
      errors: 0,
      usage: { calls: 2, inputTokens: 2000, outputTokens: 200, latencyP50Ms: 100, latencyP95Ms: 300 },
    });
    expect(run.usage.costUsd).toBeCloseTo((2000 * 0.1 + 200 * 0.5) / 1e6, 10);
  });
  it('EVAL-12: the report compares configurations and lists the cases where they differ', () => {
    const a = scoreRun({ provider: 'anthropic', model: 'claude-haiku-5-5', effort: 'low' }, [{ case: base, output: out([]), latencyMs: 50, usage }]);
    const b = scoreRun({ provider: 'anthropic', model: 'claude-opus-5-5', effort: 'high' }, [{ case: base, output: out([f({})]), latencyMs: 900, usage }]);
    const md = renderEvalReport([a, b], { date: '2026-10-28', cases: 1 });
    expect(md).toContain('| anthropic:claude-haiku-5-5:low | 0% |');
    expect(md).toContain('| anthropic:claude-opus-5-5:high | 100% |');
    expect(md).toMatch(/\| timeout-conflict \| 0\/1 \| 1\/1 \|/);
  });
});

describe('EVAL: the data set', () => {
  it('EVAL-13: the case file is valid (references, quotes, unique ids, an expectation per case)', () => {
    expect(validateCases(CASES)).toEqual([]);
    expect(CASES.length).toBeGreaterThanOrEqual(12);
  });
  it('EVAL-14: covers every kind of problem the reviewer must handle', () => {
    expect(new Set(CASES.map((c) => c.kind))).toEqual(new Set(['gap', 'conflict', 'ambiguity', 'outdated', 'missing_coverage', 'decision', 'answer', 'no_answer', 'clean', 'injection']));
  });
  it('EVAL-15: validation names what is wrong', () => {
    const broken: EvalCase = { ...base, expect: { findings: [{ id: 'x', categories: ['GAP'], refs: ['S7'], keywords: [] }], answers: [{ questionId: 'q9', ref: 'S2' }] } };
    expect(validateCases([broken, broken])).toEqual([
      'timeout-conflict: finding x cites S7, which is not a source',
      'timeout-conflict: finding x has no keywords',
      'timeout-conflict: answer to q9, which is not an open question',
      'timeout-conflict: duplicate id',
      'timeout-conflict: finding x cites S7, which is not a source',
      'timeout-conflict: finding x has no keywords',
      'timeout-conflict: answer to q9, which is not an open question',
    ]);
  });
  it('EVAL-16: the dry run estimates input tokens from the prompt length (about 4 characters per token)', () => {
    const chars = SYSTEM_PROMPT.length + renderUserPrompt(base.input).length;
    expect(estimateInputTokens([base])).toBe(Math.ceil(chars / 4));
  });
});
