import { useState } from 'react';
import { api, type ImpactReport, errMsg } from '../api';
import { Card, Source, Spinner, StatusBadge } from '../components/ui';

const EXAMPLES = ['Change payment timeout from 30s to 60s', 'Make payment retry idempotent', 'Allow 10 saved cards', 'jira:PAY-125'];

export function Impact() {
  const [q, setQ] = useState('');
  const [rep, setRep] = useState<ImpactReport>();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();

  const run = async (query = q) => {
    if (!query.trim()) return;
    setQ(query);
    setBusy(true);
    setErr(undefined);
    try {
      setRep(await api.impact(query));
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Impact analysis</h1>
          <p>“What else is affected if we change this?” — analyzed before the change, not after the bug.</p>
        </div>
      </div>
      <form className="row" onSubmit={(e) => (e.preventDefault(), void run())}>
        <input className="input" placeholder="Describe a planned change, or enter an entity id (jira:PAY-125)…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn primary" disabled={busy}>
          {busy ? <Spinner /> : 'Analyze impact'}
        </button>
      </form>
      <div className="row wrap small">
        <span className="muted">Try:</span>
        {EXAMPLES.map((x) => (
          <button key={x} className="btn sm" onClick={() => run(x)}>
            {x}
          </button>
        ))}
      </div>
      {err && <div className="banner bad">{err}</div>}
      {rep && (
        <>
          <div className="grid g4">
            {(['jira', 'confluence', 'figma'] as const).map((s) => (
              <div key={s} className="card stat">
                <div className="label">
                  <Source source={s} />
                </div>
                <div className="value">{rep.bySource[s].length}</div>
                <div className="sub">{s === 'jira' ? 'issues' : s === 'confluence' ? 'documents' : 'frames'}</div>
              </div>
            ))}
            <div className="card stat">
              <div className="label">Affected work items</div>
              <div className="value">{rep.affectedItems.length}</div>
              <div className="sub">{rep.affectedItems.filter((i) => i.readiness === 'ready').length} currently ready</div>
            </div>
          </div>
          {rep.claims.length > 0 && (
            <Card title="Sources stating the same fact" pad={false}>
              <table className="table">
                <tbody>
                  {rep.claims.map((c, i) => (
                    <tr key={i}>
                      <td>{c.attribute}</td>
                      <td>
                        <strong>{c.value}</strong>
                      </td>
                      <td>{c.title}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
          <div className="grid g2">
            <Card title="Affected stories, bugs and epics" pad={false}>
              <div className="list">
                {rep.affectedItems.length === 0 && <div className="empty">None.</div>}
                {rep.affectedItems.map((i) => (
                  <a key={i.key} className="li" href={`#/item/${i.key}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                    <div className="col" style={{ gap: 2, flex: 1 }}>
                      <strong>
                        <span className="key">{i.key}</span> {i.title}
                      </strong>
                      <span className="small muted">via {i.via.slice(0, 3).join(' · ')}</span>
                    </div>
                    <StatusBadge status={i.readiness} />
                  </a>
                ))}
              </div>
            </Card>
            <Card title="Related artifacts" pad={false}>
              <div className="list">
                {(['confluence', 'figma', 'jira'] as const).flatMap((s) =>
                  rep.bySource[s].slice(0, 8).map((h) => (
                    <div key={h.entityId} className="li">
                      <Source source={h.source} />
                      <div className="col" style={{ gap: 2, flex: 1 }}>
                        {h.url ? (
                          <a href={h.url} target="_blank" rel="noreferrer">
                            {h.title}
                          </a>
                        ) : (
                          <span>{h.title}</span>
                        )}
                        <span className="small muted">{h.reason}</span>
                      </div>
                    </div>
                  )),
                )}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
