import { afterEach, describe, expect, it } from 'vitest';
import { createServer } from '../src/lib.js';
import { ANALYSIS, DECISIONS, DRIFT, ITEM, fakeApi, type Canned, type FakeApi } from './fixtures.js';

// The MCP server against a local stand-in of ci_for_sdlc's REST API (K-1, docs/MCP-K1-PLAN.md): the paths and
// headers it sends, the compact answers it gives the model, and refusals as tool errors.

let api: FakeApi | undefined;
afterEach(async () => {
  await api?.close();
  api = undefined;
});

type ToolAnswer = { result: { isError?: boolean; content: { type: string; text: string }[]; structuredContent?: any } };
async function tool(routes: Record<string, Canned | (() => Canned)>, name: string, args?: unknown, env: Record<string, string> = {}): Promise<ToolAnswer['result']> {
  api = await fakeApi(routes);
  const server = createServer({ env: { CI_SDLC_URL: api.url, ...env } });
  const res = (await server.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })) as ToolAnswer;
  return res.result;
}

describe('readiness tools', () => {
  it('CL-01: get_readiness_summary reads /api/analysis without credentials and answers compactly, as JSON text and structured', async () => {
    const r = await tool({ '/api/analysis': { body: ANALYSIS } }, 'get_readiness_summary');
    expect(api!.requests).toEqual([{ path: '/api/analysis', headers: expect.objectContaining({ accept: 'application/json' }) }]);
    expect(api!.requests[0]!.headers.authorization).toBeUndefined();
    expect(r.isError).toBeUndefined();
    expect(JSON.parse(r.content[0]!.text)).toEqual(r.structuredContent);
    const s = r.structuredContent;
    expect(s).toMatchObject({ project: { key: 'PAY', name: 'Payments' }, analyzedAt: '2026-10-26T10:00:00.000Z', running: false, counts: ANALYSIS.counts, total: 4, truncated: false, filter: {} });
    expect(s.metrics).toEqual({ readiness: 50, specificationHealth: 71, designCoverage: 50, journeyCoverage: 60, documentationConsistency: 80, decisionDebt: { critical: 1, important: 0, minor: 2 } });
    expect(s.topRisks).toEqual(ANALYSIS.topRisks);
    expect(s.items[1]).toEqual({ key: 'TSK-57', type: 'story', title: 'Customer retries a failed payment', url: 'https://jira.example.com/browse/TSK-57', epicKey: 'CHG-12', readiness: 'not_ready', health: 40, healthStatus: 'critical', blockingIssues: ['No acceptance criteria'], openFindings: 2 });
    expect(JSON.stringify(s)).not.toMatch(/claims|checklist|dimensions|context/);
  });

  it('CL-02: the summary filters by change (the change and its items), readiness and type, and caps the list at 100', async () => {
    const change = await tool({ '/api/analysis': { body: ANALYSIS } }, 'get_readiness_summary', { change: 'CHG-12' });
    expect(change.structuredContent.items.map((i: { key: string }) => i.key)).toEqual(['CHG-12', 'TSK-57', 'TSK-58']);
    expect(change.structuredContent.filter).toEqual({ change: 'CHG-12' });
    await api!.close();
    const notReady = await tool({ '/api/analysis': { body: ANALYSIS } }, 'get_readiness_summary', { change: 'CHG-12', readiness: 'not_ready', type: 'story' });
    expect(notReady.structuredContent.items.map((i: { key: string }) => i.key)).toEqual(['TSK-57']);
    await api!.close();
    const many = { ...ANALYSIS, items: Array.from({ length: 130 }, (_, i) => ({ ...ANALYSIS.items[3]!, key: `PAY-${i + 1}` })) };
    const capped = await tool({ '/api/analysis': { body: many } }, 'get_readiness_summary');
    expect(capped.structuredContent).toMatchObject({ total: 130, truncated: true });
    expect(capped.structuredContent.items).toHaveLength(100);
  });

  it('CL-03: get_item_readiness gives open findings with evidence, open questions, approval and decisions; full: true the whole answer', async () => {
    const r = await tool({ '/api/items/TSK-57': { body: ITEM } }, 'get_item_readiness', { key: 'TSK-57' });
    expect(api!.requests.map((x) => x.path)).toEqual(['/api/items/TSK-57']);
    const s = r.structuredContent;
    expect(s).toMatchObject({ key: 'TSK-57', type: 'story', status: 'In Progress', epicKey: 'CHG-12', readiness: 'not_ready', health: 40, blockingIssues: ['No acceptance criteria'], resolvedFindings: 1 });
    expect(s.findings).toEqual([
      { id: 'f1', ruleId: 'REQ-001', severity: 'critical', category: 'GAP', dimension: 'requirements', blocks: true, title: 'No acceptance criteria', explanation: 'The story has no acceptance criteria.', evidence: [{ source: 'jira', title: 'TSK-57 — Retry', url: 'https://jira.example.com/browse/TSK-57' }] },
      { id: 'f2', ruleId: 'DES-001', severity: 'warning', category: 'GAP', dimension: 'requirements', blocks: false, title: 'No design', explanation: 'The story has no acceptance criteria.', evidence: [{ source: 'jira', title: 'TSK-57 — Retry', url: 'https://jira.example.com/browse/TSK-57' }] },
    ]);
    expect(s.openQuestions).toEqual([
      { findingId: 'f1', text: 'What must be true when the customer retries?', options: ['Product will add criteria'] },
      { challengeId: 'ch1', text: 'What if the card expired?', options: [] },
    ]);
    expect(s.approval).toEqual({ approvedAt: '2026-10-24T09:00:00.000Z', approvedBy: 'Bob' });
    expect(s.decisions).toEqual([{ id: 'd1', topic: 'retry limit', question: 'How many retries?', answer: 'Up to 3', decidedBy: 'Ann', decidedAt: '2026-10-25T09:00:00.000Z', effect: 'resolved' }]);
    expect(s.drift).toEqual([{ at: '2026-10-25T10:00:00.000Z', kind: 'changed', entity: 'Retry spec', summary: 'Timeout changed', severity: 'warning' }]);
    expect(JSON.stringify(s)).not.toMatch(/contextHashes|claims|checklist|long text/);
    await api!.close();
    const full = await tool({ '/api/items/TSK-57': { body: ITEM } }, 'get_item_readiness', { key: 'TSK-57', full: true });
    expect(full.structuredContent).toEqual(ITEM);
  });

  it('CL-04: get_item_graph reads the item\'s neighbourhood, with the key encoded in the path', async () => {
    const graph = { center: 'jira:CHG-12', nodes: [{ id: 'jira:CHG-12', kind: 'epic', source: 'jira', title: 'CHG-12 — Retry' }], edges: [] };
    const r = await tool({ '/api/items/CHG-12/graph': { body: graph } }, 'get_item_graph', { key: 'CHG-12' });
    expect(api!.requests.map((x) => x.path)).toEqual(['/api/items/CHG-12/graph']);
    expect(r.structuredContent).toEqual(graph);
  });
});

