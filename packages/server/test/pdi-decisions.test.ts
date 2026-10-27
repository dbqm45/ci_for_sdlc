import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ActiveDecision, Finding, PdiEvent } from '@ci/core';
import { buildApp } from '../src/app.js';
import { MAX_ATTEMPTS } from '../src/pdi.js';
import { putSettings } from './helpers.js';

// A2b (docs/PDI-F4-PLAN.md, "A2b"): each A2a step with a finding.auto_close decision is sent to pdi's registry as
// decision.recorded; pdi answers with its DEC number, which is kept on the local decision. The demo scenario
// "answers-in-sources" gives CHK-202 (labelled change:CHG-12 here) an answer to its timeout question.

const SECRET = 'shared-with-pdi';
let ctx: Awaited<ReturnType<typeof buildApp>> | undefined;
let dir: string;
let now: Date;
let sent: PdiEvent[];
/** pdi's answer to a decision.recorded; readiness.changed always gets 202. */
let answer: (e: PdiEvent) => { status: number; body: unknown };

const fakeFetch = async (_url: string | URL, init?: { body?: string }) => {
  const e = JSON.parse(String(init?.body)) as PdiEvent;
  sent.push(e);
  const a = e.type === 'decision.recorded' ? answer(e) : { status: 202, body: { status: 'created', item: null } };
  return new Response(JSON.stringify(a.body), { status: a.status, headers: { 'content-type': 'application/json' } });
};

afterEach(async () => {
  await ctx?.app.close();
  ctx = undefined;
  rmSync(dir, { recursive: true, force: true });
});

async function start(opts: { pdi?: boolean; policy?: Record<string, unknown> } = {}) {
  dir = mkdtempSync(join(tmpdir(), 'ci-a2b-'));
  now = new Date('2026-10-27T12:00:00Z');
  sent = [];
  let n = 40;
  answer = () => ({ status: 200, body: { status: 'recorded', item: null, decision: `DEC-${++n}` } });
  ctx = await buildApp({ dataDir: dir, adminToken: '', allowedHosts: [], allowedOrigins: [], connect: undefined, pdi: opts.pdi === false ? { eventsUrl: '', secret: '' } : { eventsUrl: 'https://pdi.example.com', secret: SECRET, fetch: fakeFetch as typeof fetch, clock: () => now } });
  if (opts.policy) expect((await putSettings(ctx.app, { policy: opts.policy })).statusCode).toBe(200);
  await ctx.engine.applyDemoScenario('answers-in-sources');
  const project = (await ctx.store.demoContext())!;
  project.requirements.find((r) => r.key === 'CHK-202')!.labels.push('change:CHG-12');
  await ctx.store.saveDemoContext(project);
  await ctx.engine.analyze('setup');
  await ctx.pdi.deliver();
  return ctx;
}
async function call(method: 'GET' | 'POST', url: string, payload?: unknown) {
  const res = await ctx!.app.inject({ method, url, payload: payload as object, headers: { 'x-ci-actor': 'Ann' } });
  return { status: res.statusCode, body: res.body ? res.json() : undefined };
}
const finding = async (key: string, ruleId: string): Promise<Finding> => (await call('GET', `/api/items/${key}`)).body.item.findings.find((f: Finding) => f.ruleId === ruleId);
const decisionsSent = () => sent.filter((e) => e.type === 'decision.recorded');
const outboxDecisions = async () => (await ctx!.store.pdiOutbox()).filter((e) => e.event.type === 'decision.recorded');
async function act(action: 'accept' | 'edit' | 'reject', answerText?: string) {
  const f = await finding('CHK-202', 'ERR-003');
  expect((await call('POST', `/api/items/CHK-202/answers/${f.answer!.id}`, { action, ...(answerText && { answer: answerText }) })).status).toBe(200);
  await ctx!.pdi.deliver();
  return f;
}
const localDecision = async () => ((await ctx!.store.decisions()) as ActiveDecision[]).find((d) => d.findingId === 'ERR-003:CHK-202')!;

