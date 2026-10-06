import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

let ctx: Awaited<ReturnType<typeof buildApp>>;
const dir = mkdtempSync(join(tmpdir(), 'ci-hierarchy-'));
beforeAll(async () => {
  ctx = await buildApp({ dataDir: dir });
});
afterAll(async () => {
  await ctx.app.close();
  rmSync(dir, { recursive: true, force: true });
});

const put = (payload: unknown) => ctx.app.inject({ method: 'PUT', url: '/api/settings', payload: payload as any });
const map = async () => (await ctx.app.inject({ method: 'GET', url: '/api/settings' })).json().settings.integrations.jira.issueTypeMap;

describe('Jira issue type mapping in settings (P1)', () => {
  it('starts with Epic → epic, Feature → feature, Story → story', async () => {
    expect(await map()).toEqual({ Epic: 'epic', Feature: 'feature', Story: 'story' });
  });

  it('replaces the whole mapping, so a type can be removed', async () => {
    expect((await put({ integrations: { jira: { issueTypeMap: { Initiative: 'epic', Capability: 'feature' } } } })).statusCode).toBe(200);
    expect((await put({ integrations: { jira: { issueTypeMap: { Capability: 'feature' } } } })).statusCode).toBe(200);
    expect(await map()).toMatchObject({ Capability: 'feature' });
    expect((await map()).Initiative).toBeUndefined();
  });

  it('rejects a level that does not exist', async () => {
    const res = await put({ integrations: { jira: { issueTypeMap: { Initiative: 'portfolio' } } } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/portfolio/);
  });
});
