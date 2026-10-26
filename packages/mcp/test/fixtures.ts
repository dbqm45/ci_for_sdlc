import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

// A stand-in for ci_for_sdlc's REST API: canned answers per path, and every request it saw.

export interface Canned {
  status?: number;
  body?: unknown;
  /** Sent as is, instead of JSON of `body`. */
  raw?: string;
  headers?: Record<string, string>;
}

export interface FakeApi {
  url: string;
  requests: { path: string; headers: IncomingMessage['headers'] }[];
  close: () => Promise<void>;
}

export async function fakeApi(routes: Record<string, Canned | (() => Canned)>): Promise<FakeApi> {
  const requests: FakeApi['requests'] = [];
  const server: Server = createServer((req, res) => {
    requests.push({ path: req.url ?? '', headers: req.headers });
    const route = routes[req.url ?? ''];
    const c: Canned = typeof route === 'function' ? route() : (route ?? { status: 404, body: { status: 404, detail: `No route ${req.url}` } });
    const json = c.raw === undefined;
    res.writeHead(c.status ?? 200, { 'content-type': json ? (c.status ?? 200) >= 400 ? 'application/problem+json' : 'application/json' : 'text/plain', ...c.headers });
    res.end(json ? JSON.stringify(c.body) : c.raw);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}`, requests, close: () => new Promise((resolve) => server.close(() => resolve())) };
}

const finding = (over: Record<string, unknown>) => ({
  id: 'f1',
  ruleId: 'REQ-001',
  itemKey: 'TSK-57',
  category: 'GAP',
  severity: 'critical',
  dimension: 'requirements',
  title: 'No acceptance criteria',
  explanation: 'The story has no acceptance criteria.',
  evidence: [{ source: 'jira', entityId: 'jira:TSK-57', title: 'TSK-57 — Retry', url: 'https://jira.example.com/browse/TSK-57', excerpt: 'long text' }],
  question: { text: 'What must be true when the customer retries?', options: ['Product will add criteria'], topic: 'requirements' },
  status: 'open',
  origin: 'rule',
  blocks: true,
  ...over,
});

const item = (key: string, over: Record<string, unknown> = {}) => ({
  key,
  type: 'story',
  title: `Item ${key}`,
  url: `https://jira.example.com/browse/${key}`,
  health: 90,
  healthStatus: 'healthy',
  readiness: 'ready',
  blockingIssues: [],
  dimensions: [{ dimension: 'requirements', score: 90, status: 'ok', notes: [] }],
  findings: [],
  context: { requirements: [], documents: [], frames: [], decisions: [] },
  claims: [{ id: 'c1' }],
  traits: ['network'],
  challenges: [],
  checklist: [],
  ...over,
});

/** GET /api/analysis: a change CHG-12 with two slices, and a Jira story outside it. */
export const ANALYSIS = {
  id: 'run-1',
  project: { key: 'PAY', name: 'Payments' },
  analyzedAt: '2026-10-26T10:00:00.000Z',
  durationMs: 120,
  running: false,
  lastReason: 'manual',
  counts: { epics: 1, features: 0, stories: 3, bugs: 0, tasks: 0, healthy: 2, needsAttention: 1, critical: 1, warnings: 2, criticalFindings: 1 },
  metrics: { specificationHealth: 71, designCoverage: 50, journeyCoverage: 60, documentationConsistency: 80, readiness: 50, drift: 0, decisionDebt: { critical: 1, important: 0, minor: 2, topics: [{ topic: 'requirements', count: 1 }] } },
  topRisks: [{ key: 'TSK-57', title: 'Retry', reason: 'No acceptance criteria', severity: 'critical' }],
  domains: [],
  drift: [],
  ai: { enabled: false, errors: [] },
  items: [
    item('CHG-12', { type: 'epic', title: 'Retry failed payments', readiness: 'needs_attention', healthStatus: 'needs_attention', health: 70, blockingIssues: ['1 of 2 stories not ready (TSK-57)'] }),
    item('TSK-57', { epicKey: 'CHG-12', title: 'Customer retries a failed payment', readiness: 'not_ready', healthStatus: 'critical', health: 40, blockingIssues: ['No acceptance criteria'], findings: [finding({}), finding({ id: 'f2', ruleId: 'DES-001', severity: 'warning', title: 'No design', blocks: undefined, question: undefined }), finding({ id: 'f3', status: 'resolved', title: 'Resolved one' })] }),
    item('TSK-58', { epicKey: 'CHG-12', title: 'Idempotency key' }),
    item('PAY-123', { title: 'Saved cards' }),
  ],
};

/** GET /api/items/TSK-57 */
export const ITEM = {
  item: { ...ANALYSIS.items[1], challenges: [{ id: 'ch1', question: { text: 'What if the card expired?', options: [], topic: 'errors' }, rationale: 'r', answered: false, origin: 'rule' }, { id: 'ch2', question: { text: 'Answered one', options: [], topic: 'x' }, rationale: 'r', answered: true, origin: 'rule' }] },
  source: { key: 'TSK-57', type: 'story', title: 'Customer retries a failed payment', description: 'As a customer…', status: 'In Progress', labels: ['change:CHG-12'] },
  children: [],
  decisions: [{ id: 'd1', questionId: 'q1', findingId: 'f9', itemKey: 'TSK-57', topic: 'retry limit', question: 'How many retries?', answer: 'Up to 3', decidedBy: 'Ann', decidedAt: '2026-10-25T09:00:00.000Z', effect: 'resolved', version: 1, status: 'active' }],
  decisionHistory: [],
  approval: { itemKey: 'TSK-57', approvedAt: '2026-10-24T09:00:00.000Z', approvedBy: 'Bob', contextHashes: { 'jira:TSK-57': 'abc' } },
  drift: [{ id: 'dr1', at: '2026-10-25T10:00:00.000Z', kind: 'changed', entityId: 'confluence:1', entityTitle: 'Retry spec', summary: 'Timeout changed', impactedItems: ['TSK-57'], severity: 'warning' }],
};

export const DECISIONS = [
  ITEM.decisions[0],
  { ...ITEM.decisions[0], id: 'd0', answer: 'Up to 5', status: 'superseded', supersededBy: 'd1', supersededAt: '2026-10-25T09:00:00.000Z' },
  { ...ITEM.decisions[0], id: 'd2', itemKey: 'PAY-123', question: 'Max cards?', answer: '5' },
];

export const DRIFT = Array.from({ length: 30 }, (_, i) => ({ id: `dr${i}`, at: `2026-10-${String(26 - (i % 20)).padStart(2, '0')}T10:00:00.000Z`, kind: 'changed', entityId: 'confluence:1', entityTitle: 'Spec', summary: `Change ${i}`, impactedItems: i % 2 ? ['TSK-57'] : ['PAY-123'], severity: 'warning' }));
