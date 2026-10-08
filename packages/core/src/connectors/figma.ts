import { createHash } from 'node:crypto';
import type { DesignFrame } from '../model.js';
import { isRecord, records, str } from '../guards.js';

/**
 * Figma connector (REST API, personal access token or OAuth token).
 * Reads top-level frames per page, their text layers / variant names and
 * prototype transitions. Images are never downloaded.
 */
export interface FigmaConfig {
  token: string;
  fileKeys: string[];
  /** Max text layers kept per frame (data minimization). */
  maxTextsPerFrame?: number;
}

interface FigmaNode {
  id: string;
  name: string;
  type: string;
  characters?: string;
  children?: FigmaNode[];
  transitionNodeID?: string;
  interactions?: { actions?: { destinationId?: string }[] }[];
}

interface CachedResponse {
  body: unknown;
  byteLength: number;
}

interface CacheEntry {
  expiresAt: number;
  promise: Promise<CachedResponse>;
}

const API = 'https://api.figma.com/v1';
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 30_000;
const REQUEST_TIMEOUT_MS = 30_000;
const CACHE_TTL_MS = 60_000;
const MAX_CACHE_ENTRIES = 100;
const MAX_BATCH_IDS = 20;
const MAX_RESPONSE_BYTES = 500_000;
const responseCache = new Map<string, CacheEntry>();

/** Test seam; the cache is deliberately not part of the public connector API. */
export function clearFigmaCache(): void {
  responseCache.clear();
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function retryAfterMs(header: string | null, now = Date.now()): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(header);
  return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}

async function requestJson(url: string, token: string, fileKey: string): Promise<CachedResponse> {
  for (let retry = 0; ; retry += 1) {
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'X-Figma-Token': token },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (res.status === 429 && retry < MAX_RETRIES) {
      const requestedDelay = retryAfterMs(res.headers.get('Retry-After')) ?? 0;
      await res.arrayBuffer();
      await delay(Math.max(requestedDelay, Math.min(BASE_BACKOFF_MS * 2 ** retry, MAX_BACKOFF_MS)));
      continue;
    }
    const text = await res.text();
    if (!res.ok) throw new Error(`Figma file ${fileKey} → HTTP ${res.status}: ${text.slice(0, 200)}`);
    return { body: JSON.parse(text), byteLength: Buffer.byteLength(text, 'utf8') };
  }
}

async function getJson(url: string, token: string, fileKey: string): Promise<CachedResponse> {
  const tokenKey = createHash('sha256').update(token).digest('hex');
  const key = `${tokenKey}\0${url}`;
  const now = Date.now();
  const cached = responseCache.get(key);
  if (cached && cached.expiresAt > now) {
    responseCache.delete(key);
    responseCache.set(key, cached);
    return cached.promise;
  }
  if (cached) responseCache.delete(key);

  const entry: CacheEntry = { expiresAt: now + CACHE_TTL_MS, promise: requestJson(url, token, fileKey) };
  responseCache.set(key, entry);
  while (responseCache.size > MAX_CACHE_ENTRIES) {
    const oldest = responseCache.keys().next();
    if (oldest.done) break;
    responseCache.delete(oldest.value);
  }
  void entry.promise.then(
    (response) => {
      if (responseCache.get(key) === entry) {
        if (response.byteLength < MAX_RESPONSE_BYTES) entry.expiresAt = Date.now() + CACHE_TTL_MS;
        else responseCache.delete(key);
      }
    },
    () => {
      if (responseCache.get(key) === entry) responseCache.delete(key);
    },
  );
  return entry.promise;
}

/** Validates an untrusted Figma API node tree; nodes without id, name or type are dropped with their subtree. */
function toFigmaNode(v: Record<string, unknown>): FigmaNode | undefined {
  const id = str(v.id);
  const name = str(v.name);
  const type = str(v.type);
  if (id === undefined || name === undefined || type === undefined) return undefined;
  return {
    id,
    name,
    type,
    characters: str(v.characters),
    transitionNodeID: str(v.transitionNodeID),
    interactions: records(v.interactions).map((i) => ({ actions: records(i.actions).map((a) => ({ destinationId: str(a.destinationId) })) })),
    children: Array.isArray(v.children) ? records(v.children).flatMap((c) => toFigmaNode(c) ?? []) : undefined,
  };
}

/** The document root has no meaningful id, so only its pages are validated. */
const toFigmaDocument = (v: unknown): FigmaNode => ({ id: '', name: '', type: 'DOCUMENT', children: isRecord(v) ? records(v.children).flatMap((c) => toFigmaNode(c) ?? []) : [] });

