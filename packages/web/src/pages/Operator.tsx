import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../App';
import { api, errMsg, type BetaEnrollment } from '../api';
import { Card, DateTime } from '../components/ui';
import { STATUS_LABEL, workspaceIdFrom } from '../lib/beta';

/**
 * The operator's panel at `#/operator` (docs/BETA-ENROLLMENT-PLAN.md): beta applications to approve or reject, and
 * the teams in the beta. Approving opens the team's organization and shows the Owner's invitation link once.
 */
export function Operator() {
  const { toast } = useApp();
  const [list, setList] = useState<BetaEnrollment[]>();
  const [ids, setIds] = useState<Record<string, string>>({});
  const [link, setLink] = useState<{ org: string; link: string }>();

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
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link!.link);
      toast('Invitation link copied');
    } catch {
      toast('Copy failed — select the link and copy it by hand');
    }
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
                      </>
                    ) : e.status === 'invited' ? (
                      'waits for the Owner to join'
                    ) : (
                      e.history.at(-1)?.note
                    )}
                  </td>
                  <td>
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
    </div>
  );
}