describe('decisions, drift, rules and pdi', () => {
  it('CL-05: list_decisions gives active decisions by default, all versions with all: true, and filters by item', async () => {
    const active = await tool({ '/api/decisions': { body: DECISIONS } }, 'list_decisions');
    expect(active.structuredContent).toMatchObject({ total: 2, truncated: false });
    expect(active.structuredContent.decisions.map((d: { id: string }) => d.id)).toEqual(['d1', 'd2']);
    expect(active.structuredContent.decisions[0]).toEqual({ id: 'd1', itemKey: 'TSK-57', topic: 'retry limit', question: 'How many retries?', answer: 'Up to 3', decidedBy: 'Ann', decidedAt: '2026-10-25T09:00:00.000Z', effect: 'resolved', status: 'active', version: 1 });
    await api!.close();
    const all = await tool({ '/api/decisions': { body: DECISIONS } }, 'list_decisions', { key: 'TSK-57', all: true });
    expect(all.structuredContent.decisions.map((d: { id: string }) => d.id)).toEqual(['d1', 'd0']);
  });

  it('CL-05b: an auto-closed decision (A2a) shows its type, the AI draft, whether it was edited and the automat', async () => {
    const auto = { ...DECISIONS[0], id: 'd9', decisionType: 'finding.auto_close', draftedBy: 'ai', draftEdited: false, automation: { level: 1, rule: 'auto-close:ERR-003' }, evidence: [{ source: 'confluence', title: 'Spec', excerpt: 'q' }], decidedBy: 'auto-close' };
    const r = await tool({ '/api/decisions': { body: [auto] } }, 'list_decisions');
    expect(r.structuredContent.decisions[0]).toMatchObject({ id: 'd9', decisionType: 'finding.auto_close', draftedBy: 'ai', draftEdited: false, automation: { level: 1, rule: 'auto-close:ERR-003' } });
    expect(r.structuredContent.decisions[0].evidence).toBeUndefined();
  });

  it('CL-06: list_drift gives the newest events, 20 by default, filtered by impacted item', async () => {
    const r = await tool({ '/api/drift': { body: DRIFT } }, 'list_drift');
    expect(r.structuredContent).toMatchObject({ total: 30 });
    expect(r.structuredContent.events).toHaveLength(20);
    expect(r.structuredContent.events[0]).toEqual({ at: DRIFT[0]!.at, kind: 'changed', entity: 'Spec', summary: 'Change 0', severity: 'warning', impactedItems: ['PAY-123'] });
    await api!.close();
    const one = await tool({ '/api/drift': { body: DRIFT } }, 'list_drift', { key: 'TSK-57', limit: 3 });
    expect(one.structuredContent.total).toBe(15);
    expect(one.structuredContent.events.map((e: { summary: string }) => e.summary)).toEqual(['Change 1', 'Change 3', 'Change 5']);
  });

  it('CL-07: list_rules and get_pdi_status', async () => {
    const rules = [{ id: 'REQ-001', name: 'Acceptance criteria', description: 'd', appliesTo: ['story'] }];
    expect((await tool({ '/api/rules': { body: rules } }, 'list_rules')).structuredContent).toEqual({ rules });
    await api!.close();
    const pdi = { enabled: true, receiving: false, eventsUrl: 'https://pdi.example.com/events', sent: { 'PAY-1': 'ready' }, outbox: Array.from({ length: 12 }, (_, i) => ({ id: `e${i}` })) };
    const r = await tool({ '/api/pdi': { body: pdi } }, 'get_pdi_status');
    expect(r.structuredContent).toEqual({ enabled: true, receiving: false, eventsUrl: 'https://pdi.example.com/events', sent: { 'PAY-1': 'ready' }, outboxPending: 12, outbox: pdi.outbox.slice(0, 10) });
  });
});

