/**
 * The beta surveys (docs/BETA-SURVEYS.md B–D) as data, and the rules for their answers (docs/BETA-ENROLLMENT-PLAN.md,
 * second PR). `version` changes whenever a question changes, so stored answers say which wording they answered.
 * Questions marked `check` are compared with measured usage when the answers are read (BETA-SURVEYS.md E).
 */
export type SurveyKind = 'entry' | 'biweekly' | 'exit';

interface Base {
  id: string;
  text: string;
  required?: boolean;
  /** A checking question: compared with measured usage (BETA-SURVEYS.md [S]). */
  check?: boolean;
  help?: string;
}
export type Question =
  | (Base & { type: 'choice'; options: readonly { value: string; label: string }[] })
  | (Base & { type: 'multi'; options: readonly { value: string; label: string }[] })
  | (Base & { type: 'scale'; min: 1; max: 5; minLabel: string; maxLabel: string })
  | (Base & { type: 'number'; max: number; allowUnknown?: boolean })
  | (Base & { type: 'text'; maxLength: number })
  | (Base & { type: 'price' });

export interface SurveyDefinition {
  kind: SurveyKind;
  version: number;
  title: string;
  minutes: number;
  questions: readonly Question[];
}

const opts = (...pairs: [string, string][]) => pairs.map(([value, label]) => ({ value, label }));
const COUNT_BUCKETS = opts(['0', '0'], ['1-5', '1–5'], ['6-15', '6–15'], ['16-30', '16–30'], ['30+', 'more than 30']);
const HOURS = opts(['<1', 'under 1 h'], ['1-3', '1–3 h'], ['3-8', '3–8 h'], ['8+', 'more than 8 h'], ['unknown', "don't know"]);
const SPRINT_HOURS = opts(['<2', 'up to 2 h'], ['2-5', '2–5 h'], ['5-10', '5–10 h'], ['10-20', '10–20 h'], ['20+', 'more than 20 h'], ['unknown', "don't know"]);
const QUALITY = { type: 'scale', min: 1, max: 5, minLabel: 'most need clarifying during the work', maxLabel: 'almost always complete' } as const;

/** The baseline questions, asked again at the end (BETA-SURVEYS.md B3, B4, B6, B7 and D5). */
const baseline = (prefix: string, when: string): Question[] => [
  { id: `${prefix}stories`, type: 'number', max: 1000, required: true, text: `How many stories went into development in ${when}?` },
  { id: `${prefix}returned`, type: 'number', max: 1000, allowUnknown: true, required: true, text: `How many of them came back from development or testing because the requirement was unclear, contradictory or incomplete?` },
  { id: `${prefix}hours`, type: 'choice', options: SPRINT_HOURS, required: true, text: 'How many hours a sprint does the team spend clarifying requirements (refinement, questions to the PO, fixing descriptions)?' },
  { id: `${prefix}quality`, ...QUALITY, required: true, text: 'How good are the requirements that reach development?' },
];

