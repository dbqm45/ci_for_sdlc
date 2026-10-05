import type { AnalysisResult, Approval, Decision, DriftEvent, ImpactReport, ItemAnalysis, Relation, RequirementItem } from '@ci/core';

export type { AnalysisResult, ItemAnalysis, Decision, DriftEvent, ImpactReport };

export interface ItemDetail {
  item: ItemAnalysis;
  source?: RequirementItem;
  children: Pick<ItemAnalysis, 'key' | 'type' | 'title' | 'health' | 'healthStatus' | 'readiness'>[];
  decisions: Decision[];
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

async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error ?? `HTTP ${res.status}`);
  return json as T;
}

export const api = {
  analysis: () => req<AnalysisResult & { running: boolean; lastReason?: string }>('GET', '/api/analysis'),
  analyze: () => req<AnalysisResult>('POST', '/api/analyze'),
  item: (key: string) => req<ItemDetail>('GET', `/api/items/${encodeURIComponent(key)}`),
  graph: (key: string) => req<GraphData>('GET', `/api/items/${encodeURIComponent(key)}/graph`),
  aiReview: (key: string) => req<{ item: ItemAnalysis; errors: string[] }>('POST', `/api/items/${encodeURIComponent(key)}/ai-review`),
  approve: (key: string, by: string) => req<AnalysisResult>('POST', `/api/items/${encodeURIComponent(key)}/approve`, { by }),
  unapprove: (key: string) => req<AnalysisResult>('DELETE', `/api/items/${encodeURIComponent(key)}/approve`),
  decide: (d: Omit<Decision, 'id' | 'decidedAt'>) => req<{ decision: Decision; item: ItemAnalysis }>('POST', '/api/decisions', d),
  reopen: (id: string) => req<AnalysisResult>('DELETE', `/api/decisions/${encodeURIComponent(id)}`),
  decisions: () => req<Decision[]>('GET', '/api/decisions'),
  impact: (q: string) => req<ImpactReport>('GET', `/api/impact?q=${encodeURIComponent(q)}`),
  drift: () => req<DriftEvent[]>('GET', '/api/drift'),
  history: () => req<HistoryPoint[]>('GET', '/api/history'),
  audit: () => req<AuditEntry[]>('GET', '/api/audit'),
  rules: () => req<{ id: string; name: string; description: string; appliesTo: string[] }[]>('GET', '/api/rules'),
  settings: () => req<{ settings: any; secrets: Record<string, boolean>; defaultModels: Record<string, string> }>('GET', '/api/settings'),
  saveSettings: (patch: unknown) => req<{ settings: any }>('PUT', '/api/settings', patch),
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
