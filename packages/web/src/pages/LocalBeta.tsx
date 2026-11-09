import { useEffect, useState } from 'react';
import { inviteFromHash, localInfo, localLogin, localMails, moveClock, type LocalMail, type LocalPerson } from '../lib/localBeta';

/**
 * The local beta walkthrough (docs/BETA-LOCAL.md), only when the server runs with CI_BETA_LOCAL=1 on loopback:
 * `#/dev/login` logs in as any person (an invitation from a mail rides along), `#/dev/mail` shows the mails the
 * server would have sent, and the bar at the bottom moves the clock forward.
 */
export function LocalLogin() {
  const invite = inviteFromHash(location.hash);
  const [people, setPeople] = useState<readonly LocalPerson[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  useEffect(() => void localInfo().then((i) => setPeople(i.people)).catch((e) => setError(String(e))), []);

  const go = async (who: { name: string; email: string }) => {
    setError('');
    try {
      await localLogin({ ...who, ...(invite && { invite }) });
      location.href = '/';
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="login-screen">
      <div className="card card-pad beta-card">
        <h1>Local walkthrough: log in as…</h1>
        <p className="small muted">
          Local mode (CI_BETA_LOCAL=1): no Atlassian, mails stay in the <a href="#/dev/mail">mailbox</a>. The same rules as a real login apply: a new person needs an
          invitation{invite ? ' — this one came with the link you opened.' : '.'}
        </p>
        {people.map((p) => (
          <button key={p.email} className="btn" style={{ justifyContent: 'flex-start', textAlign: 'left' }} onClick={() => void go({ name: p.name, email: p.email })}>
            <span>
              <strong>{p.name}</strong> <span className="small muted">{p.email}</span>
              <br />
              <span className="small muted">{p.note}</span>
            </span>
          </button>
        ))}
        <form
          className="row wrap"
          style={{ gap: 8, alignItems: 'flex-end' }}
          onSubmit={(e) => {
            e.preventDefault();
            void go({ name, email });
          }}
        >
          <label className="col" style={{ gap: 4 }}>
            <span className="small">Name</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="col" style={{ gap: 4 }}>
            <span className="small">E-mail</span>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <button className="btn primary" type="submit" disabled={!name.trim() || !email.trim()}>
            Log in
          </button>
        </form>
        {error && (
          <div className="login-error" role="alert">
            {error}
          </div>
        )}
        <a className="small" href="#/beta">
          Apply for the beta (public form)
        </a>
      </div>
    </div>
  );
}

export function LocalMailbox() {
  const [mails, setMails] = useState<LocalMail[]>();
  const [open, setOpen] = useState<number>();
  useEffect(() => {
    const load = () => void localMails().then(setMails).catch(() => setMails([]));
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="login-screen" style={{ placeItems: 'start center' }}>
      <div className="card card-pad beta-card" style={{ width: 'min(760px, 100%)' }}>
        <h1>Mailbox (local)</h1>
        <p className="small muted">
          What the server would have sent through Resend, newest first. Links in the mails work here. <a href="/">Back to the app</a>
        </p>
        {!mails ? (
          <p className="muted">Loading…</p>
        ) : !mails.length ? (
          <p className="muted">No mails yet. Apply on the public form or move the clock.</p>
        ) : (
          <ul className="col" style={{ gap: 6, listStyle: 'none', padding: 0, margin: 0 }}>
            {mails.map((m) => (
              <li key={m.id} className="card card-pad">
                <button className="btn ghost" style={{ width: '100%', justifyContent: 'space-between' }} aria-expanded={open === m.id} onClick={() => setOpen(open === m.id ? undefined : m.id)}>
                  <span>
                    <strong>{m.subject}</strong> <span className="small muted">to {m.to.join(', ')}</span>
                  </span>
                  <span className="small muted">{new Date(m.at).toLocaleString()}</span>
                </button>
                {open === m.id && <MailBody text={m.text} />}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Plain text with its links clickable (only links to this app, as the mails carry). */
function MailBody({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return (
    <pre className="small" style={{ whiteSpace: 'pre-wrap', margin: '8px 0 0', fontFamily: 'inherit' }}>
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) && new URL(p).origin === location.origin ? (
          <a key={i} href={p}>
            {p}
          </a>
        ) : (
          p
        ),
      )}
    </pre>
  );
}

/** The bar at the bottom of every page in the local mode: the clock, moving it, the mailbox and switching person. */
export function LocalBar({ offsetDays, now, onMoved }: { offsetDays: number; now: string; onMoved: () => void }) {
  const [busy, setBusy] = useState(false);
  const move = async (days: number) => {
    setBusy(true);
    try {
      await moveClock(days);
      onMoved();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="local-bar" role="region" aria-label="Local walkthrough">
      <strong>Local beta</strong>
      <span>
        {new Date(now).toLocaleString()} {offsetDays > 0 && <span className="muted">(+{offsetDays} days)</span>}
      </span>
      {[
        ['+1 day', 1],
        ['+3 days', 3],
        ['+7 days', 7],
      ].map(([label, days]) => (
        <button key={label} className="btn sm" disabled={busy} onClick={() => void move(days as number)}>
          {label}
        </button>
      ))}
      <a className="btn sm" href="#/dev/mail">
        Mailbox
      </a>
      <a className="btn sm" href="#/dev/login">
        Switch person
      </a>
    </div>
  );
}
