import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../App';
import { api, type Decision } from '../api';
import { Card, SeverityBadge, Stat } from '../components/ui';

export function Decisions() {
  const { analysis, navigate, version, refresh } = useApp();
  const [log, setLog] = useState<Decision[]>([]);
  const [topic, setTopic] = useState<string>();
  useEffect(() => void api.decisions().then(setLog), [version]);

  const open = useMemo(() => {
    const out: { key: string; title: string; severity: string; question: string; topic: string; finding: string }[] = [];
    for (const i of analysis!.items) {
      for (const f of i.findings) if (f.status === 'open' && f.question) out.push({ key: i.key, title: i.title, severity: f.severity, question: f.question.text, topic: f.question.topic, finding: f.title });
    }
    const order = { critical: 0, warning: 1, info: 2 } as Record<string, number>;
    return out.sort((a, b) => order[a.severity] - order[b.severity]);
  }, [analysis]);
  const m = analysis!.metrics.decisionDebt;
  const shown = topic ? open.filter((o) => o.topic === topic) : open;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Decision debt</h1>
          <p>Unresolved decisions that will turn into rework, bugs or wrong implementations if nobody takes them. The AI asks — humans decide.</p>
        </div>
      </div>
      <div className="grid g4">
        <Stat label="Critical" value={m.critical} tone="bad" sub="block implementation" />
        <Stat label="Important" value={m.important} tone="warn" sub="cause rework" />
        <Stat label="Minor" value={m.minor} sub="incl. unanswered adversarial questions" />
        <Stat label="Decisions in force" value={log.filter((d) => d.status === 'active').length} tone="ok" />
      </div>
      <div className="row wrap">
        <button className={`btn sm ${!topic ? 'primary' : ''}`} onClick={() => setTopic(undefined)}>All topics</button>
        {m.topics.map((t) => (
          <button key={t.topic} className={`btn sm ${topic === t.topic ? 'primary' : ''}`} onClick={() => setTopic(t.topic)}>
            {t.topic} · {t.count}
          </button>
        ))}
      </div>
      <Card title={`Open questions (${shown.length})`} pad={false}>
        <div className="list">
          {shown.length === 0 && <div className="empty">No open questions{topic ? ' for this topic' : ''}.</div>}
          {shown.map((o, i) => (
            <div key={i} className="li clickable" onClick={() => navigate(`/item/${o.key}`)}>
              <SeverityBadge severity={o.severity} />
              <div className="col" style={{ gap: 2, flex: 1 }}>
                <strong>❓ {o.question}</strong>
                <span className="small muted">
                  <span className="key">{o.key}</span> {o.title} · {o.finding} · <em>{o.topic}</em>
                </span>
              </div>
            </div>
          ))}
        </div>
      </Card>
      <Card title="Decision log" pad={false}>
        <table className="table">
          <thead>
            <tr><th>When</th><th>Item</th><th>Question</th><th>Decision</th><th>By</th><th /></tr>
          </thead>
          <tbody>
            {log.length === 0 && <tr><td colSpan={6} className="empty">No decisions yet.</td></tr>}
            {[...log].reverse().map((d) => (
              <tr key={d.id} style={d.status !== 'active' ? { opacity: 0.55 } : undefined}>
                <td className="small muted">{new Date(d.decidedAt).toLocaleString()}</td>
                <td><a href={`#/item/${d.itemKey}`} className="key">{d.itemKey}</a></td>
                <td className="small">{d.question}</td>
                <td>
                  <strong>{d.answer}</strong>
                  {d.effect !== 'resolve' && <span className="badge" style={{ marginLeft: 6 }}>{d.effect.replace('_', ' ')}</span>}
                  {d.version > 1 && <span className="badge" style={{ marginLeft: 6 }}>v{d.version}</span>}
                  {d.status !== 'active' && <span className="badge" style={{ marginLeft: 6 }}>{d.status}</span>}
                  {d.note && <div className="small muted">{d.note}</div>}
                  {d.changeReason && <div className="small muted">Changed because: {d.changeReason}</div>}
                  {d.status === 'withdrawn' && <div className="small muted">Withdrawn by {d.withdrawnBy}{d.withdrawReason ? `: ${d.withdrawReason}` : ''}</div>}
                </td>
                <td className="small">{d.decidedBy}</td>
                <td>{d.status === 'active' && <button className="btn ghost sm" onClick={async () => (await api.reopen(d.id)) && refresh()}>Re-open</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
