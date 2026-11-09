import { SURVEYS } from './beta-surveys.js';
import type { BetaEnrollment, BetaStatus, SurveyState } from './beta.js';

/**
 * The life of a beta team after it joined (docs/BETA-ENROLLMENT-PLAN.md, third PR): when a team is overdue with a
 * survey, when it is paused, when the beta ends, and which reminders are due. Pure: the daily job and every read
 * judge the same way, so a team sees its state at once and the job only records it and sends the mails.
 */
export const DAY_MS = 24 * 3_600_000;
/** Owner's decision 2026-11-09: a survey 7 days past due pauses the team, automatically. */
export const PAUSE_AFTER_DAYS = 7;

export interface Judgement {
  status: BetaStatus;
  /** Open surveys past their due date, the earliest first. */
  overdue: SurveyState[];
  /** When the team will be paused unless it answers (status `overdue`). */
  pauseOn?: string;
  /** Why it is paused (status `paused`). */
  reason?: string;
}

/**
 * The team's status at `now` from its surveys and dates. Before it joined, the stored status stands. A team is
 * `ended` from `endsAt`; `paused` when a survey is `pauseAfterDays` past due, or when two surveys are past due, and
 * the operator's grace has passed; `overdue` while a survey is past due; else `active`.
 */
export function judgeEnrollment(e: BetaEnrollment, states: SurveyState[], now: number, pauseAfterDays = PAUSE_AFTER_DAYS): Judgement {
  if (!e.startedAt || !e.endsAt || !['active', 'overdue', 'paused', 'ended'].includes(e.status)) return { status: e.status, overdue: [] };
  if (now >= Date.parse(e.endsAt)) return { status: 'ended', overdue: [] };
  const overdue = states.filter((s) => s.state === 'open' && Date.parse(s.dueAt) <= now).sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
  if (!overdue.length) return { status: 'active', overdue };
  const byDays = Date.parse(overdue[0]!.dueAt) + pauseAfterDays * DAY_MS;
  const bySecond = overdue[1] ? Date.parse(overdue[1].dueAt) : Infinity;
  const pauseAt = Math.max(Math.min(byDays, bySecond), e.graceUntil ? Date.parse(e.graceUntil) : 0);
  if (now >= pauseAt) {
    const reason = overdue.length > 1 ? `${overdue.length} surveys are past due` : `${SURVEYS[overdue[0]!.kind].title} is ${pauseAfterDays} days past due`;
    return { status: 'paused', overdue, reason };
  }
  return { status: 'overdue', overdue, pauseOn: new Date(pauseAt).toISOString() };
}

/** A mail the job sends once; `key` marks it as sent in the enrollment. */
export interface Reminder {
  key: string;
  kind: 'survey_open' | 'survey_due' | 'survey_late' | 'pause_warning';
  survey?: SurveyState;
}

/**
 * The reminders due at `now` that were not sent yet, at most one per survey: when a job ran late, only the latest
 * applicable one goes out and the earlier ones are marked as skipped (`skip`), so a team never gets a burst.
 * Survey reminders: when it opens, on its due day, 3 days after. The pause warning: a day before `pauseOn`.
 */
export function dueReminders(e: BetaEnrollment, j: Judgement, states: SurveyState[], now: number): { send: Reminder[]; skip: string[] } {
  const sent = e.reminders ?? {};
  const send: Reminder[] = [];
  const skip: string[] = [];
  if (j.status !== 'active' && j.status !== 'overdue') return { send, skip };
  for (const s of states.filter((x) => x.state === 'open')) {
    const due = Date.parse(s.dueAt);
    const steps: Reminder[] = [
      { key: `${s.id}:open`, kind: 'survey_open' as const, survey: s },
      ...(now >= due - DAY_MS ? [{ key: `${s.id}:due`, kind: 'survey_due' as const, survey: s }] : []),
      ...(now >= due + 3 * DAY_MS ? [{ key: `${s.id}:late`, kind: 'survey_late' as const, survey: s }] : []),
    ].filter((r) => !sent[r.key]);
    if (!steps.length) continue;
    send.push(steps.at(-1)!);
    skip.push(...steps.slice(0, -1).map((r) => r.key));
  }
  if (j.status === 'overdue' && j.pauseOn && now >= Date.parse(j.pauseOn) - DAY_MS) {
    const key = `pause:${j.pauseOn}`;
    if (!sent[key]) send.push({ key, kind: 'pause_warning' });
  }
  return { send, skip };
}
