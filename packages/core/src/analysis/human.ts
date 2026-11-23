import type { Finding, HumanQuestion } from '../model.js';
import { questionOptions } from './context.js';

/** The rule id of questions people ask on a work item (R1, docs/REFINEMENT-PLAN.md). */
export const HUMAN_QUESTION_RULE = 'HUMAN-001';
const TITLE_MAX = 140;

/**
 * A person's question as a finding: the same lifecycle as a rule's finding (closed by a decision on its question), with
 * `origin: 'human'`. Accepted or not, it is shown; whether it counts for readiness is decided by the policy step
 * (`actionFor` in analyze.ts: not accepted ⇒ `record`).
 */
export function humanFinding(q: HumanQuestion): Finding {
  const id = `${HUMAN_QUESTION_RULE}:${q.itemKey}:${q.id}`;
  const oneLine = q.text.replace(/\s+/g, ' ').trim();
  const title = oneLine.length > TITLE_MAX ? `${oneLine.slice(0, TITLE_MAX - 1)}…` : oneLine;
  return {
    id,
    ruleId: HUMAN_QUESTION_RULE,
    itemKey: q.itemKey,
    category: 'AMBIGUITY',
    severity: 'warning',
    dimension: 'requirements',
    title,
    explanation: `Asked by ${q.author} on ${q.askedAt.slice(0, 10)} ${q.askedAt.slice(11, 16)} UTC${q.accepted ? `; accepted for refinement by ${q.acceptedBy ?? 'the Product Owner'}` : '; waiting for the Product Owner to accept it — until then it does not change readiness'}.`,
    evidence: q.link
      ? [
          {
            source: 'jira',
            entityId: `link:${q.id}`,
            title: 'Link added with the question',
            url: q.link,
          },
        ]
      : [],
    question: {
      id: `q:${id}`,
      text: q.text,
      options: questionOptions([]),
      topic: 'refinement',
    },
    status: 'open',
    origin: 'human',
    human: {
      author: q.author,
      askedAt: q.askedAt,
      accepted: q.accepted,
      ...(q.acceptedBy && { acceptedBy: q.acceptedBy }),
      ...(q.link && { link: q.link }),
    },
  };
}
