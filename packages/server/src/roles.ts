/** Roles in the organization (docs/ACCOUNTS-PLAN.md), strongest last. */
export type Role = 'owner' | 'admin' | 'member' | 'viewer';
export const ROLES: Role[] = ['owner', 'admin', 'member', 'viewer'];

const RANK: Record<Role, number> = { viewer: 0, member: 1, admin: 2, owner: 3 };
export const atLeast = (role: Role, need: Role) => RANK[role] >= RANK[need];

/**
 * The least role each state-changing route needs, by method and path after `/api` or `/api/w/<ws>`.
 * `:x` matches one segment. A route that changes state and is not listed needs Owner; reads need Viewer.
 */
const ROUTE_ROLES: Record<string, Role> = {
  // Member: analysis, decisions, approvals, answers.
  'POST /analyze': 'member',
  'POST /items/:key/ai-review': 'member',
  'POST /items/:key/approve': 'member',
  'DELETE /items/:key/approve': 'member',
  'POST /decisions': 'member',
  'DELETE /decisions/:id': 'member',
  'POST /decisions/:id/reopen': 'member',
  'POST /items/:key/answers/:proposalId': 'member',
  'POST /changes/:change/request-approval': 'member',
  // Admin: settings, connections, demo data, workspaces, members.
  'PUT /settings': 'admin',
  'POST /settings/test-connections': 'admin',
  'POST /connections/atlassian/start': 'admin',
  'PUT /connections/atlassian/site': 'admin',
  'DELETE /connections/atlassian': 'admin',
  'POST /demo/scenarios/:id': 'admin',
  'POST /demo/reset': 'admin',
  'POST /workspaces': 'admin',
  'PATCH /workspaces/:ws': 'admin',
  'DELETE /workspaces/:ws': 'admin',
  'GET /members': 'admin',
  'PATCH /members/:id': 'admin',
  'DELETE /members/:id': 'admin',
  // Anyone logged in.
  'POST /auth/logout': 'viewer',
};

const TABLE = Object.entries(ROUTE_ROLES).map(([k, role]) => {
  const [method, path] = k.split(' ') as [string, string];
  return { method, segments: path.split('/').filter(Boolean), role };
});

/** The path inside a workspace: `/api/w/team-a/items?x` → `items`. */
function segmentsOf(url: string) {
  const path = url.split('?')[0]!;
  const rest = /^\/api\/w\/[^/]+(\/.*)?$/.exec(path)?.[1] ?? (path.startsWith('/api') ? path.slice(4) : path);
  return rest.split('/').filter(Boolean);
}

/** The role listed for this route, or undefined. Works with request URLs and with OpenAPI paths (`{id}`). */
export function explicitRole(method: string, url: string): Role | undefined {
  const segs = segmentsOf(url);
  const m = method.toUpperCase();
  return TABLE.find((r) => r.method === m && r.segments.length === segs.length && r.segments.every((s, i) => (s.startsWith(':') ? segs[i] !== '' : s === segs[i])))?.role;
}

export function requiredRole(method: string, url: string): Role {
  return explicitRole(method, url) ?? (method === 'GET' || method === 'HEAD' ? 'viewer' : 'owner');
}
