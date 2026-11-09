import { useEffect, useState } from 'react';
import { api, errMsg } from '../api';
import { Card } from '../components/ui';
import type { AnswerDraft, Question, SurveyKind } from '../lib/beta';
import { QuestionField } from './Survey';

type Definition = { kind: SurveyKind; title: string; minutes: number; version: number; questions: Question[] };

/**
 * The operator's preview of the beta surveys at `#/operator/surveys[/<kind>]` (docs/BETA-SURVEYS.md): every question
 * as a team sees it, clickable, but nothing is sent or stored.
 */
export function SurveyPreview({ kind }: { kind?: string }) {
  const [defs, setDefs] = useState<Definition[]>();
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<AnswerDraft>({});
  useEffect(() => void api.surveyDefinitions().then(setDefs).catch((e) => setError(errMsg(e))), []);
  useEffect(() => setDraft({}), [kind]);

  if (error) return <div className="empty">{error}</div>;
  if (!defs) return <div className="empty">Loading…</div>;
  const def = defs.find((d) => d.kind === kind) ?? defs[0]!;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Survey preview</h1>
          <p>The beta surveys exactly as teams see them. You can click through the answers; nothing is sent or stored.</p>
        </div>
        <a className="btn" href="#/operator">
          Back to Beta operator
        </a>
      </div>
      <div className="row wrap" role="tablist" aria-label="Surveys" style={{ gap: 8 }}>
        {defs.map((d) => (
          <a key={d.kind} role="tab" aria-selected={d.kind === def.kind} className={`btn sm ${d.kind === def.kind ? 'primary' : ''}`} href={`#/operator/surveys/${d.kind}`}>
            {d.title} · {d.questions.length} questions · about {d.minutes} min
          </a>
        ))}
      </div>
      <Card title={`${def.title} (version ${def.version})`}>
        <form className="col survey-form" style={{ gap: 18 }} onSubmit={(e) => e.preventDefault()}>
          {def.questions.map((q, i) => (
            <QuestionField key={q.id} n={i + 1} q={q} value={draft[q.id]} onChange={(v) => setDraft((d) => ({ ...d, [q.id]: v }))} missing={false} />
          ))}
          <p className="small muted">Preview only: teams send their answers from their own workspace (Beta surveys).</p>
        </form>
      </Card>
    </div>
  );
}
