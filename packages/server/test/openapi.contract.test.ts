import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

// Contract regression: the published OpenAPI document is compared with contracts/openapi.json.
// A diff here means the HTTP API changed — review it as an API change (clients, web app, docs),
// then accept it with `npm run test:contract:update`.

let ctx: Awaited<ReturnType<typeof buildApp>>;
let dir: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'ci-contract-'));
  ctx = await buildApp({ dataDir: dir, adminToken: '', allowedHosts: [], allowedOrigins: [] });
});
afterAll(async () => {
  await ctx.app.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('API contract', () => {
  it('CON-01: /api/openapi.json matches the approved contract', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/openapi.json' });
    expect(res.statusCode).toBe(200);
    await expect(`${JSON.stringify(res.json(), null, 2)}\n`).toMatchFileSnapshot('../contracts/openapi.json');
  });
});
