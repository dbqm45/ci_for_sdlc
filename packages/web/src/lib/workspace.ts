/**
 * Workspaces in the UI (F5, docs/WORKSPACES-F5-PLAN.md): the address `#/w/<id>/…` names a workspace other than
 * `default`; requests go to `/api/w/<id>/…`, except the ones shared by all workspaces.
 */
export const DEFAULT_WORKSPACE = 'default';

/** Routes of the whole installation, never of one workspace. */
const GLOBAL = ['/api/workspaces', '/api/pdi', '/api/changes', '/api/health', '/api/rules', '/api/openapi.json', '/api/auth', '/api/members', '/api/invitations'];

/** The workspace an address names (none: stay where you are) and the page path inside it. */
export function parseHashPath(path: string): { ws?: string; path: string } {
  const m = /^\/w\/([^/]+)(\/.*)?$/.exec(path);
  if (!m) return { path: path || '/overview' };
  return { ws: decodeURIComponent(m[1]!), path: m[2] && m[2] !== '/' ? m[2] : '/overview' };
}

/** The address of a page in a workspace: unprefixed for `default`. */
export const hashPath = (path: string, ws: string): string => (ws === DEFAULT_WORKSPACE ? path : `/w/${encodeURIComponent(ws)}${path}`);

/** An API URL of the current workspace. */
export function apiUrl(url: string, ws: string): string {
  if (ws === DEFAULT_WORKSPACE || !url.startsWith('/api/')) return url;
  const path = url.split('?')[0]!;
  if (GLOBAL.some((g) => path === g || path.startsWith(`${g}/`))) return url;
  return `/api/w/${encodeURIComponent(ws)}${url.slice(4)}`;
}