describe('refusals and limits', () => {
  it.each([
    [404, { status: 404, detail: 'No work item PAY-99' }, {}, /^ci_for_sdlc answered 404: No work item PAY-99$/],
    [422, { status: 422, detail: 'body/key must match pattern' }, {}, /^ci_for_sdlc answered 422: body\/key must match pattern$/],
    [429, { status: 429, detail: 'Too many requests' }, { 'retry-after': '12' }, /^ci_for_sdlc answered 429: Too many requests; try again in 12 s$/],
    [403, { status: 403, detail: 'Host "x" is not allowed. Add it to CI_ALLOWED_HOSTS.' }, {}, /403: Host "x" is not allowed/],
  ])('CL-08: HTTP %i is a tool error with the service\'s reason', async (status, body, headers, message) => {
    const r = await tool({ '/api/items/PAY-99': { status, body, headers } }, 'get_item_readiness', { key: 'PAY-99' });
    expect(r.isError).toBe(true);
    expect(r.content[0]!.text).toMatch(message);
    expect(r.structuredContent).toBeUndefined();
  });

  it('CL-09: an answer that is not JSON, a redirect and an unreachable service are tool errors', async () => {
    expect((await tool({ '/api/rules': { status: 502, raw: '<html>bad gateway</html>' } }, 'list_rules')).content[0]!.text).toBe('ci_for_sdlc answered 502 with something that is not JSON');
    await api!.close();
    const redirected = await tool({ '/api/rules': { status: 302, raw: '', headers: { location: 'https://evil.example.com/' } } }, 'list_rules');
    expect(redirected).toMatchObject({ isError: true, content: [{ text: expect.stringMatching(/^cannot reach ci_for_sdlc at http:\/\/127\.0\.0\.1:\d+/) }] });
    await api!.close();
    api = undefined;
    const down = await createServer({ env: { CI_SDLC_URL: 'http://127.0.0.1:9' } }).handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_rules' } });
    expect(down).toMatchObject({ result: { isError: true, content: [{ text: expect.stringMatching(/^cannot reach ci_for_sdlc at http:\/\/127\.0\.0\.1:9 \(/) }] } });
  });

  it('CL-10: answers are capped at 2 MB, the analysis at 32 MB', async () => {
    const big = (mb: number) => ({ raw: JSON.stringify({ rules: [], pad: 'x'.repeat(mb * 1024 * 1024) }) });
    expect((await tool({ '/api/rules': big(2.1) }, 'list_rules')).content[0]!.text).toBe("ci_for_sdlc's answer is larger than 2 MB");
    await api!.close();
    const analysis = { ...ANALYSIS, pad: 'x'.repeat(3 * 1024 * 1024) };
    expect((await tool({ '/api/analysis': { body: analysis } }, 'get_readiness_summary')).structuredContent.total).toBe(4);
    await api!.close();
    expect((await tool({ '/api/analysis': { raw: JSON.stringify({ ...ANALYSIS, pad: 'x'.repeat(33 * 1024 * 1024) }) } }, 'get_readiness_summary')).content[0]!.text).toBe("ci_for_sdlc's answer is larger than 32 MB");
  });
});

describe('the read token (K1b, docs/READ-TOKEN-K1B-PLAN.md)', () => {
  const token = 'r3ad-token-0123456789';

  it('CL-11: CI_SDLC_TOKEN goes as a bearer token on every request', async () => {
    await tool({ '/api/rules': { body: [] } }, 'list_rules', undefined, { CI_SDLC_TOKEN: ` ${token} ` });
    expect(api!.requests[0]!.headers.authorization).toBe(`Bearer ${token}`);
  });

  it('CL-12: a 401 says to set CI_SDLC_TOKEN to the server\'s CI_READ_TOKEN, and never repeats the token', async () => {
    const refused = { status: 401, body: { status: 401, detail: `Reading requires a token; got ${token}` }, headers: { 'www-authenticate': 'Bearer realm="ci"' } };
    const without = await tool({ '/api/rules': refused }, 'list_rules');
    expect(without.isError).toBe(true);
    expect(without.content[0]!.text).toMatch(/^ci_for_sdlc answered 401: .*; set CI_SDLC_TOKEN to the server's CI_READ_TOKEN$/);
    await api!.close();
    const wrong = await tool({ '/api/rules': refused }, 'list_rules', undefined, { CI_SDLC_TOKEN: token });
    expect(wrong.content[0]!.text).not.toContain(token);
    expect(wrong.content[0]!.text).toMatch(/check CI_SDLC_TOKEN: it must be the server's CI_READ_TOKEN$/);
  });
});

// F5 (docs/WORKSPACES-F5-PLAN.md): the tools read the default workspace, or the one named; list_workspaces lists them.
describe('workspaces', () => {
  it('CL-WS-01: list_workspaces reads /api/workspaces', async () => {
    const r = await tool({ '/api/workspaces': { body: [{ id: 'default', name: 'Web' }, { id: 'mobile', name: 'Mobile app' }] } }, 'list_workspaces');
    expect(r.structuredContent).toEqual({ workspaces: [{ id: 'default', name: 'Web' }, { id: 'mobile', name: 'Mobile app' }] });
  });

  it.each([
    ['get_readiness_summary', {}, '/api/w/mobile/analysis', ANALYSIS],
    ['get_item_readiness', { key: 'TSK-57' }, '/api/w/mobile/items/TSK-57', ITEM],
    ['get_item_graph', { key: 'TSK-57' }, '/api/w/mobile/items/TSK-57/graph', { nodes: [], edges: [] }],
    ['list_decisions', {}, '/api/w/mobile/decisions', DECISIONS],
    ['list_drift', {}, '/api/w/mobile/drift', DRIFT],
  ] as const)('CL-WS-02: %s with a workspace reads its route', async (name, args, path, body) => {
    const r = await tool({ [path]: { body } }, name, { ...args, workspace: 'mobile' });
    expect(r.isError).toBeUndefined();
    expect(api!.requests.map((x) => x.path)).toEqual([path]);
  });

  it('CL-WS-03: "default" is the plain route; a malformed workspace is refused before any request', async () => {
    await tool({ '/api/decisions': { body: DECISIONS } }, 'list_decisions', { workspace: 'default' });
    expect(api!.requests.map((x) => x.path)).toEqual(['/api/decisions']);
    await api!.close();
    const bad = await tool({}, 'list_decisions', { workspace: '../settings' });
    expect(bad.isError).toBe(true);
    expect(bad.content[0]!.text).toMatch(/workspace is an id like mobile/);
    expect(api!.requests).toEqual([]);
  });
});
