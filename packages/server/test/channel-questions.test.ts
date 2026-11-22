import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { pdiSignature } from '../src/pdi.js';
import { parseChannelQuestion } from '../src/questions.js';

// Step 16 (pdi docs/plan-budowy-suity.md, docs/CHANNELS.md): a question asked in Slack reaches the story through DI Channels.

const SECRET = 'channels-test-secret';
let ctx: Awaited<ReturnType<typeof buildApp>>;
const dir = mkdtempSync(join(tmpdir(), 'ci-ch-'));

beforeAll(async () => {
  ctx = await buildApp({ dataDir: dir, channels: { secret: SECRET } });
});
afterAll(async () => {
  await ctx.app.close();
  rmSync(dir, { recursive: true, force: true });
});

const send = async (body: unknown, opts: { secret?: string; ts?: number } = {}) => {
  const raw = JSON.stringify(body);
  const ts = String(opts.ts ?? Math.floor(Date.now() / 1000));
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/api/webhooks/channels',
    headers: { 'content-type': 'application/json', 'x-di-timestamp': ts, 'x-di-signature': pdiSignature(opts.secret ?? SECRET, ts, raw) },
    payload: raw,
  });
  return { status: res.statusCode, body: res.json() };
};

const storyKey = async (): Promise<string> => {
  const res = await ctx.app.inject({ method: 'GET', url: '/api/analysis' });
  return res.json().items.find((i: { type: string }) => i.type === 'story').key;
};

const question = (item: string, id = 'Ev01ABC') => ({
  id,
  platform: 'slack',
  item,
  text: 'Does this work offline?',
  link: 'https://acme.slack.com/archives/C1/p1',
  author: { name: 'Ola', user: 'U012AB3CD' },
});

describe('questions from a chat app (step 16)', () => {
  it('CHQ-01: a signed Slack question lands on the story, with the Slack name as author', async () => {
    const key = await storyKey();
    const { status, body } = await send(question(key));
    expect(status).toBe(200);
    expect(body.duplicate).toBe(false);
    expect(body.question).toMatchObject({
      itemKey: key,
      author: 'Ola (Slack)',
      accepted: false,
      via: { platform: 'slack', user: 'U012AB3CD', event: 'Ev01ABC' },
    });
    const item = (await ctx.app.inject({ method: 'GET', url: `/api/items/${key}` })).json().item;
    const f = item.findings.find((x: { id: string }) => x.id.endsWith(`:${body.question.id}`));
    expect(f).toMatchObject({ origin: 'human', human: { author: 'Ola (Slack)', accepted: false } });
  });

  it('CHQ-02: a retried delivery of the same event adds nothing', async () => {
    const key = await storyKey();
    const first = await send(question(key, 'Ev02RETRY'));
    const again = await send(question(key, 'Ev02RETRY'));
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ duplicate: true, question: { id: first.body.question.id } });
  });

  it('CHQ-03: a wrong secret, an old timestamp or no signature is 401', async () => {
    const key = await storyKey();
    expect((await send(question(key, 'Ev03'), { secret: 'other' })).status).toBe(401);
    expect((await send(question(key, 'Ev03'), { ts: Math.floor(Date.now() / 1000) - 3600 })).status).toBe(401);
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/webhooks/channels',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify(question(key, 'Ev03')),
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().detail).toContain('X-DI-Timestamp');
  });

  it('CHQ-04: an unknown story is 404 (the chat app tells the person), a bad body 400', async () => {
    expect((await send(question('NOPE-999', 'Ev04'))).status).toBe(404);
    expect((await send({ ...question('PAY-1', 'Ev05'), platform: 'teams' })).status).toBe(400);
    expect((await send({ ...question('PAY-1', 'Ev06'), email: 'x@example.com' })).status).toBe(400);
  });

  it('CHQ-05: the body check names what is wrong and keeps only known fields', () => {
    expect(parseChannelQuestion(null)).toBe('The body must be a JSON object');
    expect(parseChannelQuestion({ ...question('PAY-1'), author: { name: 'Ola', user: 'not-a-slack-id' } })).toMatch(/^author/);
    expect(parseChannelQuestion({ ...question('PAY-1'), item: 'pay 1' })).toMatch(/^item/);
    expect(parseChannelQuestion({ ...question('PAY-1'), text: '  ' })).toMatch(/^text/);
    expect(parseChannelQuestion(question('PAY-1'))).toEqual(question('PAY-1'));
  });

  it('CHQ-06: without the secret the route does not exist', async () => {
    const other = mkdtempSync(join(tmpdir(), 'ci-ch-off-'));
    const off = await buildApp({ dataDir: other });
    const res = await off.app.inject({ method: 'POST', url: '/api/webhooks/channels', headers: { 'content-type': 'application/json' }, payload: '{}' });
    expect(res.statusCode).toBe(404);
    await off.app.close();
    rmSync(other, { recursive: true, force: true });
  });
});
