import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ActiveDecision, Finding } from '@ci/core';
import { buildApp } from '../src/app.js';
import { putSettings } from './helpers.js';

// A2a (docs/AUTO-CLOSE-A2A-PLAN.md) on the server: the demo scenario "answers-in-sources" documents in Confluence what
// CHK-202's ERR-003 and ARCH-002 ask. A person accepts, edits or rejects the proposal; under `apply` the server records
// the decision itself; "Reopen" withdraws it; /api/decisions/acceptance measures the drafts.

let ctx: Awaited<ReturnType<typeof buildApp>> | undefined;
let dir: string;
afterEach(async () => {
  await ctx?.app.close();
  ctx = undefined;
  rmSync(dir, { recursive: true, force: true });
});

const TIMEOUT = 'If the payment provider does not respond within 30 seconds, the app shows a timeout message and the customer can try the payment again.';

async function start(policy?: Record<string, unknown>) {
  dir = mkdtempSync(join(tmpdir(), 'ci-ac-'));
  ctx = await buildApp({ dataDir: dir, adminToken: '', allowedHosts: [], allowedOrigins: [] });
  if (policy) expect((await putSettings(ctx.app, { policy })).statusCode).toBe(200);
  expect((await call('POST', '/api/demo/scenarios/answers-in-sources')).status).toBe(200);
  return ctx;
}
async function call(method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown) {
  const res = await ctx!.app.inject({ method, url, payload: payload as object, headers: { 'x-ci-actor': 'Ann' } });
  return { status: res.statusCode, body: res.body ? res.json() : undefined };
}
const finding = async (key: string, ruleId: string): Promise<Finding> => (await call('GET', `/api/items/${key}`)).body.item.findings.find((f: Finding) => f.ruleId === ruleId);
const autoCloseAudit = async () => (await ctx!.store.auditLog()).filter((a) => a.kind === 'auto_close');

