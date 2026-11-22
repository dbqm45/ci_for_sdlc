import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HUMAN_QUESTION_RULE } from '@ci/core';
import { buildApp } from '../src/app.js';
import { requiredRole } from '../src/roles.js';

// R1 (docs/REFINEMENT-PLAN.md): a person asks a question on a work item; the Product Owner accepts it for readiness.

let ctx: Awaited<ReturnType<typeof buildApp>>;
const dir = mkdtempSync(join(tmpdir(), 'ci-hq-'));

beforeAll(async () => {
  ctx = await buildApp({ dataDir: dir });
});
afterAll(async () => {
  await ctx.app.close();
  rmSync(dir, { recursive: true, force: true });
});

const json = async (method: 'GET' | 'POST', url: string, payload?: unknown) => {
  const res = await ctx.app.inject({ method, url, payload: payload as any });
  return { status: res.statusCode, body: res.json() };
};

const readyStory = async (): Promise<string> => {
  const { body } = await json('GET', '/api/analysis');
  return body.items.find((i: { type: string; readiness: string }) => i.type === 'story' && i.readiness === 'ready').key;
};

describe('questions people ask (R1)', () => {
  it('HQS-01: asking adds a human finding that does not change readiness yet', async () => {
    const key = await readyStory();
    const { status, body } = await json('POST', `/api/items/${key}/questions`, {
      text: 'What if the card expires?',
      link: 'https://wiki.example.com/p',
      by: 'Ola',
    });
    expect(status).toBe(200);
    expect(body.question).toMatchObject({
      itemKey: key,
      text: 'What if the card expires?',
      author: 'Ola',
      accepted: false,
    });
    expect(body.question.id).toMatch(/^hq-[a-f0-9]{12}$/);
    const f = body.item.findings.find((x: { ruleId: string }) => x.ruleId === HUMAN_QUESTION_RULE);
    expect(f).toMatchObject({
      origin: 'human',
      status: 'open',
      human: { author: 'Ola', accepted: false },
    });
    expect(body.item.readiness).toBe('ready');
  });

  it('HQS-02: accepting makes it count; accepting twice is refused', async () => {
    const key = await readyStory();
    const asked = await json('POST', `/api/items/${key}/questions`, {
      text: 'Is a partial refund allowed?',
      by: 'Ola',
    });
    const id = asked.body.question.id;
    const accepted = await json('POST', `/api/items/${key}/questions/${id}/accept`, { by: 'PO' });
    expect(accepted.status).toBe(200);
    expect(accepted.body.question).toMatchObject({
      accepted: true,
      acceptedBy: 'PO',
    });
    expect(accepted.body.item.readiness).toBe('needs_attention');
    expect(
      (
        await json('POST', `/api/items/${key}/questions/${id}/accept`, {
          by: 'PO',
        })
      ).status,
    ).toBe(409);
  });

  it('HQS-03: a decision on its question closes it like any finding', async () => {
    const { body } = await json('GET', '/api/analysis');
    const f = body.items
      .flatMap((i: { findings: unknown[] }) => i.findings)
      .find((x: { ruleId: string; human?: { accepted: boolean } }) => x.ruleId === HUMAN_QUESTION_RULE && x.human?.accepted);
    const decided = await json('POST', '/api/decisions', {
      questionId: f.question.id,
      findingId: f.id,
      itemKey: f.itemKey,
      question: f.question.text,
      answer: 'Yes, up to the paid amount.',
      by: 'PO',
    });
    expect(decided.status).toBe(200);
    expect(decided.body.item.findings.find((x: { id: string }) => x.id === f.id).status).toBe('resolved');
  });

  it('HQS-04: refuses an unknown item, an empty text, a non-http link and an unknown question', async () => {
    const key = await readyStory();
    expect((await json('POST', '/api/items/NOPE-1/questions', { text: 'x' })).status).toBe(404);
    expect((await json('POST', `/api/items/${key}/questions`, { text: '   ' })).status).toBe(400);
    expect(
      (
        await json('POST', `/api/items/${key}/questions`, {
          text: 'x',
          link: 'javascript:alert(1)',
        })
      ).status,
    ).toBe(400);
    expect((await json('POST', `/api/items/${key}/questions/hq-000000000000/accept`, {})).status).toBe(404);
    expect((await json('POST', `/api/items/${key}/questions/not-an-id/accept`, {})).status).toBe(422); // schema validation
  });

  it('HQS-06: the workspace-scoped route stores the question in that workspace', async () => {
    const key = await readyStory();
    const { status, body } = await json('POST', `/api/w/default/items/${key}/questions`, { text: 'Which currency is shown?', by: 'Ola' });
    expect(status).toBe(200);
    const item = (await json('GET', `/api/w/default/items/${key}`)).body.item;
    expect(item.findings.some((f: { id: string }) => f.id.endsWith(`:${body.question.id}`))).toBe(true);
  });

  it('HQS-05: any member may ask; accepting needs Admin (the Product Owner)', () => {
    expect(requiredRole('POST', '/api/items/PAY-1/questions')).toBe('member');
    expect(requiredRole('POST', '/api/w/acme/items/PAY-1/questions/hq-0123456789ab/accept')).toBe('admin');
  });
});
