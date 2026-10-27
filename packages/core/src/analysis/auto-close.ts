import type { NewDecision } from '../decisions.js';
import { AUTO_CLOSE_DECISION_TYPE, type AnswerProposal, type Decision, type Evidence, type Finding, type ItemAnalysis } from '../model.js';
import type { AutoCloseMode } from '../policy.js';
import { hash } from '../text.js';
import { evDecision, evDoc, evFrame, type ItemCtx } from './context.js';

/**
 * A2a (docs/AUTO-CLOSE-A2A-PLAN.md): the answer to a finding's question, found in the item's own sources — its active
 * decisions, Confluence pages and Figma frames — with a verbatim quote. What adversarial review does for its probes
 * (states.ts, `Probe.answeredBy`) for every rule whose question a quote can settle. Code from tf's reconstruction never
 * answers a question about the specification.
 */

/**
 * What an answer says, per rule: behaviour, not the word that made the rule fire ("the API is asynchronous" does not
 * say what the user sees while it processes). Rules without a pattern — acceptance criteria, conflicts, documentation
 * validity, task coverage, design links — are not settled by a quote.
 */
const ANSWER_PATTERNS: Record<string, RegExp> = {
  'REQ-004': /(?:up to|at most|max(?:imum)?(?: of)?|no more than|limit(?:ed)? to)\s*(?:\d+|one|two|three|four|five)\s*(?:\w+\s){0,2}?(?:retries|attempts|times|tries)|retry limit (?:of |is )?\d+/i,
  'ERR-001': /retr\w* (?:also |again )?fails|retry (?:is )?unsuccessful|after (?:the )?(?:last|final|max\w*|third|3rd) (?:attempt|retry)|retries are exhausted|(?:retry )?limit (?:is )?reached|no (?:more )?retries left/i,
  'ERR-002': /(?:server error|http 5\d\d|\b5\d\d\b|service unavailable|internal error|backend fails?)[^.]{0,100}?\b(?:shows?|displays?|sees?|message|retry|try again|returns? to)\b|\b(?:shows?|displays?)\b[^.]{0,60}?(?:server error|error (?:message|screen|state))/i,
  'ERR-003': /(?:time[- ]?outs?|times out|timed out|does not respond|doesn't respond|no response)[^.]{0,100}?\b(?:shows?|displays?|sees?|cancel\w*|retr\w*|redirect\w*|message|fails?)\b/i,
  'ERR-004': /are you sure|confirm(?:ation)? (?:dialog|modal|prompt|step)|asks? (?:the user )?to confirm|\bundo\b/i,
  'ERR-005': /session (?:expir\w*|times? out|timed out|ends)[^.]{0,100}?\b(?:redirect\w*|log ?in|sign ?in|resum\w*|lost|keeps?|restor\w*)\b/i,
  'ARCH-001': /idempoten\w*|deduplicat\w*|never (?:be )?charged twice|prevents? (?:a )?duplicate/i,
  'ARCH-002': /processing (?:screen|state|indicator|page|message)|(?:shows?|displays?) (?:a |the )?(?:spinner|progress|pending)|poll(?:s|ing)? (?:for )?(?:the )?status|status (?:is )?polled/i,
};

const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

/** True when `quote` is part of `text` word for word; only line breaks and runs of spaces may differ. */
export function isVerbatimQuote(text: string, quote: string): boolean {
  const q = squash(quote);
  return q.length > 0 && squash(text).includes(q);
}

/** The same question, source and quote give the same id, so a rejected proposal stays rejected. */
export const answerProposalId = (questionId: string, entityId: string, quote: string) => `ans:${hash(`${questionId}|${entityId}|${squash(quote)}`)}`;

/** The sentences of a text as written (only list markers and surrounding spaces trimmed). */
function sentencesOf(text: string): string[] {
  return text
    .split(/\r?\n/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+/))
    .map((s) => s.trim().replace(/^[-*•]\s+/, ''))
    .filter((s) => s.length > 3);
}

