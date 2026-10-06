import { describe, expect, it } from 'vitest';
import {
  DEMO_SCENARIOS,
  analyzeProject,
  approvalBaseline,
  demoProject,
  extractClaims,
  findConflicts,
  impactAnalysis,
  type Decision,
  type SemanticAnalyzer,
} from '../src/index.js';

const item = (r: Awaited<ReturnType<typeof analyzeProject>>, key: string) => r.result.items.find((i) => i.key === key)!;
const decision = (p: Partial<Decision> & Pick<Decision, 'questionId' | 'findingId' | 'itemKey' | 'answer'>): Decision => ({
  id: p.questionId,
  topic: 'test',
  question: 'Q',
  decidedBy: 'tester',
  decidedAt: '2026-10-01T00:00:00.000Z',
  version: 1,
  status: 'active',
  effect: 'resolve',
  ...p,
});

describe('claims', () => {
  const ev = { source: 'confluence' as const, entityId: 'confluence:1', title: 'Doc' };
  it('normalizes timeouts to seconds', () => {
    const cs = extractClaims('The payment API timeout is 30 seconds. TIMEOUT = 60000 ms', ev, { defaultSubject: 'payment' });
    expect(cs.filter((c) => c.attribute === 'timeout').map((c) => c.value)).toEqual([30, 60]);
  });
  it('extracts retry limits, idempotency and processing mode', () => {
    const cs = extractClaims('The user can retry up to 3 times. POST /payments accepts repeated requests. Payments are processed asynchronously.', ev, { defaultSubject: 'payment' });
    expect(cs.map((c) => [c.attribute, c.value])).toEqual([
      ['retry_limit', 3],
      ['idempotent', false],
      ['processing_mode', 'async'],
    ]);
  });
  it('detects conflicts only across different entities', () => {
    const a = extractClaims('Order requests time out after 30 seconds.', ev, { defaultSubject: 'order' });
    const b = extractClaims('If the order service does not respond within 45 seconds, show a message.', { ...ev, entityId: 'jira:X' }, { defaultSubject: 'order' });
    expect(findConflicts([...a, ...b])).toHaveLength(1);
    expect(findConflicts(a)).toHaveLength(0);
  });
});

describe('demo project analysis', async () => {
  const run = await analyzeProject(demoProject(), { now: new Date('2026-10-05T10:00:00Z') });

  it('marks PAY-125 Retry payment as NOT READY with the expected blocking issues', () => {
    const a = item(run, 'PAY-125');
    expect(a.readiness).toBe('not_ready');
    expect(a.healthStatus).toBe('critical');
    expect(a.health).toBeLessThan(50);
    expect(a.blockingIssues).toEqual(expect.arrayContaining(['Idempotency strategy missing', 'Retry failure behavior undefined', 'Figma missing loading / submitting state']));
    const idem = a.findings.find((f) => f.ruleId === 'ARCH-001')!;
    expect(idem.evidence.map((e) => e.title)).toContain('Payments API Reference');
    expect(idem.question?.options.at(-1)?.label).toBe('Other');
  });

  it('marks a complete story as READY', () => {
    expect(item(run, 'PAY-123').readiness).toBe('ready');
    expect(item(run, 'CHK-203').readiness).toBe('ready');
  });

  it('detects the Jira ↔ Confluence timeout conflict', () => {
    const f = item(run, 'CHK-201').findings.find((x) => x.ruleId === 'CON-001')!;
    expect(f.category).toBe('CONFLICT');
    expect(f.title).toContain('45 s vs 30 s');
    expect(f.evidence.map((e) => e.source).sort()).toEqual(['confluence', 'jira']);
  });

  it('detects sync expectation vs async architecture (UC-04)', () => {
    expect(item(run, 'CHK-202').findings.some((f) => f.ruleId === 'ARCH-003' && f.severity === 'critical')).toBe(true);
  });

  it('finds story ↔ task gaps (UC-06)', () => {
    const f = item(run, 'PAY-124').findings.find((x) => x.ruleId === 'COV-001')!;
    expect(f.explanation).toContain('If deletion fails');
    expect(item(run, 'PAY-124').tasks?.percent).toBe(67);
  });

  it('links the duplicate-charge bug to the missing idempotency strategy (UC-10)', () => {
    const f = item(run, 'PAY-127').findings.find((x) => x.ruleId === 'BUG-004')!;
    expect(f.title).toMatch(/idempotency/i);
  });

  it('flags outdated documentation and epic-level gaps', () => {
    expect(item(run, 'PAY-128').findings.some((f) => f.category === 'OUTDATED' && f.title.includes('Retry Policy'))).toBe(true);
    expect(item(run, 'ACC-300').findings.some((f) => f.ruleId === 'EPIC-003')).toBe(true);
    expect(item(run, 'PAY-100').rollup?.stories).toBe(2);
  });

  it('generates adversarial questions only for unanswered scenarios', () => {
    const ch = item(run, 'PAY-125').challenges;
    expect(ch.find((c) => c.id.endsWith('retry-duplicate'))?.answered).toBe(false);
    // PAY-123 explicitly answers the double-submit scenario in its acceptance criteria
    expect(item(run, 'PAY-123').challenges.find((c) => c.id.endsWith('double-action'))?.answered).toBe(true);
  });

  it('computes project metrics', () => {
    expect(run.result.counts.stories).toBe(10);
    expect(run.result.metrics.decisionDebt.critical).toBeGreaterThan(0);
    expect(run.result.topRisks[0].severity).toBe('critical');
  });

  it('answers impact analysis queries (UC-11)', () => {
    const rep = impactAnalysis(run.graph, run.result, 'change payment timeout from 30s to 60s');
    expect(rep.bySource.confluence.map((h) => h.title)).toEqual(expect.arrayContaining(['Payment Architecture', 'Retry Policy (2025)']));
    expect(rep.affectedItems.length).toBeGreaterThan(0);
  });
});

