import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { recordDecision, type Decision, type Finding, type PdiEvent } from '@ci/core';
import { buildApp } from '../src/app.js';

// D5 (docs/PDI-D5-PLAN.md): a person's decisions on findings (POST /decisions) and their withdrawal (DELETE) go to the
// suite index in pdi as decision.recorded with their origin; pdi answers with its DEC, kept on the local decision. The
// demo scenario "answers-in-sources" gives CHK-202 (labelled change:CHG-12 here) a timeout question.

const SECRET = 'shared-with-pdi';
let ctx: Awaited<ReturnType<typeof buildApp>> | undefined;
let dir: string;
let now: Date;
let sent: PdiEvent[];
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

async function start(opts: { pdi?: boolean } = {}) {
  dir = mkdtempSync(join(tmpdir(), 'ci-d5-'));
  now = new Date('2026-11-23T10:00:00Z');
  sent = [];
  let n = 40;
  answer = () => ({ status: 200, body: { status: 'recorded', item: null, decision: `DEC-${++n}` } });
  ctx = await buildApp({ dataDir: dir, adminToken: '', allowedHosts: [], allowedOrigins: [], connect: undefined, pdi: opts.pdi === false ? { eventsUrl: '', secret: '' } : { eventsUrl: 'https://pdi.example.com', secret: SECRET, fetch: fakeFetch as typeof fetch, clock: () => now } });
  await ctx.engine.applyDemoScenario('answers-in-sources');
  const project = (await ctx.store.demoContext())!;
  project.requirements.find((r) => r.key === 'CHK-202')!.labels.push('change:CHG-12');
  await ctx.store.saveDemoContext(project);
  await ctx.engine.analyze('setup');
  await ctx.pdi.deliver();
  return ctx;
}
async function call(method: 'GET' | 'POST' | 'DELETE', url: string, payload?: unknown) {
  const res = await ctx!.app.inject({ method, url, payload: payload as object, headers: { 'x-ci-actor': 'Ann' } });
  return { status: res.statusCode, body: res.body ? res.json() : undefined };
}
const finding = async (): Promise<Finding> => (await call('GET', '/api/items/CHK-202')).body.item.findings.find((f: Finding) => f.ruleId === 'ERR-003');
const decisionsSent = () => sent.filter((e) => e.type === 'decision.recorded');
const outboxDecisions = async () => (await ctx!.store.pdiOutbox()).filter((e) => e.event.type === 'decision.recorded');
const decisions = async () => (await ctx!.store.decisions()) as Decision[];
async function decide(f: Finding, body: Record<string, unknown>) {
  const r = await call('POST', '/api/decisions', { questionId: f.question!.id, findingId: f.id, itemKey: 'CHK-202', question: f.question!.text, ...body });
  expect(r.status).toBe(200);
  await ctx!.pdi.deliver();
  return r.body.decision as Decision;
}

