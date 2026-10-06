import type { AnalysisResult, Approval, Decision, NewDecision, DriftEvent, ImpactReport, ItemAnalysis, Relation, RequirementItem } from '@ci/core';

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

/** ETag of the settings last read, sent back as If-Match so concurrent edits are not lost. */
let settingsEtag = '';

/** RFC 9457 problem details returned by the API. */
interface Problem {
  title?: string;
  status?: number;
  detail?: string;
  errors?: { field: string; message: string }[];
}

async function req<T>(method: string, url: string, body?: unknown, headers: Record<string, string> = {}, retried = false): Promise<T> {
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
  if (url === '/api/settings' && res.headers.get('etag')) settingsEtag = res.headers.get('etag')!;
  const json = await res.json().catch(() => ({}));
  if (res.status === 401 && res.headers.get('www-authenticate') && !retried) {
    // The server has CI_ADMIN_TOKEN set: ask once per browser session; the token is never written to disk.
    const t = window.prompt(`${(json as Problem).detail ?? 'This change requires the admin token.'}\nAdmin token:`);
    if (t?.trim()) {
      saveToken(t.trim());
      return req<T>(method, url, body, headers, true);
    }
  }
  if (res.status === 401 && retried) saveToken('');
  if (!res.ok) {
    const p = json as Problem & { error?: string };
    throw new Error(p.detail ?? p.error ?? p.title ?? `HTTP ${res.status}`);
  }
  return json as T;
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
  impact: (q: string) => req<ImpactReport>('GET', `/api/impact?q=${encodeURIComponent(q)}`),
  drift: () => req<DriftEvent[]>('GET', '/api/drift'),
  history: () => req<HistoryPoint[]>('GET', '/api/history'),
  audit: () => req<AuditEntry[]>('GET', '/api/audit'),
  rules: () => req<{ id: string; name: string; description: string; appliesTo: string[] }[]>('GET', '/api/rules'),
  settings: () => req<{ settings: any; secrets: Record<string, boolean>; defaultModels: Record<string, string> }>('GET', '/api/settings'),
  saveSettings: (patch: unknown) => req<{ settings: any }>('PUT', '/api/settings', patch, settingsEtag ? { 'if-match': settingsEtag } : {}),
  testConnections: () => req<Record<string, string>>('POST', '/api/settings/test-connections'),
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