export const SURVEYS: Record<SurveyKind, SurveyDefinition> = {
  entry: {
    kind: 'entry',
    version: 1,
    title: 'Entry survey',
    minutes: 7,
    questions: [
      {
        id: 'readiness_today',
        type: 'multi',
        required: true,
        text: 'How do you check today that a story is ready for development?',
        options: opts(['dor_doc', 'Definition of Ready in Confluence'], ['jira_template', 'A checklist in the Jira template'], ['refinement', 'Refinement without a checklist'], ['review', 'A review by an architect or QA'], ['none', "We don't check"], ['other', 'Other']),
      },
      { id: 'who_decides', type: 'choice', required: true, text: 'Who decides that a story is ready?', options: opts(['po', 'The PO'], ['team', 'The team in refinement'], ['tech_lead', 'The tech lead'], ['nobody', 'Nobody formally']) },
      ...baseline('', 'the last finished sprint'),
      { id: 'returned_example', type: 'text', maxLength: 300, help: 'The key and one sentence, e.g. PAY-123: no behaviour for a rejected payment.', text: 'The key of one such story and what was missing.' },
      { id: 'pain', type: 'text', maxLength: 1000, required: true, text: 'Which one problem with requirements would you most like to get rid of?' },
      { id: 'tools', type: 'text', maxLength: 1000, text: 'What do you use, or have you tried, for this (Jira apps, an AI assistant in Jira or Confluence, your own scripts, nothing)?' },
    ],
  },
  biweekly: {
    kind: 'biweekly',
    version: 1,
    title: 'Two-week survey',
    minutes: 5,
    questions: [
      { id: 'stories_decided', type: 'choice', options: COUNT_BUCKETS, required: true, check: true, text: 'How many stories went through a Quorum analysis and a decision (a resolved finding or an approval) in the last two weeks?' },
      { id: 'changed_example', type: 'text', maxLength: 500, required: true, check: true, help: 'The key and what changed (description, acceptance criterion, a PO decision, a mock-up), or "none".', text: 'The key of a story where a Quorum finding changed something, and what exactly you changed.' },
      { id: 'caught', type: 'choice', required: true, text: 'Did Quorum point out something the team would not have noticed before development?', options: opts(['yes', 'Yes'], ['no', 'No'], ['unknown', "Don't know"]) },
      { id: 'caught_key', type: 'text', maxLength: 100, help: 'Only if you answered yes.', text: 'Its key.' },
      { id: 'dismissed', type: 'choice', required: true, check: true, text: 'How many findings did you dismiss as false or irrelevant?', options: opts(['0', '0'], ['1-3', '1–3'], ['4-10', '4–10'], ['10+', 'more than 10']) },
      { id: 'noise_rule', type: 'text', maxLength: 300, text: 'If any: which rule or kind of finding was most often noise?' },
      { id: 'time_spent', type: 'choice', options: HOURS, required: true, text: 'How much time did the team spend in Quorum in the last two weeks?' },
      { id: 'time_saved', type: 'choice', options: HOURS, required: true, text: 'How much time did it save on clarifying and fixing requirements, in your view?' },
      { id: 'returned', type: 'number', max: 1000, allowUnknown: true, text: 'How many stories of the last two weeks came back from development or testing because of unclear requirements?' },
      { id: 'helped', type: 'scale', min: 1, max: 5, minLabel: 'got in the way', maxLabel: 'clearly helped', required: true, text: 'How much did Quorum help in the last two weeks? (3 = no difference)' },
      {
        id: 'without_quorum',
        type: 'choice',
        required: true,
        text: 'If Quorum were gone tomorrow, what would change in your work?',
        options: opts(['nothing', 'Nothing'], ['minor', 'A minor inconvenience'], ['worse', 'We would check by hand again and it would be worse'], ['replace', 'We would have to find a replacement']),
      },
      { id: 'bother', type: 'text', maxLength: 1000, required: true, text: 'What got in the way most, or what was missing?' },
      { id: 'contact_ok', type: 'choice', text: 'May we contact you about it?', options: opts(['yes', 'Yes'], ['no', 'No']) },
    ],
  },
  exit: {
    kind: 'exit',
    version: 1,
    title: 'Exit survey',
    minutes: 10,
    questions: [
      { id: 'disappointed', type: 'choice', required: true, text: 'How would you feel if you could no longer use Quorum?', options: opts(['very', 'Very disappointed'], ['somewhat', 'Somewhat disappointed'], ['not', 'Not disappointed'], ['stopped', 'We already stopped using it']) },
      { id: 'for_whom', type: 'text', maxLength: 500, text: 'Who is Quorum most useful for?' },
      { id: 'main_benefit', type: 'text', maxLength: 1000, required: true, help: 'With the key of a story as an example.', text: 'What is the main benefit of Quorum?' },
      { id: 'daily_use', type: 'text', maxLength: 1000, required: true, text: 'What would have to change for you to use Quorum every day?' },
      ...baseline('end_', 'the last finished sprint'),
      { id: 'price_too_cheap', type: 'price', required: true, text: 'At what price per person writing stories, per month, would Quorum be so cheap that you would doubt its quality?' },
      { id: 'price_bargain', type: 'price', required: true, text: 'At what price would it be a bargain?' },
      { id: 'price_expensive', type: 'price', required: true, text: 'At what price would it start to be expensive, but you would still consider it?' },
      { id: 'price_too_expensive', type: 'price', required: true, text: 'At what price would it be too expensive to consider at all?' },
      {
        id: 'would_buy',
        type: 'choice',
        required: true,
        text: 'Would you buy the Team plan after the beta (per person, with a limit of AI analyses)?',
        options: opts(['now', 'Yes, right away'], ['budget', 'Yes, after budget approval'], ['other_model', 'Yes, but per team or per workspace'], ['no', 'No']),
      },
      { id: 'buyer', type: 'text', maxLength: 500, required: true, text: 'Who decides such a purchase at your company, and how long does it take?' },
      {
        id: 'blockers',
        type: 'multi',
        required: true,
        text: 'What would stop you from buying?',
        options: opts(['price', 'Price'], ['security', 'Security and compliance'], ['features', 'Missing features'], ['benefit', 'Too little benefit'], ['tools', 'A change of tools at the company'], ['other', 'Other']),
      },
      { id: 'design_partner', type: 'choice', text: 'Will you take a design partner discount for the first year in exchange for being a reference?', options: opts(['yes', 'Yes'], ['no', 'No'], ['discuss', 'To be discussed']) },
    ],
  },
};

