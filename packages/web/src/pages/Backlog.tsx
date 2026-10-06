import { Fragment, useMemo, useState } from 'react';
import { useApp } from '../App';
import { Bar, DIMENSION_LABELS, HealthNumber, StatusBadge, healthTone } from '../components/ui';

export function Backlog() {
  const { analysis, navigate } = useApp();
  const [filter, setFilter] = useState<'all' | 'critical' | 'needs_attention' | 'healthy'>('all');
  const [type, setType] = useState<'all' | 'epic' | 'feature' | 'story' | 'bug'>('all');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string>();

  const items = useMemo(
    () =>
      analysis!.items
        .filter((i) => i.type !== 'task')
        .filter((i) => filter === 'all' || i.healthStatus === filter)
        .filter((i) => type === 'all' || i.type === type)
        .filter((i) => !q || `${i.key} ${i.title} ${i.domain?.name ?? ''}`.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => order(a.type) - order(b.type) || a.key.localeCompare(b.key, undefined, { numeric: true })),
    [analysis, filter, type, q],
  );

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Backlog</h1>
          <p>Every item with its health and readiness. Expand a row to see the dimensions behind the number.</p>
        </div>
      </div>
      <div className="row wrap">
        <input className="input" style={{ maxWidth: 280 }} aria-label="Search" placeholder="Search key, title, domain…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input" style={{ width: 160 }} aria-label="Item type" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
          <option value="all">All types</option>
          <option value="epic">Epics</option>
          <option value="feature">Features</option>
          <option value="story">Stories</option>
          <option value="bug">Bugs</option>
        </select>
        {(['all', 'critical', 'needs_attention', 'healthy'] as const).map((f) => (
          <button key={f} className={`btn sm ${filter === f ? 'primary' : ''}`} onClick={() => setFilter(f)}>
            {f === 'all' ? 'All' : f === 'critical' ? '🔴 Critical' : f === 'needs_attention' ? '🟡 Needs attention' : '🟢 Healthy'}
          </button>
        ))}
      </div>
      <div className="card" style={{ overflow: 'hidden' }}>
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 30 }} />
              <th style={{ width: 60 }}>Status</th>
              <th style={{ width: 70 }}>Type</th>
              <th style={{ width: 100 }}>Key</th>
              <th>Title</th>
              <th style={{ width: 120 }}>Domain</th>
              <th style={{ width: 150 }}>Readiness</th>
              <th style={{ width: 70, textAlign: 'right' }}>Health</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => {
              const openCount = i.findings.filter((f) => f.status === 'open').length;
              return (
                <Fragment key={i.key}>
                  <tr className="clickable" onClick={() => navigate(`/item/${i.key}`)}>
                    <td onClick={(e) => (e.stopPropagation(), setOpen(open === i.key ? undefined : i.key))} title="Show dimensions" style={{ color: 'var(--muted)' }}>
                      {open === i.key ? '▾' : '▸'}
                    </td>
                    <td><span className={`dot ${healthTone(i.healthStatus)}`} /></td>
                    <td className="type">{i.type}</td>
                    <td className="key">{i.key}</td>
                    <td>
                      <strong>{i.title}</strong>
                      {openCount > 0 && <span className="small muted"> · {openCount} open finding{openCount > 1 ? 's' : ''}</span>}
                      {i.blockingIssues[0] && <div className="small" style={{ color: 'var(--bad)' }}>✗ {i.blockingIssues[0]}{i.blockingIssues.length > 1 ? ` (+${i.blockingIssues.length - 1})` : ''}</div>}
                    </td>
                    <td className="small muted">{i.domain?.name ?? '—'}</td>
                    <td><StatusBadge status={i.readiness} /></td>
                    <td style={{ textAlign: 'right' }}><HealthNumber value={i.health} status={i.healthStatus} /></td>
                  </tr>
                  {open === i.key && (
                    <tr className="sub">
                      <td />
                      <td colSpan={7}>
                        <div className="dims" style={{ maxWidth: 560, padding: '6px 0 10px' }}>
                          {i.dimensions.map((d) => (
                            <Fragment key={d.dimension}>
                              <span className="small">{DIMENSION_LABELS[d.dimension]}</span>
                              <Bar value={d.score} tone={d.status === 'ok' ? 'ok' : d.status === 'warn' ? 'warn' : 'bad'} />
                              <span className="num small">{d.score}%</span>
                            </Fragment>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {items.length === 0 && <div className="empty">No items match the filter.</div>}
      </div>
    </div>
  );
}

const order = (t: string) => ({ epic: 0, story: 1, bug: 2 })[t] ?? 3;
