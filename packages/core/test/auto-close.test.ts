import { describe, expect, it } from 'vitest';
import {
  acceptanceStats,
  analyzeProject,
  answerProposalId,
  AUTO_CLOSE_ACTOR,
  autoCloseDecision,
  type AutoCloseEvent,
  type AutoCloseOutcome,
  autoCloseOf,
  DEFAULT_POLICY,
  isVerbatimQuote,
  recordDecision,
  type ActiveDecision,
  type AnalysisPolicy,
  type Decision,
  type ItemAnalysis,
  type ProjectContext,
  type SemanticAnalyzer,
  type SemanticInput,
  type SemanticOutput,
} from '../src/index.js';

// A2a (docs/AUTO-CLOSE-A2A-PLAN.md): when the answer to a finding's question is already in the item's Confluence pages,
// Figma frames or an earlier decision, the finding carries a proposal with a verbatim quote; the policy decides whether
// it is offered (suggest), applied by the server (apply) or not made at all (off).

const NOW = new Date('2026-10-27T10:00:00Z');
const PAGE_ERRORS = 'If the payment service returns a server error (HTTP 503), the app shows an error message with a Try again button.';
const PAGE_TIMEOUT = 'If the payment API does not respond within 30 seconds, the app shows a timeout message and cancels the payment.';
const FRAME_TEXT = 'After the third attempt we stop retrying and show the support phone number.';

function project(): ProjectContext {
  return {
    project: { key: 'PAY', name: 'Payments' },
    requirements: [
      {
        key: 'PAY-1',
        type: 'story',
        title: 'Pay with a saved card',
        description: 'The customer pays with a saved card. The app sends the payment request to the payment service and the customer can retry the payment.',
        acceptanceCriteria: ['Given a saved card, when the customer pays, then the order is confirmed.'],
        businessRules: [],
        status: 'To Do',
        labels: [],
        components: [],
        links: [],
        remoteLinks: [],
        updatedAt: '2026-10-20T00:00:00Z',
        url: 'https://jira.example.com/browse/PAY-1',
      },
    ],
    documents: [
      {
        id: '501',
        title: 'Payment errors',
        space: 'PAY',
        labels: ['payments'],
        updatedAt: '2026-10-21T00:00:00Z',
        url: 'https://wiki.example.com/pages/501',
        body: `Error handling for PAY-1.\n${PAGE_ERRORS}\n${PAGE_TIMEOUT}`,
      },
    ],
    frames: [{ id: '1:2', fileKey: 'FK', fileName: 'Checkout', page: 'Payments', name: 'PAY-1 / Retry exhausted', texts: [FRAME_TEXT], transitions: [], updatedAt: '2026-10-22T00:00:00Z', url: 'https://figma.com/file/FK?node-id=1-2' }],
    fetchedAt: NOW.toISOString(),
  };
}

const run = async (opts: { policy?: Partial<AnalysisPolicy>; decisions?: Decision[]; suppressedAnswers?: string[]; ai?: SemanticAnalyzer } = {}) => {
  const { result } = await analyzeProject(project(), {
    now: NOW,
    policy: { ...DEFAULT_POLICY, ...opts.policy },
    decisions: opts.decisions,
    suppressedAnswers: opts.suppressedAnswers,
    ...(opts.ai && { ai: { analyzer: opts.ai, cache: new Map(), maxCharsPerSource: 5000, redactPersonalData: false } }),
  });
  return result.items.find((i) => i.key === 'PAY-1')!;
};
const byRule = (a: ItemAnalysis, ruleId: string) => a.findings.find((f) => f.ruleId === ruleId)!;

/** An earlier decision on REQ-004's question that also says how a repeated payment is prevented. */
async function idempotencyDecision(): Promise<ActiveDecision> {
  const req004 = byRule(await run(), 'REQ-004');
  return recordDecision([], {
    questionId: req004.question!.id,
    findingId: req004.id,
    itemKey: 'PAY-1',
    topic: 'retry behavior',
    question: req004.question!.text,
    answer: 'Up to 3 times. Every retry reuses the idempotency key, so the customer is never charged twice.',
    decidedBy: 'Ann',
    decidedAt: '2026-10-23T09:00:00.000Z',
    effect: 'resolve',
  }).decision;
}

