import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchFigma, figmaApiBase, framesFromDocument, FigmaRateLimitError } from '../src/index.js';
import { clearFigmaCache } from '../src/connectors/figma.js';

/** Fake for the network port: answers each request with the next queued response and records the URL and token. */
function fakeFetch(...responses: Response[]) {
  const calls: { url: string; token: string | null }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(input), token: new Headers(init?.headers).get('x-figma-token') });
      const next = responses.shift();
      if (!next) throw new Error('unexpected request');
      return next;
    }),
  );
  return calls;
}

const json = (body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json', ...headers } });
const page = (children: unknown[]) => ({ document: { children: [{ id: '0:1', name: 'Checkout', type: 'CANVAS', children }] } });
const componentMetadata = (...ids: string[]) => json({ meta: { components: ids.map((node_id) => ({ node_id })) } });

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  clearFigmaCache();
});

describe('fetchFigma', () => {
  it('FG-01: fetches shallow component metadata and file trees without node-detail requests', async () => {
    const calls = fakeFetch(
      componentMetadata('1:1'),
      json({ name: 'Pay flows', lastModified: '2026-09-01T00:00:00Z', ...page([{ id: '1:1', name: 'Pay', type: 'FRAME' }]) }),
      componentMetadata('2:1'),
      json(page([{ id: '2:1', name: 'Done', type: 'COMPONENT' }])),
    );
    const frames = await fetchFigma({ token: 'figd_x', fileKeys: ['AB/1', 'CD2'] });
    expect(calls.map((c) => c.token)).toEqual(Array(4).fill('figd_x'));
    expect(calls[0]?.url).toBe('https://api.figma.com/v1/files/AB%2F1/components');
    expect(calls[1]?.url).toBe('https://api.figma.com/v1/files/AB%2F1?depth=3');
    expect(calls[2]?.url).toBe('https://api.figma.com/v1/files/CD2/components');
    expect(calls[3]?.url).toBe('https://api.figma.com/v1/files/CD2?depth=3');
    expect(frames.map((f) => [f.fileKey, f.fileName, f.name])).toEqual([
      ['AB/1', 'Pay flows', 'Pay'],
      // a file without a name falls back to its key
      ['CD2', 'CD2', 'Done'],
    ]);
    expect(frames[0]?.updatedAt).toBe('2026-09-01T00:00:00Z');
  });

  it('FG-02: an HTTP error names the file and status', async () => {
    fakeFetch(new Response('Forbidden', { status: 403 }));
    await expect(fetchFigma({ token: 't', fileKeys: ['K'] })).rejects.toThrow('Figma file K → HTTP 403: Forbidden');
  });

  it.each([
    { id: 'FG-03', body: [] },
    { id: 'FG-04', body: { name: 'no document' } },
  ])('$id: a response without a document is rejected', async ({ body }) => {
    fakeFetch(componentMetadata(), json(body));
    await expect(fetchFigma({ token: 't', fileKeys: ['K'] })).rejects.toThrow('Figma file K → unexpected response');
  });

  it('FG-05: limits text layers per frame (data minimization)', async () => {
    const texts = ['a', 'b', 'c'].map((t, i) => ({ id: `9:${i}`, name: t, type: 'TEXT', characters: t }));
    const calls = fakeFetch(
      componentMetadata(),
      json(page([{ id: '1:1', name: 'F', type: 'FRAME', children: texts }])),
    );
    const [frame] = await fetchFigma({ token: 't', fileKeys: ['K'], maxTextsPerFrame: 2 });
    expect(calls).toHaveLength(2);
    expect(frame?.texts).toEqual(['a', 'b']);
  });

  it('FG-06: does not fetch nested node details separately', async () => {
    const calls = fakeFetch(
      componentMetadata(),
      json(page([{
        id: '1:1',
        name: 'F',
        type: 'FRAME',
        children: [{ id: '2:1', name: 'Group', type: 'GROUP', children: [{ id: '3:1', name: 'Nested group', type: 'GROUP' }] }],
      }])),
    );
    await fetchFigma({ token: 'shallow-token', fileKeys: ['SHALLOW'] });
    expect(calls).toHaveLength(2);
    expect(calls.map((call) => call.url)).toEqual([
      'https://api.figma.com/v1/files/SHALLOW/components',
      'https://api.figma.com/v1/files/SHALLOW?depth=3',
    ]);
  });

  it('FG-09: reuses successful responses from the process cache', async () => {
    const calls = fakeFetch(
      componentMetadata('1:1'),
      json(page([{ id: '1:1', name: 'Pay', type: 'FRAME' }])),
      componentMetadata('1:1'),
      json(page([{ id: '1:1', name: 'Pay', type: 'FRAME' }])),
    );
    const config = { token: 'cache-token', fileKeys: ['CACHE'] };
    await fetchFigma(config);
    await fetchFigma(config);
    await fetchFigma({ ...config, token: 'different-token' });
    expect(calls).toHaveLength(4);
  });

  it('FG-20: clearing the cache of one file makes only that file read fresh; without a key every file is', async () => {
    const calls = fakeFetch(
      componentMetadata(),
      json(page([{ id: '1:1', name: 'Pay', type: 'FRAME' }])),
      componentMetadata(),
      json(page([{ id: '2:1', name: 'Done', type: 'FRAME' }])),
      componentMetadata(),
      json(page([{ id: '1:1', name: 'Pay v2', type: 'FRAME' }])),
      componentMetadata(),
      json(page([{ id: '1:1', name: 'Pay v3', type: 'FRAME' }])),
      componentMetadata(),
      json(page([{ id: '2:1', name: 'Done v2', type: 'FRAME' }])),
    );
    const config = { token: 'clear-token', fileKeys: ['A', 'B'] };
    expect((await fetchFigma(config)).map((f) => f.name)).toEqual(['Pay', 'Done']);
    clearFigmaCache('UNRELATED');
    expect((await fetchFigma(config)).map((f) => f.name)).toEqual(['Pay', 'Done']);
    expect(calls).toHaveLength(4);
    clearFigmaCache('A');
    expect((await fetchFigma(config)).map((f) => f.name)).toEqual(['Pay v2', 'Done']);
    expect(calls).toHaveLength(6);
    clearFigmaCache();
    expect((await fetchFigma(config)).map((f) => f.name)).toEqual(['Pay v3', 'Done v2']);
    expect(calls).toHaveLength(10);
  });

  it('FG-10: honors Retry-After and uses exponential delays for repeated 429 responses', async () => {
    vi.useFakeTimers();
    const calls = fakeFetch(
      new Response('Rate limited', { status: 429 }),
      new Response('Rate limited', { status: 429 }),
      new Response('Rate limited', { status: 429, headers: { 'Retry-After': '3' } }),
      componentMetadata(),
      json(page([])),
    );
    const pending = fetchFigma({ token: 'retry-token', fileKeys: ['RETRY'] });
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(500);
    expect(calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(999);
    expect(calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(2999);
    expect(calls).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toEqual([]);
    expect(calls).toHaveLength(5);
  });

  it('FG-11: caps an excessive Retry-After instead of stalling the queue for as long as upstream asks', async () => {
    vi.useFakeTimers();
    const calls = fakeFetch(
      new Response('Rate limited', { status: 429, headers: { 'Retry-After': '3600' } }),
      componentMetadata(),
      json(page([])),
    );
    const pending = fetchFigma({ token: 'retry-token', fileKeys: ['RETRY'] });
    await vi.advanceTimersByTimeAsync(29_999);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toEqual([]);
    expect(calls).toHaveLength(3);
  });

  it('FG-12: throws a dedicated rate-limit error (carrying Retry-After) once retries are exhausted', async () => {
    vi.useFakeTimers();
    fakeFetch(
      new Response('Rate limited', { status: 429, headers: { 'Retry-After': '5' } }),
      new Response('Rate limited', { status: 429, headers: { 'Retry-After': '5' } }),
      new Response('Rate limited', { status: 429, headers: { 'Retry-After': '5' } }),
      new Response('Rate limited', { status: 429, headers: { 'Retry-After': '5' } }),
    );
    const pending = fetchFigma({ token: 't', fileKeys: ['RL'] });
    const rejection = expect(pending).rejects.toMatchObject({ name: 'FigmaRateLimitError', retryAfterMs: 5_000 });
    await vi.advanceTimersByTimeAsync(15_000);
    await rejection;
    expect(await pending.catch((e) => e)).toBeInstanceOf(FigmaRateLimitError);
  });

  it('FG-13: carries the rate-limit type and plan tier Figma reports, for diagnosing which limit was hit', async () => {
    vi.useFakeTimers();
    fakeFetch(
      ...Array.from({ length: 4 }, () => new Response('Rate limited', {
        status: 429,
        headers: { 'Retry-After': '5', 'X-Figma-Rate-Limit-Type': 'low', 'X-Figma-Plan-Tier': 'starter' },
      })),
    );
    const pending = fetchFigma({ token: 't', fileKeys: ['RL'] });
    const rejection = expect(pending).rejects.toMatchObject({ rateLimitType: 'low', planTier: 'starter' });
    await vi.advanceTimersByTimeAsync(15_000);
    await rejection;
  });

  it('FG-14: names which Figma endpoint (components vs file tree) hit the rate limit', async () => {
    vi.useFakeTimers();
    fakeFetch(
      ...Array.from({ length: 4 }, () => new Response('Rate limited', { status: 429, headers: { 'Retry-After': '5' } })),
    );
    const pending = fetchFigma({ token: 't', fileKeys: ['RL'] });
    const rejection = expect(pending).rejects.toMatchObject({ endpoint: '/v1/files/RL/components' });
    await vi.advanceTimersByTimeAsync(15_000);
    await rejection;
  });
});

describe('figmaApiBase', () => {
  it('FG-15: sends requests to a loopback mock when an API base override is given', async () => {
    const calls = fakeFetch(componentMetadata(), json(page([{ id: '1:1', name: 'Pay', type: 'FRAME' }])));
    await fetchFigma({ token: 'figd_x', fileKeys: ['AB1'], apiBase: 'http://127.0.0.1:4010/v1/' });
    expect(calls.map((c) => c.url)).toEqual(['http://127.0.0.1:4010/v1/files/AB1/components', 'http://127.0.0.1:4010/v1/files/AB1?depth=3']);
  });

  it.each([
    { id: 'FG-16', raw: undefined, expected: 'https://api.figma.com/v1' },
    { id: 'FG-16', raw: '  ', expected: 'https://api.figma.com/v1' },
    { id: 'FG-17', raw: 'http://localhost:4010', expected: 'http://localhost:4010' },
    { id: 'FG-17', raw: 'https://[::1]:8443/figma/v1//', expected: 'https://[::1]:8443/figma/v1' },
  ])('$id: resolves $raw to $expected', ({ raw, expected }) => {
    expect(figmaApiBase(raw)).toBe(expected);
  });

  it.each([
    { id: 'FG-18', raw: 'https://evil.example/v1', message: /loopback/ },
    { id: 'FG-18', raw: 'http://127.0.0.1.evil.example/v1', message: /loopback/ },
    { id: 'FG-19', raw: 'ftp://127.0.0.1/v1', message: /http or https/ },
    { id: 'FG-19', raw: 'not a url', message: /valid URL/ },
    { id: 'FG-19', raw: 'http://user:pw@localhost/v1', message: /credentials/ },
  ])('$id: rejects $raw', ({ raw, message }) => {
    expect(() => figmaApiBase(raw)).toThrow(message);
  });

  it('FG-18: a non-loopback override fails before any request, so the token is never sent', async () => {
    const calls = fakeFetch(componentMetadata());
    await expect(fetchFigma({ token: 'figd_x', fileKeys: ['AB1'], apiBase: 'https://evil.example/v1' })).rejects.toThrow(/loopback/);
    expect(calls).toEqual([]);
  });
});

describe('framesFromDocument', () => {
  it('FG-06: collects variant names and interaction destinations, skipping non-canvas pages', () => {
    const doc = {
      children: [
        { id: '0:9', name: 'Notes', type: 'FIGJAM', children: [{ id: '5:5', name: 'Ignored', type: 'FRAME' }] },
        {
          id: '0:1',
          name: 'Checkout',
          type: 'CANVAS',
          children: [
            {
              id: '1:1',
              name: 'Button',
              type: 'COMPONENT_SET',
              children: [{ id: '1:2', name: 'State=Error', type: 'COMPONENT', interactions: [{ actions: [{ destinationId: '3:3' }, {}] }] }],
            },
            { id: '1:9', name: 'Loose text', type: 'TEXT', characters: 'x' },
          ],
        },
      ],
    };
    const frames = framesFromDocument('K', 'File', '2026-01-01', doc);
    expect(frames.map((f) => [f.page, f.name, f.texts, f.transitions])).toEqual([['Checkout', 'Button', ['State=Error'], ['3:3']]]);
  });
});
