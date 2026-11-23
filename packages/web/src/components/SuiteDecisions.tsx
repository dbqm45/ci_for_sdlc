import { useEffect, useState } from 'react';
import type { SuiteDecision } from '@ci/core';
import { api } from '../api';
import { copyState, suiteDecisionState, type SuiteCopyStatus } from '../lib/suiteDecisions';
import { Card } from './ui';

/**
 * D9 (docs/PDI-D9-PLAN.md): decisions taken elsewhere in the suite (gates in pdi, the factory's decisions, DI Release),
 * from the copy of pdi's index — those of the story's change, or found by words. Read-only: the app they come from
 * changes them. Without the copy configured there is no panel.
 */
export function SuiteDecisions({ change }: { change?: string }) {
  const [q, setQ] = useState('');
  const [asked, setAsked] = useState('');
  const [found, setFound] = useState<SuiteCopyStatus & { decisions: SuiteDecision[] }>();
  useEffect(() => {
    let live = true;
    void api
      .suiteDecisions({ change: asked ? undefined : change, q: asked || undefined })
      .then((r) => live && setFound(r))
      .catch(() => live && setFound(undefined));
    return () => {
      live = false;
    };
  }, [change, asked]);
  if (!found?.enabled) return null;
  const copy = copyState(found);
  return (
    <Card title="Suite decisions">
      <p className={copy.stale ? 'banner' : 'muted'} style={{ margin: '0 0 8px' }}>
        Decided elsewhere in the suite, read-only — {copy.text}.
      </p>
      <form
        className="row"
        style={{ gap: 6, marginBottom: 8 }}
        onSubmit={(e) => {
          e.preventDefault();
          setAsked(q.trim());
        }}
      >
        <input aria-label="Search suite decisions" placeholder={change ? `Decisions of ${change}, or search…` : 'Search suite decisions…'} value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="submit" className="btn">Search</button>
      </form>
      {found.decisions.length === 0 ? (
        <div className="muted">{asked ? `No suite decision matches “${asked}”.` : change ? `No suite decisions for ${change} yet.` : 'Search to see decisions taken elsewhere in the suite.'}</div>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          {found.decisions.map((d) => {
            const s = suiteDecisionState(d);
            return (
              <li key={d.id} style={s.binding ? undefined : { opacity: 0.7 }}>
                <span className="badge">{s.app}</span> <span className={`badge${s.binding ? ' accent' : ''}`}>{s.label}</span>{' '}
                {d.link ? (
                  <a href={d.link} target="_blank" rel="noreferrer noopener">
                    {d.id}
                  </a>
                ) : (
                  d.id
                )}
                : {s.binding ? <strong>{d.statement}</strong> : <s>{d.statement}</s>}
                {d.why && <span className="muted"> — {d.why}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
