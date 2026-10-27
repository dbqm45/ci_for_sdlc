import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../App';
import type { AcceptanceStats, Finding } from '@ci/core';
import { api, type Decision } from '../api';
import { autoClosedDecisions, pdiDecisionLabel, sharePercent } from '../lib/autoClose';
import { Card, DateTime, QuestionMark, SeverityBadge, Stat } from '../components/ui';

export function Decisions() {
  const { analysis, navigate, version, refresh } = useApp();
  const [log, setLog] = useState<Decision[]>([]);
  const [topic, setTopic] = useState<string>();
  const [acceptance, setAcceptance] = useState<AcceptanceStats[]>([]);
  useEffect(() => void api.decisions().then(setLog), [version]);
  useEffect(() => void api.acceptance().then(setAcceptance).catch(() => setAcceptance([])), [version]);
  const autoClosed = useMemo(() => autoClosedDecisions(log), [log]);

  const open = useMemo(() => {
    const out: { key: string; title: string; severity: Finding['severity']; question: string; topic: string; finding: string }[] = [];
    for (const i of analysis!.items) {
      for (const f of i.findings) if (f.status === 'open' && f.question) out.push({ key: i.key, title: i.title, severity: f.severity, question: f.question.text, topic: f.question.topic, finding: f.title });
    }
    const order: Record<Finding['severity'], number> = { critical: 0, warning: 1, info: 2 };
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
        <Stat label="Critical" value={m.critical} tone="bad" tint sub="block implementation" />
        <Stat label="Important" value={m.important} tone="warn" tint sub="cause rework" />
        <Stat label="Minor" value={m.minor} sub="incl. unanswered adversarial questions" />
        <Stat label="Decisions in force" value={log.filter((d) => d.status === 'active').length} tone="ok" />
      </div>
      <div className="row wrap">
        <button className={`btn sm choice ${!topic ? 'selected' : ''}`} onClick={() => setTopic(undefined)}>All topics</button>
        {m.topics.map((t) => (
          <button key={t.topic} className={`btn sm choice ${topic === t.topic ? 'selected' : ''}`} onClick={() => setTopic(t.topic)}>
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
                <strong className="row" style={{ gap: 8 }}><QuestionMark /> {o.question}</strong>
                <span className="small muted">
                  <span className="key">{o.key}</span> {o.title} · {o.finding} · <em>{o.topic}</em>
                </span>
              </div>
            </div>
          ))}
        </div>
      </Card>
      <Card title={`Auto-closed (${autoClosed.length})`} pad={false}>
        <p className="small muted" style={{ padding: '0 var(--sp-6)' }}>
          Questions closed with an answer found in Confluence, Figma or an earlier decision. Reopen one if the quote does not answer it: the finding opens again and the same answer is not proposed again.
        </p>
        {acceptance.map((a) => (
          <div key={a.decisionType} className="row wrap small" style={{ gap: 12, padding: '0 var(--sp-6) var(--sp-4)' }} aria-label={`Acceptance of ${a.decisionType}`}>
            <span className="mono">{a.decisionType}</span>
            <span>Reviewed {a.reviewed}/{a.thresholds.lastDecisions}</span>
            <span>Accepted unedited {a.accepted} ({sharePercent(a.uneditedShare)})</span>
            <span>Edited {a.edited} ({sharePercent(a.editedShare)})</span>
            <span>Rejected {a.rejected}</span>
            <span>Reopened {a.reopened}</span>
            <span>Closed automatically {a.applied}</span>
            <span className="muted">{a.note}</span>
          </div>
        ))}
        <table className="table">
          <thead>
            <tr><th>When</th><th>Item</th><th>Question</th><th>Answer and source</th><th className="hide-sm">By</th><th /></tr>
          </thead>
          <tbody>
            {autoClosed.length === 0 && <tr><td colSpan={6} className="empty">Nothing auto-closed.</td></tr>}
            {autoClosed.map((d) => (
              <tr key={d.id}>
                <td className="small muted"><DateTime iso={d.decidedAt} /></td>
                <td><a href={`#/item/${encodeURIComponent(d.itemKey)}/${encodeURIComponent(d.findingId)}`} className="key">{d.itemKey}</a></td>
                <td className="small">{d.question}</td>
                <td>
                  <strong>{d.answer}</strong>
                  {d.draftEdited && <span className="badge" style={{ marginLeft: 6 }}>edited</span>}
                  <span className={`badge${d.pdiDecision ? ' accent' : ''}`} style={{ marginLeft: 6 }} title={d.pdiDecision ? 'Recorded in pdi’s decision register' : 'pdi has not recorded this decision yet'}>
                    {pdiDecisionLabel(d)}
                  </span>
                  {d.evidence?.[0] && <div className="small muted">«{d.evidence[0].excerpt}» — {d.evidence[0].title}</div>}
                </td>
                <td className="small hide-sm">{d.automation ? `${d.decidedBy} (${d.automation.rule})` : d.decidedBy}</td>
                <td><button className="btn ghost sm" onClick={async () => (await api.reopenAutoClosed(d.id)) && refresh()}>Reopen</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card title="Decision log" pad={false}>
        <table className="table">
          <thead>
            <tr><th>When</th><th className="hide-sm">Item</th><th>Question</th><th>Decision</th><th className="hide-sm">By</th><th className="hide-sm" /></tr>
          </thead>
          <tbody>
            {log.length === 0 && <tr><td colSpan={6} className="empty">No decisions yet.</td></tr>}
            {[...log].reverse().map((d) => (
              <tr key={d.id} style={d.status !== 'active' ? { opacity: 0.55 } : undefined}>
                <td className="small muted"><DateTime iso={d.decidedAt} /></td>
                <td className="hide-sm"><a href={`#/item/${d.itemKey}`} className="key">{d.itemKey}</a></td>
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
                <td className="small hide-sm">{d.decidedBy}</td>
                <td className="hide-sm">{d.status === 'active' && <button className="btn ghost sm" onClick={async () => (await (d.decisionType === 'finding.auto_close' ? api.reopenAutoClosed(d.id) : api.reopen(d.id))) && refresh()}>Re-open</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
