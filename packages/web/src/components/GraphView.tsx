import { useEffect, useMemo, useRef, useState } from 'react';
import { select } from 'd3-selection';
import { zoom, zoomIdentity, type ZoomBehavior } from 'd3-zoom';
import type { GraphData } from '../api';
import { ALL, edgePath, itemHref, layoutGraph, neighbours, SOURCES, type GraphFilter, type Via } from './graphLayout';

const COLORS: Record<string, string> = { jira: 'var(--jira)', confluence: 'var(--confluence)', figma: 'var(--figma)', decision: 'var(--decision)' };
const NAMES: Record<string, string> = { jira: 'Jira', confluence: 'Confluence', figma: 'Figma', decision: 'Decision', other: 'Other' };

/** The item's 1-hop neighbourhood in the context graph: zoomable, filterable, with an enlarged view. */
export function GraphView({ data }: { data: GraphData }) {
  const [filter, setFilter] = useState<GraphFilter>(ALL);
  const [enlarged, setEnlarged] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialog.current;
    if (enlarged && d && !d.open) d.showModal();
  }, [enlarged]);

  const present = useMemo(() => new Set(data.nodes.filter((n) => n.id !== data.center && n.kind !== 'domain').map((n) => n.source ?? 'other')), [data]);
  const toggle = <T,>(set: ReadonlySet<T>, v: T) => {
    const next = new Set(set);
    if (!next.delete(v)) next.add(v);
    return next;
  };

  const legend = (
    <div className="row small muted graph-legend" role="group" aria-label="Graph filters">
      {SOURCES.filter((s) => present.has(s)).map((s) => (
        <button
          key={s}
          type="button"
          className="chip"
          aria-pressed={filter.sources.has(s)}
          onClick={() => setFilter((f) => ({ ...f, sources: toggle(f.sources, s) }))}
        >
          <span style={{ color: COLORS[s] }}>●</span> {NAMES[s]}
        </button>
      ))}
      {(['explicit', 'semantic'] as Via[]).map((v) => (
        <button key={v} type="button" className="chip" aria-pressed={filter.via.has(v)} onClick={() => setFilter((f) => ({ ...f, via: toggle(f.via, v) }))}>
          {v === 'explicit' ? '— explicit link' : '- - semantic'}
        </button>
      ))}
    </div>
  );

  return (
    <div className="graph card">
      <GraphCanvas data={data} filter={filter} onEnlarge={() => setEnlarged(true)} />
      {legend}
      {enlarged && (
        <dialog ref={dialog} className="graph-dialog" aria-label="Context graph (enlarged)" onClose={() => setEnlarged(false)}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2 style={{ margin: 0 }}>Context graph</h2>
            <button type="button" className="btn sm" onClick={() => dialog.current?.close()}>
              Close
            </button>
          </div>
          <GraphCanvas data={data} filter={filter} large />
          {legend}
        </dialog>
      )}
    </div>
  );
}

