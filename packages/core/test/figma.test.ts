import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchFigma, framesFromDocument } from '../src/index.js';
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
const nodeDetails = (...nodes: { id: string; name: string; type: string; [key: string]: unknown }[]) =>
  json({ nodes: Object.fromEntries(nodes.map((node) => [node.id, { document: node }])) });

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  clearFigmaCache();
});

describe('fetchFigma', () => {
  it('FG-01: fetches shallow metadata and selected node details for every file', async () => {
    const calls = fakeFetch(
      componentMetadata('1:1'),
      json({ name: 'Pay flows', lastModified: '2026-09-01T00:00:00Z', ...page([{ id: '1:1', name: 'Pay', type: 'FRAME' }]) }),
      nodeDetails({ id: '1:1', name: 'Pay', type: 'FRAME', children: [] }),
      componentMetadata('2:1'),
      json(page([{ id: '2:1', name: 'Done', type: 'COMPONENT' }])),
      nodeDetails({ id: '2:1', name: 'Done', type: 'COMPONENT', children: [] }),
    );
    const frames = await fetchFigma({ token: 'figd_x', fileKeys: ['AB/1', 'CD2'] });
    expect(calls.map((c) => c.token)).toEqual(Array(6).fill('figd_x'));
    expect(calls[0]?.url).toBe('https://api.figma.com/v1/files/AB%2F1/components');
    expect(calls[1]?.url).toBe('https://api.figma.com/v1/files/AB%2F1?depth=3');
    expect(calls[2]?.url).toContain('/files/AB%2F1/nodes?ids=1%3A1&depth=2');
    expect(calls[3]?.url).toBe('https://api.figma.com/v1/files/CD2/components');
    expect(calls[4]?.url).toBe('https://api.figma.com/v1/files/CD2?depth=3');
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
      json(page([{ id: '1:1', name: 'F', type: 'FRAME' }])),
      nodeDetails({ id: '1:1', name: 'F', type: 'FRAME', children: [{ id: '2:1', name: 'Group', type: 'GROUP', children: texts }] }),
    );
    const [frame] = await fetchFigma({ token: 't', fileKeys: ['K'], maxTextsPerFrame: 2 });
    expect(calls).toHaveLength(3);
    expect(frame?.texts).toEqual(['a', 'b']);
  });

  it('FG-06: does not issue follow-up requests for every nested Figma layer', async () => {
    const calls = fakeFetch(
      componentMetadata(),
      json(page([{ id: '1:1', name: 'F', type: 'FRAME' }])),
      nodeDetails({
        id: '1:1',
        name: 'F',
        type: 'FRAME',
        children: [{ id: '2:1', name: 'Group', type: 'GROUP', children: [{ id: '3:1', name: 'Nested group', type: 'GROUP' }] }],
      }),
    );
    await fetchFigma({ token: 'bounded-token', fileKeys: ['BOUNDED'] });
    expect(calls).toHaveLength(3);
    expect(calls.map((call) => call.url)).toEqual([
      'https://api.figma.com/v1/files/BOUNDED/components',
      'https://api.figma.com/v1/files/BOUNDED?depth=3',
      expect.stringContaining('/files/BOUNDED/nodes?ids=1%3A1&depth=2'),
    ]);
  });

  it('FG-07: batches all selected frame IDs into one depth-limited nodes request', async () => {
    const calls = fakeFetch(
      componentMetadata('1:1'),
      json(page([
        { id: '1:1', name: 'One', type: 'COMPONENT' },
        { id: '1:2', name: 'Two', type: 'FRAME' },
      ])),
      nodeDetails(
        { id: '1:1', name: 'One', type: 'COMPONENT', children: [] },
        { id: '1:2', name: 'Two', type: 'FRAME', children: [] },
      ),
    );
    await fetchFigma({ token: 'batch-token', fileKeys: ['BATCH'] });
    const nodesUrl = new URL(calls[2]?.url ?? '');
    expect(nodesUrl.pathname).toBe('/v1/files/BATCH/nodes');
    expect(nodesUrl.searchParams.get('ids')).toBe('1:1,1:2');
    expect(nodesUrl.searchParams.get('depth')).toBe('2');
  });

  it('FG-08: splits node batches when their response exceeds 500 KB', async () => {
    const largeText = 'x'.repeat(300 * 1024);
    const calls = fakeFetch(
      componentMetadata(),
      json(page([
        { id: '1:1', name: 'One', type: 'FRAME' },
        { id: '1:2', name: 'Two', type: 'FRAME' },
      ])),
      nodeDetails(
        { id: '1:1', name: 'One', type: 'FRAME', children: [{ id: '2:1', name: 'Text', type: 'TEXT', characters: largeText }] },
        { id: '1:2', name: 'Two', type: 'FRAME', children: [{ id: '2:2', name: 'Text', type: 'TEXT', characters: largeText }] },
      ),
      nodeDetails({ id: '1:1', name: 'One', type: 'FRAME', children: [{ id: '2:1', name: 'Text', type: 'TEXT', characters: largeText }] }),
      nodeDetails({ id: '1:2', name: 'Two', type: 'FRAME', children: [{ id: '2:2', name: 'Text', type: 'TEXT', characters: largeText }] }),
    );
    const frames = await fetchFigma({ token: 'split-token', fileKeys: ['SPLIT'] });
    expect(calls).toHaveLength(5);
    expect(new URL(calls[2]?.url ?? '').searchParams.get('ids')).toBe('1:1,1:2');
    expect(new URL(calls[3]?.url ?? '').searchParams.get('ids')).toBe('1:1');
    expect(new URL(calls[4]?.url ?? '').searchParams.get('ids')).toBe('1:2');
    expect(frames.map((frame) => frame.texts[0]?.length)).toEqual([120, 120]);
  });

  it('FG-09: reuses successful responses from the process cache', async () => {
    const calls = fakeFetch(
      componentMetadata('1:1'),
      json(page([{ id: '1:1', name: 'Pay', type: 'FRAME' }])),
      nodeDetails({ id: '1:1', name: 'Pay', type: 'FRAME', children: [] }),
      componentMetadata('1:1'),
      json(page([{ id: '1:1', name: 'Pay', type: 'FRAME' }])),
      nodeDetails({ id: '1:1', name: 'Pay', type: 'FRAME', children: [] }),
    );
    const config = { token: 'cache-token', fileKeys: ['CACHE'] };
    await fetchFigma(config);
    await fetchFigma(config);
    await fetchFigma({ ...config, token: 'different-token' });
    expect(calls).toHaveLength(6);
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