describe('human decisions', () => {
  it('resolve findings and feed claims back into the analysis', async () => {
    const base = await analyzeProject(demoProject());
    const idem = item(base, 'PAY-125').findings.find((f) => f.ruleId === 'ARCH-001')!;
    const dec = decision({ questionId: idem.question!.id, findingId: idem.id, itemKey: 'PAY-125', answer: 'Idempotency key per payment attempt', topic: 'idempotency' });
    const next = await analyzeProject(demoProject(), { decisions: [dec] });
    const a = item(next, 'PAY-125');
    // ARCH-001 is resolved by the decision …
    expect(a.findings.find((f) => f.ruleId === 'ARCH-001')?.status).toBe('resolved');
    // … but the API reference now contradicts the decision.
    const contradiction = a.findings.find((f) => f.ruleId === 'CON-001' && f.title.includes('contradict'))!;
    expect(contradiction.severity).toBe('critical');
    expect(contradiction.evidence.some((e) => e.source === 'decision')).toBe(true);
  });

  it('mark findings as accepted risk', async () => {
    const base = await analyzeProject(demoProject());
    const f = item(base, 'PAY-124').findings.find((x) => x.ruleId === 'ERR-004')!;
    const next = await analyzeProject(demoProject(), { decisions: [decision({ questionId: f.question!.id, findingId: f.id, itemKey: 'PAY-124', answer: 'No confirmation needed', effect: 'accept_risk' })] });
    expect(item(next, 'PAY-124').findings.find((x) => x.id === f.id)?.status).toBe('accepted_risk');
  });
});

describe('continuous drift detection', () => {
  it('reports changed claims and impact on approved items', async () => {
    const ctx = demoProject();
    const first = await analyzeProject(ctx);
    const approval = { itemKey: 'PAY-123', approvedAt: '2026-10-01T00:00:00Z', approvedBy: 'po', ...approvalBaseline(first.graph, item(first, 'PAY-123')) };
    DEMO_SCENARIOS.find((s) => s.id === 'timeout-change')!.apply(ctx);
    const second = await analyzeProject(ctx, { previous: first.snapshot, approvals: [approval] });

    const claimChange = second.result.drift.find((d) => d.kind === 'claim_changed' && d.summary.includes('30 s to 60 s'))!;
    expect(claimChange).toBeDefined();
    expect(claimChange.impactedItems).toContain('PAY-123');
    expect(claimChange.severity).toBe('critical');

    const a = item(second, 'PAY-123');
    expect(a.findings.some((f) => f.category === 'DRIFT')).toBe(true);
    // The story still says 30 seconds — now a conflict with the changed documentation.
    expect(a.findings.some((f) => f.category === 'CONFLICT' && f.title.includes('30 s'))).toBe(true);
    expect(second.result.drift.some((d) => d.kind === 'status_change' && d.entityId === 'jira:PAY-123')).toBe(true);
  });
});

describe('semantic AI layer', () => {
  it('keeps only evidence-backed AI findings and adds AI challenges', async () => {
    const fake: SemanticAnalyzer = {
      provider: 'fake',
      model: 'fake-1',
      analyze: async () => ({
        findings: [
          { category: 'AMBIGUITY', severity: 'warning', dimension: 'requirements', title: 'Order number format undefined', explanation: 'x', evidence: [{ ref: 'S1', quote: 'order number' }] },
          { category: 'GAP', severity: 'critical', dimension: 'design', title: 'Unsupported claim without evidence', explanation: 'x', evidence: [{ ref: 'S99', quote: '?' }] },
        ],
        challenges: [{ question: 'What happens if the customer changes the cart in another tab during retry?', rationale: 'r', options: ['Block'], topic: 'concurrency' }],
      }),
    };
    const audits: unknown[] = [];
    const run = await analyzeProject(demoProject(), { ai: { analyzer: fake, cache: new Map(), maxCharsPerSource: 4000, redactPersonalData: true, onAudit: (a) => audits.push(a) } });
    const a = item(run, 'PAY-125');
    expect(a.findings.some((f) => f.origin === 'ai' && f.title === 'Order number format undefined')).toBe(true);
    expect(a.findings.some((f) => f.title.startsWith('Unsupported claim'))).toBe(false);
    expect(a.challenges.some((c) => c.origin === 'ai')).toBe(true);
    expect(audits.length).toBeGreaterThan(0);
    expect(run.result.ai.enabled).toBe(true);
  });
});
