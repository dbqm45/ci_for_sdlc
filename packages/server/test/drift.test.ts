import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

let ctx: Awaited<ReturnType<typeof buildApp>>;
let dir: string;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'ci-drift-'));
  ctx = await buildApp({ dataDir: dir });
});
afterEach(async () => {
  await ctx.app.close();
  rmSync(dir, { recursive: true, force: true });
});

const call = async (method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown) => {
  const res = await ctx.app.inject({ method, url, payload: payload as any });
  return { status: res.statusCode, body: res.json() };
};

// The Figma scenario changes the meaning of PAY-123's design and adds no other blocker.
const approveThenChange = async () => {
  expect((await call('POST', '/api/items/PAY-123/approve', { by: 'lead' })).status).toBe(200);
  expect((await call('POST', '/api/demo/scenarios/figma-remove-error')).status).toBe(200);
};

describe('drift after approval (P4)', () => {
  it('blocks the story for review, and a re-approval without force refreshes the baseline', async () => {
    await approveThenChange();
    const before = (await call('GET', '/api/items/PAY-123')).body.item;
    expect(before.readiness).toBe('not_ready');
    expect(before.findings.filter((f: any) => f.blocks).every((f: any) => f.origin === 'drift')).toBe(true);

    const re = await call('POST', '/api/items/PAY-123/approve', { by: 'lead' });
    expect(re.status).toBe(200);
    const after = (await call('GET', '/api/items/PAY-123')).body.item;
    expect(after.findings.some((f: any) => f.origin === 'drift' && f.status === 'open')).toBe(false);
    const approvals = await ctx.store.approvals();
    expect(approvals.find((a) => a.itemKey === 'PAY-123')!.forced).toBeUndefined();
  });

  it('in invalidate mode removes the approval and records it in the audit log', async () => {
    expect((await call('PUT', '/api/settings', { policy: { driftReaction: 'invalidate' } })).status).toBe(200);
    await approveThenChange();
    const approvals = await ctx.store.approvals();
    expect(approvals.some((a) => a.itemKey === 'PAY-123')).toBe(false);
    const audit = (await call('GET', '/api/audit')).body;
    expect(audit.some((e: any) => e.kind === 'approval_removed' && e.actor === 'system' && /PAY-123/.test(e.summary))).toBe(true);
  });
});
