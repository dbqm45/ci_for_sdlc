import { useEffect, useState } from 'react';
import { useApp } from '../App';
import { api, type AuditEntry } from '../api';
import { Card, DateTime } from '../components/ui';

export function Audit() {
  const { version } = useApp();
  const [log, setLog] = useState<AuditEntry[]>([]);
  const [kind, setKind] = useState('all');
  const [open, setOpen] = useState<number>();
  useEffect(() => void api.audit().then(setLog), [version]);
  const kinds = ['all', ...new Set(log.map((l) => l.kind))];
  const shown = kind === 'all' ? log : log.filter((l) => l.kind === kind);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Audit log</h1>
          <p>Every AI call (with the exact sources sent), decision, approval, webhook and settings change.</p>
        </div>
        <select className="input" style={{ width: 200 }} aria-label="Event kind" value={kind} onChange={(e) => setKind(e.target.value)}>
          {kinds.map((k) => (
            <option key={k} value={k}>
              {k === 'all' ? 'All events' : k.replace('_', ' ')}
            </option>
          ))}
        </select>
      </div>
      <Card pad={false}>
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 170 }}>When</th>
              <th className="hide-sm" style={{ width: 120 }}>Event</th>
              <th className="hide-sm" style={{ width: 160 }}>Actor</th>
              <th>Summary</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((l, i) => (
              <tr key={i} className={l.details ? 'clickable' : ''} onClick={() => l.details && setOpen(open === i ? undefined : i)}>
                <td className="small muted"><DateTime iso={l.at} /></td>
                <td className="hide-sm">
                  <span className="badge">{l.kind.replace('_', ' ')}</span>
                </td>
                <td className="small hide-sm">{l.actor}</td>
                <td>
                  {l.summary}
                  {open === i && <pre className="mono small" style={{ whiteSpace: 'pre-wrap', background: 'var(--panel-2)', padding: 8, borderRadius: 6 }}>{JSON.stringify(l.details, null, 2)}</pre>}
                </td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={4} className="empty">
                  No entries.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
