import { describe, expect, it, vi } from 'vitest';
import { authStep } from '../src/lib/auth';
import { createSseParser, subscribeEvents } from '../src/lib/sse';

// K1b (docs/READ-TOKEN-K1B-PLAN.md): with CI_READ_TOKEN the live updates need the token too. EventSource cannot send a
// header, so the UI reads /api/events with fetch and parses Server-Sent Events itself.

describe('SSE parser', () => {
  it('SSE-01: events split across chunks and lines, comments and pings ignored, multi-line data joined', () => {
    const got: [string, string][] = [];
    const feed = createSseParser((event, data) => got.push([event, data]));
    for (const chunk of ['event: anal', 'ysis\ndata: {"a"', ':1}\n\n: ping\n\n', 'event: status\r\ndata: {"running":true}\r\n\r\n', 'data: line 1\ndata: line 2\n\n']) feed(chunk);
    expect(got).toEqual([
      ['analysis', '{"a":1}'],
      ['status', '{"running":true}'],
      ['message', 'line 1\nline 2'],
    ]);
  });

  it('SSE-02: an event without a blank line yet is not dispatched', () => {
    const got: string[] = [];
    const feed = createSseParser((event) => got.push(event));
    feed('event: analysis\ndata: {}\n');
    expect(got).toEqual([]);
    feed('\n');
    expect(got).toEqual(['analysis']);
  });
});

const stream = (chunks: string[]) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      for (const x of chunks) c.enqueue(new TextEncoder().encode(x));
      c.close();
    },
  });

describe('subscribeEvents', () => {
  it('SSE-03: sends the token as a bearer header, hands events over and reconnects after the stream ends', async () => {
    const calls: RequestInit[] = [];
    let n = 0;
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      calls.push(init);
      n++;
      if (n === 1) return new Response(stream(['event: analysis\ndata: {}\n\n']), { status: 200 });
      if (n === 2) return new Response('{}', { status: 401 });
      if (n === 3) return new Response(stream(['event: status\ndata: {"running":false}\n\n']), { status: 200 });
      return new Response('{}', { status: 401 });
    });
    const got: string[] = [];
    const stop = subscribeEvents('/api/events', { analysis: () => got.push('analysis'), status: (d) => got.push(`status ${d}`) }, { fetchImpl, token: () => 'r3ad', retryMs: 1 });
    await vi.waitFor(() => expect(got).toEqual(['analysis', 'status {"running":false}']));
    stop();
    expect((calls[0]!.headers as Record<string, string>).authorization).toBe('Bearer r3ad');
    expect((calls[0]!.headers as Record<string, string>).accept).toBe('text/event-stream');
  });

  it('SSE-04: without a token no authorization header; stop() ends it', async () => {
    const fetchImpl = vi.fn(async () => new Response(stream([]), { status: 200 }));
    const stop = subscribeEvents('/api/events', {}, { fetchImpl, token: () => '', retryMs: 1 });
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalled());
    stop();
    const count = fetchImpl.mock.calls.length;
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchImpl.mock.calls.length).toBeLessThanOrEqual(count + 1);
    expect(((fetchImpl.mock.calls[0] as unknown[])[1] as RequestInit & { headers: Record<string, string> }).headers.authorization).toBeUndefined();
  });
});

describe('asking for a token', () => {
  it.each([
    ['a 401 without WWW-Authenticate is an error', { status: 401, challenge: false, retried: false, used: '', current: '' }, 'fail'],
    ['a first 401 asks for the token', { status: 401, challenge: true, retried: false, used: '', current: '' }, 'prompt'],
    ['a 401 after another request saved a token retries without asking', { status: 401, challenge: true, retried: false, used: '', current: 'r3ad' }, 'retry'],
    ['a 401 with the saved token still asks (a read token for a change)', { status: 401, challenge: true, retried: false, used: 'r3ad', current: 'r3ad' }, 'prompt'],
    ['a 401 after the retry forgets the token', { status: 401, challenge: true, retried: true, used: 'bad', current: 'bad' }, 'forget'],
    ['anything else passes', { status: 200, challenge: false, retried: false, used: '', current: '' }, 'ok'],
  ])('AUTH: %s', (_, input, expected) => {
    expect(authStep(input)).toBe(expected);
  });
});
