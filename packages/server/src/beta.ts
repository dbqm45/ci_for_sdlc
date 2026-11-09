import { randomUUID } from 'node:crypto';
import type { Backend } from './backend.js';
import { httpError } from './http.js';

/**
 * Closed beta enrollment (T10, docs/BETA-ENROLLMENT-PLAN.md, first PR): a team applies through a public form, an
 * operator approves it, which opens an organization with a one-time Owner invitation, and the beta runs for a fixed
 * time from the moment the Owner joins. Kept in the reserved `_platform` space as `beta-enrollments.json`.
 * Surveys and the daily job (reminders, pause, end) come in the next PRs.
 */
export type BetaStatus = 'applied' | 'rejected' | 'invited' | 'active' | 'ended';
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
}

/** How the beta looks to its team (GET /api/auth/me). */
export interface BetaView {
  status: BetaStatus;
  startedAt?: string;
  endsAt?: string;
  daysLeft?: number;
}

const DAY_MS = 24 * 3_600_000;

/** The status as of `now`: an active beta past its end has ended, even before the daily job records it. */
export function statusAt(e: Pick<BetaEnrollment, 'status' | 'endsAt'>, now: number): BetaStatus {
  return e.status === 'active' && e.endsAt && Date.parse(e.endsAt) <= now ? 'ended' : e.status;
}

/** Whole days until the end, rounded up (the last day counts as 1); 0 once it ended; undefined before it started. */
export function daysLeft(e: Pick<BetaEnrollment, 'endsAt'>, now: number): number | undefined {
  if (!e.endsAt) return undefined;
  return Math.max(0, Math.ceil((Date.parse(e.endsAt) - now) / DAY_MS));
}

export function betaView(e: BetaEnrollment, now: number): BetaView {
  const status = statusAt(e, now);
  return { status, ...(e.startedAt && { startedAt: e.startedAt }), ...(e.endsAt && { endsAt: e.endsAt, daysLeft: daysLeft(e, now) }) };
}

/** Statuses in which the same contact e-mail may not apply again (the answer stays the same, nothing is stored). */
const OPEN: readonly BetaStatus[] = ['applied', 'invited', 'active'];

export interface BetaConfig {
  /** CI_BETA_WEEKS, default 8. */
  weeks: number;
  /** CI_BETA_APPLICATIONS=closed stops new applications. */
  open: boolean;
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
