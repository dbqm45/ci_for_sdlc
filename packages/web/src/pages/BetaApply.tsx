import { useEffect, useState } from 'react';
import { api, errMsg } from '../api';
import { EMPTY_FORM, SOURCES, applicationBody, formProblems, type ApplicationForm, type SourceId } from '../lib/beta';

/**
 * The public beta application form at `#/beta` (docs/BETA-ENROLLMENT-PLAN.md, docs/BETA-SURVEYS.md A). Shown without
 * logging in; an operator decides each application and sends the Owner invitation.
 */
export function BetaApply() {
  const [info, setInfo] = useState<{ open: boolean; weeks: number } | null>();
  const [f, setF] = useState<ApplicationForm>(EMPTY_FORM);
  const [tried, setTried] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => void api.betaInfo().then(setInfo).catch(() => setInfo(null)), []);

  const set = <K extends keyof ApplicationForm>(k: K, v: ApplicationForm[K]) => setF((x) => ({ ...x, [k]: v }));
  const toggle = (id: SourceId) => set('sources', f.sources.includes(id) ? f.sources.filter((s) => s !== id) : [...f.sources, id]);
  const problems = formProblems(f);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (problems.length) return;
    setSending(true);
    setError('');
    try {
      await api.applyForBeta(applicationBody(f));
      setSent(true);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setSending(false);
    }
  };

  const text = (k: 'org' | 'team' | 'contactName' | 'contactEmail' | 'contactRole' | 'writers' | 'builders', label: string, type = 'text') => (
    <label className="col" style={{ gap: 4 }}>
      <span className="small">{label}</span>
      <input className="input" type={type} inputMode={type === 'number' ? 'numeric' : undefined} min={type === 'number' ? 0 : undefined} value={f[k]} onChange={(e) => set(k, e.target.value)} />
    </label>
  );

  let body;
  if (info === undefined) body = <p className="muted">Loading…</p>;
  else if (info === null) body = <p>The beta is not offered on this server.</p>;
  else if (!info.open) body = <p>Applications for the beta are closed. Thank you for your interest.</p>;
  else if (sent)
    body = (
      <div role="status">
        <h2>Thank you</h2>
        <p>We read every application and answer by e-mail. If your team is chosen, the Owner gets a one-time invitation link to log in with Atlassian.</p>
      </div>
    );
  else
    body = (
      <form className="col" style={{ gap: 14 }} onSubmit={(e) => void submit(e)} noValidate>
        <p className="muted">
          The beta is free for {info.weeks} weeks. In return your team fills in a short survey every two weeks (about 5 minutes) and lets us measure how Quorum is used — events only, never the content of your stories.
        </p>
        {text('org', 'Organization')}
        {text('team', 'Team')}
        {text('contactName', 'Your name')}
        {text('contactEmail', 'Work e-mail (the Atlassian account you will log in with)', 'email')}
        {text('contactRole', 'Your role (optional)')}
        <div className="row wrap" style={{ gap: 12 }}>
          {text('writers', 'People who write and refine stories', 'number')}
          {text('builders', 'People who build them', 'number')}
        </div>
        <fieldset className="col" style={{ gap: 6, border: 0, padding: 0 }}>
          <legend className="small">Sources you use</legend>
          {SOURCES.map((s) => (
            <label key={s.id} className="row" style={{ gap: 8 }}>
              <input type="checkbox" checked={f.sources.includes(s.id)} onChange={() => toggle(s.id)} /> {s.label}
            </label>
          ))}
        </fieldset>
        <label className="col" style={{ gap: 4 }}>
          <span className="small">Can you connect Jira Cloud with real data once a DPA is signed?</span>
          <select className="input" value={f.realData} onChange={(e) => set('realData', e.target.value as ApplicationForm['realData'])}>
            <option value="">Choose…</option>
            <option value="yes">Yes</option>
            <option value="one_project">Yes, but one project only</option>
            <option value="test_only">No, test data only</option>
          </select>
        </label>
        <label className="col" style={{ gap: 4 }}>
          <span className="small">May we name you as a user after the beta? (optional, does not affect taking part)</span>
          <select className="input" value={f.reference} onChange={(e) => set('reference', e.target.value as ApplicationForm['reference'])}>
            <option value="">No answer</option>
            <option value="yes">Yes</option>
            <option value="ask_first">Ask us first</option>
            <option value="no">No</option>
          </select>
        </label>
        <fieldset className="col" style={{ gap: 6, border: 0, padding: 0 }}>
          <legend className="small">Consents (all three are needed)</legend>
          <label className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
            <input type="checkbox" checked={f.terms} onChange={(e) => set('terms', e.target.checked)} /> I accept the beta terms: free during the beta, no availability guarantee.
          </label>
          <label className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
            <input type="checkbox" checked={f.measurement} onChange={(e) => set('measurement', e.target.checked)} /> We agree to usage measurement: events without the content of stories, people as pseudonyms, with a switch in the workspace settings.
          </label>
          <label className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
            <input type="checkbox" checked={f.surveys} onChange={(e) => set('surveys', e.target.checked)} /> We will fill in the entry survey, a survey every two weeks and the exit survey.
          </label>
        </fieldset>
        {/* Honeypot for bots: hidden from people and from screen readers. */}
        <input className="sr-only" tabIndex={-1} autoComplete="off" aria-hidden="true" name="website" value={f.website} onChange={(e) => set('website', e.target.value)} />
        {tried && problems.length > 0 && (
          <ul className="login-error" role="alert" style={{ textAlign: 'left', margin: 0, paddingLeft: 28 }}>
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
        {error && (
          <div className="login-error" role="alert">
            {error}
          </div>
        )}
        <button className="btn primary" type="submit" disabled={sending}>
          {sending ? 'Sending…' : 'Apply for the beta'}
        </button>
      </form>
    );

  return (
    <div className="login-screen">
      <div className="card card-pad beta-card">
        <h1>Quorum closed beta</h1>
        {body}
      </div>
    </div>
  );
}
