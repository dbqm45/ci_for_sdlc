import { useCallback, useEffect, useState } from 'react';
import { api, errMsg, type Invitation, type Member } from '../api';
import { assignableRoles, canManage, roleLabel, type Role, type User } from '../lib/account';
import { ago, Card } from './ui';

/** Settings → Members (accounts mode, Admin and Owner): people, their roles, and one-time invitation links. */
export function Members({ me, toast }: { me: User; toast: (m: string) => void }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [role, setRole] = useState<Role>('member');
  const [email, setEmail] = useState('');
  const [link, setLink] = useState('');
  const roles = assignableRoles(me.role);

  const load = useCallback(async () => {
    try {
      const [m, i] = await Promise.all([api.members(), api.invitations()]);
      setMembers(m);
      setInvitations(i);
    } catch (e) {
      toast(errMsg(e));
    }
  }, [toast]);
  useEffect(() => void load(), [load]);

  const act = async (run: () => Promise<unknown>, done: string) => {
    try {
      await run();
      toast(done);
    } catch (e) {
      toast(errMsg(e));
    }
    await load();
  };

  const invite = async () => {
    try {
      const r = await api.invite(role, email);
      setLink(r.link);
      setEmail('');
      await load();
    } catch (e) {
      toast(errMsg(e));
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast('Invitation link copied');
    } catch {
      toast('Copy failed — select the link and copy it by hand');
    }
  };

  return (
    <Card title="Members">
      <table className="table">
        <thead>
          <tr>
            <th>Person</th>
            <th>Role</th>
            <th>Last login</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {members.map((m) => {
            const manage = m.id !== me.id && canManage(me.role, m.role);
            return (
              <tr key={m.id}>
                <td>
                  <strong>{m.name}</strong>
                  {m.email && <div className="small muted">{m.email}</div>}
                </td>
                <td>
                  {manage ? (
                    <select
                      className="input"
                      aria-label={`Role of ${m.name}`}
                      value={m.role}
                      onChange={(e) => void act(() => api.setRole(m.id, e.target.value as Role), `${m.name} is now ${roleLabel(e.target.value as Role)}`)}
                    >
                      {roles.map((r) => (
                        <option key={r} value={r}>
                          {roleLabel(r)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    roleLabel(m.role)
                  )}
                </td>
                <td className="small muted">{ago(m.lastLoginAt)}</td>
                <td>
                  {manage && (
                    <button
                      className="btn sm danger"
                      onClick={() => window.confirm(`Remove ${m.name}? They lose access at once and need a new invitation to come back.`) && void act(() => api.removeMember(m.id), `${m.name} removed`)}
                    >
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h3>Invite a person</h3>
      <p className="small muted">The link works once, for 7 days. With an e-mail, only the Atlassian account with that e-mail can use it.</p>
      <div className="row wrap" style={{ gap: 8, alignItems: 'flex-end' }}>
        <label className="col" style={{ gap: 4 }}>
          <span className="small muted">Role</span>
          <select className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {roles
              .filter((r) => r !== 'owner')
              .map((r) => (
                <option key={r} value={r}>
                  {roleLabel(r)}
                </option>
              ))}
          </select>
        </label>
        <label className="col" style={{ gap: 4 }}>
          <span className="small muted">E-mail (optional)</span>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <button className="btn primary" onClick={() => void invite()}>
          Create invitation link
        </button>
      </div>
      {link && (
        <div className="row wrap" style={{ gap: 8, marginTop: 12, alignItems: 'center' }}>
          <input className="input grow" readOnly value={link} aria-label="Invitation link" onFocus={(e) => e.target.select()} />
          <button className="btn" onClick={() => void copy()}>
            Copy
          </button>
          <span className="small muted">Shown only now — send it to the person.</span>
        </div>
      )}

      {invitations.length > 0 && (
        <>
          <h3>Open invitations</h3>
          <table className="table">
            <tbody>
              {invitations.map((i) => (
                <tr key={i.id}>
                  <td>{roleLabel(i.role)}</td>
                  <td>{i.email || <span className="muted">any e-mail</span>}</td>
                  <td className="small muted">
                    by {i.invitedBy}, expires {new Date(i.expiresAt).toLocaleDateString()}
                  </td>
                  <td>
                    <button className="btn sm" onClick={() => void act(() => api.revokeInvitation(i.id), 'Invitation revoked')}>
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Card>
  );
}
