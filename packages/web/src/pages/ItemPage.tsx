import { Fragment, useCallback, useEffect, useState } from 'react';
import type { ContextRef, ItemAnalysis } from '@ci/core';
import { useApp } from '../App';
import { api, currentUser, type GraphData, type ItemDetail, errMsg } from '../api';
import { FindingCard, QuestionBox } from '../components/FindingCard';
import { GraphView } from '../components/GraphView';
import { Modal } from '../components/Modal';
import { Bar, Card, Chevron, DIMENSION_LABELS, DateTime, EmptyState, HealthNumber, JOURNEY_LABELS, ReadinessBadge, STATE_LABELS, SeverityBadge, Source, SourceLogo, Spinner, StatusBadge, StatusIcon, ago } from '../components/ui';
import { ChevronIcon, ListIcon, SearchIcon, SettingsIcon, SlidersIcon, SparkleIcon } from '../components/icons';
import { acTestRows, acTestsSummary } from '../lib/acTests';

type Tab = 'findings' | 'challenge' | 'states' | 'context' | 'claims' | 'history';

/** `focusFinding`: a finding to scroll to (`#/item/KEY/FINDING`, the link pdi keeps for a decision, A2b). */
export function ItemPage({ itemKey, focusFinding }: { itemKey: string; focusFinding?: string }) {
  const { navigate, toast, refresh, version, analysis } = useApp();
  const [d, setD] = useState<ItemDetail>();
  const [err, setErr] = useState<string>();
  const [tab, setTab] = useState<Tab>('findings');
  const [showClosed, setShowClosed] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [forceOpen, setForceOpen] = useState(false);
  const [forceReason, setForceReason] = useState('');
  const [forceBusy, setForceBusy] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiResult, setAiResult] = useState<{ added: number; total: number; errors: string[] } | { error: string }>();

  const load = useCallback(async () => {
    try {
      setD(await api.item(itemKey));
    } catch (e) {
      setErr(errMsg(e));
    }
  }, [itemKey]);
  useEffect(() => void load(), [load, version]);
  const focusClosed = !!focusFinding && !!d?.item.findings.some((f) => f.id === focusFinding && f.status !== 'open');
  useEffect(() => {
    if (!focusFinding || !d) return;
    if (focusClosed) setShowClosed(true);
    requestAnimationFrame(() => document.getElementById(`finding-${focusFinding}`)?.scrollIntoView({ block: 'center' }));
  }, [focusFinding, focusClosed, d]);

  const changed = useCallback(async () => {
    await load();
    await refresh();
  }, [load, refresh]);

  if (err) return <ItemNotFound itemKey={itemKey} message={err} navigate={navigate} />;
  if (!d) return <div className="empty"><Spinner /></div>;
  const a = d.item;
  const open = a.findings.filter((f) => f.status === 'open');
  const closed = a.findings.filter((f) => f.status !== 'open');
  const openChallenges = a.challenges.filter((c) => !c.answered);
  const decisionFor = (qid?: string) => d.decisions.find((x) => x.questionId === qid);

  const approvable = a.type === 'story' || a.type === 'bug';
  // Only drift blocks: the change needs a review, not a forced approval (P4).
  const reviewNeeded = a.readiness === 'not_ready' && a.findings.some((f) => f.blocks && f.origin === 'drift') && !a.findings.some((f) => f.blocks && f.origin !== 'drift');
  const approve = async (forced?: { reason: string }) => {
    try {
      await api.approve(a.key, currentUser(), forced);
      toast(`${a.key} approved — drift will be monitored from now on`);
      await changed();
      return true;
    } catch (e) {
      toast(errMsg(e));
      return false;
    }
  };
  const closeForce = () => {
    setForceOpen(false);
    setForceReason('');
  };
  const submitForce = async () => {
    const reason = forceReason.trim();
    if (!reason) return;
    setForceBusy(true);
    const ok = await approve({ reason });
    setForceBusy(false);
    if (ok) closeForce();
  };
  const aiEnabled = !!analysis?.ai.enabled;
  const aiModel = [analysis?.ai.provider, analysis?.ai.model].filter(Boolean).join(' · ');
  const openAi = () => {
    setAiResult(undefined);
    setAiOpen(true);
  };
  const closeAi = () => {
    if (aiBusy) return;
    setAiOpen(false);
  };
  const aiReview = async () => {
    setAiBusy(true);
    setAiResult(undefined);
    const before = new Set(a.findings.filter((f) => f.origin === 'ai').map((f) => f.id));
    try {
      const r = await api.aiReview(a.key);
      const aiNow = (r.item?.findings ?? []).filter((f) => f.origin === 'ai');
      setAiResult({ added: aiNow.filter((f) => !before.has(f.id)).length, total: aiNow.length, errors: r.errors });
      await changed();
    } catch (e) {
      setAiResult({ error: errMsg(e) });
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
        {a.featureKey && (
          <>
            <a href={`#/item/${a.featureKey}`}>{a.featureKey}</a> /
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
            <span className="badge-lg">
              <ReadinessBadge readiness={a.readiness} />
            </span>
            <StatusBadge status={a.healthStatus} />
            {d.approval && (
              <span className={`badge row ${d.approval.forced ? 'warn' : 'ok'}`} style={{ gap: 5 }} title={`Approved by ${d.approval.approvedBy}${d.approval.reason ? ` — reason: ${d.approval.reason}` : ''}`}>
                <StatusIcon status={d.approval.forced ? 'warn' : 'ok'} /> {d.approval.forced ? 'Force-approved' : 'Approved'} {ago(d.approval.approvedAt)} · drift monitored
              </span>
            )}
            {d.approval?.reason && <span className="muted">Reason: {d.approval.reason}</span>}
          </div>
        </div>
        <div className="row">
          <button className="btn row" style={{ gap: 6 }} onClick={openAi} disabled={aiBusy} title="Semantic review + adversarial questions by the configured AI provider">
            {aiBusy ? <Spinner /> : <SparkleIcon size={15} />} AI review
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
            <button className="btn danger" onClick={() => setForceOpen(true)} title="Approve despite blocking issues — a reason is required and recorded in the audit log">
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
              <div className="spec-body">
              {!d.source.description && d.source.acceptanceCriteria.length === 0 && d.source.businessRules.length === 0 && !d.decisions.some((x) => x.effect === 'resolve') && (
                <p className="muted">No description, acceptance criteria or business rules in Jira.</p>
              )}
              {d.source.description && <p style={{ whiteSpace: 'pre-wrap' }}>{d.source.description}</p>}
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
              </div>
            </Card>
          )}

          {a.rollup && <EpicRollup a={a} children={d.children} navigate={navigate} />}
          {a.releasePlan && <ReleasePlanPanel a={a} children={d.children} navigate={navigate} />}

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
                    <button className="btn ghost sm row" onClick={() => setShowClosed(!showClosed)}>
                      <Chevron open={showClosed} /> {closed.length} resolved / accepted finding{closed.length > 1 ? 's' : ''}
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
                        <span className="small muted"><DateTime iso={e.at} /></span>
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
                  <span className="small row" style={{ gap: 6 }} title={x.notes.join('\n')}>
                    <StatusIcon status={x.status === 'ok' ? 'ok' : x.status === 'warn' ? 'warn' : 'bad'} /> {DIMENSION_LABELS[x.dimension]}
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
                        <StatusIcon status={i.status === 'ok' ? 'ok' : i.status === 'warn' ? 'warn' : 'bad'} />
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
                    <StatusIcon status={r.coveredBy.length ? 'ok' : 'bad'} />
                    <span className="small">
                      {r.criterion} {r.coveredBy.length > 0 && <span className="muted">({r.coveredBy.join(', ')})</span>}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {a.acTests && (
            <Card title={`Acceptance criteria ↔ tests · ${acTestsSummary(a.acTests).passing}/${acTestsSummary(a.acTests).total} passing`}>
              <div className="col" style={{ gap: 6 }}>
                {acTestRows(a.acTests, d.source ?? { acceptanceCriteria: [] }).map((r) => (
                  <div className="check-item" key={r.ac}>
                    <StatusIcon status={r.icon} />
                    <span className="small">
                      <strong>{r.ac}</strong> {r.text}
                      {r.tests.length === 0 && <span className="muted"> — no test</span>}
                      {r.tests.map((t) => (
                        <span key={t.name} className="muted" style={{ display: 'block' }}>
                          {t.status === 'failed' ? '✗' : t.status === 'skipped' ? '–' : '✓'} {t.name}
                          {t.message && `: ${t.message}`}
                        </span>
                      ))}
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
      <Modal
        open={forceOpen}
        title={`Force approve ${a.key}?`}
        onClose={closeForce}
        footer={
          <>
            <button className="btn" onClick={closeForce} disabled={forceBusy}>
              Cancel
            </button>
            <button className="btn danger" onClick={submitForce} disabled={!forceReason.trim() || forceBusy}>
              {forceBusy ? <Spinner /> : null} Force approve
            </button>
          </>
        }
      >
        <p>
          <strong>{a.key}</strong> has {a.blockingIssues.length || 'open'} blocking issue{a.blockingIssues.length === 1 ? '' : 's'}. Approving freezes the current
          specification as the baseline for drift detection.
        </p>
        {a.blockingIssues.length > 0 && (
          <ul className="modal-issues">
            {a.blockingIssues.map((b) => (
              <li key={b}>
                <StatusIcon status="bad" /> {b}
              </li>
            ))}
          </ul>
        )}
        <label className="field">
          <span>
            Why approve it anyway? <span className="faint">(required, stored in the audit log)</span>
          </span>
          <textarea
            className="input"
            data-autofocus
            maxLength={1000}
            rows={3}
            placeholder="e.g. Release deadline agreed with the PO; retry behaviour will be specified in PAY-130."
            value={forceReason}
            onChange={(e) => setForceReason(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void submitForce();
            }}
          />
        </label>
      </Modal>

      <Modal
        open={aiOpen}
        title={`AI review of ${a.key}`}
        onClose={closeAi}
        footer={
          !aiEnabled ? (
            <>
              <button className="btn" onClick={closeAi}>
                Cancel
              </button>
              <button
                className="btn primary"
                onClick={() => {
                  setAiOpen(false);
                  navigate('/settings');
                }}
              >
                <SettingsIcon size={15} /> Open Settings
              </button>
            </>
          ) : aiResult && !('error' in aiResult) && !aiResult.errors.length ? (
            aiResult.added > 0 ? (
              <>
                <button className="btn" onClick={closeAi}>
                  Close
                </button>
                <button
                  className="btn primary"
                  onClick={() => {
                    setTab('findings');
                    setAiOpen(false);
                  }}
                >
                  Show findings
                </button>
              </>
            ) : (
              <button className="btn primary" onClick={closeAi}>
                Close
              </button>
            )
          ) : (
            <>
              <button className="btn" onClick={closeAi} disabled={aiBusy}>
                {aiResult ? 'Close' : 'Cancel'}
              </button>
              <button className="btn primary" onClick={aiReview} disabled={aiBusy} data-autofocus>
                {aiBusy ? <Spinner /> : <SparkleIcon size={15} />} {aiBusy ? 'Reviewing…' : aiResult ? 'Try again' : 'Run AI review'}
              </button>
            </>
          )
        }
      >
        {!aiEnabled ? (
          <>
            <p>
              No AI provider is configured, so only the deterministic rules ran on <strong>{a.key}</strong>.
            </p>
            <p className="muted small">Choose a provider (Amazon Bedrock, Anthropic, OpenAI, Azure OpenAI or a custom endpoint) in Settings → AI provider.</p>
          </>
        ) : aiResult && 'error' in aiResult ? (
          <div className="banner bad">{aiResult.error}</div>
        ) : aiResult ? (
          <>
            <p className="row" style={{ gap: 8 }}>
              <StatusIcon status={aiResult.errors.length ? 'warn' : 'ok'} />
              {aiResult.errors.length ? 'AI review finished with errors.' : 'AI review complete.'}
            </p>
            <p>
              {aiResult.added > 0 ? (
                <>
                  <strong>{aiResult.added}</strong> new AI finding{aiResult.added === 1 ? '' : 's'} added
                </>
              ) : (
                'No new AI findings'
              )}{' '}
              · {aiResult.total} AI finding{aiResult.total === 1 ? '' : 's'} on {a.key} in total. Each one cites its evidence and is marked <span className="badge accent">AI</span>.
            </p>
            {aiResult.errors.length > 0 && (
              <ul className="modal-issues">
                {aiResult.errors.map((e) => (
                  <li key={e}>
                    <StatusIcon status="bad" /> {e}
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <>
            <p>
              The semantic reviewer reads the Jira story together with its linked Confluence pages and Figma frames, and looks for gaps,
              conflicts and ambiguities that the rules cannot catch.
            </p>
            <ul className="modal-facts">
              <li>
                <span className="faint">Provider</span> {aiModel || 'configured in Settings'}
              </li>
              <li>
                <span className="faint">Scope</span> {a.key} only — the rest of the backlog is not re-reviewed
              </li>
              <li>
                <span className="faint">Data</span> product definition only; source code is never read or sent
              </li>
            </ul>
            <p className="muted small">New findings are added to the Findings tab and marked AI. Findings that would block can require human confirmation, depending on the policy.</p>
          </>
        )}
      </Modal>
    </div>
  );
}

function ItemNotFound({ itemKey, message, navigate }: { itemKey: string; message: string; navigate: (p: string) => void }) {
  const { analysis } = useApp();
  return (
    <div className="page">
      <div className="page-head">
        <div className="col" style={{ gap: 10 }}>
          <a href="#/backlog" className="back-link">
            <ChevronIcon size={14} style={{ transform: 'rotate(180deg)' }} />
            Backlog
          </a>
          <div className="row" style={{ gap: 12 }}>
            <h1>{itemKey}</h1>
            <span className="badge badge-outline">
              <span className="sdot sdot-info" aria-hidden="true" /> Not found
            </span>
          </div>
        </div>
      </div>
      <section className="card" style={{ padding: 12 }}>
        <div className="empty-state empty-state-lg">
          <span className="empty-state-icon">
            <SearchIcon size={22} />
          </span>
          <strong>No work item {itemKey}</strong>
          <p>
            {itemKey} is not part of the latest analysis
            {analysis && (
              <>
                {' '}of <strong>{analysis.project.name}</strong>
              </>
            )}
            . It may have been deleted or moved in Jira, or it does not match the project key and JQL filter in Settings.
            <span className="sr-only"> ({message})</span>
          </p>
          {analysis && (
            <div className="empty-state-chips">
              <span className="chip">
                <span className="faint">Last analysis</span> {ago(analysis.analyzedAt)}
              </span>
              <span className="chip">
                <span className="faint">Items analyzed</span> {analysis.items.length}
              </span>
            </div>
          )}
          <div className="row" style={{ marginTop: 6 }}>
            <button className="btn primary" onClick={() => navigate('/backlog')}>
              <ListIcon size={15} /> Go to backlog
            </button>
            <button className="btn" onClick={() => navigate('/settings')}>
              <SlidersIcon size={15} /> Check Jira filter
            </button>
          </div>
        </div>
      </section>
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
        <div key={h} className="small row" style={{ gap: 6, color: 'var(--warn)' }}>
          <StatusIcon status="warn" /> {h}
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

/** G1.2: the epic's release lines R1…Rn (R1 = MVP) from its stories, with the open REL findings. */
function ReleasePlanPanel({ a, children, navigate }: { a: ItemAnalysis; children: ItemDetail['children']; navigate: (p: string) => void }) {
  const p = a.releasePlan!;
  const titleOf = new Map(children.map((c) => [c.key, c.title]));
  const warnings = a.findings.filter((f) => f.status === 'open' && f.dimension === 'delivery');
  const mvp = p.lines.find((l) => l.id === 'R1');
  const rows = [...p.lines.map((l) => ({ id: l.id, label: l.id === 'R1' ? 'R1 · MVP' : l.id, stories: l.stories })), ...(p.unassigned.length ? [{ id: '-', label: 'No release line', stories: p.unassigned }] : [])];
  return (
    <Card title="Release plan">
      <p className="small muted" style={{ marginTop: 0 }}>
        {p.stories === 0 ? 'No stories yet.' : mvp ? `MVP (R1) holds ${mvp.stories.length} of ${p.stories} stories (${p.mvpPercent}%).` : `No MVP yet: none of the ${p.stories} stories is in release line R1.`} Lines come from the stories&apos; release:R1… labels.
      </p>
      {warnings.map((f) => (
        <div key={f.id} className="small row" style={{ gap: 6, color: f.severity === 'critical' ? 'var(--bad)' : 'var(--warn)' }}>
          <StatusIcon status={f.severity === 'critical' ? 'bad' : 'warn'} /> {f.title}
        </div>
      ))}
      {rows.length > 0 && (
        <table className="table" style={{ marginTop: 12 }} aria-label="Release lines">
          <tbody>
            {rows.map((l) => (
              <tr key={l.id}>
                <th scope="row" className="mono small" style={{ width: 120, textAlign: 'left' }}>{l.label}</th>
                <td>
                  {l.stories.map((k) => (
                    <button key={k} className="btn sm" style={{ margin: '2px 6px 2px 0' }} title={titleOf.get(k)} onClick={() => navigate(`/item/${k}`)}>
                      {k}
                    </button>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
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
          <StatusIcon status="ok" />
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
                <span className="row" style={{ gap: 5, color: inR ? 'var(--ok)' : 'var(--bad)' }}><StatusIcon status={inR ? 'ok' : 'bad'} /> Requirements</span>
                <span className="row" style={{ gap: 5, color: inD ? 'var(--ok)' : 'var(--bad)' }}><StatusIcon status={inD ? 'ok' : 'bad'} /> Figma</span>
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
                    <StatusIcon status={j.covered ? 'ok' : 'bad'} />
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
  // The section header carries the source logo + name; rows only repeat it when they come from another source.
  const group = (source: string, title: string, refs: ContextRef[]) => (
    <div>
      <h3 className="row context-group-head">
        <SourceLogo source={source} size={17} /> {title}
      </h3>
      {refs.length === 0 && <div className="small faint">Nothing found.</div>}
      {refs.map((r) => (
        <div key={r.entityId} className="row small" style={{ padding: '4px 0', alignItems: 'flex-start' }}>
          {r.source !== source && <Source source={r.source} />}
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
      <div className="grid">
        {group('jira', 'Jira', a.context.requirements)}
        {group('confluence', 'Confluence', a.context.documents.filter((d) => d.source !== 'code'))}
        {a.context.documents.some((d) => d.source === 'code') && group('code', 'Code (tf)', a.context.documents.filter((d) => d.source === 'code'))}
        {group('figma', 'Figma', a.context.frames)}
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
