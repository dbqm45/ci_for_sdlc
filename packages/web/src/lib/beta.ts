/**
 * The closed beta in the UI (docs/BETA-ENROLLMENT-PLAN.md): the public application form at `#/beta`, the operator's
 * panel at `#/operator`, and the days left shown to a beta team.
 */
export type BetaStatus = 'applied' | 'rejected' | 'invited' | 'active' | 'overdue' | 'paused' | 'ended';

/** How the beta looks to its team (GET /api/auth/me → `beta`). */
export interface BetaView {
  status: BetaStatus;
  startedAt?: string;
  endsAt?: string;
  daysLeft?: number;
  /** Until the entry survey is answered, analyses and connecting Atlassian wait. */
  entrySurveyDone?: boolean;
  /** The survey to answer now, if any. */
  surveyDue?: { id: string; kind: SurveyKind; dueAt: string } | null;
  /** When analyses pause unless the overdue survey is answered (status `overdue`). */
  pauseOn?: string;
  /** Why analyses are paused (status `paused`). */
  pausedReason?: string;
  /** Whether the team's usage is measured (T8). */
  measurement?: boolean;
}

export type SurveyKind = 'entry' | 'biweekly' | 'exit';

interface QuestionBase {
  id: string;
  text: string;
  required?: boolean;
  help?: string;
}
/** A survey question as GET /api/beta/surveys sends it (the server checks the answers). */
export type Question =
  | (QuestionBase & { type: 'choice' | 'multi'; options: { value: string; label: string }[] })
  | (QuestionBase & { type: 'scale'; min: number; max: number; minLabel: string; maxLabel: string })
  | (QuestionBase & { type: 'number'; max: number; allowUnknown?: boolean })
  | (QuestionBase & { type: 'text'; maxLength: number })
  | (QuestionBase & { type: 'price' });

/** A survey of the team: upcoming, open (with its questions, unless this person answered) or answered. */
export interface SurveyState {
  id: string;
  kind: SurveyKind;
  title: string;
  minutes: number;
  opensAt: string;
  dueAt: string;
  state: 'upcoming' | 'open' | 'answered';
  mine: boolean;
  answeredAt?: string;
  questions?: Question[];
}

export type AnswerDraft = Record<string, string | number | string[] | undefined>;

const blank = (v: AnswerDraft[string]) => v === undefined || v === '' || (Array.isArray(v) && !v.length);

/** The required questions still without an answer (the server checks the rest and names every problem). */
export const unanswered = (questions: Question[], draft: AnswerDraft) => questions.filter((q) => q.required && blank(draft[q.id])).map((q) => q.id);

/** The draft as the API takes it: blank answers left out. */
export const answersBody = (draft: AnswerDraft) => Object.fromEntries(Object.entries(draft).filter(([, v]) => !blank(v))) as Record<string, string | number | string[]>;

/** Why analysing waits for a beta team; undefined when it does not. */
export const betaBlockReason = (beta: BetaView | null | undefined) =>
  beta?.status === 'paused'
    ? 'Paused until the overdue survey is answered'
    : beta?.status === 'ended'
      ? 'The beta has ended'
      : (beta?.status === 'active' || beta?.status === 'overdue') && beta.entrySurveyDone === false
        ? 'Fill in the entry survey first'
        : undefined;

/** The banner text for the survey due now; undefined when none is. */
export function surveyDueText(beta: BetaView | null | undefined, now = Date.now()): string | undefined {
  const due = beta?.surveyDue;
  if (!due) return undefined;
  const name = due.kind === 'entry' ? 'The entry survey' : due.kind === 'exit' ? 'The exit survey' : 'The two-week survey';
  const left = Date.parse(due.dueAt) - now;
  const days = Math.floor(left / 86_400_000);
  const when = left < 0 ? `was due on ${due.dueAt.slice(0, 10)}` : days === 0 ? 'is due today' : days === 1 ? 'is due tomorrow' : `is due in ${days} days`;
  if (beta?.status === 'paused') return `Analyses are paused: ${beta.pausedReason ?? 'a survey is overdue'}. ${name} resumes them at once.`;
  if (beta?.status === 'overdue' && beta.pauseOn) return `${name} ${when}. Analyses pause on ${beta.pauseOn.slice(0, 10)} without it.`;
  return `${name} ${when}.`;
}

export const SOURCES = [
  { id: 'jira', label: 'Jira Cloud' },
  { id: 'confluence', label: 'Confluence Cloud' },
  { id: 'figma', label: 'Figma' },
  { id: 'repo', label: 'A repository with change plans (tf/pdi)' },
  { id: 'other', label: 'Other' },
] as const;
export type SourceId = (typeof SOURCES)[number]['id'];

export interface ApplicationForm {
  org: string;
  team: string;
  contactName: string;
  contactEmail: string;
  contactRole: string;
  writers: string;
  builders: string;
  sources: SourceId[];
  realData: '' | 'yes' | 'one_project' | 'test_only';
  reference: '' | 'yes' | 'ask_first' | 'no';
  terms: boolean;
  measurement: boolean;
  surveys: boolean;
  /** Honeypot: hidden from people, left empty. */
  website: string;
}

