/**
 * The "Decision impact" section of a pull request description (docs/DECISION-SCOPE-PLAN.md, step 2; the template is
 * `.github/pull_request_template.md`): does the pull request change an accepted decision, and which one replaces it.
 * Pure: the gate reads the description and decides what blocks.
 */

/** `missing` — no section; `unanswered` — the answer is empty or still the template's options. */
export type DecisionImpactAnswer = 'no' | 'yes' | 'unknown' | 'unanswered' | 'missing';

export interface DecisionImpact {
  answer: DecisionImpactAnswer;
  /** Decision keys on the answer line of a "yes": the superseding decisions. */
  superseding: string[];
  /** Decision keys on the "decisions concerned" line. */
  concerned: string[];
}

const HEADING = /^##\s+(wpływ na decyzje|decision impact)\s*$/i;
const ANSWER = /^-\s*(czy zmienia przyjętą decyzję|changes an accepted decision)\s*:(.*)$/i;
const CONCERNED = /^-\s*(dotyczy decyzji|decisions concerned)\s*:(.*)$/i;
const KEY = /\b[A-Z][A-Z0-9]+-[0-9]+\b/g;

const keys = (s: string) => [...new Set(s.match(KEY) ?? [])];

function answerOf(value: string): DecisionImpactAnswer {
  const v = value.trim().toLowerCase();
  if (!v || v.includes(' / ')) return 'unanswered';
  if (/^(nie wiem|don'?t know|not sure)\b/.test(v)) return 'unknown';
  if (/^(tak|yes)\b/.test(v)) return 'yes';
  if (/^(nie|no)\b/.test(v)) return 'no';
  return 'unanswered';
}

export function decisionImpactOf(body: string): DecisionImpact {
  const lines = body.replace(/<!--[\s\S]*?-->/g, '').split(/\r?\n/);
  const start = lines.findIndex((l) => HEADING.test(l.trim()));
  if (start < 0) return { answer: 'missing', superseding: [], concerned: [] };
  const end = lines.findIndex((l, i) => i > start && /^##?\s/.test(l));
  const section = lines.slice(start + 1, end < 0 ? undefined : end).map((l) => l.trim());
  const answerLine = section.map((l) => ANSWER.exec(l)).find(Boolean);
  const concernedLine = section.map((l) => CONCERNED.exec(l)).find(Boolean);
  const answer = answerLine ? answerOf(answerLine[2]!) : 'unanswered';
  return {
    answer,
    superseding: answer === 'yes' ? keys(answerLine![2]!) : [],
    concerned: concernedLine ? keys(concernedLine[2]!) : [],
  };
}