describe('suggest (the default)', () => {
  it('AS-01: the finding offers the answer; nothing is decided; the first sighting is audited', async () => {
    await start();
    expect((await call('GET', '/api/settings')).body.settings.policy.autoClose).toBe('suggest');
    const f = await finding('CHK-202', 'ERR-003');
    expect(f.status).toBe('open');
    expect(f.answer).toMatchObject({ origin: 'rule', rule: 'auto-close:ERR-003', quote: TIMEOUT, source: { source: 'confluence', title: 'Payment Failure Handling' } });
    expect(await ctx!.store.decisions()).toEqual([]);
    const audit = await autoCloseAudit();
    expect(audit.map((a) => [a.actor, a.summary])).toContainEqual(['auto-close:ERR-003', expect.stringMatching(/^Answer proposed for CHK-202 "What should happen/)]);
    await call('POST', '/api/analyze');
    expect((await autoCloseAudit()).length).toBe(audit.length);
  });

  it('AS-02: Accept records a resolve decision with the quote, typed finding.auto_close, drafted by AI, not edited', async () => {
    await start();
    const f = await finding('CHK-202', 'ERR-003');
    const r = await call('POST', `/api/items/CHK-202/answers/${f.answer!.id}`, { action: 'accept' });
    expect(r.status).toBe(200);
    const [d] = (await ctx!.store.decisions()) as ActiveDecision[];
    expect(d).toMatchObject({ itemKey: 'CHK-202', questionId: f.question!.id, answer: TIMEOUT, effect: 'resolve', decidedBy: 'Ann', decisionType: 'finding.auto_close', draftedBy: 'ai', draftEdited: false, proposalId: f.answer!.id, evidence: [{ source: 'confluence', title: 'Payment Failure Handling', excerpt: TIMEOUT }] });
    expect(d!.automation).toBeUndefined();
    const after = await finding('CHK-202', 'ERR-003');
    expect(after).toMatchObject({ status: 'resolved' });
    expect(after.answer).toBeUndefined();
    expect((await autoCloseAudit()).map((a) => a.summary)).toContainEqual(expect.stringMatching(/^Answer accepted for CHK-202/));
  });

  it('AS-03: Edit records the person\'s text and marks the draft edited', async () => {
    await start();
    const f = await finding('CHK-202', 'ERR-003');
    expect((await call('POST', `/api/items/CHK-202/answers/${f.answer!.id}`, { action: 'edit', answer: 'Show a timeout message after 30 s with Try again.' })).status).toBe(200);
    expect((await ctx!.store.decisions())[0]).toMatchObject({ answer: 'Show a timeout message after 30 s with Try again.', draftEdited: true, draftedBy: 'ai' });
    expect((await call('POST', `/api/items/CHK-202/answers/${f.answer!.id}`, { action: 'edit' })).status).toBe(404);
  });

  it('AS-04: Reject records no decision, and the same proposal does not come back', async () => {
    await start();
    const f = await finding('CHK-202', 'ERR-003');
    expect((await call('POST', `/api/items/CHK-202/answers/${f.answer!.id}`, { action: 'reject' })).status).toBe(200);
    expect(await ctx!.store.decisions()).toEqual([]);
    await call('POST', '/api/analyze');
    const after = await finding('CHK-202', 'ERR-003');
    expect(after.status).toBe('open');
    expect(after.answer).toBeUndefined();
  });

  it('AS-05: an unknown proposal, a bad action and an edit without text are refused', async () => {
    await start();
    const f = await finding('CHK-202', 'ERR-003');
    expect((await call('POST', '/api/items/CHK-202/answers/ans:nope', { action: 'accept' })).status).toBe(404);
    expect((await call('POST', `/api/items/CHK-202/answers/${f.answer!.id}`, { action: 'approve' })).status).toBe(422);
    expect((await call('POST', `/api/items/CHK-202/answers/${f.answer!.id}`, { action: 'edit', answer: '  ' })).status).toBe(400);
  });
});

describe('the policy', () => {
  it('AS-06: off makes no proposals; an unknown mode is refused; apply is never the default', async () => {
    await start({ autoClose: 'off' });
    expect((await finding('CHK-202', 'ERR-003')).answer).toBeUndefined();
    expect((await putSettings(ctx!.app, { policy: { autoClose: 'auto' } })).statusCode).toBe(422);
  });

  it('AS-07: apply records each proposal as a decision of the automat, once, with the rule that fired', async () => {
    await start({ autoClose: 'apply' });
    const decisions = (await ctx!.store.decisions()) as ActiveDecision[];
    expect(decisions.map((d) => [d.itemKey, d.findingId]).sort()).toEqual([
      ['CHK-202', 'ARCH-002:CHK-202'],
      ['CHK-202', 'ERR-003:CHK-202'],
      ['PAY-126', 'ARCH-002:PAY-126'],
    ]);
    expect(decisions.find((d) => d.findingId === 'ERR-003:CHK-202')).toMatchObject({ decidedBy: 'auto-close', automation: { level: 1, rule: 'auto-close:ERR-003' }, draftedBy: 'ai', draftEdited: false, decisionType: 'finding.auto_close', answer: TIMEOUT });
    expect((await finding('CHK-202', 'ERR-003')).status).toBe('resolved');
    await call('POST', '/api/analyze');
    expect(await ctx!.store.decisions()).toHaveLength(3);
    expect((await autoCloseAudit()).filter((a) => /^Answer applied/.test(a.summary)).map((a) => a.actor).sort()).toEqual(['auto-close:ARCH-002', 'auto-close:ARCH-002', 'auto-close:ERR-003']);
  });
});

describe('Reopen and the measure', () => {
  it('AS-08: Reopen withdraws an auto-closed decision, reopens the finding, and the proposal does not come back (even under apply)', async () => {
    await start({ autoClose: 'apply' });
    const d = ((await ctx!.store.decisions()) as ActiveDecision[]).find((x) => x.findingId === 'ERR-003:CHK-202')!;
    const r = await call('POST', `/api/decisions/${d.id}/reopen`, { reason: 'The timeout message is wrong' });
    expect(r.status).toBe(200);
    expect((await ctx!.store.decisions()).find((x) => x.id === d.id)).toMatchObject({ status: 'withdrawn', withdrawnBy: 'Ann', withdrawReason: 'The timeout message is wrong' });
    await call('POST', '/api/analyze');
    const f = await finding('CHK-202', 'ERR-003');
    expect(f.status).toBe('open');
    expect(f.answer).toBeUndefined();
    expect((await ctx!.store.decisions()).filter((x) => x.findingId === 'ERR-003:CHK-202' && x.status === 'active')).toEqual([]);
    expect((await autoCloseAudit()).map((a) => a.summary)).toContainEqual(expect.stringMatching(/^Auto-closed answer reopened for CHK-202/));
  });

  it('AS-09: only auto-closed decisions can be reopened', async () => {
    await start();
    const f = await finding('CHK-202', 'ERR-005');
    const own = await call('POST', '/api/decisions', { questionId: f.question!.id, findingId: f.id, itemKey: 'CHK-202', answer: 'Redirect to login and resume the flow' });
    expect((await call('POST', `/api/decisions/${own.body.decision.id}/reopen`, {})).status).toBe(409);
    expect((await call('POST', '/api/decisions/nope/reopen', {})).status).toBe(404);
  });

  it('AS-10: /api/decisions/acceptance counts accepted, edited, rejected and reopened drafts against the pdi thresholds', async () => {
    await start();
    // Each finding is read just before acting on it: a new decision changes the semantic links of the context graph.
    const pay126 = await finding('PAY-126', 'ARCH-002');
    expect((await call('POST', `/api/items/PAY-126/answers/${pay126.answer!.id}`, { action: 'reject' })).status).toBe(200);
    const err003 = await finding('CHK-202', 'ERR-003');
    expect((await call('POST', `/api/items/CHK-202/answers/${err003.answer!.id}`, { action: 'accept' })).status).toBe(200);
    const arch002 = await finding('CHK-202', 'ARCH-002');
    expect((await call('POST', `/api/items/CHK-202/answers/${arch002.answer!.id}`, { action: 'edit', answer: 'A processing screen polls every 2 s.' })).status).toBe(200);
    const accepted = ((await ctx!.store.decisions()) as ActiveDecision[]).find((x) => x.findingId === 'ERR-003:CHK-202')!;
    await call('POST', `/api/decisions/${accepted.id}/reopen`, {});
    const r = await call('GET', '/api/decisions/acceptance');
    expect(r.status).toBe(200);
    expect(r.body).toEqual([
      expect.objectContaining({ decisionType: 'finding.auto_close', reviewed: 3, accepted: 0, edited: 1, rejected: 1, reopened: 1, applied: 0, verdict: 'back_to_human', thresholds: { lastDecisions: 30, minUneditedShare: 0.95, maxEditedShare: 0.1 } }),
    ]);
    expect((await call('GET', '/api/settings')).body.settings.policy.autoClose).toBe('suggest');
  });
});
