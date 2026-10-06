import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

let ctx: Awaited<ReturnType<typeof buildApp>>;
const dir = mkdtempSync(join(tmpdir(), 'ci-approvals-'));

beforeAll(async () => {
  ctx = await buildApp({ dataDir: dir });
});
afterAll(async () => {
  await ctx.app.close();
  rmSync(dir, { recursive: true, force: true });
});

const json = async (method: 'GET' | 'POST' | 'DELETE', url: string, payload?: unknown) => {
  const res = await ctx.app.inject({ method, url, payload: payload as any });
  return { status: res.statusCode, body: res.json() };
};

describe('approvals', () => {
  it('requires a non-empty reason to force-approve a NOT READY story (P6)', async () => {
    expect((await json('POST', '/api/items/PAY-125/approve', { by: 'po', force: true })).status).toBe(400);
    expect((await json('POST', '/api/items/PAY-125/approve', { by: 'po', force: true, reason: '   ' })).status).toBe(400);
  });

  it('stores the reason of a forced approval and writes it to audit (P6)', async () => {
    const res = await json('POST', '/api/items/PAY-125/approve', { by: 'lead', force: true, reason: 'Release deadline, risk accepted by PO' });
    expect(res.status).toBe(200);
    const item = await json('GET', '/api/items/PAY-125');
    expect(item.body.approval).toMatchObject({ approvedBy: 'lead', forced: true, reason: 'Release deadline, risk accepted by PO' });
    const audit = await json('GET', '/api/audit');
    expect(audit.body.some((a: any) => a.kind === 'approval' && a.actor === 'lead' && a.summary.includes('Release deadline'))).toBe(true);
  });

  it('does not mark a normal approval as forced', async () => {
    expect((await json('POST', '/api/items/PAY-123/approve', { by: 'po' })).status).toBe(200);
    const item = await json('GET', '/api/items/PAY-123');
    expect(item.body.approval.forced).toBeUndefined();
    expect(item.body.approval.reason).toBeUndefined();
  });

  it('only approves stories and bugs; epic readiness is derived (P7)', async () => {
    const res = await json('POST', '/api/items/PAY-100/approve', { by: 'po', force: true, reason: 'x' });
    expect(res.status).toBe(409);
    expect(res.body.detail).toMatch(/derived from its stories/);
  });
});
