import type { GraphData } from '../api';

/** Order of the source groups; the first groups go to the left column. */
export const SOURCES = ['jira', 'confluence', 'decision', 'figma'] as const;
export type Via = 'explicit' | 'semantic';

export const ROW_H = 36;
export const HEAD_H = 22;
export const GROUP_GAP = 12;
export const MAX_LABEL = 52;
const CHAR_W = 6.6;
const PAD = 24;
const SPREAD = 220;

export interface LayoutNode {
  id: string;
  source: string;
  title: string;
  /** Title shortened to MAX_LABEL characters; the full title stays in `title`. */
  label: string;
  url?: string;
  /** Relation to the centre, e.g. "designed by · semantic 85%". */
  relation: string;
  side: 'left' | 'right';
  x: number;
  y: number;
}
export interface LayoutEdge {
  from: string;
  to: string;
  type: string;
  via: Via;
  confidence: number;
}
export interface GraphLayout {
  width: number;
  height: number;
  center: { id: string; x: number; y: number; key: string; title: string; domains: string[] };
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  headings: { source: string; side: 'left' | 'right'; x: number; y: number; count: number }[];
}
export interface GraphFilter {
  sources: ReadonlySet<string>;
  via: ReadonlySet<Via>;
}

export const ALL: GraphFilter = { sources: new Set([...SOURCES, 'other']), via: new Set<Via>(['explicit', 'semantic']) };

export const truncate = (s: string, max = MAX_LABEL) => (s.length > max ? s.slice(0, max - 1) + '…' : s);
const groupOf = (source: string | undefined) => ((SOURCES as readonly string[]).includes(source ?? '') ? source! : 'other');

/**
 * Two-column layout of an item's 1-hop neighbourhood: the item in the middle, its neighbours grouped by
 * source system in a column on each side, one row per neighbour, so labels never overlap.
 */
export function layoutGraph(data: GraphData, filter: GraphFilter = ALL): GraphLayout {
  const edges = data.edges.filter((e) => filter.via.has(e.via));
  const centerNode = data.nodes.find((n) => n.id === data.center);
  const domains = data.nodes.filter((n) => n.kind === 'domain').map((n) => n.title);

  const toCenter = (id: string) =>
    edges
      .filter((e) => (e.from === data.center && e.to === id) || (e.to === data.center && e.from === id))
      .sort((a, b) => Number(a.via === 'semantic') - Number(b.via === 'semantic') || b.confidence - a.confidence)[0];

  const visible = data.nodes.filter(
    (n) => n.id !== data.center && n.kind !== 'domain' && filter.sources.has(groupOf(n.source)) && edges.some((e) => e.from === n.id || e.to === n.id),
  );
  const order = [...SOURCES, 'other'];
  const rows = visible
    .map((n) => ({ n, rel: toCenter(n.id), group: groupOf(n.source) }))
    .sort(
      (a, b) =>
        order.indexOf(a.group) - order.indexOf(b.group) ||
        Number(a.rel?.via === 'semantic') - Number(b.rel?.via === 'semantic') ||
        (b.rel?.confidence ?? 0) - (a.rel?.confidence ?? 0) ||
        a.n.title.localeCompare(b.n.title),
    );

  // Split at a group boundary when it keeps the columns roughly even, otherwise in the middle.
  const half = Math.ceil(rows.length / 2);
  let cut = half;
  let best = Infinity;
  for (let i = 0; i <= rows.length; i++) {
    if (i > 0 && i < rows.length && rows[i]?.group === rows[i - 1]?.group) continue;
    const tall = Math.max(i, rows.length - i);
    if (tall < best) [best, cut] = [tall, i];
  }
  if (best > half + 2) cut = half;
  const columns = { left: rows.slice(0, cut), right: rows.slice(cut) };

  const labelW = Math.min(MAX_LABEL, Math.max(16, ...rows.map((r) => Math.max(r.n.title.length, (r.rel ? relationText(r.rel) : '').length)))) * CHAR_W;
  const leftX = PAD + labelW + 14;
  const cx = leftX + SPREAD;
  const rightX = cx + SPREAD;
  const width = rightX + 14 + labelW + PAD;

  const colHeight = (col: typeof rows) => {
    const groups = new Set(col.map((r) => r.group)).size;
    return col.length * ROW_H + groups * HEAD_H + Math.max(0, groups - 1) * GROUP_GAP;
  };
  const height = Math.max(220, colHeight(columns.left), colHeight(columns.right)) + PAD * 2;

  const nodes: LayoutNode[] = [];
  const headings: GraphLayout['headings'] = [];
  for (const side of ['left', 'right'] as const) {
    const col = columns[side];
    const x = side === 'left' ? leftX : rightX;
    let y = (height - colHeight(col)) / 2;
    col.forEach((r, i) => {
      if (i === 0 || col[i - 1]?.group !== r.group) {
        if (i > 0) y += GROUP_GAP;
        headings.push({ source: r.group, side, x, y: y + HEAD_H - 8, count: col.filter((c) => c.group === r.group).length });
        y += HEAD_H;
      }
      nodes.push({
        id: r.n.id,
        source: r.group,
        title: r.n.title,
        label: truncate(r.n.title),
        url: r.n.url,
        relation: r.rel ? relationText(r.rel) : 'indirect',
        side,
        x,
        y: y + ROW_H / 2,
      });
      y += ROW_H;
    });
  }

  const shown = new Set([data.center, ...nodes.map((n) => n.id)]);
  const [key, ...rest] = (centerNode?.title ?? data.center).split(' — ');
  return {
    width,
    height,
    center: { id: data.center, x: cx, y: height / 2, key: key ?? data.center, title: truncate(rest.join(' — '), 36), domains },
    nodes,
    edges: edges.filter((e) => shown.has(e.from) && shown.has(e.to)),
    headings,
  };
}

export function relationText(e: { type: string; via: Via; confidence: number }) {
  return `${e.type.replace(/_/g, ' ')} · ${e.via}${e.via === 'semantic' ? ` ${Math.round(e.confidence * 100)}%` : ''}`;
}

/** SVG path of an edge: an S-curve between columns, an arc towards the item within one column (labels are outside). */
export function edgePath(a: { x: number; y: number }, b: { x: number; y: number }, side?: 'left' | 'right') {
  if (a.x === b.x && side) {
    const bulge = (side === 'left' ? 1 : -1) * Math.min(120, 24 + Math.abs(b.y - a.y) / 3);
    return `M${a.x},${a.y} Q${a.x + bulge},${(a.y + b.y) / 2} ${b.x},${b.y}`;
  }
  const mx = (a.x + b.x) / 2;
  return `M${a.x},${a.y} C${mx},${a.y} ${mx},${b.y} ${b.x},${b.y}`;
}

/** Ids of the node and everything directly linked to it. */
export function neighbours(edges: LayoutEdge[], id: string) {
  const out = new Set([id]);
  for (const e of edges) {
    if (e.from === id) out.add(e.to);
    if (e.to === id) out.add(e.from);
  }
  return out;
}

/** In-app link for a Jira node, so the graph can be walked item by item. */
export function itemHref(id: string) {
  return id.startsWith('jira:') ? `#/item/${encodeURIComponent(id.slice(5))}` : undefined;
}