export type AnswerValue = string | number | string[];

/** What is wrong with `answers` for `def`, one line per problem; empty = valid. Unknown question ids are problems. */
export function answerProblems(def: SurveyDefinition, answers: Record<string, unknown>): string[] {
  const out: string[] = [];
  const known = new Set(def.questions.map((q) => q.id));
  for (const id of Object.keys(answers)) if (!known.has(id)) out.push(`${id}: not a question of this survey`);
  for (const q of def.questions) {
    const v = answers[q.id];
    const empty = v === undefined || v === '' || (Array.isArray(v) && !v.length);
    if (empty) {
      if (q.required) out.push(`${q.id}: an answer is required`);
      continue;
    }
    const values = 'options' in q ? q.options.map((o) => o.value) : [];
    switch (q.type) {
      case 'choice':
        if (typeof v !== 'string' || !values.includes(v)) out.push(`${q.id}: pick one of ${values.join(', ')}`);
        break;
      case 'multi':
        if (!Array.isArray(v) || v.some((x) => typeof x !== 'string' || !values.includes(x)) || new Set(v).size !== v.length) out.push(`${q.id}: pick from ${values.join(', ')}`);
        break;
      case 'scale':
        if (!Number.isInteger(v) || (v as number) < q.min || (v as number) > q.max) out.push(`${q.id}: a whole number from ${q.min} to ${q.max}`);
        break;
      case 'number':
        if (!(q.allowUnknown && v === 'unknown') && (!Number.isInteger(v) || (v as number) < 0 || (v as number) > q.max)) out.push(`${q.id}: a whole number from 0 to ${q.max}${q.allowUnknown ? ' or "unknown"' : ''}`);
        break;
      case 'price':
        if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 100_000) out.push(`${q.id}: an amount from 0 to 100000`);
        break;
      case 'text':
        if (typeof v !== 'string' || !v.trim() || v.length > q.maxLength) out.push(`${q.id}: text up to ${q.maxLength} characters`);
        break;
    }
  }
  return out;
}

/** The answers as stored: unanswered optional questions left out, text trimmed. Call after answerProblems() is empty. */
export function cleanAnswers(def: SurveyDefinition, answers: Record<string, unknown>): Record<string, AnswerValue> {
  const out: Record<string, AnswerValue> = {};
  for (const q of def.questions) {
    const v = answers[q.id];
    if (v === undefined || v === '' || (Array.isArray(v) && !v.length)) continue;
    out[q.id] = typeof v === 'string' ? v.trim() : (v as AnswerValue);
  }
  return out;
}

const DAY_MS = 24 * 3_600_000;

/** One survey a team owes: when it opens and by when it is due. */
export interface SurveySlot {
  id: string;
  kind: SurveyKind;
  opensAt: string;
  dueAt: string;
}

/**
 * The surveys of a beta from `startedAt` to `endsAt`: the entry survey at once (due in 3 days), a two-week survey
 * every 14 days before the end (due 5 days after it opens), and the exit survey a week before the end (due a week
 * after it).
 */
export function surveySchedule(startedAt: string, endsAt: string): SurveySlot[] {
  const start = Date.parse(startedAt);
  const end = Date.parse(endsAt);
  const iso = (t: number) => new Date(t).toISOString();
  const out: SurveySlot[] = [{ id: 'entry', kind: 'entry', opensAt: iso(start), dueAt: iso(start + 3 * DAY_MS) }];
  for (let n = 1, t = start + 14 * DAY_MS; t < end - 7 * DAY_MS; n++, t += 14 * DAY_MS) out.push({ id: `biweekly-${n}`, kind: 'biweekly', opensAt: iso(t), dueAt: iso(t + 5 * DAY_MS) });
  out.push({ id: 'exit', kind: 'exit', opensAt: iso(end - 7 * DAY_MS), dueAt: iso(end + 7 * DAY_MS) });
  return out;
}
