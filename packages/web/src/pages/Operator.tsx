import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../App';
import { api, ApiError, errMsg, type AiBudgetRow, type BetaEnrollment, type DeletedWorkspace } from '../api';
import { Card, DateTime } from '../components/ui';
import { betaNow } from '../lib/localBeta';
import { STATUS_LABEL, surveysSummary, usageLines, workspaceIdFrom, type UsageReport } from '../lib/beta';

/**
 * The operator's panel at `#/operator` (docs/BETA-ENROLLMENT-PLAN.md): beta applications to approve or reject, and
 * the teams in the beta. Approving opens the team's organization and shows the Owner's invitation link once.
 */
export function Operator() {
  const { toast, me } = useApp();
  const [list, setList] = useState<BetaEnrollment[]>();
  const [ids, setIds] = useState<Record<string, string>>({});
  const [link, setLink] = useState<{ org: string; link: string }>();
  const [usage, setUsage] = useState<{ org: string; measurement: boolean; report: UsageReport | null }>();
  const showUsage = async (e: BetaEnrollment) => {
    try {
      setUsage({ org: e.application.org, ...(await api.betaUsage(e.id)) });
    } catch (err) {
      toast(errMsg(err));
    }
  };

  const load = useCallback(async () => {
    try {
      setList(await api.betaEnrollments());
    } catch (e) {
      toast(errMsg(e));
    }
  }, [toast]);
  useEffect(() => void load(), [load]);

  const showLink = (org: string, l: string) => setLink({ org, link: l });
  const approve = async (e: BetaEnrollment) => {
    try {
      const r = await api.approveBeta(e.id, { id: ids[e.id] ?? workspaceIdFrom(e.application.team) });
      showLink(e.application.org, r.invitation.link);
      toast(`${e.application.org} approved`);
    } catch (err) {
      toast(errMsg(err));
    }
    await load();
  };
  const reject = async (e: BetaEnrollment) => {
    const note = window.prompt(`Reject the application from ${e.application.org}? Note for yourself (optional):`);
    if (note === null) return;
    try {
      await api.rejectBeta(e.id, note);
      toast(`${e.application.org} rejected`);
    } catch (err) {
      toast(errMsg(err));
    }
    await load();
  };
  const reinvite = async (e: BetaEnrollment) => {
    try {
      const r = await api.reinviteBeta(e.id);
      showLink(e.application.org, r.invitation.link);
    } catch (err) {
      toast(errMsg(err));
    }
    await load();
  };
  /** Asks for a number of days and a reason, then runs the operator's change. */
  const withDays = async (e: BetaEnrollment, what: string, max: number, run: (days: number, reason: string) => Promise<unknown>, done: string) => {
    const days = Number(window.prompt(`${what} for ${e.application.org}: how many days (1–${max})?`, '7'));
    if (!Number.isInteger(days) || days < 1 || days > max) return;
    const reason = window.prompt('Reason (optional, kept in the history):') ?? '';
    try {
      await run(days, reason);
      toast(done);
    } catch (err) {
      toast(errMsg(err));
    }
    await load();
  };
  /** Every answer of one team as a JSON file, for reading them next to the measured usage. */
  const download = async (e: BetaEnrollment) => {
    try {
      const answers = await api.betaAnswers(e.id);
      const url = URL.createObjectURL(new Blob([JSON.stringify(answers, null, 2)], { type: 'application/json' }));
      const a = Object.assign(document.createElement('a'), { href: url, download: `beta-answers-${e.workspace ?? e.id}.json` });
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast(errMsg(err));
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link!.link);
      toast('Invitation link copied');
    } catch {
      toast('Copy failed — select the link and copy it by hand');
    }
  };

  /** On the team's request (T7): everything of its organization goes for good; the name is typed back. */
  const eraseOrg = async (e: BetaEnrollment) => {
    const org = e.application.org;
    const typed = window.prompt(
      `Erase ALL data of ${org} for good? Its workspaces, Atlassian connection, people, invitations, usage events, AI spend, application and survey answers are deleted now and cannot be restored (backups expire within 100 days).\nType the organization's name (${org}) to confirm:`,
    );
    if (typed === null) return;
    try {
      const r = await api.eraseOrg(e.orgId!, typed.trim());
      toast(`${r.erased} erased: ${r.workspaces} workspaces, ${r.people} people`);
    } catch (err) {
      toast(errMsg(err));
    }
    await load();
  };

  const waiting = list?.filter((e) => e.status === 'applied') ?? [];
  const decided = list?.filter((e) => e.status !== 'applied') ?? [];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Beta operator</h1>
          <p>Applications for the closed beta and the teams taking part. Approving opens the team's organization and workspace.</p>
        </div>
        <a className="btn" href="#/operator/surveys">
          Preview surveys
        </a>
      </div>
      {link && (
        <Card title={`Owner invitation for ${link.org}`}>
          <div className="row wrap" style={{ gap: 8, alignItems: 'center' }}>
            <input className="input grow" readOnly value={link.link} aria-label="Invitation link" onFocus={(e) => e.target.select()} />
            <button className="btn" onClick={() => void copy()}>
              Copy
            </button>
          </div>
          <p className="small muted">Shown only now. It works once, for 7 days, and only for the contact's Atlassian e-mail. Send it to them.</p>
        </Card>
      )}
      {usage && (
        <Card title={`Usage of ${usage.org}`} actions={<button className="btn sm ghost" onClick={() => setUsage(undefined)}>Close</button>}>
          {!usage.measurement && <p className="small muted">The team switched measurement off; nothing new is recorded.</p>}
          {usage.report ? (
            <div className="row wrap" style={{ gap: 24, alignItems: 'flex-start' }}>
              <table className="table" style={{ width: 'auto' }}>
                <tbody>
                  {usageLines(usage.report).map(([k, v]) => (
                    <tr key={k}>
                      <td>{k}</td>
                      <td>
                        <strong>{v}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <table className="table" style={{ width: 'auto' }}>
                <thead>
                  <tr>
                    <th>Week</th>
                    <th>Analyses</th>
                    <th>Decisions</th>
                    <th>Active</th>
                    <th>AI cost</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.report.weeks.map((w) => (
                    <tr key={w.week}>
                      <td>W{w.week}</td>
                      <td>{w.analyses}</td>
                      <td>{w.decisions}</td>
                      <td>{w.active ? 'yes' : '—'}</td>
                      <td>${w.aiCostUsd.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted">The team has not started yet.</p>
          )}
        </Card>
      )}
      <Card title={`Waiting for a decision (${waiting.length})`} pad={false}>
        {!list ? (
          <p className="muted card-pad">Loading…</p>
        ) : !waiting.length ? (
          <p className="muted card-pad">No applications are waiting.</p>
        ) : (
          <table className="table">
            <tbody>
              {waiting.map((e) => (
                <tr key={e.id}>
                  <td>
                    <strong>{e.application.org}</strong> · {e.application.team}
                    <div className="small muted">
                      {e.application.contactName} ({e.application.contactEmail}){e.application.contactRole && `, ${e.application.contactRole}`}
                    </div>
                    <div className="small muted">
                      {e.application.writers} writing, {e.application.builders} building · {e.application.sources.join(', ')} · real data: {e.application.realData.replace('_', ' ')}
                    </div>
                  </td>
                  <td className="small muted">
                    <DateTime iso={e.appliedAt} />
                  </td>
                  <td>
                    <label className="col" style={{ gap: 4 }}>
                      <span className="small muted">Workspace id</span>
                      <input className="input" value={ids[e.id] ?? workspaceIdFrom(e.application.team)} onChange={(x) => setIds((m) => ({ ...m, [e.id]: x.target.value }))} />
                    </label>
                  </td>
                  <td>
                    <div className="row" style={{ gap: 6 }}>
                      <button className="btn sm primary" onClick={() => void approve(e)}>
                        Approve
                      </button>
                      <button className="btn sm" onClick={() => void reject(e)}>
                        Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <Card title="Decided" pad={false}>
        {!decided.length ? (
          <p className="muted card-pad">Nothing yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Team</th>
                <th>Status</th>
                <th>Beta</th>
                <th>Surveys</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {decided.map((e) => (
                <tr key={e.id}>
                  <td>
                    <strong>{e.application.org}</strong> · {e.application.team}
                    {e.workspace && <div className="small muted">workspace {e.workspace}</div>}
                  </td>
                  <td>{STATUS_LABEL[e.status]}</td>
                  <td className="small muted">
                    {e.endsAt ? (
                      <>
                        ends {new Date(e.endsAt).toLocaleDateString()} ({e.daysLeft} days left)
                        {e.pauseOn && <div>pauses {new Date(e.pauseOn).toLocaleDateString()}</div>}
                        {e.pausedReason && <div>{e.pausedReason}</div>}
                      </>
                    ) : e.status === 'invited' ? (
                      'waits for the Owner to join'
                    ) : (
                      e.history.at(-1)?.note
                    )}
                  </td>
                  <td className="small">{surveysSummary(e, betaNow(me?.local))}</td>
                  <td>
                    {e.startedAt && (
                      <div className="row wrap" style={{ gap: 6 }}>
                        <button className="btn sm" onClick={() => void showUsage(e)}>
                          Usage
                        </button>
                        <button className="btn sm" onClick={() => void download(e)}>
                          Answers (JSON)
                        </button>
                        {e.orgId && (
                          <button className="btn sm ghost" onClick={() => void eraseOrg(e)}>
                            Erase all data…
                          </button>
                        )}
                        {e.status !== 'ended' && (
                          <button className="btn sm" onClick={() => void withDays(e, 'No pause', 30, (d, r) => api.graceBeta(e.id, d, r), 'Pause held off')}>
                            No pause for…
                          </button>
                        )}
                        <button className="btn sm" onClick={() => void withDays(e, 'Extend the beta', 60, (d, r) => api.extendBeta(e.id, d, r), 'Beta extended')}>
                          Extend…
                        </button>
                      </div>
                    )}
                    {e.status === 'invited' && (
                      <button className="btn sm" onClick={() => void reinvite(e)}>
                        New invitation link
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <DeletedWorkspaces />
      <AiLimits />
    </div>
  );
}

/**
 * The platform's AI and each workspace's monthly limit (T4, docs/AI-PLATFORM.md). Hidden when workspaces choose their
 * own AI (the server answers 404). A change applies to the next call to the model.
 */
function AiLimits() {
  const { toast } = useApp();
  const [data, setData] = useState<{ provider: string; model: string; defaultLimitUsd?: number; workspaces: AiBudgetRow[] } | null>();
  const [edit, setEdit] = useState<Record<string, string>>({});
  const load = useCallback(async () => {
    try {
      setData(await api.aiBudget());
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setData(null);
      else toast(errMsg(e));
    }
  }, [toast]);
  useEffect(() => void load(), [load]);
  if (!data) return null;

  const save = async (row: AiBudgetRow, value: number | null | 'default') => {
    try {
      await api.setAiLimit(row.workspace, value);
      toast(`AI limit of ${row.name} changed`);
      setEdit((x) => ({ ...x, [row.workspace]: '' }));
    } catch (e) {
      toast(errMsg(e));
    }
    await load();
  };
  const fromInput = (row: AiBudgetRow) => {
    const raw = (edit[row.workspace] ?? '').trim();
    const n = Number(raw);
    if (!raw || !Number.isFinite(n) || n < 0) return toast('Enter a limit in US dollars, 0 or more.');
    return void save(row, n);
  };
  const usd = (n: number) => `$${n.toFixed(2)}`;

  return (
    <Card title="AI limits" pad={false}>
      <p className="small muted card-pad" style={{ margin: 0 }}>
        Every workspace uses <strong>{data.provider}</strong> · <code>{data.model}</code>, paid by the platform.{' '}
        {data.defaultLimitUsd === undefined ? 'No default limit.' : `Default limit: ${usd(data.defaultLimitUsd)} per workspace per month (UTC).`} Past its limit a
        workspace's analyses run without AI until next month.
      </p>
      <table className="table">
        <thead>
          <tr>
            <th>Workspace</th>
            <th>This month</th>
            <th>Limit</th>
            <th>Change</th>
          </tr>
        </thead>
        <tbody>
          {data.workspaces.map((row) => (
            <tr key={row.workspace}>
              <td>
                <strong>{row.name}</strong>
                <div className="small muted">
                  {row.orgName ?? row.workspace}
                  {row.removed && ' · removed'}
                </div>
              </td>
              <td>
                {usd(row.spentUsd)} · {row.calls} calls
                {row.unpricedCalls > 0 && <div className="small">{row.unpricedCalls} without a known price (not counted; set CI_AI_PRICES)</div>}
                {row.exhausted && <div className="small"><span className="badge">limit reached</span></div>}
              </td>
              <td>
                {row.limitUsd === undefined ? 'none' : usd(row.limitUsd)}
                <div className="small muted">{row.custom ? 'own' : 'default'}</div>
              </td>
              <td>
                {!row.removed && (
                  <div className="row wrap" style={{ gap: 6 }}>
                    <input
                      className="input"
                      style={{ width: 90 }}
                      inputMode="decimal"
                      placeholder="USD"
                      aria-label={`New monthly AI limit for ${row.name}`}
                      value={edit[row.workspace] ?? ''}
                      onChange={(e) => setEdit((x) => ({ ...x, [row.workspace]: e.target.value }))}
                    />
                    <button className="btn sm" onClick={() => fromInput(row)}>
                      Set
                    </button>
                    {row.custom && (
                      <button className="btn sm ghost" onClick={() => void save(row, 'default')}>
                        Default
                      </button>
                    )}
                    <button className="btn sm ghost" onClick={() => void save(row, null)}>
                      No limit
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

/** Deleted workspaces kept for 30 days (T7): restore one deleted by mistake, or erase it now on request. */
function DeletedWorkspaces() {
  const { toast } = useApp();
  const [list, setList] = useState<DeletedWorkspace[]>();
  const load = useCallback(async () => {
    try {
      setList(await api.deletedWorkspaces());
    } catch (e) {
      toast(errMsg(e));
    }
  }, [toast]);
  useEffect(() => void load(), [load]);
  if (!list?.length) return null;
  const act = async (d: DeletedWorkspace, what: 'restore' | 'erase') => {
    if (what === 'erase' && !window.confirm(`Erase workspace ${d.name} for good now? This cannot be undone.`)) return;
    try {
      if (what === 'restore') await api.restoreWorkspace(d.archivedAs);
      else await api.eraseWorkspace(d.archivedAs);
      toast(what === 'restore' ? `${d.name} restored; its Atlassian connection has to be made again` : `${d.name} erased`);
    } catch (e) {
      toast(errMsg(e));
    }
    await load();
  };
  return (
    <Card title={`Deleted workspaces (${list.length})`} pad={false}>
      <p className="small muted card-pad" style={{ margin: 0 }}>
        Kept for 30 days after deletion, then erased for good by the hourly job.
      </p>
      <table className="table">
        <tbody>
          {list.map((d) => (
            <tr key={d.archivedAs}>
              <td>
                <strong>{d.name}</strong>
                <div className="small muted">{d.id}</div>
              </td>
              <td className="small">
                Deleted <DateTime iso={d.deletedAt} />, erased <DateTime iso={d.eraseAfter} />
              </td>
              <td>
                <div className="row wrap" style={{ gap: 6 }}>
                  <button className="btn sm" onClick={() => void act(d, 'restore')}>
                    Restore
                  </button>
                  <button className="btn sm ghost" onClick={() => void act(d, 'erase')}>
                    Erase now
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
