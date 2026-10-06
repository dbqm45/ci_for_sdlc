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
    children: records(v.children).flatMap((c) => toFigmaNode(c) ?? []),
  };
}

/** The document root has no meaningful id, so only its pages are validated. */
const toFigmaDocument = (v: unknown): FigmaNode => ({ id: '', name: '', type: 'DOCUMENT', children: isRecord(v) ? records(v.children).flatMap((c) => toFigmaNode(c) ?? []) : [] });

const FRAME_TYPES = new Set(['FRAME', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE']);

export async function fetchFigma(cfg: FigmaConfig): Promise<DesignFrame[]> {
  const frames: DesignFrame[] = [];
  for (const key of cfg.fileKeys) {
    const res = await fetch(`https://api.figma.com/v1/files/${encodeURIComponent(key)}`, { headers: { 'X-Figma-Token': cfg.token } });
    if (!res.ok) throw new Error(`Figma file ${key} → HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const file: unknown = await res.json();
    if (!isRecord(file) || !isRecord(file.document)) throw new Error(`Figma file ${key} → unexpected response`);
    frames.push(...framesFromDocument(key, str(file.name) ?? key, str(file.lastModified) ?? new Date().toISOString(), file.document, cfg.maxTextsPerFrame ?? 40));
  }
  return frames;
}

export function framesFromDocument(fileKey: string, fileName: string, lastModified: string, raw: unknown, maxTexts = 40): DesignFrame[] {
  const doc = toFigmaDocument(raw);
  const out: DesignFrame[] = [];
  for (const page of doc.children ?? []) {
    if (page.type !== 'CANVAS') continue;
    const tops: FigmaNode[] = [];
    for (const n of page.children ?? []) {
      if (n.type === 'SECTION') tops.push(...(n.children ?? []).filter((c) => FRAME_TYPES.has(c.type)));
      else if (FRAME_TYPES.has(n.type)) tops.push(n);
    }
    for (const n of tops) {
      const texts: string[] = [];
      const transitions = new Set<string>();
      const walk = (x: FigmaNode) => {
        if (x.type === 'TEXT' && x.characters && texts.length < maxTexts) texts.push(x.characters.trim().slice(0, 120));
        if (x.type === 'COMPONENT' && x !== n && texts.length < maxTexts) texts.push(x.name); // variant names, e.g. "State=Error"
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
