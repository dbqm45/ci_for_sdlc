import { useEffect, useState } from 'react';
import { useApp } from '../App';
import { api, type HistoryPoint } from '../api';
import { Bar, Card, HealthNumber, SeverityBadge, Source, Stat, StatusBadge, ago } from '../components/ui';

export function Overview() {
  const { analysis, navigate, setAnalysis, toast, version } = useApp();
  const a = analysis!;
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [scenarios, setScenarios] = useState<{ id: string; title: string; description: string }[]>([]);
  const [demo, setDemo] = useState(false);
  const [busy, setBusy] = useState<string>();

  useEffect(() => {
    void api.history().then(setHistory);
    void api.settings().then((s) => {
      setDemo(s.settings.mode === 'demo');
      if (s.settings.mode === 'demo') void api.scenarios().then(setScenarios);
    });
  }, [version]);

  const work = a.counts.healthy + a.counts.needsAttention + a.counts.critical || 1;
  const m = a.metrics;
  const epics = a.items.filter((i) => i.type === 'epic');

  const simulate = async (id: string) => {
    setBusy(id);
    try {
      const r = await api.applyScenario(id);
      setAnalysis(r);
      toast(`Change applied — ${r.drift.length} drift events detected`);
      navigate('/drift');
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Continuous Intelligence — {a.project.name}</h1>
          <p>Is the team ready to build what it has defined — and do Jira, Confluence and Figma say the same thing?</p>
        </div>
        <span className="small muted">Analyzed {ago(a.analyzedAt)} in {a.durationMs} ms</span>
      </div>

      <div className="grid g4">
        <Stat label="Epics" value={a.counts.epics} />
        <Stat label="Stories" value={a.counts.stories} sub={`${a.counts.bugs} bugs · ${a.counts.tasks} tasks`} />
        <Stat label="Warnings" value={a.counts.warnings} tone="warn" sub="open findings" />
        <Stat label="Critical" value={a.counts.criticalFindings} tone="bad" sub="blocking findings" />
      </div>

      <Card title="Backlog health">
        <div className="col" style={{ gap: 12 }}>
          <div className="stack">
            <span style={{ width: `${(a.counts.healthy / work) * 100}%`, background: 'var(--ok)' }} />
            <span style={{ width: `${(a.counts.needsAttention / work) * 100}%`, background: 'var(--warn)' }} />
            <span style={{ width: `${(a.counts.critical / work) * 100}%`, background: 'var(--bad)' }} />
          </div>
          <div className="row wrap" style={{ gap: 20 }}>
            <span className="row"><span className="dot ok" /> Healthy <strong>{a.counts.healthy}</strong></span>
            <span className="row"><span className="dot warn" /> Needs attention <strong>{a.counts.needsAttention}</strong></span>
            <span className="row"><span className="dot bad" /> Critical <strong>{a.counts.critical}</strong></span>
            {history.length > 1 && <Trend history={history} />}
          </div>
        </div>
      </Card>

      <div className="grid g4">
        <Stat label="Feature readiness" value={`${m.readiness}%`} sub="stories ready for implementation" tone={m.readiness >= 70 ? 'ok' : m.readiness >= 40 ? 'warn' : 'bad'} />
        <Stat label="Specification health" value={m.specificationHealth} sub="average story health" />
        <Stat label="Design coverage" value={`${m.designCoverage}%`} sub="required UI states present in Figma" />
        <Stat label="User journey coverage" value={`${m.journeyCoverage}%`} sub="expected paths defined" />
        <Stat label="Documentation consistency" value={`${m.documentationConsistency}%`} sub="items without conflicts / outdated docs" />
        <Stat label="Drift" value={m.drift} sub="changes since last analysis + open drift" tone={m.drift ? 'warn' : undefined} />
        <div className="card stat" style={{ gridColumn: 'span 2' }}>
          <div className="label">Decision debt — unresolved decisions that will cause rework later</div>
          <div className="row" style={{ gap: 18, marginTop: 6 }}>
            <span className="value" style={{ color: 'var(--bad)' }}>🔴 {m.decisionDebt.critical}</span>
            <span className="value" style={{ color: 'var(--warn)' }}>🟡 {m.decisionDebt.important}</span>
            <span className="value" style={{ color: 'var(--muted)' }}>⚪ {m.decisionDebt.minor}</span>
          </div>
          <div className="sub">{m.decisionDebt.topics.slice(0, 5).map((t) => `${t.topic} (${t.count})`).join(' · ')}</div>
        </div>
      </div>

      <div className="grid g2">
        <Card title="Where is the biggest risk?" pad={false}>
          <div className="list">
            {a.topRisks.length === 0 && <div className="empty">No risks — every item is healthy.</div>}
            {a.topRisks.map((r, i) => (
              <div key={r.key} className="li clickable" onClick={() => navigate(`/item/${r.key}`)}>
                <strong className="faint" style={{ width: 18 }}>{i + 1}.</strong>
                <div className="col" style={{ gap: 2, flex: 1 }}>
                  <div className="row">
                    <span className="key">{r.key}</span> <strong>{r.title}</strong>
                  </div>
                  <span className="small muted">{r.reason}</span>
                </div>
                <SeverityBadge severity={r.severity} />
              </div>
            ))}
          </div>
        </Card>

        <Card title="Epics" pad={false}>
          <div className="list">
            {epics.map((e) => (
              <div key={e.key} className="li clickable" onClick={() => navigate(`/item/${e.key}`)}>
                <div className="col" style={{ gap: 4, flex: 1 }}>
                  <div className="row">
                    <span className="key">{e.key}</span>
                    <strong>{e.title}</strong>
                    <span className="right"><HealthNumber value={e.health} status={e.healthStatus} /></span>
                  </div>
                  {e.rollup && (
                    <>
                      <div className="row small muted wrap" style={{ gap: 12 }}>
                        <span>{e.rollup.stories} stories</span>
                        <span>Requirements {e.rollup.requirementsCoverage}%</span>
                        <span>Design {e.rollup.designCoverage}%</span>
                        <span>Docs {e.rollup.documentationCoverage}%</span>
                      </div>
                      {e.rollup.highlights.slice(0, 2).map((h) => (
                        <span key={h} className="small" style={{ color: 'var(--warn)' }}>⚠ {h}</span>
                      ))}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid g2">
        <Card title="Domains" pad={false}>
          <table className="table">
            <thead>
              <tr><th>Domain</th><th>Items</th><th>Critical</th><th>Needs attention</th><th style={{ width: '35%' }}>Health</th></tr>
            </thead>
            <tbody>
              {a.domains.map((d) => (
                <tr key={d.name}>
                  <td><strong>{d.name}</strong></td>
                  <td>{d.items}</td>
                  <td style={{ color: d.critical ? 'var(--bad)' : undefined }}>{d.critical}</td>
                  <td style={{ color: d.needsAttention ? 'var(--warn)' : undefined }}>{d.needsAttention}</td>
                  <td><Bar value={((d.items - d.critical - d.needsAttention * 0.5) / d.items) * 100} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="Recent drift" actions={<a href="#/drift" className="small">All events →</a>} pad={false}>
          <div className="list">
            {a.drift.length === 0 && <div className="empty">No changes since the previous analysis.</div>}
            {a.drift.slice(0, 6).map((d) => (
              <div key={d.id} className="li">
                <SeverityBadge severity={d.severity} />
                <div className="col" style={{ gap: 2 }}>
                  <span>{d.summary}</span>
                  {d.impactedItems.length > 0 && <span className="small muted">Impacts {d.impactedItems.join(', ')}</span>}
                </div>
                <span className="right"><Source source={d.source} /></span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {demo && scenarios.length > 0 && (
        <Card title="Demo workspace — simulate a change in a source system" actions={<button className="btn sm" onClick={async () => { setAnalysis(await api.resetDemo()); toast('Demo workspace reset'); }}>Reset demo data</button>}>
          <p className="muted small" style={{ marginTop: 0 }}>
            Continuous drift detection: approve a story (e.g. PAY-123), then change Confluence, Figma or Jira and watch the system flag impacted items.
          </p>
          <div className="grid g2">
            {scenarios.map((s) => (
              <div key={s.id} className="card card-pad row" style={{ alignItems: 'flex-start' }}>
                <div className="col" style={{ gap: 2, flex: 1 }}>
                  <strong>{s.title}</strong>
                  <span className="small muted">{s.description}</span>
                </div>
                <button className="btn sm" disabled={!!busy} onClick={() => simulate(s.id)}>{busy === s.id ? '…' : 'Apply'}</button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="row small muted">
        <StatusBadge status="healthy" /> no open findings that require action
        <StatusBadge status="needs_attention" /> warnings — notify
        <StatusBadge status="critical" /> blocking — a critical finding overrides the average
      </div>
    </div>
  );
}

function Trend({ history }: { history: HistoryPoint[] }) {
  const pts = history.slice(-30);
  const w = 160;
  const h = 28;
  const max = 100;
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${(i / Math.max(1, pts.length - 1)) * w},${h - (p.readiness / max) * h}`).join(' ');
  return (
    <span className="row right small muted" title="Readiness over the last analyses">
      Readiness trend
      <svg width={w} height={h} style={{ overflow: 'visible' }}>
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2" />
      </svg>
    </span>
  );
}