export const EMPTY_FORM: ApplicationForm = {
  org: '',
  team: '',
  contactName: '',
  contactEmail: '',
  contactRole: '',
  writers: '',
  builders: '',
  sources: [],
  realData: '',
  reference: '',
  terms: false,
  measurement: false,
  surveys: false,
  website: '',
};

const count = (v: string) => (/^\d{1,4}$/.test(v.trim()) ? Number(v.trim()) : undefined);

/** What still stops the form from being sent, in the order of the fields; empty = it can be sent. */
export function formProblems(f: ApplicationForm): string[] {
  const out: string[] = [];
  if (!f.org.trim()) out.push('Organization is required');
  if (!f.team.trim()) out.push('Team is required');
  if (!f.contactName.trim()) out.push('Your name is required');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.contactEmail.trim())) out.push('A work e-mail is required');
  if (count(f.writers) === undefined) out.push('How many people write stories: a number');
  if (count(f.builders) === undefined) out.push('How many people build them: a number');
  if (!f.sources.length) out.push('Pick at least one source');
  if (!f.realData) out.push('Say whether you can connect real data');
  if (!f.terms || !f.measurement || !f.surveys) out.push('All three consents are needed to take part');
  return out;
}

/** The body of POST /api/beta/apply; call only when formProblems() is empty. */
export function applicationBody(f: ApplicationForm) {
  return {
    org: f.org.trim(),
    team: f.team.trim(),
    contactName: f.contactName.trim(),
    contactEmail: f.contactEmail.trim(),
    ...(f.contactRole.trim() && { contactRole: f.contactRole.trim() }),
    writers: count(f.writers)!,
    builders: count(f.builders)!,
    sources: f.sources,
    realData: f.realData as Exclude<ApplicationForm['realData'], ''>,
    ...(f.reference && { reference: f.reference }),
    consents: { terms: true as const, measurement: true as const, surveys: true as const },
    ...(f.website && { website: f.website }),
  };
}

/** A workspace id proposed from a team or organization name: lower case, digits and `-`, at most 40 characters. */
export function workspaceIdFrom(name: string): string {
  const id = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l')
    .replace(/Ł/g, 'l')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
  return id || 'team';
}

/** The label beside the workspace for a beta team; undefined outside the beta. */
export function betaLabel(beta: BetaView | null | undefined): string | undefined {
  if (!beta) return undefined;
  if (beta.status === 'ended') return 'Beta ended';
  if (beta.status === 'paused') return 'Beta paused';
  if ((beta.status !== 'active' && beta.status !== 'overdue') || beta.daysLeft === undefined) return undefined;
  return beta.daysLeft === 1 ? 'Beta: last day' : `Beta: ${beta.daysLeft} days left`;
}

export const STATUS_LABEL: Record<BetaStatus, string> = { applied: 'Waiting', rejected: 'Rejected', invited: 'Invited', active: 'Active', overdue: 'Survey overdue', paused: 'Paused', ended: 'Ended' };

/** The operator's line for a team's surveys: answered of those opened so far, and how many are overdue. */
export function surveysSummary(e: { surveySlots?: { state: 'upcoming' | 'open' | 'answered'; dueAt: string }[] }, now = Date.now()): string {
  const slots = e.surveySlots ?? [];
  const opened = slots.filter((s) => s.state !== 'upcoming');
  if (!opened.length) return '—';
  const answered = opened.filter((s) => s.state === 'answered').length;
  const overdue = opened.filter((s) => s.state === 'open' && Date.parse(s.dueAt) < now).length;
  return `${answered}/${opened.length} answered${overdue ? `, ${overdue} overdue` : ''}`;
}

/** A beta team's usage measures (GET /api/beta/enrollments/:id/usage, docs/BETA-PLAN.md §8). */
export interface UsageReport {
  weeks: { week: number; from: string; analyses: number; decisions: number; active: boolean; aiCostUsd: number }[];
  activeWeeks: number;
  decided: number;
  accuracy: number | null;
  falseAlarms: Record<string, number | null>;
  unreacted: number | null;
  hoursToFirstDecision: number | null;
  answerAcceptance: number | null;
  forcedApprovals: number | null;
  aiCostUsd: number;
  surveysAnswered: number;
}

const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`);

/** The measures as label and value, in the order of BETA-PLAN.md §8. */
export function usageLines(r: UsageReport): [string, string][] {
  return [
    ['Active weeks', `${r.activeWeeks} of ${r.weeks.length}`],
    ['Findings decided', String(r.decided)],
    ['Accuracy (resolved or risk accepted)', pct(r.accuracy)],
    ...Object.entries(r.falseAlarms).map(([origin, v]): [string, string] => [`False alarms (${origin})`, pct(v)]),
    ['Findings without a reaction after 14 days', pct(r.unreacted)],
    ['Time to the first decision', r.hoursToFirstDecision === null ? '—' : r.hoursToFirstDecision < 48 ? `${r.hoursToFirstDecision} h` : `${Math.round(r.hoursToFirstDecision / 24)} days`],
    ['Answers from sources accepted as they were', pct(r.answerAcceptance)],
    ['Forced approvals', pct(r.forcedApprovals)],
    ['AI cost', `$${r.aiCostUsd.toFixed(2)}`],
    ['Surveys answered', String(r.surveysAnswered)],
  ];
}