describe('decision.recorded to pdi', () => {
  it('A2B-01: Accept sends the person\'s decision on the AI draft and keeps the DEC pdi answers', async () => {
    await start();
    await act('accept');
    const [e] = decisionsSent();
    expect(e).toMatchObject({ type: 'decision.recorded', source: 'ci_for_sdlc', contract_version: '0.7.0', payload: { decision_type: 'finding.auto_close', ref: 'CHK-202/ERR-003:CHK-202', decided_by: 'Ann', drafted_by: 'ai', draft_edited: false, change: 'CHG-12' } });
    expect(e!.payload.evidence).toEqual([{ text: expect.stringMatching(/^If the payment provider does not respond within 30 seconds/), source_url: 'https://demo.atlassian.net/wiki/spaces/PAY/pages/1004' }]);
    expect(e!.payload.url).toBe('http://localhost:4317/#/item/CHK-202/ERR-003%3ACHK-202');
    expect((await localDecision()).pdiDecision).toBe('DEC-41');
    expect(await outboxDecisions()).toEqual([]);
  });

  it('A2B-02: Edit and Reject count as a changed draft; a duplicate answer still gives the DEC; a rejection keeps it in the proposal log', async () => {
    await start();
    answer = () => ({ status: 200, body: { status: 'duplicate', item: null, decision: 'DEC-7' } });
    await act('edit', 'A timeout message after 30 s.');
    expect(decisionsSent()[0]!.payload).toMatchObject({ draft_edited: true, statement: expect.stringMatching(/A timeout message after 30 s\.$/) });
    expect((await localDecision()).pdiDecision).toBe('DEC-7');

    const arch = await finding('CHK-202', 'ARCH-002');
    answer = () => ({ status: 200, body: { status: 'recorded', item: null, decision: 'DEC-8' } });
    await call('POST', `/api/items/CHK-202/answers/${arch.answer!.id}`, { action: 'reject' });
    await ctx!.pdi.deliver();
    expect(decisionsSent()[1]!.payload).toMatchObject({ draft_edited: true, ref: 'CHK-202/ARCH-002:CHK-202', statement: expect.stringMatching(/^Rejected the answer from Payment Failure Handling/) });
    expect((await ctx!.store.autoCloseLog()).find((x) => x.outcome === 'rejected')).toMatchObject({ pdiDecision: 'DEC-8' });
  });

  it('A2B-03: Reopen waits until the decision it reopens has its DEC, then supersedes it', async () => {
    await start();
    answer = () => ({ status: 503, body: { error: 'down' } });
    await act('accept');
    const d = await localDecision();
    expect(d.pdiDecision).toBeUndefined();
    expect((await call('POST', `/api/decisions/${d.id}/reopen`, { reason: 'Wrong flow' })).status).toBe(200);
    now = new Date(now.getTime() + 5 * 60_000);
    await ctx!.pdi.deliver();
    expect(decisionsSent().map((e) => e.id.split('-')[3])).toEqual(['accepted', 'accepted']);

    let n = 50;
    answer = () => ({ status: 200, body: { status: 'recorded', item: null, decision: `DEC-${++n}` } });
    now = new Date(now.getTime() + 10 * 60_000);
    await ctx!.pdi.deliver();
    const reopen = decisionsSent().find((e) => e.id.includes('-reopened-'))!;
    expect(reopen.payload).toMatchObject({ supersedes: 'DEC-51', draft_edited: true, why: 'Wrong flow', decided_by: 'Ann' });
    expect((await ctx!.store.decisions()).find((x) => x.id === d.id)).toMatchObject({ status: 'withdrawn', pdiDecision: 'DEC-51' });
    expect(await outboxDecisions()).toEqual([]);
  });

  it('A2B-04: a 400 from pdi is kept as failed with its reason and never retried', async () => {
    await start();
    answer = () => ({ status: 400, body: { error: 'Typ finding.auto_close nie jest na liście nadawcy ci_for_sdlc.' } });
    await act('accept');
    now = new Date(now.getTime() + 2 * 3600_000);
    await ctx!.pdi.deliver();
    expect(decisionsSent()).toHaveLength(1);
    expect(await outboxDecisions()).toEqual([expect.objectContaining({ failed: 'pdi answered 400: Typ finding.auto_close nie jest na liście nadawcy ci_for_sdlc.' })]);
    expect((await call('GET', '/api/pdi')).body.outbox).toContainEqual(expect.objectContaining({ failed: expect.stringMatching(/^pdi answered 400/) }));
    expect((await ctx!.store.auditLog()).some((a) => a.kind === 'pdi' && /refused decision\.recorded for CHK-202/.test(a.summary))).toBe(true);
  });

  it('A2B-05: decision events are never dropped after MAX_ATTEMPTS — they are the audit trail', async () => {
    await start();
    answer = () => ({ status: 503, body: { error: 'down' } });
    await act('accept');
    for (let i = 0; i < MAX_ATTEMPTS + 2; i++) {
      now = new Date(now.getTime() + 2 * 3600_000);
      await ctx!.pdi.deliver();
    }
    const [entry] = await outboxDecisions();
    expect(entry!.attempts).toBe(MAX_ATTEMPTS + 3);
    expect(entry!.failed).toBeUndefined();
  });

  it('A2B-06: apply sends the automat\'s decision: decided by ci_for_sdlc, with its rule, without draft_edited', async () => {
    await start({ policy: { autoClose: 'apply' } });
    const e = decisionsSent().find((x) => x.payload.ref === 'CHK-202/ERR-003:CHK-202')!;
    expect(e.payload).toMatchObject({ decided_by: 'ci_for_sdlc', drafted_by: 'ai', automation: { level: 1, rule: 'auto-close:ERR-003' } });
    expect(e.payload).not.toHaveProperty('draft_edited');
    expect((await localDecision()).pdiDecision).toMatch(/^DEC-\d+$/);
  });

  it('A2B-07: without the pdi link nothing is queued, and the decision still works locally', async () => {
    await start({ pdi: false });
    await act('accept');
    expect(await ctx!.store.pdiOutbox()).toEqual([]);
    expect((await localDecision()).pdiDecision).toBeUndefined();
  });
});
