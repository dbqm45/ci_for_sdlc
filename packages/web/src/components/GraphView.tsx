import type { GraphData } from '../api';

const COLORS: Record<string, string> = { jira: 'var(--jira)', confluence: 'var(--confluence)', figma: 'var(--figma)', decision: 'var(--decision)' };

/** Radial view of the item's 1-hop neighbourhood in the context graph. */
export function GraphView({ data }: { data: GraphData }) {
  const others = data.nodes.filter((n) => n.id !== data.center && n.kind !== 'domain');
  const w = 760;
  const h = Math.max(300, 120 + others.length * 14);
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(cx, cy) - 40;
  const pos = new Map<string, { x: number; y: number }>([[data.center, { x: cx, y: cy }]]);
  others.forEach((n, i) => {
    const angle = (i / others.length) * Math.PI * 2 - Math.PI / 2;
    pos.set(n.id, { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r * 0.85 });
  });
  const center = data.nodes.find((n) => n.id === data.center);
  return (
    <div className="graph card" style={{ padding: 8, overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" style={{ minWidth: 560, display: 'block' }} role="img" aria-label="Context graph">
        {data.edges
          .filter((e) => pos.has(e.from) && pos.has(e.to))
          .map((e, i) => {
            const a = pos.get(e.from)!;
            const b = pos.get(e.to)!;
            return (
              <g key={i}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--border)" strokeWidth={e.via === 'explicit' ? 2 : 1} strokeDasharray={e.via === 'semantic' ? '4 3' : undefined} />
                {(e.from === data.center || e.to === data.center) && (
                  <text x={a.x + (b.x - a.x) * (e.from === data.center ? 0.62 : 0.38)} y={a.y + (b.y - a.y) * (e.from === data.center ? 0.62 : 0.38) - 3} textAnchor="middle" style={{ fill: 'var(--faint)', fontSize: 9.5 }}>
                    {e.type.replace('_', ' ')}
                  </text>
                )}
              </g>
            );
          })}
        {others.map((n) => {
          const p = pos.get(n.id)!;
          const label = n.title.length > 34 ? n.title.slice(0, 33) + '…' : n.title;
          const anchor = p.x < cx - 10 ? 'end' : p.x > cx + 10 ? 'start' : 'middle';
          const dx = anchor === 'end' ? -10 : anchor === 'start' ? 10 : 0;
          return (
            <g key={n.id}>
              <circle cx={p.x} cy={p.y} r={7} fill={COLORS[n.source ?? ''] ?? 'var(--faint)'} />
              <text x={p.x + dx} y={p.y + 4} textAnchor={anchor}>
                {label}
              </text>
            </g>
          );
        })}
        <circle cx={cx} cy={cy} r={12} fill="var(--accent)" />
        <text x={cx} y={cy + 28} textAnchor="middle" style={{ fontWeight: 700, paintOrder: 'stroke', stroke: 'var(--panel)', strokeWidth: 4 }}>
          {center?.title.split(' — ')[0]}
        </text>
      </svg>
      <div className="row small muted" style={{ gap: 14, padding: '0 8px 4px' }}>
        <span className="src jira">● Jira</span>
        <span className="src confluence">● Confluence</span>
        <span className="src figma">● Figma</span>
        <span className="src decision">● Decision</span>
        <span>— explicit link</span>
        <span>- - semantic</span>
      </div>
    </div>
  );
}
