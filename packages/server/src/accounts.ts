import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Backend } from './backend.js';
import { ATLASSIAN_AUTH, CALLBACK_PATH, ConnectError, tokenRequest } from './connections.js';
import { httpError } from './http.js';
import { atLeast, type Role } from './roles.js';

/**
 * People, the organization and sessions (docs/ACCOUNTS-PLAN.md), kept in the reserved `_platform` space.
 * Login with Atlassian asks only for `read:me`; the token is used once for `/me` and forgotten.
 */
export const LOGIN_COOKIE = 'ci_oauth_login';
export const SESSION_COOKIE = 'ci_session';
export const ATLASSIAN_ME = 'https://api.atlassian.com/me';

const LOGIN_TTL_MS = 10 * 60_000;
const IDLE_MS = 12 * 3_600_000;
const MAX_AGE_MS = 7 * 24 * 3_600_000;
const TOUCH_MS = 60_000;
const INVITE_TTL_MS = 7 * 24 * 3_600_000;

export const ASK_FOR_INVITATION = 'Ask an administrator for an invitation.';
const LOGIN_EXPIRED = 'The login expired. Please log in again.';
const INVITE_GONE = 'This invitation is no longer valid. Ask an administrator for a new one.';
const INVITE_OTHER_EMAIL = 'This invitation is for a different e-mail address. Log in with that Atlassian account or ask for a new invitation.';

export interface Identity {
  provider: 'atlassian';
  subject: string;
  name: string;
  email: string;
}

interface User extends Identity {
  id: string;
  createdAt: string;
  lastLoginAt: string;
}
interface Org {
  id: string;
  name: string;
  createdAt: string;
}
interface Membership {
  userId: string;
  orgId: string;
  role: Role;
}
interface Invitation {
  id: string;
  hash: string;
  role: InvitedRole;
  email: string;
  invitedBy: string;
  createdAt: string;
  expiresAt: string;
}
interface Session {
  hash: string;
  userId: string;
  createdAt: string;
  lastSeenAt: string;
}

/** Who a session belongs to, with the role as it is now. */
export interface Account {
  userId: string;
  name: string;
  email: string;
  role: Role;
}

export interface Member {
  id: string;
  name: string;
  email: string;
  role: Role;
  lastLoginAt: string;
}

export type InvitedRole = Exclude<Role, 'owner'>;

/** An open invitation as the API shows it: never the token or its hash. */
export interface InvitationView {
  id: string;
  role: InvitedRole;
  email: string;
  invitedBy: string;
  createdAt: string;
  expiresAt: string;
}

/** What `start` remembers about a login until Atlassian sends the browser back. */
interface Pending {
  expiresAt: number;
  bootstrap?: string;
  invite?: string;
}

export interface AccountsConfig {
  enabled: boolean;
  publicUrl: string;
  clientId: string;
  clientSecret: string;
  /** CI_BOOTSTRAP_EMAIL: the Atlassian e-mail of the first Owner. Without it the one-time link from the log is needed. */
  bootstrapEmail?: string;
}

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
const token = () => randomBytes(32).toString('base64url');
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const list = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const view = ({ id, role, email, invitedBy, createdAt, expiresAt }: Invitation): InvitationView => ({ id, role, email, invitedBy, createdAt, expiresAt });