const FRAME_TYPES = new Set(['FRAME', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE']);

function frameNodes(doc: FigmaNode): FigmaNode[] {
  const out: FigmaNode[] = [];
  for (const page of doc.children ?? []) {
    if (page.type !== 'CANVAS') continue;
    for (const node of page.children ?? []) {
      if (node.type === 'SECTION') out.push(...(node.children ?? []).filter((child) => FRAME_TYPES.has(child.type)));
      else if (FRAME_TYPES.has(node.type)) out.push(node);
    }
  }
  return out;
}

function nodeIdBatches(ids: string[]): string[][] {
  const batches: string[][] = [];
  for (let i = 0; i < ids.length; i += MAX_BATCH_IDS) batches.push(ids.slice(i, i + MAX_BATCH_IDS));
  return batches;
}

async function getNodeBatch(fileKey: string, token: string, ids: string[]): Promise<Map<string, FigmaNode>> {
  const query = new URLSearchParams({ ids: ids.join(','), depth: '2' });
  const url = `${API}/files/${encodeURIComponent(fileKey)}/nodes?${query}`;
  const response = await getJson(url, token, fileKey);
  if (response.byteLength >= MAX_RESPONSE_BYTES && ids.length > 1) {
    const middle = Math.ceil(ids.length / 2);
    const first = await getNodeBatch(fileKey, token, ids.slice(0, middle));
    const second = await getNodeBatch(fileKey, token, ids.slice(middle));
    return new Map([...first, ...second]);
  }

  if (!isRecord(response.body) || !isRecord(response.body.nodes)) throw new Error(`Figma file ${fileKey} → unexpected node response`);
  const result = new Map<string, FigmaNode>();
  for (const id of ids) {
    const nodeResponse = response.body.nodes[id];
    if (!isRecord(nodeResponse) || !isRecord(nodeResponse.document)) throw new Error(`Figma file ${fileKey} → missing node ${id}`);
    const node = toFigmaNode(nodeResponse.document);
    if (!node) throw new Error(`Figma file ${fileKey} → invalid node ${id}`);
    result.set(id, node);
  }
  return result;
}

async function fetchNodeDetails(fileKey: string, token: string, roots: FigmaNode[]): Promise<Map<string, FigmaNode>> {
  const details = new Map<string, FigmaNode>();
  const unique = [...new Map(roots.map((node) => [node.id, node])).values()];
  for (const batch of nodeIdBatches(unique.map((node) => node.id))) {
    const fetched = await getNodeBatch(fileKey, token, batch);
    for (const [id, node] of fetched) {
      details.set(id, node);
    }
  }
  return details;
}

function expandDetails(node: FigmaNode, details: Map<string, FigmaNode>): FigmaNode {
  const full = details.get(node.id) ?? node;
  return { ...full, children: full.children?.map((child) => expandDetails(child, details)) };
}

export async function fetchFigma(cfg: FigmaConfig): Promise<DesignFrame[]> {
  const frames: DesignFrame[] = [];
  for (const key of cfg.fileKeys) {
    const componentUrl = `${API}/files/${encodeURIComponent(key)}/components`;
    const componentResponse = await getJson(componentUrl, cfg.token, key);
    if (!isRecord(componentResponse.body) || !isRecord(componentResponse.body.meta)) throw new Error(`Figma file ${key} → unexpected component metadata`);
    const componentIds = new Set(records(componentResponse.body.meta.components).flatMap((component) => str(component.node_id) ?? []));

    const fileUrl = `${API}/files/${encodeURIComponent(key)}?depth=3`;
    const fileResponse = await getJson(fileUrl, cfg.token, key);
    const file: unknown = fileResponse.body;
    if (!isRecord(file) || !isRecord(file.document)) throw new Error(`Figma file ${key} → unexpected response`);
    const shallowDocument = toFigmaDocument(file.document);
    const roots = frameNodes(shallowDocument).sort((a, b) => Number(componentIds.has(b.id)) - Number(componentIds.has(a.id)));
    const details = await fetchNodeDetails(key, cfg.token, roots);
    const fullDocument = expandDetails(shallowDocument, details);
    frames.push(...framesFromDocument(key, str(file.name) ?? key, str(file.lastModified) ?? new Date().toISOString(), fullDocument, cfg.maxTextsPerFrame ?? 40));
  }
  return frames;
}

export function framesFromDocument(fileKey: string, fileName: string, lastModified: string, raw: unknown, maxTexts = 40): DesignFrame[] {
  const doc = toFigmaDocument(raw);
  const out: DesignFrame[] = [];
  for (const page of doc.children ?? []) {
    for (const n of frameNodes({ ...doc, children: [page] })) {
      const texts: string[] = [];
      const transitions = new Set<string>();
      const walk = (x: FigmaNode) => {
        if (x.type === 'TEXT' && x.characters && texts.length < maxTexts) texts.push(x.characters.trim().slice(0, 120));
        if (x.type === 'COMPONENT' && x !== n && texts.length < maxTexts) texts.push(x.name);
        if (x.transitionNodeID) transitions.add(x.transitionNodeID);
        for (const i of x.interactions ?? []) for (const a of i.actions ?? []) if (a.destinationId) transitions.add(a.destinationId);
        for (const c of x.children ?? []) walk(c);
      };
      walk(n);
      out.push({
        id: n.id,
        fileKey,
        fileName,
        page: page.name,
        name: n.name,
        texts: [...new Set(texts.filter(Boolean))],
        transitions: [...transitions],
        updatedAt: lastModified,
        url: `https://www.figma.com/design/${fileKey}/${encodeURIComponent(fileName)}?node-id=${n.id.replace(':', '-')}`,
      });
    }
  }
  return out;
}
