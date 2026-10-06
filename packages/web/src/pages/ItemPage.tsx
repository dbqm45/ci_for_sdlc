import { Fragment, useCallback, useEffect, useState } from 'react';
import type { ContextRef, ItemAnalysis } from '@ci/core';
import { useApp } from '../App';
import { api, currentUser, type GraphData, type ItemDetail } from '../api';
import { FindingCard, QuestionBox } from '../components/FindingCard';
import { GraphView } from '../components/GraphView';
import { Bar, Card, DIMENSION_LABELS, HealthNumber, JOURNEY_LABELS, ReadinessBadge, STATE_LABELS, SeverityBadge, Source, Spinner, StatusBadge, ago } from '../components/ui';

type Tab = 'findings' | 'challenge' | 'states' | 'context' | 'claims' | 'history';

export function ItemPage({ itemKey }: { itemKey: string }) {
  const { navigate, toast, refresh, version } = useApp();
  const [d, setD] = useState<ItemDetail>();
  const [err, setErr] = useState<string>();
  const [tab, setTab] = useState<Tab>('findings');
  const [showClosed, setShowClosed] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setD(await api.item(itemKey));
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [itemKey]);
  useEffect(() => void load(), [load, version]);

  const changed = useCallback(async () => {
    await load();
    await refresh();
  }, [load, refresh]);

  if (err) return <div className="empty">{err}</div>;
  if (!d) return <div className="empty"><Spinner /></div>;
  const a = d.item;
  const open = a.findings.filter((f) => f.status === 'open');
  const closed = a.findings.filter((f) => f.status !== 'open');
  const openChallenges = a.challenges.filter((c) => !c.answered);
  const decisionFor = (qid?: string) => d.decisions.find((x) => x.questionId === qid);

  const approvable = a.type === 'story' || a.type === 'bug';
  // Only drift blocks: the change needs a review, not a forced approval (P4).
  const reviewNeeded = a.readiness === 'not_ready' && a.findings.some((f) => f.blocks && f.origin === 'drift') && !a.findings.some((f) => f.blocks && f.origin !== 'drift');
  const approve = async (force?: boolean) => {
    let forced: { reason: string } | undefined;
    if (force) {
      const reason = window.prompt(`${a.key} has blocking issues. Why approve it anyway? (required, stored in audit)`)?.trim();
      if (!reason) return;
      forced = { reason };
    }
    try {
      await api.approve(a.key, currentUser(), forced);
      toast(`${a.key} approved — drift will be monitored from now on`);
      await changed();
    } catch (e) {
      toast((e as Error).message);
    }
  };
  const aiReview = async () => {
    setAiBusy(true);
    try {
      const r = await api.aiReview(a.key);
      toast(r.errors.length ? `AI review finished with errors: ${r.errors[0]}` : 'AI review complete');
      await changed();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <div className="page">
      <div className="row small muted">
        <a href="#/backlog">Backlog</a> /
        {a.epicKey && (
          <>
            <a href={`#/item/${a.epicKey}`}>{a.epicKey}</a> /
          </>
        )}
        <span>{a.key}</span>
      </div>

      <div className="page-head">
        <div className="col" style={{ gap: 6 }}>
          <div className="row">
            <span className="type">{a.type}</span>
            {a.url ? (
              <a className="key" href={a.url} target="_blank" rel="noreferrer">
                {a.key} ↗
              </a>
            ) : (
              <span className="key">{a.key}</span>
            )}
            {d.source?.status && <span className="badge">{d.source.status}</span>}
            {a.domain && (
              <span className="badge" title={a.domain.alternatives.map((x) => `${x.name} ${Math.round(x.confidence * 100)}%`).join(', ') || 'No alternatives'}>
                Domain: {a.domain.name} · {Math.round(a.domain.confidence * 100)}%
              </span>
            )}
          </div>
          <h1>
            {a.key} — {a.title}
          </h1>
          <div className="row wrap">
            <ReadinessBadge readiness={a.readiness} />
            <StatusBadge status={a.healthStatus} />
            {d.approval && (
              <span className={`badge ${d.approval.forced ? 'warn' : 'ok'}`} title={`Approved by ${d.approval.approvedBy}${d.approval.reason ? ` — reason: ${d.approval.reason}` : ''}`}>
                ✓ {d.approval.forced ? 'Force-approved' : 'Approved'} {ago(d.approval.approvedAt)} · drift monitored
              </span>
            )}
            {d.approval?.reason && <span className="muted">Reason: {d.approval.reason}</span>}
          </div>
        </div>
        <div className="row">
          <button className="btn" onClick={aiReview} disabled={aiBusy} title="Semantic review + adversarial questions by the configured AI provider">
            {aiBusy ? <Spinner /> : '✦'} AI review
          </button>
          {d.approval && reviewNeeded && (
            <button className="btn primary" onClick={() => approve()} title="The approved specification changed in meaning. Re-approve to accept the change as the new baseline.">
              Re-approve after review
            </button>
          )}
          {d.approval ? (
            <button className="btn" onClick={async () => (await api.unapprove(a.key), changed())}>
              Withdraw approval
            </button>
          ) : !approvable ? null : a.readiness === 'not_ready' ? (
            <button className="btn" onClick={() => approve(true)} title="Approve despite blocking issues — a reason is required and recorded in the audit log">
              Force approve…
            </button>
          ) : (
            <button className="btn primary" onClick={() => approve()} title="Freeze the current specification as the baseline for drift detection">
              Approve for implementation
            </button>
          )}
        </div>
      </div>

      {a.blockingIssues.length > 0 && (
        <div className="banner bad">
          <strong>{a.readiness === 'not_ready' ? `${a.blockingIssues.length} blocking issue${a.blockingIssues.length > 1 ? 's' : ''}` : 'Attention'}:</strong>{' '}
          {a.blockingIssues.map((b, i) => (
            <span key={b}>
              {i > 0 && ' · '}
              {i + 1}. {b}
            </span>
          ))}
        </div>
      )}

      <div className="split">
        <div className="col" style={{ gap: 16 }}>
          {d.source && (d.source.description || d.source.acceptanceCriteria.length > 0) && (
            <Card title="Specification (Jira)">
              {d.source.description && <p style={{ marginTop: 0, whiteSpace: 'pre-wrap' }}>{d.source.description}</p>}
              {d.source.acceptanceCriteria.length > 0 && (
                <>
                  <h3 style={{ margin: '8px 0 4px' }}>Acceptance criteria</h3>
                  <ol style={{ margin: 0, paddingLeft: 20 }}>
                    {d.source.acceptanceCriteria.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ol>
                </>
              )}
              {d.source.businessRules.length > 0 && (
                <>
                  <h3 style={{ margin: '8px 0 4px' }}>Business rules</h3>
                  <ul style={{ margin: 0, paddingLeft: 20 }}>
                    {d.source.businessRules.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </>
              )}
              {d.decisions.filter((x) => x.effect === 'resolve').length > 0 && (
                <>
                  <h3 style={{ margin: '10px 0 4px' }}>Decisions</h3>
                  <ul style={{ margin: 0, paddingLeft: 20 }}>
                    {d.decisions
                      .filter((x) => x.effect === 'resolve')
                      .map((x) => (
                        <li key={x.id}>
                          <span className="muted">{x.question}</span> → <strong>{x.answer}</strong>
                          {x.note && <span className="muted"> ({x.note})</span>}
                        </li>
                      ))}
                  </ul>
                </>
              )}
            </Card>
          )}

          {a.rollup && <EpicRollup a={a} children={d.children} navigate={navigate} />}

          <section className="card">
            <div className="tabs">
              <Tabb id="findings" tab={tab} set={setTab} label={`Findings (${open.length})`} />
              {a.type === 'story' && <Tabb id="challenge" tab={tab} set={setTab} label={`Challenge this feature (${openChallenges.length})`} />}
              {a.states && <Tabb id="states" tab={tab} set={setTab} label="States & journeys" />}
              <Tabb id="context" tab={tab} set={setTab} label={`Context (${a.context.documents.length + a.context.frames.length + a.context.requirements.length})`} />
              <Tabb id="claims" tab={tab} set={setTab} label={`Claims (${a.claims.length})`} />
              <Tabb id="history" tab={tab} set={setTab} label={`Drift (${d.drift.length})`} />
            </div>
            <div className="card-pad col" style={{ gap: 12 }}>
              {tab === 'findings' && (
                <>
                  {open.length === 0 && <div className="empty">No open findings. {a.readiness === 'ready' && 'This item is ready for implementation.'}</div>}
                  {open.map((f) => (
                    <FindingCard key={f.id} finding={f} onChanged={changed} />
                  ))}
                  {closed.length > 0 && (
                    <button className="btn ghost sm" onClick={() => setShowClosed(!showClosed)}>
                      {showClosed ? '▾' : '▸'} {closed.length} resolved / accepted finding{closed.length > 1 ? 's' : ''}
                    </button>
                  )}
                  {showClosed && closed.map((f) => <FindingCard key={f.id} finding={f} decision={decisionFor(f.question?.id)} onChanged={changed} />)}
                </>
              )}
              {tab === 'challenge' && <Challenges a={a} onChanged={changed} decisions={d.decisions} />}
              {tab === 'states' && <States a={a} />}
              {tab === 'context' && <ContextTab a={a} />}
              {tab === 'claims' && <Claims a={a} />}
              {tab === 'history' && (
                <div className="list">
                  {d.drift.length === 0 && <div className="empty">No drift recorded for this item.</div>}
                  {d.drift.map((e) => (
                    <div key={e.id} className="li">
                      <SeverityBadge severity={e.severity} />
                      <div className="col" style={{ gap: 2 }}>
                        <span>{e.summary}</span>
                        <span className="small muted">{new Date(e.at).toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>

        <div className="col" style={{ gap: 16 }}>
          <Card title={<span className="row">Readiness <span className="right"><HealthNumber value={a.health} status={a.healthStatus} /></span></span>}>
            <div className="dims">
              {a.dimensions.map((x) => (
                <Fragment key={x.dimension}>
                  <span className="small" title={x.notes.join('\n')}>
                    {x.status === 'ok' ? '✓' : x.status === 'warn' ? '⚠' : '✗'} {DIMENSION_LABELS[x.dimension]}
                  </span>
                  <Bar value={x.score} tone={x.status === 'ok' ? 'ok' : x.status === 'warn' ? 'warn' : 'bad'} />
                  <span className="num small">{x.score}%</span>
                </Fragment>
              ))}
            </div>
            <p className="small muted" style={{ marginBottom: 0 }}>
              Health is not a grade: a single critical finding makes the item NOT READY regardless of the average.
            </p>
          </Card>

          {a.checklist.length > 0 && (
            <Card title="Checklist">
              <div className="checklist">
                {a.checklist.map((g) => (
                  <div key={g.group}>
                    <h4>{g.group}</h4>
                    {g.items.map((i) => (
                      <div className="check-item" key={i.label}>
                        <span className={`mark ${i.status}`}>{i.status === 'ok' ? '✓' : i.status === 'warn' ? '⚠' : '✗'}</span>
                        <span>{i.label}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {a.tasks && (
            <Card title={`Story ↔ tasks coverage · ${a.tasks.percent}%`}>
              <div className="col" style={{ gap: 6 }}>
                {a.tasks.requirements.map((r) => (
                  <div className="check-item" key={r.criterion}>
                    <span className={`mark ${r.coveredBy.length ? 'ok' : 'fail'}`}>{r.coveredBy.length ? '✓' : '✗'}</span>
                    <span className="small">
                      {r.criterion} {r.coveredBy.length > 0 && <span className="muted">({r.coveredBy.join(', ')})</span>}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {a.traits.length > 0 && (
            <Card title="Detected traits">
              <div className="row wrap">
                {a.traits.map((t) => (
                  <span key={t} className="badge">
                    {t}
                  </span>
                ))}
              </div>
              <p className="small muted" style={{ marginBottom: 0 }}>
                Traits drive which states, journeys and questions are expected.
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Tabb({ id, tab, set, label }: { id: Tab; tab: Tab; set: (t: Tab) => void; label: string }) {
  return (
    <button className={`tab ${tab === id ? 'active' : ''}`} onClick={() => set(id)}>
      {label}
    </button>
  );
}

function EpicRollup({ a, children, navigate }: { a: ItemAnalysis; children: ItemDetail['children']; navigate: (p: string) => void }) {
  const r = a.rollup!;
  return (
    <Card title={`Epic analysis · ${r.stories} stories`}>
      <div className="grid g3" style={{ marginBottom: 12 }}>
        <div>
          <div className="small muted">Requirements coverage</div>
          <strong>{r.requirementsCoverage}%</strong>
          <Bar value={r.requirementsCoverage} />
        </div>
        <div>
          <div className="small muted">Design coverage</div>
          <strong>{r.designCoverage}%</strong>
          <Bar value={r.designCoverage} />
        </div>
        <div>
          <div className="small muted">Documentation coverage</div>
          <strong>{r.documentationCoverage}%</strong>
          <Bar value={r.documentationCoverage} />
        </div>
      </div>
      {r.highlights.map((h) => (
        <div key={h} className="small" style={{ color: 'var(--warn)' }}>
          ⚠ {h}
        </div>
      ))}
      <table className="table" style={{ marginTop: 12 }}>
        <tbody>
          {children.map((c) => (
            <tr key={c.key} className="clickable" onClick={() => navigate(`/item/${c.key}`)}>
              <td className="key">{c.key}</td>
              <td className="type">{c.type}</td>
              <td>{c.title}</td>
              <td>
                <StatusBadge status={c.readiness} />
              </td>
              <td style={{ textAlign: 'right' }}>
                <HealthNumber value={c.health} status={c.healthStatus} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function Challenges({ a, onChanged, decisions }: { a: ItemAnalysis; onChanged: () => void; decisions: ItemDetail['decisions'] }) {
  const open = a.challenges.filter((c) => !c.answered);
  const answered = a.challenges.filter((c) => c.answered);
  return (
    <>
      <p className="muted" style={{ margin: 0 }}>
        Adversarial review — <em>assume the specification is incomplete and try to break it.</em> Scenarios already answered by Jira, Confluence or a decision are listed below.
      </p>
      {open.length === 0 && <div className="empty">Every probed scenario is answered.</div>}
      {open.map((c) => (
        <div key={c.id} className="col" style={{ gap: 4 }}>
          {c.origin === 'ai' && <span className="badge accent" style={{ alignSelf: 'flex-start' }}>AI</span>}
          <QuestionBox question={c.question} findingId={c.id} itemKey={a.key} onDecided={onChanged} rationale={c.rationale} />
        </div>
      ))}
      {answered.length > 0 && <h3 style={{ marginTop: 8 }}>Answered</h3>}
      {answered.map((c) => (
        <div key={c.id} className="check-item">
          <span className="mark ok">✓</span>
          <div className="col" style={{ gap: 2 }}>
            <span>{c.question.text}</span>
            <span className="small muted">
              {c.decision ? `Decision: ${c.decision}` : c.answeredBy ? <>Answered by <Source source={c.answeredBy.source} /> {c.answeredBy.title}{c.answeredBy.excerpt && <> — “{c.answeredBy.excerpt}”</>}</> : 'Answered in the specification'}
              {decisions.find((x) => x.questionId === c.id) && ' · '}
            </span>
          </div>
        </div>
      ))}
    </>
  );
}

function States({ a }: { a: ItemAnalysis }) {
  const s = a.states!;
  return (
    <>
      <h3>State machine coverage</h3>
      <p className="small muted" style={{ margin: 0 }}>
        States required by the feature (from acceptance criteria and detected traits) compared with requirements and Figma.
      </p>
      <div className="states">
        {s.required.map(({ state, because }) => {
          const inD = s.inDesign.includes(state);
          const inR = s.inRequirements.includes(state) || state === 'idle';
          return (
            <div key={state} className={`state ${!inD && !inR ? 'missing' : !inD || !inR ? 'partial' : ''}`}>
              <div className="name">{STATE_LABELS[state]}</div>
              <div className="why">{because}</div>
              <div className="state-flags">
                <span style={{ color: inR ? 'var(--ok)' : 'var(--bad)' }}>{inR ? '✓' : '✗'} Requirements</span>
                <span style={{ color: inD ? 'var(--ok)' : 'var(--bad)' }}>{inD ? '✓' : '✗'} Figma</span>
              </div>
            </div>
          );
        })}
      </div>
      {a.journeys && (
        <>
          <h3 style={{ marginTop: 12 }}>User journey coverage · {a.journeys.percent}%</h3>
          <p className="small muted" style={{ margin: 0 }}>
            Not a quality grade — the share of expected paths that are defined somewhere in the specification.
          </p>
          <table className="table">
            <tbody>
              {a.journeys.journeys.map((j) => (
                <tr key={j.journey}>
                  <td style={{ width: 24 }}>
                    <span className={`mark ${j.covered ? 'ok' : 'fail'}`}>{j.covered ? '✓' : '✗'}</span>
                  </td>
                  <td>{JOURNEY_LABELS[j.journey]}</td>
                  <td className="row" style={{ gap: 10 }}>
                    {j.where.map((w) => (
                      <Source key={w} source={w} />
                    ))}
                    {j.where.length === 0 && <span className="small faint">not defined anywhere</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}

function ContextTab({ a }: { a: ItemAnalysis }) {
  const [graph, setGraph] = useState<GraphData>();
  useEffect(() => void api.graph(a.key).then(setGraph).catch(() => undefined), [a.key]);
  const group = (title: string, refs: ContextRef[]) => (
    <div>
      <h3 style={{ margin: '4px 0 6px' }}>{title}</h3>
      {refs.length === 0 && <div className="small faint">Nothing found.</div>}
      {refs.map((r) => (
        <div key={r.entityId} className="row small" style={{ padding: '4px 0', alignItems: 'flex-start' }}>
          <Source source={r.source} />
          <div className="col" style={{ gap: 0, flex: 1 }}>
            {r.url ? (
              <a href={r.url} target="_blank" rel="noreferrer">
                {r.title}
              </a>
            ) : (
              <span>{r.title}</span>
            )}
            <span className="faint">
              {r.relation.replace('_', ' ')} · {r.via} · {r.reason}
            </span>
          </div>
          <span className={`badge ${r.confidence >= 0.8 ? 'ok' : r.confidence >= 0.45 ? '' : 'warn'}`} title="Confidence">
            {Math.round(r.confidence * 100)}%
          </span>
        </div>
      ))}
    </div>
  );
  return (
    <>
      <p className="small muted" style={{ margin: 0 }}>
        Context discovery: explicit links from the source systems plus semantically discovered artifacts. Items below 45% confidence are shown but not used as evidence.
      </p>
      {graph && <GraphView data={graph} />}
      <div className="grid g3">
        {group('Jira', a.context.requirements)}
        {group('Confluence', a.context.documents)}
        {group('Figma', a.context.frames)}
      </div>
    </>
  );
}

function Claims({ a }: { a: ItemAnalysis }) {
  if (!a.claims.length) return <div className="empty">No normalized claims (timeouts, limits, idempotency, processing mode…) found in this item's context.</div>;
  return (
    <>
      <p className="small muted" style={{ margin: 0 }}>
        Claims are normalized statements extracted from every source. Different values for the same subject + attribute are reported as conflicts.
      </p>
      <table className="table">
        <thead>
          <tr>
            <th>Subject</th>
            <th>Attribute</th>
            <th>Value</th>
            <th>Source</th>
            <th>Statement</th>
          </tr>
        </thead>
        <tbody>
          {a.claims.map((c) => (
            <tr key={c.id}>
              <td>{c.subject}</td>
              <td>{c.attribute.replace('_', ' ')}</td>
              <td>
                <strong>
                  {String(c.value)}
                  {c.unit && ` ${c.unit}`}
                </strong>
              </td>
              <td>
                <Source source={c.evidence.source} /> <span className="small">{c.evidence.title}</span>
              </td>
              <td className="small muted">{c.text}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
