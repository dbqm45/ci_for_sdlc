import { describe, expect, it } from 'vitest';
import { DEFAULT_POLICY, analyzeProject, demoProject, type AnalysisPolicy, type Decision, type SemanticAnalyzer } from '../src/index.js';

// PAY-123 is READY in the demo, so any change in readiness comes from the AI finding.
const fake: SemanticAnalyzer = {
  provider: 'fake',
  model: 'fake-1',
  analyze: async (input) => ({
    findings:
      input.itemKey === 'PAY-123'
        ? [{ category: 'GAP', severity: 'critical', dimension: 'requirements', title: 'Refund flow after confirmation is undefined', explanation: 'x', evidence: [{ ref: 'S1', quote: 'confirmation' }], question: { text: 'Is the refund flow in scope?', options: ['Yes', 'No'], topic: 'refund' } }]
        : [],
    challenges: [],
  }),
};

const run = async (policy: AnalysisPolicy, decisions: Decision[] = []) => {
  const r = await analyzeProject(demoProject(), { policy, decisions, ai: { analyzer: fake, cache: new Map(), maxCharsPerSource: 4000, redactPersonalData: true } });
  return r.result.items.find((i) => i.key === 'PAY-123')!;
};

describe('AI findings policy (P2)', () => {
  it('defaults to require_confirmation', () => {
    expect(DEFAULT_POLICY.aiFindings).toBe('require_confirmation');
  });

  it('an unconfirmed critical AI finding needs attention but does not block', async () => {
    const a = await run(DEFAULT_POLICY);
    const f = a.findings.find((x) => x.origin === 'ai')!;
    expect(f.needsConfirmation).toBe(true);
    expect(a.readiness).toBe('needs_attention');
  });

  it('a human confirmation turns it into a blocking finding', async () => {
    const f = (await run(DEFAULT_POLICY)).findings.find((x) => x.origin === 'ai')!;
    const confirm: Decision = { id: 'c1', questionId: f.question!.id, findingId: f.id, itemKey: 'PAY-123', topic: 'refund', question: f.question!.text, answer: 'Confirmed', decidedBy: 'lead', decidedAt: '2026-10-06T00:00:00Z', effect: 'confirm', version: 1, status: 'active' };
    const a = await run(DEFAULT_POLICY, [confirm]);
    const g = a.findings.find((x) => x.id === f.id)!;
    expect(g.status).toBe('open');
    expect(g.needsConfirmation).toBeFalsy();
    expect(a.readiness).toBe('not_ready');
  });

  it('block mode lets AI block on its own', async () => {
    expect((await run({ ...DEFAULT_POLICY, aiFindings: 'block' })).readiness).toBe('not_ready');
  });

  it('notify mode never blocks, even after confirmation', async () => {
    const a = await run({ ...DEFAULT_POLICY, aiFindings: 'notify' });
    expect(a.readiness).toBe('needs_attention');
    expect(a.findings.find((x) => x.origin === 'ai')!.needsConfirmation).toBeFalsy();
  });

  it('a stored policy without aiFindings behaves like the default', async () => {
    const { aiFindings: _, ...legacy } = DEFAULT_POLICY;
    expect((await run(legacy as AnalysisPolicy)).readiness).toBe('needs_attention');
  });
});

describe('answering a confirmed AI finding', () => {
  it('does not need a change reason, because a confirmation is not an answer', async () => {
    const { recordDecision } = await import('../src/index.js');
    const base = { questionId: 'q1', findingId: 'f1', itemKey: 'PAY-123', topic: 't', question: 'Q?', decidedBy: 'lead' };
    const first = recordDecision([], { ...base, answer: 'Confirmed', decidedAt: '2026-10-06T00:00:00Z', effect: 'confirm' });
    const second = recordDecision(first.all, { ...base, answer: 'Out of scope', decidedAt: '2026-10-06T01:00:00Z', effect: 'resolve' });
    expect(second.decision).toMatchObject({ version: 2, status: 'active' });
  });
});
