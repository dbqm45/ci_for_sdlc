import { createHash } from 'node:crypto';
import type { DesignFrame } from '../model.js';
import { isRecord, records, str } from '../guards.js';

/**
 * Figma connector (REST API, personal access token or OAuth token).
 * Reads top-level frames per page and their shallow text/transition metadata.
 * Images and nested node details are never downloaded.
 */
export interface FigmaConfig {
  token: string;
  fileKeys: string[];
  /** Max text layers kept per frame (data minimization). */
  maxTextsPerFrame?: number;
  /** Override of the Figma API base URL for local mocks and tests; only loopback hosts are accepted. */
  apiBase?: string;
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
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 30_000;
const REQUEST_TIMEOUT_MS = 30_000;
const CACHE_TTL_MS = 60_000;
const MAX_CACHE_ENTRIES = 100;
const MAX_RESPONSE_BYTES = 500_000;
const responseCache = new Map<string, CacheEntry>();

/** Test seam; the cache is deliberately not part of the public connector API. */
export function clearFigmaCache(): void {
  responseCache.clear();
}

/** Figma's own rate limit, not a connector bug — the HTTP layer maps this to 429, not a generic 500. */
export class FigmaRateLimitError extends Error {
  readonly retryAfterMs?: number;
  /** From X-Figma-Rate-Limit-Type: 'low' (Collab/Viewer seats) or 'high' (Full/Dev seats). */
  readonly rateLimitType?: string;
  /** From X-Figma-Plan-Tier: enterprise/org/pro/starter/student. */
  readonly planTier?: string;
  /** Which Figma endpoint (e.g. /v1/files/{key}/components) actually returned the 429. */
  readonly endpoint?: string;
  constructor(fileKey: string, retryAfterMs?: number, rateLimitType?: string, planTier?: string, endpoint?: string) {
    super(`Figma file ${fileKey} → rate limited (429) after ${MAX_RETRIES} retries`);
    this.name = 'FigmaRateLimitError';
    this.retryAfterMs = retryAfterMs;
    this.rateLimitType = rateLimitType;
    this.planTier = planTier;
    this.endpoint = endpoint;
  }
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
    if (res.status === 429) {
      const requestedDelayMs = retryAfterMs(res.headers.get('Retry-After'));
      await res.arrayBuffer();
      if (retry < MAX_RETRIES) {
        // Retry-After is upstream-controlled; never let it stall the analysis queue beyond our own backoff cap.
        await delay(Math.min(Math.max(requestedDelayMs ?? 0, BASE_BACKOFF_MS * 2 ** retry), MAX_BACKOFF_MS));
        continue;
      }
      throw new FigmaRateLimitError(
        fileKey,
        requestedDelayMs,
        res.headers.get('X-Figma-Rate-Limit-Type') ?? undefined,
        res.headers.get('X-Figma-Plan-Tier') ?? undefined,
        new URL(url).pathname,
      );
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

/** Resolves the API base; an override may only point at loopback so the token never leaves the machine except to Figma. */
export function figmaApiBase(raw?: string): string {
  if (raw === undefined || raw.trim() === '') return API;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error('Figma API base override is not a valid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Figma API base override must use http or https');
  if (!LOOPBACK_HOSTS.has(url.hostname)) throw new Error('Figma API base override must point at a loopback host (localhost, 127.0.0.1, ::1)');
  if (url.username || url.password || url.search || url.hash) throw new Error('Figma API base override must not contain credentials, query or fragment');
  return `${url.origin}${url.pathname}`.replace(/\/+$/, '');
}

export async function fetchFigma(cfg: FigmaConfig): Promise<DesignFrame[]> {
  const api = figmaApiBase(cfg.apiBase);
  const frames: DesignFrame[] = [];
  for (const key of cfg.fileKeys) {
    const componentUrl = `${api}/files/${encodeURIComponent(key)}/components`;
    const componentResponse = await getJson(componentUrl, cfg.token, key);
    if (!isRecord(componentResponse.body) || !isRecord(componentResponse.body.meta)) throw new Error(`Figma file ${key} → unexpected component metadata`);
    const componentIds = new Set(records(componentResponse.body.meta.components).flatMap((component) => str(component.node_id) ?? []));

    const fileUrl = `${api}/files/${encodeURIComponent(key)}?depth=3`;
    const fileResponse = await getJson(fileUrl, cfg.token, key);
    const file: unknown = fileResponse.body;
    if (!isRecord(file) || !isRecord(file.document)) throw new Error(`Figma file ${key} → unexpected response`);
    const document = toFigmaDocument(file.document);
    const fileFrames = framesFromDocument(key, str(file.name) ?? key, str(file.lastModified) ?? new Date().toISOString(), document, cfg.maxTextsPerFrame ?? 40);
    fileFrames.sort((a, b) => Number(componentIds.has(b.id)) - Number(componentIds.has(a.id)));
    frames.push(...fileFrames);
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
