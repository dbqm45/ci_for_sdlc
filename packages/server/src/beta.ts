import { randomUUID } from 'node:crypto';
import type { Backend } from './backend.js';
import { httpError } from './http.js';
import { PAUSE_AFTER_DAYS, judgeEnrollment } from './beta-lifecycle.js';
import { SURVEYS, answerProblems, cleanAnswers, surveySchedule, type AnswerValue, type SurveyKind, type SurveySlot } from './beta-surveys.js';

/**
 * Closed beta enrollment (T10, docs/BETA-ENROLLMENT-PLAN.md, first PR): a team applies through a public form, an
 * operator approves it, which opens an organization with a one-time Owner invitation, and the beta runs for a fixed
 * time from the moment the Owner joins. Kept in the reserved `_platform` space as `beta-enrollments.json`.
 * Surveys and the daily job (reminders, pause, end) come in the next PRs.
 */
/** `overdue`: a survey is past due; `paused`: analyses wait until the team answers (docs/BETA-ENROLLMENT-PLAN.md). */
export type BetaStatus = 'applied' | 'rejected' | 'invited' | 'active' | 'overdue' | 'paused' | 'ended';
export const BETA_SOURCES = ['jira', 'confluence', 'figma', 'repo', 'other'] as const;
export const BETA_REAL_DATA = ['yes', 'one_project', 'test_only'] as const;
export const BETA_REFERENCE = ['yes', 'ask_first', 'no'] as const;

/** What the team wrote in the application form (docs/BETA-SURVEYS.md, A). */
export interface BetaApplication {
  org: string;
  team: string;
  contactName: string;
  contactEmail: string;
  contactRole?: string;
  writers: number;
  builders: number;
  sources: (typeof BETA_SOURCES)[number][];
  realData: (typeof BETA_REAL_DATA)[number];
  reference?: (typeof BETA_REFERENCE)[number];
}

export interface BetaHistoryEntry {
  at: string;
  status: BetaStatus;
  by: string;
  note?: string;
}

export interface BetaEnrollment {
  id: string;
  status: BetaStatus;
  application: BetaApplication;
  /** The three consents of the form, all required, with when they were given. */
  consents: { terms: true; measurement: true; surveys: true; at: string };
  appliedAt: string;
  orgId?: string;
  workspace?: string;
  invitationId?: string;
  invitedAt?: string;
  /** When the Owner joined: the beta's first day. */
  startedAt?: string;
  /** startedAt + the beta's length. */
  endsAt?: string;
  history: BetaHistoryEntry[];
  /** The operator's grace: no pause before this time. */
  graceUntil?: string;
  /** Mails already sent (or skipped), by key, with when. */
  reminders?: Record<string, string>;
  /** Answered surveys by slot id (`entry`, `biweekly-1`, …, `exit`): first answer and who answered. */
  surveys?: Record<string, { answeredAt: string; by: string[] }>;
}

/** A survey slot as its team sees it. */
export interface SurveyState extends SurveySlot {
  state: 'upcoming' | 'open' | 'answered';
  /** Whether this person already answered it (others in the team may still add theirs). */
  mine: boolean;
  answeredAt?: string;
}

/** One person's answers to one survey, as kept in the `beta-survey-answers` log. */
export interface SurveyAnswer {
  enrollmentId: string;
  orgId: string;
  survey: string;
  kind: SurveyKind;
  version: number;
  userId: string;
  name: string;
  at: string;
  answers: Record<string, AnswerValue>;
}

/** How the beta looks to its team (GET /api/auth/me). */
export interface BetaView {
  status: BetaStatus;
  startedAt?: string;
  endsAt?: string;
  daysLeft?: number;
  /** Whether the entry survey is answered: until then analyses and connecting Atlassian wait. */
  entrySurveyDone?: boolean;
  /** The survey to answer now, the earliest due first; none when nothing is open. */
  surveyDue?: { id: string; kind: SurveyKind; dueAt: string } | null;
  /** When analyses pause unless the overdue survey is answered (status `overdue`). */
  pauseOn?: string;
  /** Why analyses are paused (status `paused`). */
  pausedReason?: string;
}

