import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchFigma, framesFromDocument } from '../src/index.js';

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

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
const page = (children: unknown[]) => ({ document: { children: [{ id: '0:1', name: 'Checkout', type: 'CANVAS', children }] } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchFigma', () => {
  it('FG-01: reads every file with the token header and keeps file name and modification date', async () => {
    const calls = fakeFetch(
      json({ name: 'Pay flows', lastModified: '2026-09-01T00:00:00Z', ...page([{ id: '1:1', name: 'Pay', type: 'FRAME' }]) }),
      json({ ...page([{ id: '2:1', name: 'Done', type: 'COMPONENT' }]) }),
    );
    const frames = await fetchFigma({ token: 'figd_x', fileKeys: ['AB/1', 'CD2'] });
    expect(calls.map((c) => [c.url, c.token])).toEqual([
      ['https://api.figma.com/v1/files/AB%2F1', 'figd_x'],
      ['https://api.figma.com/v1/files/CD2', 'figd_x'],
    ]);
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
    fakeFetch(json(body));
    await expect(fetchFigma({ token: 't', fileKeys: ['K'] })).rejects.toThrow('Figma file K → unexpected response');
  });

  it('FG-05: limits text layers per frame (data minimization)', async () => {
    const texts = ['a', 'b', 'c'].map((t, i) => ({ id: `9:${i}`, name: t, type: 'TEXT', characters: t }));
    fakeFetch(json(page([{ id: '1:1', name: 'F', type: 'FRAME', children: texts }])));
    const [frame] = await fetchFigma({ token: 't', fileKeys: ['K'], maxTextsPerFrame: 2 });
    expect(frame?.texts).toEqual(['a', 'b']);
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
