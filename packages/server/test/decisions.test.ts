import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

let ctx: Awaited<ReturnType<typeof buildApp>>;
const dir = mkdtempSync(join(tmpdir(), 'ci-decisions-'));

const legacy = {
  id: 'legacy1',
  questionId: 'q:legacy',
  findingId: 'legacy',
  itemKey: 'PAY-123',
  topic: 'legacy',
  question: 'Old question?',
  answer: 'Old answer',
  decidedBy: 'someone',
  decidedAt: '2026-01-01T00:00:00.000Z',
  effect: 'resolve',
};

beforeAll(async () => {
  // A decision file written before versioning existed.
  writeFileSync(join(dir, 'decisions.json'), JSON.stringify([legacy]));
  ctx = await buildApp({ dataDir: dir });
});
afterAll(async () => {
  await ctx.app.close();
  rmSync(dir, { recursive: true, force: true });
});

const json = async (method: 'GET' | 'POST' | 'DELETE', url: string, payload?: unknown) => {
  const res = await ctx.app.inject({ method, url, payload: payload as any });
  return { status: res.statusCode, body: res.json() };
};

const question = async () => {
  const { body } = await json('GET', '/api/items/PAY-124');
  const f = body.item.findings.find((x: any) => x.ruleId === 'ERR-004');
  return { questionId: f.question.id, findingId: f.id, itemKey: 'PAY-124', question: f.question.text, topic: f.question.topic };
};

describe('decisions are immutable and versioned (P3)', () => {
  it('treats decisions stored before versioning as active version 1', async () => {
    const all = await json('GET', '/api/decisions');
    expect(all.body.find((d: any) => d.id === 'legacy1')).toMatchObject({ version: 1, status: 'active' });
  });

  it('creates version 1 for a first decision', async () => {
    const res = await json('POST', '/api/decisions', { ...(await question()), answer: 'Confirmation dialog', decidedBy: 'Anna' });
    expect(res.status).toBe(200);
    expect(res.body.decision).toMatchObject({ version: 1, status: 'active' });
  });

  it('requires a reason to change an active decision', async () => {
    const res = await json('POST', '/api/decisions', { ...(await question()), answer: 'Undo toast', decidedBy: 'Piotr' });
    expect(res.status).toBe(400);
  });

  it('supersedes instead of overwriting, keeping who, when and why', async () => {
    const q = await question();
    const res = await json('POST', '/api/decisions', { ...q, answer: 'Undo toast', decidedBy: 'Piotr', reason: 'UX research showed dialogs are ignored' });
    expect(res.status).toBe(200);
    const v2 = res.body.decision;
    expect(v2).toMatchObject({ version: 2, status: 'active', changeReason: 'UX research showed dialogs are ignored', decidedBy: 'Piotr' });

    const all = (await json('GET', '/api/decisions')).body.filter((d: any) => d.questionId === q.questionId);
    expect(all).toHaveLength(2);
    const v1 = all.find((d: any) => d.version === 1);
    expect(v1).toMatchObject({ status: 'superseded', supersededBy: v2.id, answer: 'Confirmation dialog' });
    expect(v2.supersedes).toBe(v1.id);

    const item = await json('GET', '/api/items/PAY-124');
    expect(item.body.decisions.filter((d: any) => d.questionId === q.questionId).map((d: any) => d.answer)).toEqual(['Undo toast']);
    expect(item.body.decisionHistory.some((d: any) => d.id === v1.id)).toBe(true);
  });

  it('withdraws instead of deleting and re-opens the finding', async () => {
    const q = await question();
    const active = (await json('GET', '/api/decisions')).body.find((d: any) => d.questionId === q.questionId && d.status === 'active');
    const res = await ctx.app.inject({ method: 'DELETE', url: `/api/decisions/${active.id}`, payload: { by: 'Anna', reason: 'Needs legal review' } });
    expect(res.statusCode).toBe(200);
    const after = (await json('GET', '/api/decisions')).body.find((d: any) => d.id === active.id);
    expect(after).toMatchObject({ status: 'withdrawn', withdrawnBy: 'Anna', withdrawReason: 'Needs legal review' });
    const item = await json('GET', '/api/items/PAY-124');
    expect(item.body.item.findings.find((f: any) => f.id === q.findingId).status).toBe('open');
    const audit = await json('GET', '/api/audit');
    expect(audit.body.some((a: any) => a.kind === 'decision_withdrawn' && a.actor === 'Anna')).toBe(true);
  });

  it('continues the version chain after a withdrawal without requiring a reason', async () => {
    const q = await question();
    const res = await json('POST', '/api/decisions', { ...q, answer: 'Confirmation dialog', decidedBy: 'Anna' });
    expect(res.status).toBe(200);
    expect(res.body.decision.version).toBe(3);
  });
});
