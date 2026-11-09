import type { Mail, Mailer } from './mailer.js';

/**
 * The local beta walkthrough (docs/BETA-LOCAL.md, TODO "Lokalny przebieg całej bety"): with CI_BETA_LOCAL=1 the server
 * offers a fake login (any person, no Atlassian), keeps mails in an in-app mailbox instead of sending them, and lets
 * the clock move forward, so the whole beta (application, approval, surveys, reminders, pause, end) can be walked
 * through in minutes. It refuses to start this mode anywhere but on loopback outside production.
 */
export interface LocalBetaCheck {
  enabled: boolean;
  /** Why CI_BETA_LOCAL=1 was refused; the server does not start then. */
  refused?: string;
}

const LOOPBACK_URL = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\/?$/;
const LOOPBACK_HOST = new Set(['127.0.0.1', 'localhost', '::1']);

/** Whether the local beta mode is on, and when it was asked for but is not allowed, why. */
export function localBetaMode(env: Record<string, string | undefined>, o: { publicUrl: string; authMode: string }): LocalBetaCheck {
  if (env.CI_BETA_LOCAL !== '1') return { enabled: false };
  if (env.NODE_ENV === 'production') return { enabled: false, refused: 'CI_BETA_LOCAL=1 is for a local walkthrough only, never with NODE_ENV=production.' };
  if (!LOOPBACK_URL.test(o.publicUrl)) return { enabled: false, refused: `CI_BETA_LOCAL=1 needs CI_PUBLIC_URL on localhost, not ${o.publicUrl}.` };
  if (!LOOPBACK_HOST.has(env.HOST ?? '127.0.0.1')) return { enabled: false, refused: `CI_BETA_LOCAL=1 needs HOST on loopback (127.0.0.1), not ${env.HOST}.` };
  if (o.authMode !== 'accounts') return { enabled: false, refused: 'CI_BETA_LOCAL=1 needs CI_AUTH_MODE=accounts.' };
  return { enabled: true };
}

/** Mails kept in memory for the in-app mailbox, newest first; at most 300. */
export class MemoryMailer implements Mailer {
  readonly kind = 'test';
  readonly mails: (Mail & { at: string; id: number })[] = [];
  private next = 1;
  async send(m: Mail) {
    this.mails.unshift({ ...m, at: new Date().toISOString(), id: this.next++ });
    this.mails.splice(300);
  }
}

/**
 * A clock that can move forward for the walkthrough: replaces the global `Date` so `Date.now()` and `new Date()`
 * (sessions, the beta's days, surveys, reminders) all see the moved time. Only for the local mode; `restore()` puts
 * the real clock back.
 */
export function shiftedClock() {
  const Real = globalThis.Date;
  let offsetMs = 0;
  class Shifted extends Real {
    constructor(...args: unknown[]) {
      if (args.length === 0) super(Real.now() + offsetMs);
      else super(...(args as [string | number | Date]));
    }
    static override now() {
      return Real.now() + offsetMs;
    }
  }
  globalThis.Date = Shifted as DateConstructor;
  return {
    get offsetMs() {
      return offsetMs;
    },
    /** Moves the clock forward (never back: a beta's history only moves on). */
    forward(ms: number) {
      offsetMs += Math.max(0, ms);
    },
    restore() {
      globalThis.Date = Real;
    },
  };
}

/** The people offered on the local login screen: the operator, a beta team's Owner and a member. */
export const LOCAL_PEOPLE = [
  { name: 'Olga Operator', email: 'operator@quorum.local', note: 'Operator of the installation (approves applications)' },
  { name: 'Bea Beta', email: 'bea@beta.local', note: "The beta team's contact and Owner (apply with this e-mail)" },
  { name: 'Ben Beta', email: 'ben@beta.local', note: 'A member the Owner invites' },
] as const;