function GraphCanvas({ data, filter, large, onEnlarge }: { data: GraphData; filter: GraphFilter; large?: boolean; onEnlarge?: () => void }) {
  const g = useMemo(() => layoutGraph(data, filter), [data, filter]);
  const [active, setActive] = useState<string>();
  const svg = useRef<SVGSVGElement>(null);
  const viewport = useRef<SVGGElement>(null);
  const behavior = useRef<ZoomBehavior<SVGSVGElement, unknown>>(undefined);

  useEffect(() => {
    if (!svg.current || !viewport.current) return;
    const vp = select(viewport.current);
    const z = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 5])
      // Inline, the wheel scrolls the page unless Ctrl/⌘ is held; in the enlarged view it always zooms.
      .filter((e: MouseEvent | WheelEvent) => (e.type === 'wheel' ? large || e.ctrlKey || e.metaKey : !e.button))
      .on('zoom', (e) => vp.attr('transform', e.transform.toString()));
    behavior.current = z;
    const s = select(svg.current).call(z);
    return () => void s.on('.zoom', null);
  }, [large]);

  const zoomBy = (k: number) => svg.current && behavior.current && select(svg.current).call(behavior.current.scaleBy, k);
  const fit = () => svg.current && behavior.current && select(svg.current).call(behavior.current.transform, zoomIdentity);

  const pos = new Map<string, { x: number; y: number }>([[g.center.id, g.center], ...g.nodes.map((n) => [n.id, n] as const)]);
  const side = new Map(g.nodes.map((n) => [n.id, n.side]));
  const lit = active ? neighbours(g.edges, active) : undefined;
  const dim = (id: string) => (lit && !lit.has(id) ? ' dim' : '');

  return (
    <div className={`graph-canvas${large ? ' large' : ''}`}>
      <div className="graph-tools row small">
        <button type="button" className="btn sm" onClick={() => zoomBy(1.4)} aria-label="Zoom in">
          +
        </button>
        <button type="button" className="btn sm" onClick={() => zoomBy(1 / 1.4)} aria-label="Zoom out">
          −
        </button>
        <button type="button" className="btn sm" onClick={fit}>
          Fit
        </button>
        {onEnlarge && (
          <button type="button" className="btn sm" onClick={onEnlarge}>
            ⤢ Enlarge
          </button>
        )}
        <span className="faint">{large ? 'Scroll to zoom, drag to pan' : 'Ctrl + scroll to zoom, drag to pan'}</span>
      </div>
      <svg ref={svg} viewBox={`0 0 ${g.width} ${g.height}`} width="100%" role="group" aria-label="Context graph" style={{ display: 'block', height: large ? 'calc(100vh - 170px)' : undefined }}>
        <g ref={viewport} data-testid="graph-viewport">
          {g.edges.map((e, i) => {
            const a = pos.get(e.from)!;
            const b = pos.get(e.to)!;
            const on = lit?.has(e.from) && lit.has(e.to) && (e.from === active || e.to === active);
            return (
              <path
                key={i}
                d={edgePath(a, b, side.get(e.from) === side.get(e.to) ? side.get(e.from) : undefined)}
                className={`edge ${e.via}${on ? ' on' : lit ? ' dim' : ''}`}
                fill="none"
              >
                <title>{`${e.type.replace(/_/g, ' ')} · ${e.via}`}</title>
              </path>
            );
          })}
          {g.headings.map((h) => (
            <text key={`${h.side}-${h.source}`} x={h.side === 'left' ? h.x - 14 : h.x + 14} y={h.y} textAnchor={h.side === 'left' ? 'end' : 'start'} className="heading">
              {h.side === 'right' && <tspan style={{ fill: COLORS[h.source] }}>● </tspan>}
              {NAMES[h.source]} ({h.count})
              {h.side === 'left' && <tspan style={{ fill: COLORS[h.source] }}> ●</tspan>}
            </text>
          ))}
          {g.nodes.map((n) => {
            const left = n.side === 'left';
            const tx = left ? n.x - 14 : n.x + 14;
            const anchor = left ? 'end' : 'start';
            const internal = itemHref(n.id);
            return (
              <a
                key={n.id}
                href={internal ?? n.url}
                target={internal ? undefined : '_blank'}
                rel={internal ? undefined : 'noreferrer'}
                aria-label={`${n.title} (${n.relation})`}
                className={`node${dim(n.id)}${active === n.id ? ' on' : ''}`}
                onMouseEnter={() => setActive(n.id)}
                onMouseLeave={() => setActive(undefined)}
                onFocus={() => setActive(n.id)}
                onBlur={() => setActive(undefined)}
              >
                <title>{n.title}</title>
                <rect x={left ? n.x - 360 : n.x - 10} y={n.y - ROW_HALF} width={370} height={ROW_HALF * 2} className="hit" />
                <circle cx={n.x} cy={n.y} r={6.5} fill={COLORS[n.source] ?? 'var(--faint)'} />
                <text x={tx} y={n.y - 1} textAnchor={anchor} className="label">
                  {n.label}
                </text>
                <text x={tx} y={n.y + 12} textAnchor={anchor} className="rel">
                  {n.relation}
                </text>
              </a>
            );
          })}
          <g className={`center${dim(g.center.id)}`} onMouseEnter={() => setActive(g.center.id)} onMouseLeave={() => setActive(undefined)}>
            <circle cx={g.center.x} cy={g.center.y} r={13} fill="var(--accent)" />
            <text x={g.center.x} y={g.center.y + 32} textAnchor="middle" className="key">
              {g.center.key}
            </text>
            <text x={g.center.x} y={g.center.y + 48} textAnchor="middle" className="rel">
              {g.center.title}
            </text>
            {g.center.domains.length > 0 && (
              <text x={g.center.x} y={g.center.y + 62} textAnchor="middle" className="rel">
                {g.center.domains.join(', ')} domain
              </text>
            )}
          </g>
          {g.nodes.length === 0 && (
            <text x={g.center.x} y={g.center.y - 30} textAnchor="middle" className="rel">
              Nothing to show with the current filters.
            </text>
          )}
        </g>
      </svg>
    </div>
  );
}

const ROW_HALF = 16;