describe('every decision of DI Definition to pdi (D5)', () => {
  it('D5-01: a person accepts a risk — decision.recorded with its origin, the change, and the DEC kept here', async () => {
    await start();
    const f = await finding();
    const d = await decide(f, { answer: 'We ship without a timeout message', effect: 'accept_risk', note: 'Provider SLA is 5 s' });
    const [e] = decisionsSent();
    expect(e).toMatchObject({
      source: 'ci_for_sdlc',
      contract_version: '0.17.0',
      payload: {
        decision_type: 'finding.accept_risk',
        ref: `CHK-202/${f.id}`,
        origin: { app: 'ci_for_sdlc', scope: 'default', local_id: `CHK-202/${f.id}` },
        statement: `Accepted the risk in "${f.question!.text}": We ship without a timeout message`,
        why: 'Provider SLA is 5 s',
        kind: 'triage',
        decided_by: 'Ann',
        drafted_by: 'human',
        change: 'CHG-12',
      },
    });
    expect((await decisions()).find((x) => x.id === d.id)?.pdiDecision).toBe('DEC-41');
    expect(await outboxDecisions()).toEqual([]);
  });

  it('D5-02: a new answer with a reason is a new version of the same origin; pdi supersedes it by the origin', async () => {
    await start();
    const f = await finding();
    await decide(f, { answer: 'Show a timeout message' });
    const second = await decide(f, { answer: 'Retry once, then show a timeout message', reason: 'The provider asked for one retry' });
    const [one, two] = decisionsSent();
    expect(one!.payload).toMatchObject({ decision_type: 'finding.resolve', kind: 'product' });
    expect(two!.payload).toMatchObject({ decision_type: 'finding.resolve', why: 'The provider asked for one retry', origin: one!.payload.origin });
    expect(two!.payload).not.toHaveProperty('supersedes');
    expect((await decisions()).find((x) => x.id === second.id)?.pdiDecision).toBe('DEC-42');
  });

  it('D5-03: a withdrawal waits until pdi has the decision it withdraws, then goes with its author and reason', async () => {
    await start();
    const f = await finding();
    answer = () => ({ status: 503, body: { error: 'down' } });
    const d = await decide(f, { answer: 'Not a real problem here', effect: 'dismiss' });
    expect((await call('DELETE', `/api/decisions/${d.id}`, { reason: 'It is a real problem' })).status).toBe(200);
    now = new Date(now.getTime() + 5 * 60_000);
    await ctx!.pdi.deliver();
    expect(decisionsSent().map((e) => e.payload.decision_type)).toEqual(['finding.dismiss', 'finding.dismiss']);

    let n = 50;
    answer = () => ({ status: 200, body: { status: 'recorded', item: null, decision: `DEC-${++n}` } });
    now = new Date(now.getTime() + 10 * 60_000);
    await ctx!.pdi.deliver();
    const withdrawal = decisionsSent().find((e) => e.payload.decision_type === 'finding.withdraw')!;
    expect(withdrawal.payload).toMatchObject({ decided_by: 'Ann', why: 'It is a real problem', origin: { local_id: `CHK-202/${f.id}` }, statement: expect.stringMatching(/^Withdrew the decision on /) });
    expect(withdrawal.payload).not.toHaveProperty('supersedes');
    expect((await decisions()).find((x) => x.id === d.id)).toMatchObject({ status: 'withdrawn', pdiDecision: 'DEC-51' });
    expect(await outboxDecisions()).toEqual([]);
  });

  it('D5-04: withdrawing a decision pdi never had (made before D5) sends nothing', async () => {
    await start();
    const f = await finding();
    let id = '';
    await ctx!.store.updateDecisions((all) => {
      const r = recordDecision(all, { questionId: f.question!.id, findingId: f.id, itemKey: 'CHK-202', topic: 'general', question: f.question!.text, answer: 'Old answer', decidedBy: 'Ann', decidedAt: '2026-11-01T00:00:00Z', effect: 'resolve' });
      id = r.decision.id;
      return r.all;
    });
    expect((await call('DELETE', `/api/decisions/${id}`, { reason: 'Outdated' })).status).toBe(200);
    await ctx!.pdi.deliver();
    expect(decisionsSent()).toEqual([]);
    expect(await outboxDecisions()).toEqual([]);
  });

  it('D5-05: a new answer to a question closed with an answer from a source supersedes its DEC (sent before D5 without origin)', async () => {
    await start();
    const f = await finding();
    expect((await call('POST', `/api/items/CHK-202/answers/${f.answer!.id}`, { action: 'accept' })).status).toBe(200);
    await ctx!.pdi.deliver();
    expect(decisionsSent()).toHaveLength(1);
    await decide(f, { answer: 'Retry once, then show a timeout message', reason: 'The source was outdated' });
    expect(decisionsSent()[1]!.payload).toMatchObject({ decision_type: 'finding.resolve', supersedes: 'DEC-41' });
  });

  it('D5-06: without the pdi link nothing is queued and decisions work as before', async () => {
    await start({ pdi: false });
    const f = await finding();
    const d = await decide(f, { answer: 'Show a timeout message' });
    expect((await call('DELETE', `/api/decisions/${d.id}`)).status).toBe(200);
    expect(await ctx!.store.pdiOutbox()).toEqual([]);
  });
});