describe('answers found in the item\'s sources', () => {
  it('AC-01: a Confluence page answers ERR-002 and ERR-003 with the sentence that says it, verbatim', async () => {
    const a = await run();
    expect(byRule(a, 'ERR-002').answer).toEqual({
      id: answerProposalId(byRule(a, 'ERR-002').question!.id, 'confluence:501', PAGE_ERRORS),
      origin: 'rule',
      rule: 'auto-close:ERR-002',
      quote: PAGE_ERRORS,
      source: { source: 'confluence', entityId: 'confluence:501', title: 'Payment errors', url: 'https://wiki.example.com/pages/501', excerpt: PAGE_ERRORS },
    });
    expect(byRule(a, 'ERR-003').answer).toMatchObject({ rule: 'auto-close:ERR-003', quote: PAGE_TIMEOUT, source: { source: 'confluence' } });
    expect(byRule(a, 'ERR-002').status).toBe('open');
  });

  it('AC-02: a Figma frame answers ERR-001 (what happens when the retry fails)', async () => {
    expect(byRule(await run(), 'ERR-001').answer).toMatchObject({ rule: 'auto-close:ERR-001', quote: FRAME_TEXT, source: { source: 'figma', entityId: 'figma:FK:1:2', title: 'Checkout / PAY-1 / Retry exhausted' } });
  });

  it('AC-03: an earlier decision on another question answers ARCH-001 (idempotency)', async () => {
    const dec = await idempotencyDecision();
    const a = await run({ decisions: [dec] });
    expect(byRule(a, 'REQ-004').status).toBe('resolved');
    expect(byRule(a, 'REQ-004').answer).toBeUndefined();
    expect(byRule(a, 'ARCH-001').answer).toMatchObject({
      rule: 'auto-close:ARCH-001',
      quote: 'Every retry reuses the idempotency key, so the customer is never charged twice.',
      source: { source: 'decision', entityId: `decision:${dec.id}` },
    });
  });

  it('AC-04: a question nothing answers gets no proposal, nor does a rule a quote cannot settle', async () => {
    const a = await run();
    expect(byRule(a, 'REQ-004').answer).toBeUndefined();
    expect(a.findings.filter((f) => f.answer).map((f) => f.ruleId).sort()).toEqual(['ERR-001', 'ERR-002', 'ERR-003']);
  });
});

describe('the autoClose policy', () => {
  it('AC-05: suggest is the default, apply never is', () => {
    expect(DEFAULT_POLICY.autoClose).toBe('suggest');
    expect(autoCloseOf({ ...DEFAULT_POLICY, autoClose: undefined })).toBe('suggest');
  });

  it('AC-06: off makes no proposals; suggest and apply make the same ones (the server applies them)', async () => {
    expect((await run({ policy: { autoClose: 'off' } })).findings.some((f) => f.answer)).toBe(false);
    const suggest = (await run({ policy: { autoClose: 'suggest' } })).findings.filter((f) => f.answer).map((f) => f.answer!.id);
    const apply = (await run({ policy: { autoClose: 'apply' } })).findings.filter((f) => f.answer).map((f) => f.answer!.id);
    expect(suggest).toHaveLength(3);
    expect(apply).toEqual(suggest);
  });

  it('AC-07: a rejected or reopened proposal is not made again', async () => {
    const id = byRule(await run(), 'ERR-002').answer!.id;
    const a = await run({ suppressedAnswers: [id] });
    expect(byRule(a, 'ERR-002').answer).toBeUndefined();
    expect(byRule(a, 'ERR-003').answer).toBeDefined();
  });

  it('AC-08: a decided question gets no proposal', async () => {
    const err002 = byRule(await run(), 'ERR-002');
    const dec = recordDecision([], { questionId: err002.question!.id, findingId: err002.id, itemKey: 'PAY-1', topic: 'error handling', question: err002.question!.text, answer: 'Generic error with retry option', decidedBy: 'Ann', decidedAt: '2026-10-23T09:00:00.000Z', effect: 'resolve' }).decision;
    expect(byRule(await run({ decisions: [dec] }), 'ERR-002').answer).toBeUndefined();
  });
});

