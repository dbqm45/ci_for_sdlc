import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { OpenApiError, extractClaims, parseOpenApi, readOpenApi } from '../src/index.js';

// OpenAPI as a source (docs/OPENAPI-PLAN.md): every operation of an OpenAPI 3.x file becomes a context document with
// the facts of the contract, and a readable summary the existing claim extractors understand.

const SPEC = `openapi: 3.0.3
info: { title: Payments API, version: 2.1.0 }
paths:
  /payments/{id}/retry:
    post:
      operationId: retryPayment
      summary: Retry a payment
      description: Retries a declined card payment.
      tags: [payments]
      x-requirements: [PAY-124]
      parameters:
        - $ref: '#/components/parameters/IdempotencyKey'
      responses:
        '202': { description: Accepted }
        '409': { description: Payment already settled }
        '429': { $ref: '#/components/responses/TooMany' }
  /payments:
    post:
      summary: Create payments in bulk
      requestBody:
        content:
          application/json:
            schema: { $ref: '#/components/schemas/Bulk' }
      responses:
        '201': { description: Created }
        '422': { description: Invalid card data }
    get:
      summary: List payments
      parameters:
        - $ref: 'common.yaml#/components/parameters/Page'
      responses:
        '200': { description: OK }
components:
  parameters:
    IdempotencyKey: { name: Idempotency-Key, in: header, required: true, schema: { type: string } }
  responses:
    TooMany: { description: Too many requests }
  schemas:
    Bulk:
      type: object
      properties:
        items: { type: array, maxItems: 100, items: { type: object } }
`;

const parse = () => parseOpenApi(SPEC, 'api/payments.yaml', { updatedAt: '2026-10-28T10:00:00Z' });
const op = (id: string) => parse().find((d) => d.id === id)!;

describe('OA: parsing an OpenAPI file', () => {
  it('OA-01: every operation is a document with the facts of the contract (paths in file order, methods in OpenAPI order)', () => {
    const docs = parse();
    expect(docs.map((d) => d.id)).toEqual(['api/payments.yaml#POST /payments/{id}/retry', 'api/payments.yaml#GET /payments', 'api/payments.yaml#POST /payments']);
    expect(op('api/payments.yaml#POST /payments/{id}/retry')).toMatchObject({
      source: 'api',
      title: 'POST /payments/{id}/retry — Retry a payment',
      space: 'Payments API',
      labels: ['payments'],
      updatedAt: '2026-10-28T10:00:00Z',
      api: {
        file: 'api/payments.yaml',
        spec: 'Payments API 2.1.0',
        method: 'POST',
        path: '/payments/{id}/retry',
        operationId: 'retryPayment',
        successCodes: ['202'],
        errorCodes: [
          { code: '409', description: 'Payment already settled' },
          { code: '429', description: 'Too many requests' },
        ],
        idempotencyKey: true,
        requirements: ['PAY-124'],
      },
    });
  });
  it('OA-02: the body is a readable summary of the contract', () => {
    expect(op('api/payments.yaml#POST /payments/{id}/retry').body).toBe(
      [
        'POST /payments/{id}/retry — Retry a payment.',
        'Retries a declined card payment.',
        'Responds 202 Accepted: the request is processed asynchronously.',
        'Requests carry an Idempotency-Key header.',
        'Errors: 409 Payment already settled; 429 Too many requests.',
        'Requirements: PAY-124.',
      ].join('\n'),
    );
  });
  it('OA-03: an array limit in the request body is a fact and a sentence', () => {
    const bulk = op('api/payments.yaml#POST /payments');
    expect(bulk.api).toMatchObject({ successCodes: ['201'], idempotencyKey: false, maxItems: 100 });
    expect(bulk.body).toContain('At most 100 items per request.');
    expect(bulk.body).toContain('Responds 201 Created.');
  });
  it('OA-04: the summary gives the claims the rules already use (async, idempotent, item limit)', () => {
    const ev = { source: 'api' as const, entityId: 'api:x', title: 'x' };
    const claims = (id: string) => extractClaims(op(id).body, ev, { defaultSubject: 'payment' }).map((c) => `${c.attribute}=${String(c.value)}`);
    expect(claims('api/payments.yaml#POST /payments/{id}/retry')).toEqual(expect.arrayContaining(['processing_mode=async', 'idempotent=true']));
    expect(claims('api/payments.yaml#POST /payments')).toContain('max_items=100');
  });
  it('OA-05: JSON reads like YAML; an external $ref is skipped, not an error', () => {
    const json = JSON.stringify({ openapi: '3.1.0', info: { title: 'T', version: '1' }, paths: { '/x': { delete: { responses: { '204': { description: 'gone' }, '403': { description: 'Forbidden' } } } } } });
    const [d] = parseOpenApi(json, 't.json', { updatedAt: '' });
    expect(d).toMatchObject({ title: 'DELETE /x', api: { successCodes: ['204'], errorCodes: [{ code: '403', description: 'Forbidden' }] } });
    expect(op('api/payments.yaml#GET /payments').api?.errorCodes).toEqual([]);
  });
  it.each([
    { id: 'OA-06', text: 'swagger: "2.0"\ninfo: { title: T, version: "1" }\npaths: {}', error: /Swagger 2\.0 is not supported/ },
    { id: 'OA-07', text: 'name: not a spec', error: /not an OpenAPI 3 document/ },
    { id: 'OA-08', text: 'openapi: 3.0.0\ninfo: { title: T, version: "1" }\npaths: {}', error: /no operations/ },
    { id: 'OA-09', text: 'openapi: [unclosed', error: /not valid JSON or YAML/ },
  ])('$id: a file that is not a usable OpenAPI 3 document is an error with the reason', ({ text, error }) => {
    expect(() => parseOpenApi(text, 'f.yaml', { updatedAt: '' })).toThrow(OpenApiError);
    expect(() => parseOpenApi(text, 'f.yaml', { updatedAt: '' })).toThrow(error);
  });
});

describe('OA: reading files and directories', () => {
  const dirs: string[] = [];
  afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

  it('OA-10: a directory gives the operations of its specs; a broken file is a problem naming it', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ci-openapi-'));
    dirs.push(root);
    mkdirSync(join(root, 'v2'));
    writeFileSync(join(root, 'payments.yaml'), SPEC);
    writeFileSync(join(root, 'v2', 'broken.json'), '{"swagger": "2.0"}');
    writeFileSync(join(root, 'README.md'), '# not a spec');
    const { documents, problems } = await readOpenApi([root]);
    expect(documents).toHaveLength(3);
    expect(documents[0]?.api?.file).toBe(join(root, 'payments.yaml'));
    expect(problems).toEqual([{ path: join(root, 'v2', 'broken.json'), message: expect.stringMatching(/Swagger 2\.0/) }]);
  });
  it('OA-11: a missing path is a problem', async () => {
    const { documents, problems } = await readOpenApi(['/nonexistent/openapi.yaml']);
    expect(documents).toEqual([]);
    expect(problems).toEqual([{ path: '/nonexistent/openapi.yaml', message: expect.stringMatching(/not found|ENOENT/) }]);
  });
});