/** The text a decision states: its answer and note. */
export const decisionText = (d: Decision) => `${d.answer}${d.note ? `\n${d.note}` : ''}`;

interface Source {
  text: string;
  evidence: Evidence;
}

function sourcesOf(c: ItemCtx): Source[] {
  return [
    ...c.decisions.map((d) => ({ text: decisionText(d), evidence: evDecision(d) })),
    ...c.docs.map((d) => ({ text: d.body, evidence: evDoc(d) })),
    ...c.frames.map((f) => ({ text: [f.name, ...f.texts].join('\n'), evidence: evFrame(f) })),
  ];
}

function deterministicAnswer(c: ItemCtx, f: Finding & { question: NonNullable<Finding['question']> }): AnswerProposal | undefined {
  const re = ANSWER_PATTERNS[f.ruleId];
  if (!re) return undefined;
  for (const s of sourcesOf(c)) {
    const quote = sentencesOf(s.text).find((x) => re.test(x));
    if (!quote || !isVerbatimQuote(s.text, quote)) continue;
    return { id: answerProposalId(f.question.id, s.evidence.entityId, quote), origin: 'rule', rule: `auto-close:${f.ruleId}`, quote, source: { ...s.evidence, excerpt: quote } };
  }
  return undefined;
}

/** An AI proposal for a question, already checked against its source's text (project.ts). */
export interface AiAnswer {
  questionId: string;
  proposal: AnswerProposal;
}

/**
 * Sets `answer` on the item's open findings whose question has no decision yet: the deterministic match first, else
 * the AI's. Nothing under `off`, and nothing a person rejected or reopened (`suppressed`).
 */
export function proposeAnswers(c: ItemCtx, a: ItemAnalysis, opts: { mode: AutoCloseMode; suppressed: ReadonlySet<string>; ai?: readonly AiAnswer[] }) {
  for (const f of a.findings) {
    delete f.answer;
    if (opts.mode === 'off' || f.status !== 'open' || !f.question || c.env.decisionsByQuestion.has(f.question.id)) continue;
    const q = f.question;
    const found = deterministicAnswer(c, { ...f, question: q }) ?? opts.ai?.find((x) => x.questionId === q.id)?.proposal;
    if (found && !opts.suppressed.has(found.id)) f.answer = found;
  }
}

/** Who records the decision when the policy is `apply`. */
export const AUTO_CLOSE_ACTOR = 'auto-close';

/**
 * The decision a finding's answer proposal becomes: `resolve`, typed `finding.auto_close`, drafted by AI (the draft is
 * machine-made, whether a pattern or the AI reviewer found it), with the quote's source as evidence. `answer` is the
 * person's edited text (edited only when it differs from the quote); `automatic` is the `apply` policy (level 1).
 */
export function autoCloseDecision(f: Finding, opts: { by: string; at: string; answer?: string; automatic?: boolean }): NewDecision {
  const p = f.answer;
  if (!p || !f.question) throw new Error(`${f.id} has no answer proposal`);
  const edited = opts.answer !== undefined ? opts.answer.trim() : undefined;
  const draftEdited = edited !== undefined && squash(edited) !== squash(p.quote);
  return {
    questionId: f.question.id,
    findingId: f.id,
    itemKey: f.itemKey,
    topic: f.question.topic,
    question: f.question.text,
    answer: draftEdited ? edited! : p.quote,
    note: `Answer found in ${p.source.title}`,
    decidedBy: opts.by,
    decidedAt: opts.at,
    effect: 'resolve',
    decisionType: AUTO_CLOSE_DECISION_TYPE,
    draftedBy: 'ai',
    draftEdited,
    ...(opts.automatic && { automation: { level: 1 as const, rule: p.rule } }),
    evidence: [p.source],
    proposalId: p.id,
  };
}