export class Accounts {
  private users: User[] = [];
  private orgs: Org[] = [];
  private memberships: Membership[] = [];
  private sessions: Session[] = [];
  private invitations: Invitation[] = [];
  private readonly pending = new Map<string, Pending>();
  private readonly bootstrapCode = randomBytes(24).toString('base64url');
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly backend: Backend,
    private readonly cfg: AccountsConfig,
  ) {}

  get enabled() {
    return this.cfg.enabled;
  }

  async init() {
    await this.backend.init();
    this.users = list(await this.backend.read('users.json'));
    this.orgs = list(await this.backend.read('orgs.json'));
    this.memberships = list(await this.backend.read('memberships.json'));
    this.sessions = list(await this.backend.read('sessions.json'));
    this.invitations = list(await this.backend.read('invitations.json'));
  }

  /** The one-time link for the first Owner, while there is nobody and no CI_BOOTSTRAP_EMAIL. */
  bootstrapLink(): string | undefined {
    if (!this.cfg.enabled || this.cfg.bootstrapEmail || this.users.length) return undefined;
    return `${this.cfg.publicUrl}/api/auth/login?bootstrap=${this.bootstrapCode}`;
  }

  private secure() {
    return this.cfg.publicUrl.startsWith('https://') ? '; Secure' : '';
  }
  loginCookie(value: string, maxAgeSeconds = LOGIN_TTL_MS / 1000) {
    return `${LOGIN_COOKIE}=${value}; Path=${CALLBACK_PATH}; Max-Age=${maxAgeSeconds}; HttpOnly; SameSite=Lax${this.secure()}`;
  }
  sessionCookie(id: string, maxAgeSeconds?: number) {
    return `${SESSION_COOKIE}=${id}; Path=/;${maxAgeSeconds === undefined ? '' : ` Max-Age=${maxAgeSeconds};`} HttpOnly; SameSite=Lax${this.secure()}`;
  }

  /** Where to send the browser, and the cookie that ties the answer to this browser. */
  start(opts: { bootstrap?: string; invite?: string } = {}) {
    const now = Date.now();
    for (const [k, v] of this.pending) if (v.expiresAt < now) this.pending.delete(k);
    const state = token();
    this.pending.set(state, { expiresAt: now + LOGIN_TTL_MS, ...opts });
    const url = new URL(`${ATLASSIAN_AUTH}/authorize`);
    url.search = new URLSearchParams({
      audience: 'api.atlassian.com',
      client_id: this.cfg.clientId,
      scope: 'read:me',
      redirect_uri: this.cfg.publicUrl + CALLBACK_PATH,
      state,
      response_type: 'code',
      prompt: 'consent',
    }).toString();
    return { url: url.toString(), cookie: this.loginCookie(state) };
  }

  issued(state: string | undefined) {
    return !!state && this.pending.has(state);
  }

  /**
   * Finishes a login; returns the new session id and, when an invitation let a new person in, who joined.
   * Errors are ConnectError with a message for the login screen.
   */
  async complete(q: { code?: string; state?: string; error?: string; cookieState?: string }): Promise<{ id: string; joined?: { name: string; role: InvitedRole } }> {
    const p = q.state ? this.pending.get(q.state) : undefined;
    if (q.state) this.pending.delete(q.state);
    if (!p || !q.cookieState || !same(q.cookieState, q.state!) || p.expiresAt < Date.now()) throw new ConnectError('login_expired', LOGIN_EXPIRED);
    if (q.error || !q.code) throw new ConnectError('login_denied', 'The login was cancelled at Atlassian.');
    const tokens = await tokenRequest({ grant_type: 'authorization_code', client_id: this.cfg.clientId, client_secret: this.cfg.clientSecret, code: q.code, redirect_uri: this.cfg.publicUrl + CALLBACK_PATH }).catch(() => {
      throw new ConnectError('login_failed', 'Atlassian did not accept the login. Please log in again.');
    });
    const me = await this.fetchMe(tokens.accessToken);
    return this.serial(async () => {
      const now = new Date().toISOString();
      let joined: { name: string; role: InvitedRole } | undefined;
      let user = this.users.find((u) => u.provider === 'atlassian' && u.subject === me.subject);
      if (user && this.memberships.some((m) => m.userId === user!.id)) {
        Object.assign(user, { name: me.name, email: me.email, lastLoginAt: now });
      } else if (p.invite && this.orgs.length) {
        const inv = this.redeem(p.invite, me);
        if (user) Object.assign(user, { name: me.name, email: me.email, lastLoginAt: now });
        else this.users.push((user = { id: randomUUID(), ...me, createdAt: now, lastLoginAt: now }));
        this.memberships.push({ userId: user.id, orgId: this.orgs[0]!.id, role: inv.role });
        joined = { name: user.name, role: inv.role };
        await this.backend.write('invitations.json', this.invitations);
        await this.backend.write('memberships.json', this.memberships);
      } else if (!this.users.length && this.mayBootstrap(me, p.bootstrap)) {
        const org: Org = { id: randomUUID(), name: 'Organization', createdAt: now };
        user = { id: randomUUID(), ...me, createdAt: now, lastLoginAt: now };
        this.orgs.push(org);
        this.users.push(user);
        this.memberships.push({ userId: user.id, orgId: org.id, role: 'owner' });
        await this.backend.write('orgs.json', this.orgs);
        await this.backend.write('memberships.json', this.memberships);
      } else {
        throw new ConnectError('not_invited', ASK_FOR_INVITATION);
      }
      await this.backend.write('users.json', this.users);
      const id = token();
      this.sessions.push({ hash: sha256(id), userId: user.id, createdAt: now, lastSeenAt: now });
      await this.backend.write('sessions.json', this.sessions);
      return { id, joined };
    });
  }

  /** Uses up the invitation behind `inviteToken` for this person, or throws the message for the login screen. */
  private redeem(inviteToken: string, me: Identity): Invitation {
    const hash = sha256(inviteToken);
    const inv = this.invitations.find((x) => same(x.hash, hash));
    if (!inv || Date.parse(inv.expiresAt) < Date.now()) throw new ConnectError('invitation_invalid', INVITE_GONE);
    if (inv.email && me.email && inv.email.toLowerCase() !== me.email.toLowerCase()) throw new ConnectError('invitation_email', INVITE_OTHER_EMAIL);
    this.invitations = this.invitations.filter((x) => x !== inv);
    return inv;
  }

  /** A new one-time invitation; the link carries the only copy of its token. */
  async invite(by: string, role: InvitedRole, email = ''): Promise<InvitationView & { link: string }> {
    return this.serial(async () => {
      const now = Date.now();
      const secret = token();
      const inv: Invitation = { id: randomUUID(), hash: sha256(secret), role, email: email.trim(), invitedBy: by, createdAt: new Date(now).toISOString(), expiresAt: new Date(now + INVITE_TTL_MS).toISOString() };
      this.invitations = this.invitations.filter((x) => Date.parse(x.expiresAt) >= now);
      this.invitations.push(inv);
      await this.backend.write('invitations.json', this.invitations);
      return { ...view(inv), link: `${this.cfg.publicUrl}/api/auth/login?invite=${secret}` };
    });
  }

  /** Invitations that can still be used, newest first. */
  openInvitations(): InvitationView[] {
    const now = Date.now();
    return this.invitations
      .filter((x) => Date.parse(x.expiresAt) >= now)
      .map(view)
      .reverse();
  }

  /** Revokes an invitation; returns it. */
  async revoke(id: string): Promise<InvitationView> {
    return this.serial(async () => {
      const inv = this.invitations.find((x) => x.id === id);
      if (!inv) throw httpError(404, 'No such invitation.');
      this.invitations = this.invitations.filter((x) => x !== inv);
      await this.backend.write('invitations.json', this.invitations);
      return view(inv);
    });
  }

  private mayBootstrap(me: Identity, code: string | undefined) {
    const email = this.cfg.bootstrapEmail?.trim().toLowerCase();
    if (email) return !!me.email && me.email.toLowerCase() === email;
    return !!code && same(code, this.bootstrapCode);
  }

  private async fetchMe(accessToken: string): Promise<Identity> {
    const res = await fetch(ATLASSIAN_ME, { headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' } }).catch(() => undefined);
    const json = (res?.ok ? await res.json().catch(() => undefined) : undefined) as Record<string, unknown> | undefined;
    const subject = typeof json?.account_id === 'string' ? json.account_id.trim() : '';
    if (!subject) throw new ConnectError('login_failed', 'Atlassian did not say who you are. Please log in again.');
    const str = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, 200) : '');
    return { provider: 'atlassian', subject, name: str(json!.name) || subject, email: str(json!.email) };
  }

  /** The account behind a session id, or undefined when it is unknown, expired or its person was removed. */
  async session(id: string | undefined): Promise<Account | undefined> {
    if (!id) return undefined;
    const hash = sha256(id);
    const s = this.sessions.find((x) => same(x.hash, hash));
    if (!s) return undefined;
    const now = Date.now();
    const membership = this.memberships.find((m) => m.userId === s.userId);
    const user = this.users.find((u) => u.id === s.userId);
    if (!membership || !user || now - Date.parse(s.lastSeenAt) > IDLE_MS || now - Date.parse(s.createdAt) > MAX_AGE_MS) {
      await this.serial(() => this.dropSessions((x) => x === s));
      return undefined;
    }
    if (now - Date.parse(s.lastSeenAt) > TOUCH_MS) {
      s.lastSeenAt = new Date(now).toISOString();
      await this.serial(() => this.backend.write('sessions.json', this.sessions));
    }
    return { userId: user.id, name: user.name, email: user.email, role: membership.role };
  }

  async logout(id: string | undefined) {
    if (!id) return;
    const hash = sha256(id);
    await this.serial(() => this.dropSessions((s) => s.hash === hash));
  }

  /** Adds a person with a role directly, without an invitation (used by tests). */
  async admit(identity: Identity, role: Role) {
    return this.serial(async () => {
      const now = new Date().toISOString();
      const orgId = this.orgs[0]?.id ?? '';
      let user = this.users.find((u) => u.provider === identity.provider && u.subject === identity.subject);
      if (!user) {
        user = { id: randomUUID(), ...identity, createdAt: now, lastLoginAt: '' };
        this.users.push(user);
      }
      this.memberships = this.memberships.filter((m) => m.userId !== user!.id);
      this.memberships.push({ userId: user.id, orgId, role });
      await this.backend.write('users.json', this.users);
      await this.backend.write('memberships.json', this.memberships);
      return user.id;
    });
  }

  members(): Member[] {
    return this.memberships.flatMap((m) => {
      const u = this.users.find((x) => x.id === m.userId);
      return u ? [{ id: u.id, name: u.name, email: u.email, role: m.role, lastLoginAt: u.lastLoginAt }] : [];
    });
  }

  /** Changes a role; returns the person's name. Admins never touch the Owner role; the last Owner stays. */
  async setRole(actor: Role, id: string, role: Role) {
    return this.serial(async () => {
      const m = this.checkChange(actor, id, role);
      m.role = role;
      await this.backend.write('memberships.json', this.memberships);
      return this.users.find((u) => u.id === id)!.name;
    });
  }

  /** Removes a person and their sessions; returns their name. */
  async remove(actor: Role, id: string) {
    return this.serial(async () => {
      this.checkChange(actor, id);
      const name = this.users.find((u) => u.id === id)!.name;
      this.memberships = this.memberships.filter((m) => m.userId !== id);
      this.users = this.users.filter((u) => u.id !== id);
      await this.backend.write('memberships.json', this.memberships);
      await this.backend.write('users.json', this.users);
      await this.dropSessions((s) => s.userId === id);
      return name;
    });
  }

  private checkChange(actor: Role, id: string, role?: Role) {
    const m = this.memberships.find((x) => x.userId === id);
    if (!m || !this.users.some((u) => u.id === id)) throw httpError(404, 'No such member.');
    if (!atLeast(actor, 'owner') && (m.role === 'owner' || role === 'owner')) throw httpError(403, 'Only an Owner can give or take the Owner role.');
    if (m.role === 'owner' && role !== 'owner' && this.memberships.filter((x) => x.role === 'owner').length === 1) throw httpError(409, 'The organization needs at least one Owner. Make someone else Owner first.');
    return m;
  }

  private async dropSessions(drop: (s: Session) => boolean) {
    const before = this.sessions.length;
    this.sessions = this.sessions.filter((s) => !drop(s));
    if (this.sessions.length !== before) await this.backend.write('sessions.json', this.sessions);
  }

  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => undefined);
    return run;
  }
}