describe('quotes are verbatim', () => {
  it.each([
    ['the exact sentence', PAGE_ERRORS, true],
    ['the sentence with other line breaks and spaces', PAGE_ERRORS.replace(' (HTTP 503), ', ' (HTTP 503),\n  '), true],
    ['a paraphrase', 'If the service fails, the app shows an error with a retry button.', false],
    ['a changed number', PAGE_ERRORS.replace('503', '500'), false],
    ['different case', PAGE_ERRORS.toLowerCase(), false],
    ['an empty quote', '  ', false],
  ])('AC-09: %s', (_, quote, ok) => {
    expect(isVerbatimQuote(`Error handling for PAY-1.\n${PAGE_ERRORS}\n${PAGE_TIMEOUT}`, quote)).toBe(ok);
  });

  const ai = (answers: SemanticOutput['answers']): SemanticAnalyzer & { inputs: SemanticInput[] } => {
    const inputs: SemanticInput[] = [];
    return { provider: 'mock', model: 'mock', inputs, analyze: async (input) => (inputs.push(input), { findings: [], challenges: [], answers }) };
  };

  it('AC-10: the AI may propose an answer to an open question, but only with a quote found verbatim in the cited source', async () => {
    const plain = await run();
    const req004 = byRule(plain, 'REQ-004');
    const page = (input: SemanticInput) => input.sources.find((s) => s.title === 'Payment errors')!.ref;

    const real = ai([]);
    await run({ ai: real });
    expect(real.inputs[0]!.openQuestions).toContainEqual({ id: req004.question!.id, text: req004.question!.text });
    const ref = page(real.inputs[0]!);

    const quoted = await run({ ai: ai([{ questionId: req004.question!.id, ref, quote: 'the app shows an error message with a Try again button' }]) });
    expect(byRule(quoted, 'REQ-004').answer).toMatchObject({ origin: 'ai', rule: 'auto-close:ai', quote: 'the app shows an error message with a Try again button', source: { entityId: 'confluence:501' } });

    for (const bad of [
      { questionId: req004.question!.id, ref, quote: 'The customer can retry up to 3 times.' },
      { questionId: req004.question!.id, ref: 'S99', quote: 'the app shows an error message' },
      { questionId: req004.question!.id, ref, quote: '' },
      { questionId: 'q:unknown', ref, quote: 'the app shows an error message' },
    ]) {
      expect(byRule(await run({ ai: ai([bad]) }), 'REQ-004').answer, JSON.stringify(bad)).toBeUndefined();
    }
  });

  it('AC-11: a deterministic answer wins over the AI\'s', async () => {
    const err002 = byRule(await run(), 'ERR-002');
    const probe = ai([]);
    await run({ ai: probe });
    const ref = probe.inputs[0]!.sources.find((s) => s.title === 'Payment errors')!.ref;
    const a = await run({ ai: ai([{ questionId: err002.question!.id, ref, quote: 'the app shows a timeout message' }]) });
    expect(byRule(a, 'ERR-002').answer).toMatchObject({ origin: 'rule', quote: PAGE_ERRORS });
  });
});

