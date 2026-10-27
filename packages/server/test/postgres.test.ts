import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ActiveDecision } from '@ci/core';
import { buildApp } from '../src/app.js';
import { PgBackend, migrate, MIGRATIONS } from '../src/backend.js';
import { importFiles } from '../src/db-import.js';

// F5 (docs/WORKSPACES-F5-PLAN.md, "Postgres"): with CI_DATABASE_URL the workspaces live in Postgres, as JSON
// documents and logs kept apart by row-level security. Runs against a real database: set CI_TEST_DATABASE_URL to a
// database the role owns, with a role that is not a superuser (so row-level security applies). The tables are
// emptied before each test.

const url = process.env.CI_TEST_DATABASE_URL ?? '';
let pool: pg.Pool;
let dir: string;
let ctx: Awaited<ReturnType<typeof buildApp>> | undefined;

describe.skipIf(!url)('Postgres storage', () => {
  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url, max: 4 });
  });
  afterAll(async () => {
    await ctx?.app.close();
    // Nothing is left behind, so a server started on the same database later begins empty.
    await pool?.query('truncate ci_documents, ci_log_entries');
    await pool?.end();
  });
  beforeEach(async () => {
    await ctx?.app.close();
    ctx = undefined;
    await migrate(pool);
    await pool.query('truncate ci_documents, ci_log_entries');
    dir = mkdtempSync(join(tmpdir(), 'ci-pg-'));
    return () => rmSync(dir, { recursive: true, force: true });
  });

  const start = async () => {
    ctx = await buildApp({ dataDir: dir, databaseUrl: url, adminToken: '', allowedHosts: [], allowedOrigins: [], pdi: { eventsUrl: '', secret: '' } });
    return ctx;
  };
  const call = async (method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, payload?: unknown, headers: Record<string, string> = {}) => {
    const res = await ctx!.app.inject({ method, url: path, payload: payload as object, headers: { 'x-ci-actor': 'Ann', ...headers } });
    return { status: res.statusCode, body: res.body ? res.json() : undefined, headers: res.headers };
  };

  it('PG-01: the schema is created once; a second start runs nothing', async () => {
    expect(await migrate(pool)).toBe(0);
    const { rows } = await pool.query<{ version: number }>('select version from ci_schema_migrations order by version');
    expect(rows.map((r) => r.version)).toEqual(MIGRATIONS.map((_, i) => i + 1));
  });

  it('PG-02: decisions, settings and audit live in the database, survive a restart, and no state file is written', async () => {
    await start();
    expect((await call('GET', '/api/health')).body.storage).toBe('postgres');
    expect((await call('POST', '/api/decisions', { questionId: 'q-pg', itemKey: 'PAY-123', answer: 'In Postgres' })).status).toBe(200);
    const etag = (await call('GET', '/api/settings')).headers.etag as string;
    expect((await call('PUT', '/api/settings', { project: { key: 'PG', name: 'In the database' } }, { 'if-match': etag })).status).toBe(200);
    await ctx!.app.close();
    ctx = undefined;
    expect(readdirSync(dir)).toEqual([]);

    await start();
    expect((await call('GET', '/api/decisions')).body.map((d: ActiveDecision) => d.answer)).toEqual(['In Postgres']);
    expect((await call('GET', '/api/settings')).body.settings.project.name).toBe('In the database');
    expect((await call('GET', '/api/audit')).body.map((a: { summary: string }) => a.summary)).toEqual(expect.arrayContaining(['Settings updated']));
  });

  it('PG-03: row-level security keeps workspaces apart, and nothing is visible without a workspace', async () => {
    await new PgBackend(pool, 'web').write('settings.json', { a: 1 });
    await new PgBackend(pool, 'mobile').write('settings.json', { b: 2 });
    await new PgBackend(pool, 'web').append('audit', { at: 'x', kind: 'k' });
    expect(await new PgBackend(pool, 'web').read('settings.json')).toEqual({ a: 1 });
    expect(await new PgBackend(pool, 'mobile').names()).toEqual({ documents: ['settings.json'], logs: [] });
    // A query that forgets the workspace sees nothing, even without a where clause.
    expect((await pool.query('select * from ci_documents')).rows).toEqual([]);
    const c = await pool.connect();
    try {
      await c.query('begin');
      await c.query("select set_config('ci.workspace', 'mobile', true)");
      expect((await c.query('select value from ci_documents')).rows).toEqual([{ value: { b: 2 } }]);
      await expect(c.query("insert into ci_documents (workspace, name, value) values ('web', 'x.json', '{}')")).rejects.toThrow(/row-level security/);
      await c.query('rollback');
    } finally {
      c.release();
    }
  });

  it('PG-04: workspaces in the database: created, kept apart, deleted to a "deleted:" name', async () => {
    await start();
    expect((await call('POST', '/api/workspaces', { id: 'mobile' })).status).toBe(201);
    await call('POST', '/api/w/mobile/decisions', { questionId: 'q-m', itemKey: 'PAY-123', answer: 'Only mobile' });
    expect((await call('GET', '/api/decisions')).body).toEqual([]);
    const del = await call('DELETE', '/api/workspaces/mobile', { confirm: 'mobile' });
    expect(del.body.archivedTo).toMatch(/^deleted:mobile-\d+T\d+Z$/);
    expect(await new PgBackend(pool, 'mobile').names()).toEqual({ documents: [], logs: [] });
    expect((await new PgBackend(pool, del.body.archivedTo).read('decisions.json')) as unknown[]).toHaveLength(1);
    await ctx!.app.close();
    ctx = undefined;
    await start();
    expect((await call('GET', '/api/workspaces')).body).toEqual([{ id: 'default', name: 'Default' }]);
  });

  it('PG-05: db:import copies the files of every workspace once; a second run is refused', async () => {
    writeFileSync(join(dir, 'decisions.json'), JSON.stringify([{ id: 'd1', questionId: 'q', findingId: 'f', itemKey: 'PAY-1', topic: 't', question: 'Q?', answer: 'From files', decidedBy: 'Ann', decidedAt: '2026-10-27T10:00:00.000Z', effect: 'resolve', version: 1, status: 'active' }]));
    writeFileSync(join(dir, 'audit.jsonl'), '{"at":"2026-10-27T10:00:00Z","kind":"decision","actor":"Ann","summary":"one"}\nnot json\n{"at":"2026-10-27T10:01:00Z","kind":"settings","actor":"Ann","summary":"two"}\n');
    writeFileSync(join(dir, 'workspaces.json'), JSON.stringify([{ id: 'mobile', name: 'Mobile', createdAt: '2026-10-27T09:00:00Z' }]));
    mkdirSync(join(dir, 'workspaces', 'mobile'), { recursive: true });
    writeFileSync(join(dir, 'workspaces', 'mobile', 'settings.json'), JSON.stringify({ project: { key: 'APP', name: 'Mobile' } }));

    expect(await importFiles(dir, pool)).toEqual([
      { workspace: 'default', documents: 2, entries: 2 },
      { workspace: 'mobile', documents: 1, entries: 0 },
    ]);
    await expect(importFiles(dir, pool)).rejects.toThrow(/already has data/);

    await start();
    expect((await call('GET', '/api/decisions')).body.map((d: ActiveDecision) => d.answer)).toEqual(['From files']);
    expect((await call('GET', '/api/audit')).body.slice(-2).map((a: { summary: string }) => a.summary)).toEqual(['two', 'one']);
    expect((await call('GET', '/api/w/mobile/settings')).body.settings.project.name).toBe('Mobile');
    expect(existsSync(join(dir, 'decisions.json'))).toBe(true);
  });

  it('PG-06: encryption at rest stores only the envelope in the database', async () => {
    process.env.CI_ENCRYPTION_KEY = 'dummy-test-key';
    try {
      await start();
      const etag = (await call('GET', '/api/settings')).headers.etag as string;
      await call('PUT', '/api/settings', { security: { encryptStoredContext: true } }, { 'if-match': etag });
      await call('POST', '/api/decisions', { questionId: 'q-enc', itemKey: 'PAY-123', answer: 'Secret answer' });
      const stored = await new PgBackend(pool, 'default').read('decisions.json');
      expect(stored).toMatchObject({ __enc: 1 });
      expect(JSON.stringify(stored)).not.toMatch(/Secret answer/);
      expect((await call('GET', '/api/decisions')).body.map((d: ActiveDecision) => d.answer)).toEqual(['Secret answer']);
    } finally {
      delete process.env.CI_ENCRYPTION_KEY;
    }
  });
});
