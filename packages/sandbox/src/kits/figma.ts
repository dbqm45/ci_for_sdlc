import { framesFromDocument, type DesignFrame } from '@ci/core';
import type { FetchLike } from '../../../../scripts/lib/sandbox-atlassian.mjs';
import { SandboxError } from '../live/context.js';

/**
 * Figma kit, read side (docs/TEST-DATA-GENERATOR.md, 4.2). The REST API cannot create frames, so the "CI sandbox"
 * plugin (figma-plugin/) builds them; the seeder only reads the sandbox file back, maps Figma's node ids to the frame
 * ids of the world through the plugin's mark (shared plugin data ci_sandbox.id) and compares.
 */

/** Namespace and key of the mark the plugin puts on every frame it makes (figma-plugin/runtime.js). */
export const PLUGIN_NS = 'ci_sandbox';

export interface FigmaAccess {
  token: string;
  fileKey: string;
  /** https://api.figma.com/v1, or a loopback override (CI_FIGMA_API_BASE). */
  apiBase: string;
  fetchImpl: FetchLike;
}

export interface LiveFrame {
  /** Figma's node id (100:7); the world id is the key of the map. */
  nodeId: string;
  page: string;
  name: string;
  texts: string[];
  /** World ids of the frames it navigates to; a destination without a mark keeps its node id. */
  transitions: string[];
  url: string;
}

export interface LiveFigma {
  fileName: string;
  /** Marked frames by world id (1:1, 2:3…). */
  frames: Map<string, LiveFrame>;
  /** World ids marked on more than one frame (the first one counts). */
  duplicates: string[];
  /** Top-level frames without the mark: made by hand, not by the plugin. */
  unmarked: number;
}

const isRecord = (v: unknown): v is Record<string, any> => typeof v === 'object' && v !== null && !Array.isArray(v);
const children = (v: unknown): Record<string, any>[] => (isRecord(v) && Array.isArray(v.children) ? v.children.filter(isRecord) : []);

/** Node id → world id, from the marks on the frames the core connector reads (top level and inside sections). */
function marks(document: unknown): Map<string, string | undefined> {
  const out = new Map<string, string | undefined>();
  for (const page of children(document)) {
    if (page.type !== 'CANVAS') continue;
    for (const node of children(page)) {
      for (const n of node.type === 'SECTION' ? children(node) : [node]) {
        const id = n.sharedPluginData?.[PLUGIN_NS]?.id;
        out.set(String(n.id), typeof id === 'string' && id ? id : undefined);
      }
    }
  }
  return out;
}

/** The file as GET /v1/files/:key?depth=3&plugin_data=shared returns it, read the way the application reads Figma. */
export function liveFigma(fileKey: string, file: unknown): LiveFigma {
  if (!isRecord(file) || !isRecord(file.document)) throw new SandboxError(['Figma: unexpected response for the sandbox file']);
  const fileName = typeof file.name === 'string' ? file.name : fileKey;
  const frames: DesignFrame[] = framesFromDocument(fileKey, fileName, String(file.lastModified ?? ''), file.document);
  const mark = marks(file.document);
  const worldId = (nodeId: string) => mark.get(nodeId) ?? nodeId;
  const out: LiveFigma = { fileName, frames: new Map(), duplicates: [], unmarked: 0 };
  for (const f of frames) {
    const id = mark.get(f.id);
    if (!id) {
      out.unmarked++;
      continue;
    }
    if (out.frames.has(id)) {
      if (!out.duplicates.includes(id)) out.duplicates.push(id);
      continue;
    }
    out.frames.set(id, { nodeId: f.id, page: f.page, name: f.name, texts: f.texts, transitions: f.transitions.map(worldId), url: f.url! });
  }
  return out;
}

/** Reads the sandbox file. Errors carry the status and a hint, never the response body or the file key. */
export async function readFigma(access: FigmaAccess): Promise<LiveFigma> {
  const url = `${access.apiBase}/files/${encodeURIComponent(access.fileKey)}?depth=3&plugin_data=shared`;
  const r = await access.fetchImpl(url, { method: 'GET', headers: { 'X-Figma-Token': access.token, Accept: 'application/json' } });
  if (r.status === 401 || r.status === 403) throw new SandboxError([`Figma: reading the sandbox file refused (${r.status}) — check FIGMA_TOKEN (scope file_content:read) and that its account can open the file`]);
  if (r.status === 404) throw new SandboxError(['Figma: no sandbox file (404) — check SANDBOX_FIGMA_FILE_KEY']);
  if (r.status === 429) throw new SandboxError(['Figma: rate limited (429) — try again in a minute']);
  if (r.status < 200 || r.status >= 300) throw new SandboxError([`Figma: reading the sandbox file failed (${r.status})`]);
  let body: unknown;
  try {
    body = JSON.parse(await r.text());
  } catch {
    throw new SandboxError(['Figma: the sandbox file is not JSON']);
  }
  return liveFigma(access.fileKey, body);
}

const sorted = (xs: string[]) => [...xs].sort();
const same = (a: string[], b: string[]) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));

/**
 * Differences between the frames of the world and the sandbox file, one line each. `command` names the plugin command
 * that brings the file to `want` ("Seed", "Mutate: figma-remove-error").
 */
export function compareFrames(want: DesignFrame[], live: LiveFigma, command: string): string[] {
  const out: string[] = [];
  const fix = `run "CI sandbox → ${command}" in Figma`;
  for (const f of want) {
    const got = live.frames.get(f.id);
    if (!got) {
      out.push(`Figma frame ${f.id} (${f.name}): missing — ${fix}`);
      continue;
    }
    const differs = [
      got.page !== f.page && 'page',
      got.name !== f.name && 'name',
      !same(got.texts, f.texts) && 'texts',
      !same(got.transitions, f.transitions) && 'prototype links',
    ].filter((x): x is string => !!x);
    if (differs.length) out.push(`Figma frame ${f.id} (${f.name}): ${differs.join(', ')} differ from the world — ${fix}`);
  }
  for (const [id, got] of live.frames) if (!want.some((f) => f.id === id)) out.push(`Figma frame ${id} (${got.name}): not in the world — ${fix}`);
  for (const id of live.duplicates) out.push(`Figma frame ${id}: marked on more than one frame — ${fix}`);
  return out;
}

/** World frame id of a Figma URL (`…?node-id=1-1` → `1:1`). */
export function figmaNodeOfUrl(url: string): string | undefined {
  let raw: string | null;
  try {
    raw = new URL(url).searchParams.get('node-id');
  } catch {
    return undefined;
  }
  return raw ? raw.replace(/-/g, ':') : undefined;
}