describe('the decision a proposal becomes', () => {
  const finding = async () => byRule(await run(), 'ERR-002');

  it('AC-12: accepted: resolve with the quote as the answer, the source as evidence, drafted by AI, not edited', async () => {
    const f = await finding();
    expect(autoCloseDecision(f, { by: 'Ann', at: '2026-10-27T11:00:00.000Z' })).toEqual({
      questionId: f.question!.id,
      findingId: f.id,
      itemKey: 'PAY-1',
      topic: 'error handling',
      question: f.question!.text,
      answer: PAGE_ERRORS,
      note: 'Answer found in Payment errors',
      decidedBy: 'Ann',
      decidedAt: '2026-10-27T11:00:00.000Z',
      effect: 'resolve',
      decisionType: 'finding.auto_close',
      draftedBy: 'ai',
      draftEdited: false,
      evidence: [f.answer!.source],
      proposalId: f.answer!.id,
    });
  });

  it('AC-13: edited: the person\'s answer, marked edited; unchanged text is not an edit', async () => {
    const f = await finding();
    expect(autoCloseDecision(f, { by: 'Ann', at: 'now', answer: 'Show a generic error with a Try again button.' })).toMatchObject({ answer: 'Show a generic error with a Try again button.', draftEdited: true });
    expect(autoCloseDecision(f, { by: 'Ann', at: 'now', answer: ` ${PAGE_ERRORS} ` })).toMatchObject({ answer: PAGE_ERRORS, draftEdited: false });
  });

  it('AC-14: applied by the server: decided by the automat at level 1 with the rule that fired', async () => {
    const f = await finding();
    expect(autoCloseDecision(f, { by: AUTO_CLOSE_ACTOR, at: 'now', automatic: true })).toMatchObject({ decidedBy: 'auto-close', automation: { level: 1, rule: 'auto-close:ERR-002' }, draftedBy: 'ai', draftEdited: false });
  });
});

describe('measured acceptance (DA2 thresholds of the pdi contract)', () => {
  const ev = (proposalId: string, outcome: AutoCloseOutcome, at: string): AutoCloseEvent => ({ at, proposalId, outcome, decisionType: 'finding.auto_close' });
  const many = (n: number, outcome: AutoCloseOutcome, from = 0) => Array.from({ length: n }, (_, i) => ev(`p${from + i}`, outcome, `2026-10-27T10:${String(from + i).padStart(2, '0')}:00.000Z`));

  it('AC-15: each proposal counts once, by its latest human outcome; a reopened one counts as rejected; applied ones apart', () => {
    const s = acceptanceStats([ev('a', 'proposed', '1'), ev('a', 'accepted', '2'), ev('a', 'reopened', '5'), ev('b', 'edited', '3'), ev('c', 'rejected', '4'), ev('d', 'applied', '6'), ev('e', 'proposed', '7')]);
    expect(s).toMatchObject({ decisionType: 'finding.auto_close', reviewed: 3, accepted: 0, edited: 1, rejected: 1, reopened: 1, applied: 1, verdict: 'back_to_human' });
    expect(s.thresholds).toEqual({ lastDecisions: 30, minUneditedShare: 0.95, maxEditedShare: 0.1 });
  });

  it('AC-16: the window is the last 30; at 95% unedited it meets the threshold, but only says so', () => {
    expect(acceptanceStats(many(12, 'accepted'))).toMatchObject({ reviewed: 12, verdict: 'not_enough_data', note: 'Not enough data: 12/30 reviewed proposals' });
    const meets = acceptanceStats([...many(10, 'rejected'), ...many(29, 'accepted', 10), ...many(1, 'rejected', 39)]);
    expect(meets).toMatchObject({ reviewed: 30, accepted: 29, rejected: 1, uneditedShare: 29 / 30, verdict: 'meets_lower_threshold' });
    expect(acceptanceStats([...many(28, 'accepted'), ...many(2, 'rejected', 28)])).toMatchObject({ verdict: 'hold' });
    expect(acceptanceStats([...many(27, 'accepted'), ...many(3, 'edited', 27)])).toMatchObject({ verdict: 'hold', editedShare: 0.1 });
    expect(acceptanceStats([...many(26, 'accepted'), ...many(4, 'edited', 26)])).toMatchObject({ verdict: 'back_to_human' });
  });
});
