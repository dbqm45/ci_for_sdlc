/** Roles in the organization (docs/ACCOUNTS-PLAN.md), strongest first. */
export type Role = 'owner' | 'admin' | 'member' | 'viewer';
export const ROLES: readonly Role[] = ['owner', 'admin', 'member', 'viewer'];

const RANK: Record<Role, number> = { viewer: 0, member: 1, admin: 2, owner: 3 };
export const atLeast = (role: Role, need: Role) => RANK[role] >= RANK[need];

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
}

/** GET /api/auth/me: how this server authorizes, and who is logged in (accounts mode). */
export interface Me {
  mode: 'token' | 'accounts';
  user: User | null;
}

export const roleLabel = (role: Role) => role[0]!.toUpperCase() + role.slice(1);

/** Accounts mode without a session: show the login screen instead of the app. */
export const showLogin = (me: Me | undefined) => me?.mode === 'accounts' && !me.user;

/** Why a button needing `need` is disabled for this person; undefined when it is not (always in token mode). */
export function disabledReason(me: Me | undefined, need: Role): string | undefined {
  if (me?.mode !== 'accounts' || !me.user || atLeast(me.user.role, need)) return undefined;
  return `Needs the ${roleLabel(need)} role`;
}

/** The message the server put in the address after a refused login (`?login_error=…`). */
export const loginErrorFrom = (search: string) => new URLSearchParams(search).get('login_error') ?? '';

/** The roles this person may give: an Admin every role but Owner, the Owner all. */
export const assignableRoles = (actor: Role): Role[] => (actor === 'owner' ? [...ROLES] : actor === 'admin' ? ROLES.filter((r) => r !== 'owner') : []);

/** Whether this person may change or remove a member with `role`. */
export const canManage = (actor: Role, role: Role) => atLeast(actor, 'admin') && (actor === 'owner' || role !== 'owner');
