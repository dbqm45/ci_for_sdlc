import type { AcceptanceStats, AnalysisResult, Approval, Decision, DeepPartial, NewDecision, DriftEvent, ImpactReport, ItemAnalysis, Relation, RequirementItem, Settings } from '@ci/core';

export type { AnalysisResult, ItemAnalysis, Decision, DriftEvent, ImpactReport };

export interface ItemDetail {
  item: ItemAnalysis;
  source?: RequirementItem;
  children: Pick<ItemAnalysis, 'key' | 'type' | 'title' | 'health' | 'healthStatus' | 'readiness'>[];
  decisions: Decision[];
  /** Superseded and withdrawn versions. */
  decisionHistory: Decision[];
  approval?: Approval;
  drift: DriftEvent[];
}

export interface GraphData {
  center: string;
  nodes: { id: string; kind: string; source?: string; title: string; url?: string }[];
  edges: Relation[];
}

export interface AuditEntry {
  at: string;
  kind: string;
  actor: string;
  summary: string;
  details?: unknown;
}

export interface HistoryPoint {
  at: string;
  healthy: number;
  needsAttention: number;
  critical: number;
  readiness: number;
  specificationHealth: number;
  decisionDebt: number;
}

const TOKEN_KEY = 'ci.adminToken';
const readToken = () => {
  try {
    return sessionStorage.getItem(TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
};
const saveToken = (t: string) => {
  try {
    if (t) sessionStorage.setItem(TOKEN_KEY, t);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
};

/** How Jira and Confluence are reached: an API token from the environment, or a one-click OAuth connection. */
export type ConnectMode = 'token' | 'oauth';

export interface AtlassianSite {
  id: string;
  name: string;
  url: string;
  scopes: string[];
}

/** GET /api/connections → atlassian. Never contains a token. */
export interface AtlassianStatus {
  mode: ConnectMode;
  configured: boolean;
  missing: string[];
  callbackUrl: string;
  connected: boolean;
  site?: AtlassianSite;
  sites: AtlassianSite[];
  connectedAt?: string;
  connectedBy?: string;
  lastError?: string;
}

/** RFC 9457 problem details returned by the API. */
export interface Problem {
  title?: string;
  status?: number;
  detail?: string;
  errors?: { field: string; message: string }[];
}

/** A non-2xx response; `status` lets callers react (e.g. reload after 412). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly problem: Problem,
  ) {
    super(problem.detail ?? problem.title ?? `HTTP ${status}`);
    this.name = 'ApiError';
  }
}

/** A readable message for anything caught. */
export const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Settings as read, with the ETag to send back as If-Match so concurrent edits are not lost. */
export interface SettingsResponse {
  settings: Settings;
  etag: string;
}

async function req<T>(method: string, url: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  return (await send(method, url, body, headers)).json as T;
}

async function send(method: string, url: string, body?: unknown, headers: Record<string, string> = {}, retried = false): Promise<{ json: unknown; res: Response }> {
  const token = readToken();
  const res = await fetch(url, {
    method,
    headers: {
      ...(body !== undefined && { 'content-type': 'application/json' }),
      ...(method !== 'GET' && { 'x-ci-actor': encodeURIComponent(currentUser()) }),
      ...(token && { authorization: `Bearer ${token}` }),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json: unknown = await res.json().catch(() => ({}));
  if (res.status === 401 && res.headers.get('www-authenticate') && !retried) {
    // The server has CI_ADMIN_TOKEN set: ask once per browser session; the token is never written to disk.
    const t = window.prompt(`${(json as Problem).detail ?? 'This change requires the admin token.'}\nAdmin token:`);
    if (t?.trim()) {
      saveToken(t.trim());
      return send(method, url, body, headers, true);
    }
  }
  if (res.status === 401 && retried) saveToken('');
  if (!res.ok) throw new ApiError(res.status, toProblem(json));
  return { json, res };
}

function toProblem(json: unknown): Problem {
  if (!json || typeof json !== 'object') return {};
  const o = json as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === 'string' ? v : undefined);
  return { title: text(o.title), status: typeof o.status === 'number' ? o.status : undefined, detail: text(o.detail) ?? text(o.error), errors: Array.isArray(o.errors) ? (o.errors as Problem['errors']) : undefined };
}

export const api = {
  analysis: () => req<AnalysisResult & { running: boolean; lastReason?: string }>('GET', '/api/analysis'),
  analyze: () => req<AnalysisResult>('POST', '/api/analyze'),
  item: (key: string) => req<ItemDetail>('GET', `/api/items/${encodeURIComponent(key)}`),
  graph: (key: string) => req<GraphData>('GET', `/api/items/${encodeURIComponent(key)}/graph`),
  aiReview: (key: string) => req<{ item: ItemAnalysis; errors: string[] }>('POST', `/api/items/${encodeURIComponent(key)}/ai-review`),
  approve: (key: string, by: string, force?: { reason: string }) => req<AnalysisResult>('POST', `/api/items/${encodeURIComponent(key)}/approve`, { by, ...(force && { force: true, reason: force.reason }) }),
  unapprove: (key: string) => req<AnalysisResult>('DELETE', `/api/items/${encodeURIComponent(key)}/approve`),
  decide: (d: Omit<NewDecision, 'decidedAt'> & { reason?: string }) => req<{ decision: Decision; item: ItemAnalysis }>('POST', '/api/decisions', d),
  /** Withdraws the decision (it stays in history) and re-opens its finding. Returns undefined when the user cancels. */
  reopen: async (id: string) => {
    const reason = window.prompt('Why re-open this decision? (optional, recorded in the audit log)');
    if (reason === null) return undefined;
    return req<AnalysisResult>('DELETE', `/api/decisions/${encodeURIComponent(id)}`, { by: currentUser(), reason: reason.trim() || undefined });
  },
  decisions: () => req<Decision[]>('GET', '/api/decisions'),
  /** A2a: accept, edit or reject an answer found in a source. */
  answer: (key: string, proposalId: string, action: 'accept' | 'edit' | 'reject', answer?: string) =>
    req<{ decision?: Decision; item?: ItemAnalysis }>('POST', `/api/items/${encodeURIComponent(key)}/answers/${encodeURIComponent(proposalId)}`, { action, ...(answer !== undefined && { answer }), by: currentUser() }),
  /** A2a: reopen an auto-closed finding; the proposal counts as rejected. Returns undefined when the user cancels. */
  reopenAutoClosed: async (id: string) => {
    const reason = window.prompt('Why reopen this auto-closed finding? (optional, recorded in the audit log)');
    if (reason === null) return undefined;
    return req<AnalysisResult>('POST', `/api/decisions/${encodeURIComponent(id)}/reopen`, { by: currentUser(), reason: reason.trim() || undefined });
  },
  acceptance: () => req<AcceptanceStats[]>('GET', '/api/decisions/acceptance'),
  impact: (q: string) => req<ImpactReport>('GET', `/api/impact?q=${encodeURIComponent(q)}`),
  drift: () => req<DriftEvent[]>('GET', '/api/drift'),
  history: () => req<HistoryPoint[]>('GET', '/api/history'),
  audit: () => req<AuditEntry[]>('GET', '/api/audit'),
  rules: () => req<{ id: string; name: string; description: string; appliesTo: string[] }[]>('GET', '/api/rules'),
  settings: async () => {
    const { json, res } = await send('GET', '/api/settings');
    return { ...(json as { settings: Settings; secrets: Record<string, boolean>; defaultModels: Record<string, string>; connectMode: ConnectMode }), etag: res.headers.get('etag') ?? '' };
  },
  /** `etag` is the one returned with the settings being edited; a 412 means someone else saved in between. */
  saveSettings: async (patch: DeepPartial<Settings>, etag: string): Promise<SettingsResponse> => {
    const { json, res } = await send('PUT', '/api/settings', patch, etag ? { 'if-match': etag } : {});
    return { settings: (json as { settings: Settings }).settings, etag: res.headers.get('etag') ?? '' };
  },
  testConnections: () => req<Record<string, string>>('POST', '/api/settings/test-connections'),
  connections: () => req<{ mode: ConnectMode; atlassian: AtlassianStatus }>('GET', '/api/connections'),
  /** The URL of Atlassian's consent page; the browser goes there and comes back to Settings. */
  connectAtlassian: () => req<{ url: string }>('POST', '/api/connections/atlassian/start'),
  selectAtlassianSite: (cloudId: string) => req<AtlassianStatus>('PUT', '/api/connections/atlassian/site', { cloudId }),
  disconnectAtlassian: () => req<AtlassianStatus>('DELETE', '/api/connections/atlassian'),
  scenarios: () => req<{ id: string; title: string; description: string }[]>('GET', '/api/demo/scenarios'),
  applyScenario: (id: string) => req<AnalysisResult>('POST', `/api/demo/scenarios/${id}`),
  resetDemo: () => req<AnalysisResult>('POST', '/api/demo/reset'),
};

const USER_KEY = 'ci.user';
export function currentUser(): string {
  try {
    return localStorage.getItem(USER_KEY) || 'Product Owner';
  } catch {
    return 'Product Owner';
  }
}
export function setCurrentUser(name: string) {
  try {
    localStorage.setItem(USER_KEY, name);
  } catch {
    /* ignore */
  }
}
