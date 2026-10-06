import { describe, expect, it } from 'vitest';
import { DEFAULT_POLICY, analyzeProject, approvalBaseline, demoProject, type AnalysisPolicy, type Approval, type Decision, type ProjectContext } from '../src/index.js';

const KEY = 'PAY-123';
const pay123 = (ctx: ProjectContext) => ctx.requirements.find((r) => r.key === KEY)!;

/** Approve PAY-123 on the untouched demo, then analyze an edited copy. */
const afterEdit = async (edit: (ctx: ProjectContext) => void, opts: { policy?: AnalysisPolicy; decisions?: Decision[]; legacy?: boolean } = {}) => {
  const before = await analyzeProject(demoProject());
  const item = before.result.items.find((i) => i.key === KEY)!;
  const baseline = approvalBaseline(before.graph, item);
  const approval: Approval = { itemKey: KEY, approvedAt: '2026-10-01T00:00:00Z', approvedBy: 'po', contextHashes: baseline.contextHashes, ...(opts.legacy ? {} : { meaningHashes: baseline.meaningHashes }) };
  const ctx = demoProject();
  edit(ctx);
  const run = await analyzeProject(ctx, { approvals: [approval], previous: before.snapshot, policy: opts.policy, decisions: opts.decisions });
  const a = run.result.items.find((i) => i.key === KEY)!;
  return { run, a, drift: a.findings.find((f) => f.ruleId === 'DRIFT-001') };
};

const cosmetic = (ctx: ProjectContext) => {
  const r = pay123(ctx);
  r.title = 'Save a payment method';
  r.description = r.description + '  ';
  r.acceptanceCriteria[0] = r.acceptanceCriteria[0].toUpperCase();
};
const meaningful = (ctx: ProjectContext) => void pay123(ctx).acceptanceCriteria.push('The user can name the card.');

describe('drift reaction (P4/P5)', () => {
  it('defaults to review_required', () => {
    expect(DEFAULT_POLICY.driftReaction).toBe('review_required');
  });

  it('ignores cosmetic edits for drift and keeps them in history only', async () => {
    const { a, drift, run } = await afterEdit(cosmetic);
    expect(drift).toBeUndefined();
    expect(a.readiness).toBe('ready');
    const ev = run.result.drift.find((e) => e.kind === 'changed' && e.entityId.endsWith(KEY));
    expect(ev?.severity).toBe('info');
  });

  it('a changed acceptance criterion requires review: the story is not ready', async () => {
    const { a, drift } = await afterEdit(meaningful);
    expect(drift?.status).toBe('open');
    expect(a.readiness).toBe('not_ready');
    expect(drift?.blocks).toBe(true);
  });

  it('a changed claim in a linked document requires review', async () => {
    const { a, drift } = await afterEdit((ctx) => {
      const d = ctx.documents.find((x) => x.body.includes('Applies to PAY-123'))!;
      d.body = d.body.replace('timeout is 30 seconds', 'timeout is 60 seconds');
    });
    expect(drift).toBeDefined();
    expect(a.readiness).toBe('not_ready');
  });

  it('confirming "still valid" clears the review', async () => {
    const { drift } = await afterEdit(meaningful);
    const ok: Decision = { id: 'd1', questionId: drift!.question!.id, findingId: drift!.id, itemKey: KEY, topic: 'drift', question: drift!.question!.text, answer: 'Still valid — re-approve', decidedBy: 'po', decidedAt: '2026-10-06T00:00:00Z', effect: 'resolve', version: 1, status: 'active' };
    const { a } = await afterEdit(meaningful, { decisions: [ok] });
    expect(a.readiness).toBe('ready');
  });

  it('warn only flags the item', async () => {
    const { a, drift } = await afterEdit(meaningful, { policy: { ...DEFAULT_POLICY, driftReaction: 'warn' } });
    expect(drift?.blocks).toBeFalsy();
    expect(a.readiness).toBe('needs_attention');
  });

  it('invalidate reports the approval as invalidated', async () => {
    const { run } = await afterEdit(meaningful, { policy: { ...DEFAULT_POLICY, driftReaction: 'invalidate' } });
    expect(run.result.invalidatedApprovals).toEqual([KEY]);
  });

  it('approvals stored before P5 fall back to content hashes', async () => {
    const { drift } = await afterEdit(cosmetic, { legacy: true });
    expect(drift).toBeDefined();
  });

  it('an epic shows drift of its stories (P7)', async () => {
    const { run } = await afterEdit(meaningful);
    const epic = run.result.items.find((i) => i.key === 'PAY-100')!;
    expect(epic.blockingIssues.some((b) => b.includes(KEY) && /review/i.test(b))).toBe(true);
  });
});
