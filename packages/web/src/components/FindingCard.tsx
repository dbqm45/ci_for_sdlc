import { useState } from 'react';
import type { Decision, Finding, Question } from '@ci/core';
import { api, currentUser } from '../api';
import { CATEGORY_LABELS, DIMENSION_LABELS, SeverityBadge, Source } from './ui';

/** Finding → Explanation → Evidence → Question → Decision */
export function FindingCard({ finding, decision, onChanged }: { finding: Finding; decision?: Decision; onChanged: () => void }) {
  const [why, setWhy] = useState(finding.severity === 'critical');
  const closed = finding.status !== 'open';
  return (
    <div className={`finding ${finding.severity} ${closed ? 'closed' : ''}`}>
      <div className="row wrap">
        <SeverityBadge severity={finding.severity} />
        <span className="badge">{CATEGORY_LABELS[finding.category]}</span>
        <span className="small muted">{DIMENSION_LABELS[finding.dimension]}</span>
        {finding.origin === 'ai' && <span className="badge accent" title="Found by the semantic AI reviewer — backed by cited evidence">AI</span>}
        {finding.origin === 'drift' && <span className="badge warn">Drift</span>}
        <span className="right small faint mono" title="Rule that produced this finding">{finding.ruleId}</span>
      </div>
      <div className="title">{finding.title}</div>
      <p>{finding.explanation}</p>
      <div>
        <button className="btn ghost sm" onClick={() => setWhy(!why)}>
          {why ? '▾' : '▸'} WHY? — {finding.evidence.length} source{finding.evidence.length === 1 ? '' : 's'}
        </button>
      </div>
      {why && (
        <div className="evidence">
          {finding.evidence.map((e, i) => (
            <div className="ev" key={i}>
              <Source source={e.source} />
              <div>
                {e.url ? (
                  <a href={e.url} target="_blank" rel="noreferrer">
                    {e.title} ↗
                  </a>
                ) : (
                  <span>{e.title}</span>
                )}
                {e.excerpt && <blockquote>{e.excerpt}</blockquote>}
              </div>
            </div>
          ))}
        </div>
      )}
      {finding.resolution && (
        <div className="resolution">
          ✓ {finding.status === 'accepted_risk' ? 'Risk accepted' : finding.status === 'dismissed' ? 'Dismissed' : 'Decided'}: {finding.resolution.summary}
          {decision && (
            <span className="small" style={{ color: 'var(--muted)' }}>
              {' '}
              — {decision.decidedBy}, {new Date(decision.decidedAt).toLocaleString()}{' '}
              <button className="btn ghost sm" onClick={async () => (await api.reopen(decision.id), onChanged())}>
                Re-open
              </button>
            </span>
          )}
        </div>
      )}
      {!closed && finding.question && <QuestionBox question={finding.question} findingId={finding.id} itemKey={finding.itemKey} onDecided={onChanged} allowRisk />}
    </div>
  );
}

export function QuestionBox({
  question,
  findingId,
  itemKey,
  onDecided,
  allowRisk,
  rationale,
}: {
  question: Question;
  findingId: string;
  itemKey: string;
  onDecided: () => void;
  allowRisk?: boolean;
  rationale?: string;
}) {
  const [selected, setSelected] = useState<string>();
  const [other, setOther] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  const isOther = selected === 'Other';
  const answer = isOther ? other.trim() : selected;

  const submit = async (effect: Decision['effect']) => {
    const ans = effect === 'resolve' ? answer : effect === 'accept_risk' ? 'Risk accepted' : 'Not applicable';
    if (!ans) return;
    setBusy(true);
    setErr(undefined);
    try {
      await api.decide({ questionId: question.id, findingId, itemKey, topic: question.topic, question: question.text, answer: ans, note: note || undefined, decidedBy: currentUser(), effect });
      onDecided();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="question">
      <div className="q">❓ {question.text}</div>
      {rationale && <div className="small muted">{rationale}</div>}
      <div className="options">
        {question.options.map((o) => (
          <button key={o.id} className={`option ${selected === o.label ? 'selected' : ''}`} onClick={() => setSelected(o.label)}>
            {o.label}
          </button>
        ))}
      </div>
      {isOther && <input className="input" autoFocus placeholder="Describe what should happen…" value={other} onChange={(e) => setOther(e.target.value)} />}
      {selected && <textarea className="input" placeholder="Note / rationale (optional) — becomes part of the specification" value={note} onChange={(e) => setNote(e.target.value)} />}
      <div className="row wrap">
        <button className="btn primary sm" disabled={!answer || busy} onClick={() => submit('resolve')}>
          Record decision
        </button>
        {allowRisk && (
          <>
            <button className="btn sm" disabled={busy} onClick={() => submit('accept_risk')} title="Keep the gap, but consciously accept the risk">
              Accept risk
            </button>
            <button className="btn ghost sm" disabled={busy} onClick={() => submit('dismiss')} title="The finding does not apply">
              Not applicable
            </button>
          </>
        )}
        <span className="small muted right">Decision by {currentUser()} · the human owns the decision</span>
      </div>
      {err && <div className="banner bad">{err}</div>}
    </div>
  );
}
