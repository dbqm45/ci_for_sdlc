import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { DesignFrame } from '../../src/index.js';

/**
 * Figma REST API mock (test data generator, stage E2). Serves the two endpoints the connector reads, built from
 * DesignFrames. Listens on 127.0.0.1 only, accepts a single dummy token and never forwards anything upstream.
 */
export interface FigmaMockOptions {
  frames: DesignFrame[];
  /** The only token accepted; real tokens never belong in tests. */
  token?: string;
  /** Number of initial requests answered with 429 (Retry-After: 0) before serving data. */
  rateLimitFirst?: number;
}

export interface FigmaMock {
  /** Value for CI_FIGMA_API_BASE / FigmaConfig.apiBase. */
  apiBase: string;
  /** Request paths (with query) in arrival order. */
  requests: string[];
  close(): Promise<void>;
}

export const DUMMY_FIGMA_TOKEN = 'dummy-figma-token';

/** Builds a Figma file body (document → CANVAS pages → FRAME with TEXT layers and prototype interactions). */
export function figmaFile(frames: DesignFrame[]): unknown {
  const pages = new Map<string, DesignFrame[]>();
  for (const f of frames) pages.set(f.page, [...(pages.get(f.page) ?? []), f]);
  const [first] = frames;
  return {
    name: first?.fileName ?? 'Untitled',
    lastModified: frames.map((f) => f.updatedAt).sort().at(-1) ?? new Date(0).toISOString(),
    document: {
      id: '0:0',
      name: 'Document',
      type: 'DOCUMENT',
      children: [...pages].map(([name, list], i) => ({
        id: `0:${i + 1}`,
        name,
        type: 'CANVAS',
        children: list.map((f) => ({
          id: f.id,
          name: f.name,
          type: 'FRAME',
          interactions: f.transitions.length ? [{ actions: f.transitions.map((destinationId) => ({ destinationId })) }] : [],
          children: f.texts.map((characters, j) => ({ id: `${f.id};t${j}`, name: characters, type: 'TEXT', characters })),
        })),
      })),
    },
  };
}

export async function startFigmaMock(opts: FigmaMockOptions): Promise<FigmaMock> {
  const token = opts.token ?? DUMMY_FIGMA_TOKEN;
  const files = new Map<string, DesignFrame[]>();
  for (const f of opts.frames) files.set(f.fileKey, [...(files.get(f.fileKey) ?? []), f]);
  const requests: string[] = [];
  let rateLimited = opts.rateLimitFirst ?? 0;

  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    requests.push(`${url.pathname}${url.search}`);
    const send = (status: number, body: unknown, headers: Record<string, string> = {}) => {
      res.writeHead(status, { 'content-type': 'application/json', ...headers });
      res.end(JSON.stringify(body));
    };
    if (req.method !== 'GET') return send(405, { status: 405, err: 'Method not allowed' });
    // Figma answers an invalid token with 403, not 401.
    if (req.headers['x-figma-token'] !== token) return send(403, { status: 403, err: 'Invalid token' });
    if (rateLimited > 0) {
      rateLimited -= 1;
      return send(429, { status: 429, err: 'Rate limit exceeded' }, { 'retry-after': '0', 'x-figma-rate-limit-type': 'low', 'x-figma-plan-tier': 'starter' });
    }
    const match = /^\/v1\/files\/([^/]+)(\/components)?$/.exec(url.pathname);
    const frames = match ? files.get(decodeURIComponent(match[1] ?? '')) : undefined;
    if (!match || !frames) return send(404, { status: 404, err: 'Not found' });
    if (match[2]) return send(200, { status: 200, error: false, meta: { components: [] } });
    return send(200, figmaFile(frames));
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address() as AddressInfo;
  return {
    apiBase: `http://127.0.0.1:${port}/v1`,
    requests,
    close: () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}