/** The surveys of an enrollment as of `now`; `userId` marks the ones this person answered. */
export function surveyStates(e: BetaEnrollment, now: number, userId?: string): SurveyState[] {
  if (!e.startedAt || !e.endsAt) return [];
  return surveySchedule(e.startedAt, e.endsAt).map((slot) => {
    const done = e.surveys?.[slot.id];
    const state = done ? 'answered' : Date.parse(slot.opensAt) > now ? 'upcoming' : 'open';
    return { ...slot, state, mine: !!userId && !!done?.by.includes(userId), ...(done && { answeredAt: done.answeredAt }) };
  });
}

/** Whether a team must still answer the entry survey before analysing (an active beta without it). */
export const entrySurveyPending = (e: BetaEnrollment) => ['active', 'overdue', 'paused'].includes(e.status) && !!e.startedAt && !e.surveys?.entry;

const DAY_MS = 24 * 3_600_000;

/** The status as of `now` (judged from the surveys and dates, before the daily job records it). */
export function statusAt(e: BetaEnrollment, now: number, pauseAfterDays = PAUSE_AFTER_DAYS): BetaStatus {
  return judgeEnrollment(e, surveyStates(e, now), now, pauseAfterDays).status;
}

/** Whole days until the end, rounded up (the last day counts as 1); 0 once it ended; undefined before it started. */
export function daysLeft(e: Pick<BetaEnrollment, 'endsAt'>, now: number): number | undefined {
  if (!e.endsAt) return undefined;
  return Math.max(0, Math.ceil((Date.parse(e.endsAt) - now) / DAY_MS));
}

export function betaView(e: BetaEnrollment, now: number, pauseAfterDays = PAUSE_AFTER_DAYS): BetaView {
  const states = surveyStates(e, now);
  const j = judgeEnrollment(e, states, now, pauseAfterDays);
  const due = j.status === 'ended' ? states.find((x) => x.state === 'open' && x.kind === 'exit') : states.find((x) => x.state === 'open');
  return {
    status: j.status,
    ...(j.pauseOn && { pauseOn: j.pauseOn }),
    ...(j.reason && { pausedReason: j.reason }),
    ...(e.startedAt && { startedAt: e.startedAt, entrySurveyDone: !!e.surveys?.entry, surveyDue: due ? { id: due.id, kind: due.kind, dueAt: due.dueAt } : null }),
    ...(e.endsAt && { endsAt: e.endsAt, daysLeft: daysLeft(e, now) }),
  };
}

/** Statuses in which the same contact e-mail may not apply again (the answer stays the same, nothing is stored). */
const OPEN: readonly BetaStatus[] = ['applied', 'invited', 'active', 'overdue', 'paused'];

export interface BetaConfig {
  /** CI_BETA_WEEKS, default 8. */
  weeks: number;
  /** CI_BETA_APPLICATIONS=closed stops new applications. */
  open: boolean;
  /** CI_BETA_PAUSE_AFTER_DAYS, default 7: how long a survey may be past due before analyses pause. */
  pauseAfterDays?: number;
  /** At most this many applications wait for a decision; more are refused (503). */
  maxPending?: number;
}

const list = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

