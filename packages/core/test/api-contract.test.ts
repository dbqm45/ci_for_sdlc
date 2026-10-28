import { describe, expect, it } from 'vitest';
import { analyzeProject, parseOpenApi, type DesignFrame, type ProjectContext, type RequirementItem } from '../src/index.js';

// The API contract in the analysis (docs/OPENAPI-PLAN.md): operations join an item's context like pages do, their
// summary feeds the claims of ARCH-001…003, and API-001 asks how the user sees the API's errors.

const SPEC = `openapi: 3.0.3
info: { title: Payments API, version: 2.1.0 }
paths:
  /payments/{id}/retry:
    post:
      summary: Retry a payment
      tags: [payments]
      x-requirements: [PAY-124]
      parameters:
        - { name: Idempotency-Key, in: header, required: true, schema: { type: string } }
      responses:
        '202': { description: Accepted }
        '409': { description: Payment already settled }
        '422': { description: Invalid card data }
        '429': { description: Too many requests }
        '503': { description: Service unavailable }
`;

const story = (over: Partial<RequirementItem> = {}): RequirementItem => ({
  key: 'PAY-124',
  type: 'story',
  title: 'Retry a failed card payment',
  description: 'When a card payment fails, the customer can retry it from the payment page.',
  acceptanceCriteria: ['The customer can retry a failed payment.', 'After the retry the customer gets an immediate confirmation of the result.'],
  businessRules: [],
  status: 'To Do',
  labels: [],
  components: [],
  links: [],
  remoteLinks: [],
  updatedAt: '2026-10-28T10:00:00Z',
  ...over,
});
const frame = (texts: string[]): DesignFrame => ({ id: '1:2', fileKey: 'F', fileName: 'Checkout', page: 'Pay', name: 'Retry payment', texts, transitions: [], updatedAt: '2026-10-28T10:00:00Z' });
const api = parseOpenApi(SPEC, 'payments.yaml', { updatedAt: '2026-10-28T10:00:00Z' });

const run = async (opts: { r?: RequirementItem; withApi?: boolean; frames?: DesignFrame[] } = {}) => {
  const ctx: ProjectContext = { project: { key: 'PAY', name: 'Payments' }, requirements: [opts.r ?? story()], documents: opts.withApi === false ? [] : api, frames: opts.frames ?? [], fetchedAt: '2026-10-28T10:00:00Z' };
  const { result, graph } = await analyzeProject(ctx, { now: new Date('2026-10-28T10:00:00Z') });
  return { item: result.items.find((i) => i.key === 'PAY-124')!, graph };
};
const OP = 'api:payments.yaml#POST /payments/{id}/retry';

describe('API: the contract in the analysis of an item', () => {
  it('API-01: an operation naming the item is linked to it explicitly', async () => {
    const { graph } = await run();
    expect(graph.relations).toContainEqual(expect.objectContaining({ from: 'jira:PAY-124', to: OP, type: 'documented_by', via: 'explicit', reason: 'API operation names PAY-124' }));
  });
  it('API-02: an immediate result in the story against 202 Accepted is a conflict with the operation as evidence', async () => {
    const { item } = await run();
    const f = item.findings.find((x) => x.ruleId === 'ARCH-003');
    expect(f?.category).toBe('CONFLICT');
    expect(f?.evidence).toContainEqual(expect.objectContaining({ source: 'api', entityId: OP, title: 'API POST /payments/{id}/retry' }));
  });
  it('API-03: an Idempotency-Key header in the contract answers the idempotency gap of a payment retry', async () => {
    expect((await run({ withApi: false })).item.findings.some((x) => x.ruleId === 'ARCH-001')).toBe(true);
    expect((await run()).item.findings.some((x) => x.ruleId === 'ARCH-001')).toBe(false);
  });
});

describe('API-001: API errors without a screen state', () => {
  it('API-04: an error code whose state neither the story nor the design covers is one finding naming code and operation', async () => {
    const { item } = await run();
    const f = item.findings.find((x) => x.ruleId === 'API-001');
    expect(f).toMatchObject({ category: 'MISSING_COVERAGE', severity: 'warning', dimension: 'errorHandling' });
    // 422 → validation error is not covered; 429 → retry is (the story retries); 409 has no screen state; 503 is ERR-002's.
    expect(f?.title).toBe('API error 422 has no state in the story or design');
    expect(f?.explanation).toContain('POST /payments/{id}/retry returns 422 Invalid card data');
    expect(f?.evidence).toContainEqual(expect.objectContaining({ source: 'api', entityId: OP }));
    expect(f?.question?.text).toBe('What does the user see when the API returns 422 Invalid card data?');
  });
  it('API-05: a Figma frame with the state covers it', async () => {
    const { item } = await run({ frames: [frame(['Retry payment', 'Invalid card data', 'Try again'])] });
    expect(item.findings.some((x) => x.ruleId === 'API-001')).toBe(false);
  });
  it('API-06: silent for items without a user interface and without a linked contract', async () => {
    expect((await run({ r: story({ labels: ['backend'] }) })).item.findings.some((x) => x.ruleId === 'API-001')).toBe(false);
    expect((await run({ withApi: false })).item.findings.some((x) => x.ruleId === 'API-001')).toBe(false);
  });
});
