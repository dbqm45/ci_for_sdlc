import { useEffect, useState } from 'react';
import { useApp } from '../App';
import { api, errMsg } from '../api';
import { Card } from '../components/ui';
import { answersBody, unanswered, type AnswerDraft, type Question, type SurveyState } from '../lib/beta';

/**
 * A beta survey at `#/survey/<id>` (docs/BETA-SURVEYS.md). Without an id it lists the team's surveys. The server
 * checks every answer; this page only stops a send with a required question left empty.
 */
export function Survey({ id }: { id?: string }) {
  const { navigate, toast, refreshMe, me } = useApp();
  const mayMeasure = me?.user && (me.user.role === 'owner' || me.user.role === 'admin');
  const toggleMeasurement = async () => {
    try {
      const r = await api.setBetaMeasurement(!(me?.beta?.measurement ?? true));
      toast(r.measurement ? 'Usage measurement is on' : 'Usage measurement is off');
      await refreshMe();
    } catch (err) {
      toast(errMsg(err));
    }
  };
  const [list, setList] = useState<SurveyState[]>();
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<AnswerDraft>({});
  const [tried, setTried] = useState(false);
  const [sending, setSending] = useState(false);
  useEffect(() => void api.betaSurveys().then(setList).catch((e) => setError(errMsg(e))), [id]);

  if (error) return <div className="empty">{error}</div>;
  if (!list) return <div className="empty">Loading…</div>;

  const survey = id ? list.find((s) => s.id === id) : undefined;
  if (!survey || !survey.questions)
    return (
      <div className="page">
        <div className="page-head">
          <div>
            <h1>Beta surveys</h1>
            <p>A few minutes every two weeks: what Quorum changed for your team, and what got in the way.</p>
          </div>
        </div>
        <Card pad={false}>
          <table className="table">
            <tbody>
              {list.map((s) => (
                <tr key={s.id}>
                  <td>
                    <strong>{s.title}</strong> <span className="small muted">about {s.minutes} min</span>
                  </td>
                  <td className="small muted">
                    {s.state === 'upcoming' ? `opens ${s.opensAt.slice(0, 10)}` : s.state === 'answered' ? `answered ${s.answeredAt!.slice(0, 10)}${s.mine ? ' (by you)' : ''}` : `due ${s.dueAt.slice(0, 10)}`}
                  </td>
                  <td>
                    {s.questions && (
                      <a className="btn sm primary" href={`#/survey/${s.id}`}>
                        {s.state === 'answered' ? 'Add your answers' : 'Fill in'}
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card title="Usage measurement">
          <p className="small">
            {me?.beta?.measurement === false
              ? 'Off: nothing about how your team uses Quorum is recorded.'
              : 'On: Quorum records what happens (an analysis ran, a finding was decided) — never the content of your stories, never names or e-mails.'}{' '}
            You agreed to it in the application; an Admin can switch it off.
          </p>
          {mayMeasure && (
            <button className="btn sm" onClick={() => void toggleMeasurement()}>
              {me?.beta?.measurement === false ? 'Switch measurement on' : 'Switch measurement off'}
            </button>
          )}
        </Card>
      </div>
    );

  const missing = unanswered(survey.questions, draft);
  const set = (q: string, v: AnswerDraft[string]) => setDraft((d) => ({ ...d, [q]: v }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (missing.length) return;
    setSending(true);
    try {
      await api.answerSurvey(survey.id, answersBody(draft));
      toast('Thank you — your answers are saved');
      await refreshMe();
      navigate('/overview');
    } catch (err) {
      toast(errMsg(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{survey.title}</h1>
          <p>
            About {survey.minutes} minutes, due {survey.dueAt.slice(0, 10)}. Answer for your team; give story keys, never their content.
          </p>
        </div>
      </div>
      <Card>
        <form className="col survey-form" style={{ gap: 18 }} onSubmit={(e) => void submit(e)} noValidate>
          {survey.questions.map((q, i) => (
            <QuestionField key={q.id} n={i + 1} q={q} value={draft[q.id]} onChange={(v) => set(q.id, v)} missing={tried && missing.includes(q.id)} />
          ))}
          {tried && missing.length > 0 && (
            <div className="login-error" role="alert">
              {missing.length === 1 ? 'One required question is' : `${missing.length} required questions are`} still empty.
            </div>
          )}
          <div className="row" style={{ gap: 8 }}>
            <button className="btn primary" type="submit" disabled={sending}>
              {sending ? 'Sending…' : 'Send answers'}
            </button>
            <a className="btn" href="#/survey">
              Later
            </a>
          </div>
        </form>
      </Card>
    </div>
  );
}

function QuestionField({ n, q, value, onChange, missing }: { n: number; q: Question; value: AnswerDraft[string]; onChange: (v: AnswerDraft[string]) => void; missing: boolean }) {
  const label = (
    <span>
      {n}. {q.text}
      {q.required ? '' : <span className="muted"> (optional)</span>}
      {q.help && <span className="small muted survey-help">{q.help}</span>}
    </span>
  );
  const invalid = missing ? { 'aria-invalid': true as const } : {};
  if (q.type === 'choice' || q.type === 'multi' || q.type === 'scale') {
    const options = q.type === 'scale' ? Array.from({ length: q.max - q.min + 1 }, (_, i) => ({ value: String(q.min + i), label: String(q.min + i) })) : q.options;
    const multi = q.type === 'multi';
    const chosen = (v: string) => (multi ? Array.isArray(value) && value.includes(v) : String(value ?? '') === v);
    const pick = (v: string) => {
      if (q.type === 'scale') return onChange(Number(v));
      if (!multi) return onChange(v);
      const now = Array.isArray(value) ? value : [];
      onChange(now.includes(v) ? now.filter((x) => x !== v) : [...now, v]);
    };
    return (
      <fieldset className={`col survey-q ${missing ? 'is-missing' : ''}`} style={{ gap: 6 }} {...invalid}>
        <legend>{label}</legend>
        <div className={q.type === 'scale' ? 'row wrap' : 'col'} style={{ gap: q.type === 'scale' ? 14 : 4 }}>
          {q.type === 'scale' && <span className="small muted">1 = {q.minLabel}</span>}
          {options.map((o) => (
            <label key={o.value} className="row" style={{ gap: 8 }}>
              <input type={multi ? 'checkbox' : 'radio'} name={q.id} checked={chosen(o.value)} onChange={() => pick(o.value)} /> {o.label}
            </label>
          ))}
          {q.type === 'scale' && <span className="small muted">5 = {q.maxLabel}</span>}
        </div>
      </fieldset>
    );
  }
  if (q.type === 'text')
    return (
      <label className={`col survey-q ${missing ? 'is-missing' : ''}`} style={{ gap: 6 }}>
        {label}
        <textarea className="input" rows={q.maxLength > 300 ? 3 : 1} maxLength={q.maxLength} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} {...invalid} />
      </label>
    );
  const unknown = q.type === 'number' && q.allowUnknown && value === 'unknown';
  return (
    <div className={`col survey-q ${missing ? 'is-missing' : ''}`} style={{ gap: 6 }}>
      <label className="col" style={{ gap: 6 }}>
        {label}
        <input
          className="input"
          style={{ maxWidth: 200 }}
          type="number"
          min={0}
          max={q.type === 'number' ? q.max : undefined}
          step={q.type === 'price' ? 'any' : 1}
          disabled={unknown}
          value={typeof value === 'number' ? value : ''}
          onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
          {...invalid}
        />
      </label>
      {q.type === 'price' && <span className="small muted">PLN per month</span>}
      {q.type === 'number' && q.allowUnknown && (
        <label className="row small" style={{ gap: 8 }}>
          <input type="checkbox" checked={unknown} onChange={(e) => onChange(e.target.checked ? 'unknown' : undefined)} /> Don't know
        </label>
      )}
    </div>
  );
}