export class BetaEnrollments {
  private all: BetaEnrollment[] = [];
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly backend: Backend,
    readonly cfg: BetaConfig,
  ) {}

  async init() {
    await this.backend.init();
    this.all = list(await this.backend.read('beta-enrollments.json'));
  }

  /** Newest first. */
  enrollments(): BetaEnrollment[] {
    return structuredClone(this.all).reverse();
  }

  forOrg(orgId: string): BetaEnrollment | undefined {
    const e = this.all.find((x) => x.orgId === orgId);
    return e && structuredClone(e);
  }

  /**
   * A new application; `stored` is false when the same contact already has an open one (the caller answers the same,
   * so the form does not tell who applied).
   */
  async apply(application: BetaApplication, at: string): Promise<{ stored: boolean; enrollment?: BetaEnrollment }> {
    return this.serial(async () => {
      if (!this.cfg.open) throw httpError(410, 'Applications for the beta are closed.');
      const email = application.contactEmail.trim().toLowerCase();
      if (this.all.some((e) => OPEN.includes(e.status) && e.application.contactEmail.toLowerCase() === email)) return { stored: false };
      if (this.all.filter((e) => e.status === 'applied').length >= (this.cfg.maxPending ?? 200)) throw httpError(503, 'Too many applications are waiting. Please try again later.');
      const e: BetaEnrollment = {
        id: randomUUID(),
        status: 'applied',
        application: { ...application, contactEmail: application.contactEmail.trim() },
        consents: { terms: true, measurement: true, surveys: true, at },
        appliedAt: at,
        history: [{ at, status: 'applied', by: application.contactName }],
      };
      this.all.push(e);
      await this.save();
      return { stored: true, enrollment: structuredClone(e) };
    });
  }

  /** Checks that the enrollment exists and is in one of `allowed`; returns it (not a copy). */
  private find(id: string, allowed: readonly BetaStatus[]) {
    const e = this.all.find((x) => x.id === id);
    if (!e) throw httpError(404, 'No such application.');
    if (!allowed.includes(e.status)) throw httpError(409, `The application is ${e.status}, not ${allowed.join(' or ')}.`);
    return e;
  }

  /** Before approving: the application must still wait for a decision. */
  check(id: string, allowed: readonly BetaStatus[]): BetaEnrollment {
    return structuredClone(this.find(id, allowed));
  }

  async approve(id: string, o: { orgId: string; workspace: string; invitationId: string; by: string; at: string }) {
    return this.change(id, ['applied'], (e) => {
      Object.assign(e, { status: 'invited', orgId: o.orgId, workspace: o.workspace, invitationId: o.invitationId, invitedAt: o.at });
      e.history.push({ at: o.at, status: 'invited', by: o.by });
    });
  }

  async reject(id: string, o: { by: string; at: string; note?: string }) {
    return this.change(id, ['applied'], (e) => {
      e.status = 'rejected';
      e.history.push({ at: o.at, status: 'rejected', by: o.by, ...(o.note && { note: o.note }) });
    });
  }

  /** A new invitation for an invited team whose link expired or got lost. */
  async reinvite(id: string, o: { invitationId: string; by: string; at: string }) {
    return this.change(id, ['invited'], (e) => {
      Object.assign(e, { invitationId: o.invitationId, invitedAt: o.at });
      e.history.push({ at: o.at, status: 'invited', by: o.by, note: 'invitation sent again' });
    });
  }

  /** The Owner of an invited team joined: the beta starts now and ends after `weeks`. Nothing for other organizations. */
  async joined(orgId: string, by: string, at: string): Promise<BetaEnrollment | undefined> {
    const e = this.all.find((x) => x.orgId === orgId && x.status === 'invited');
    if (!e) return undefined;
    return this.change(e.id, ['invited'], (x) => {
      Object.assign(x, { status: 'active', startedAt: at, endsAt: new Date(Date.parse(at) + this.cfg.weeks * 7 * DAY_MS).toISOString() });
      x.history.push({ at, status: 'active', by });
    });
  }

  /**
   * One person's answers to an open survey of their team. 404 for an unknown survey, 409 before it opens or when this
   * person already answered it, 422 with every problem for invalid answers.
   */
  async answer(enrollmentId: string, surveyId: string, who: { userId: string; name: string }, answers: Record<string, unknown>, at: string): Promise<SurveyAnswer> {
    return this.serial(async () => {
      const e = this.find(enrollmentId, ['active', 'overdue', 'paused', 'ended']);
      const slot = surveyStates(e, Date.parse(at), who.userId).find((x) => x.id === surveyId);
      if (!slot) throw httpError(404, `No survey ${surveyId} in this beta.`);
      if (slot.state === 'upcoming') throw httpError(409, `The survey opens on ${slot.opensAt.slice(0, 10)}.`);
      if (slot.mine) throw httpError(409, 'You already answered this survey.');
      const def = SURVEYS[slot.kind];
      const problems = answerProblems(def, answers);
      if (problems.length) throw Object.assign(httpError(422, `Some answers need attention: ${problems.join('; ')}`), { problems });
      const entry: SurveyAnswer = { enrollmentId: e.id, orgId: e.orgId!, survey: slot.id, kind: slot.kind, version: def.version, userId: who.userId, name: who.name, at, answers: cleanAnswers(def, answers) };
      await this.backend.append('beta-survey-answers', entry);
      const done = (e.surveys ??= {});
      const record = (done[slot.id] ??= { answeredAt: at, by: [] });
      record.by.push(who.userId);
      await this.save();
      return entry;
    });
  }

  /** Records the judged status when it changed (the daily job); returns the enrollment, or undefined when unchanged. */
  async record(id: string, status: BetaStatus, at: string, note?: string): Promise<BetaEnrollment | undefined> {
    return this.serial(async () => {
      const e = this.find(id, ['active', 'overdue', 'paused', 'ended']);
      if (e.status === status) return undefined;
      e.status = status;
      e.history.push({ at, status, by: 'beta job', ...(note && { note }) });
      await this.save();
      return structuredClone(e);
    });
  }

  /** Marks mails as sent or skipped. */
  async markReminders(id: string, keys: string[], at: string) {
    if (!keys.length) return;
    await this.serial(async () => {
      const e = this.find(id, ['active', 'overdue', 'paused', 'ended']);
      e.reminders = { ...e.reminders, ...Object.fromEntries(keys.map((k) => [k, at])) };
      await this.save();
    });
  }

  /** The operator moves the end of the beta by `days` (a team that ended comes back while the new end is ahead). */
  async extend(id: string, o: { days: number; by: string; at: string; reason?: string }) {
    return this.change(id, ['active', 'overdue', 'paused', 'ended'], (e) => {
      e.endsAt = new Date(Date.parse(e.endsAt!) + o.days * DAY_MS).toISOString();
      e.history.push({ at: o.at, status: e.status, by: o.by, note: `beta extended by ${o.days} days to ${e.endsAt.slice(0, 10)}${o.reason ? `: ${o.reason}` : ''}` });
    });
  }

  /** The operator holds off the pause for `days` from now (holiday, a change in the team); a paused team resumes. */
  async grace(id: string, o: { days: number; by: string; at: string; reason?: string }) {
    return this.change(id, ['active', 'overdue', 'paused'], (e) => {
      e.graceUntil = new Date(Date.parse(o.at) + o.days * DAY_MS).toISOString();
      e.history.push({ at: o.at, status: e.status, by: o.by, note: `no pause before ${e.graceUntil.slice(0, 10)}${o.reason ? `: ${o.reason}` : ''}` });
    });
  }

  /** Every answer of one enrollment, oldest first (the operator reads them). */
  async answersOf(enrollmentId: string): Promise<SurveyAnswer[]> {
    return ((await this.backend.tail('beta-survey-answers', 100_000)) as SurveyAnswer[]).filter((a) => a?.enrollmentId === enrollmentId);
  }

  private async change(id: string, allowed: readonly BetaStatus[], fn: (e: BetaEnrollment) => void): Promise<BetaEnrollment> {
    return this.serial(async () => {
      const e = this.find(id, allowed);
      fn(e);
      await this.save();
      return structuredClone(e);
    });
  }

  private save() {
    return this.backend.write('beta-enrollments.json', this.all);
  }

  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => undefined);
    return run;
  }
}

/** At most `limit` applications per address in `windowMs`; in memory, so a restart forgets (enough for a beta). */
export function applicationLimiter(limit = 5, windowMs = 3_600_000) {
  const seen = new Map<string, number[]>();
  return (ip: string, now: number) => {
    const recent = (seen.get(ip) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= limit) return false;
    recent.push(now);
    seen.set(ip, recent);
    if (seen.size > 10_000) for (const [k, v] of seen) if (!v.some((t) => now - t < windowMs)) seen.delete(k);
    return true;
  };
}
