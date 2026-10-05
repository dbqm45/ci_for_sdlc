import { useEffect, useState } from 'react';
import { useApp } from '../App';
import { api, type DriftEvent } from '../api';
import { Card, SeverityBadge, Source } from '../components/ui';

const KIND: Record<string, string> = {
  changed: 'Changed',
  added: 'Added',
  removed: 'Removed',
  claim_changed: 'Value changed',
  new_finding: 'New finding',
  status_change: 'Readiness changed',
};

export function Drift() {
  const { analysis, version, navigate } = useApp();
  const [events, setEvents] = useState<DriftEvent[]>([]);
  const [hideInfo, setHideInfo] = useState(true);
  useEffect(() => void api.drift().then(setEvents), [version]);

  const approvedDrift = analysis!.items.flatMap((i) => i.findings.filter((f) => f.category === 'DRIFT' && f.status === 'open').map((f) => ({ item: i, f })));
  const shown = hideInfo ? events.filter((e) => e.severity !== 'info') : events;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Continuous drift detection</h1>
          <p>The system stays active after approval: every change in Jira, Confluence or Figma is compared with the previous state and with approved baselines.</p>
        </div>
        <label className="check small">
          <input type="checkbox" checked={hideInfo} onChange={(e) => setHideInfo(e.target.checked)} /> Hide informational events
        </label>
      </div>

      {approvedDrift.length > 0 && (
        <Card title={`🟡 Impact detected on approved items (${approvedDrift.length})`} pad={false}>
          <div className="list">
            {approvedDrift.map(({ item, f }) => (
              <div key={f.id} className="li clickable" onClick={() => navigate(`/item/${item.key}`)}>
                <SeverityBadge severity={f.severity} />
                <div className="col" style={{ gap: 2 }}>
                  <strong>
                    <span className="key">{item.key}</span> {item.title}
                  </strong>
                  <span className="small">{f.title}</span>
                  <span className="small muted">{f.evidence.map((e) => e.title).join(' · ')}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card title="Change log" pad={false}>
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 160 }}>When</th>
              <th style={{ width: 110 }}>Severity</th>
              <th style={{ width: 130 }}>Change</th>
              <th>What</th>
              <th>Potentially affected</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr>
                <td colSpan={5} className="empty">
                  No drift yet. In the demo workspace use “Simulate a change” on the Project health page.
                </td>
              </tr>
            )}
            {shown.map((e) => (
              <tr key={e.id}>
                <td className="small muted">{new Date(e.at).toLocaleString()}</td>
                <td>
                  <SeverityBadge severity={e.severity} />
                </td>
                <td className="small">
                  {e.kind === 'status_change' && e.severity === 'critical' ? <strong style={{ color: 'var(--bad)' }}>🔴 DRIFT DETECTED</strong> : KIND[e.kind]}
                </td>
                <td>
                  <Source source={e.source} /> {e.summary}
                </td>
                <td className="small">
                  {e.impactedItems.map((k) => (
                    <a key={k} href={`#/item/${k}`} className="key" style={{ marginRight: 8 }}>
                      {k}
                    </a>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
