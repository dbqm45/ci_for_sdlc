import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { appendFile, mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Pool, PoolClient } from 'pg';

/**
 * Where a workspace's state lives (F5, docs/WORKSPACES-F5-PLAN.md, "Postgres"): JSON documents by name, and
 * append-only logs. `Store` keeps the shapes, the encryption and the write queue; a backend only reads and writes.
 * Files (`FileBackend`, the default) or Postgres (`PgBackend`, with CI_DATABASE_URL).
 */
export interface Backend {
  /** Prepares the place (a directory; nothing for Postgres, whose schema `migrate()` creates). */
  init(): Promise<void>;
  /** The document, or `undefined` when there is none; an error when it exists but cannot be read. */
  read(name: string): Promise<unknown>;
  write(name: string, value: unknown): Promise<void>;
  append(log: string, entry: unknown): Promise<void>;
  /** The last `limit` entries of a log, oldest first; an unreadable entry is skipped, not fatal. */
  tail(log: string, limit: number): Promise<unknown[]>;
  /** Every document and log of the workspace (for `db:import`). */
  names(): Promise<{ documents: string[]; logs: string[] }>;
}

const isEncrypted = (v: unknown) => !!v && typeof v === 'object' && '__enc' in v;

/** JSON files in a directory, written through a temporary file and a rename; logs as JSON lines (`<log>.jsonl`). */
export class FileBackend implements Backend {
  constructor(readonly dir: string) {}

  async init() {
    await mkdir(this.dir, { recursive: true });
  }

  async read(name: string) {
    let raw: string;
    try {
      raw = await readFile(join(this.dir, name), 'utf8');
    } catch (e) {
      if (e instanceof Error && 'code' in e && e.code === 'ENOENT') return undefined;
      throw e;
    }
    return JSON.parse(raw) as unknown;
  }

  async write(name: string, value: unknown) {
    // Encrypted envelopes stay on one line; plain state is indented for people reading it.
    const body = isEncrypted(value) ? JSON.stringify(value) : JSON.stringify(value, null, 2);
    const p = join(this.dir, name);
    const tmp = `${p}.${randomBytes(6).toString('hex')}.tmp`;
    await writeFile(tmp, body);
    await rename(tmp, p);
  }

  async append(log: string, entry: unknown) {
    await appendFile(join(this.dir, `${log}.jsonl`), JSON.stringify(entry) + '\n');
  }

  async tail(log: string, limit: number) {
    const p = join(this.dir, `${log}.jsonl`);
    if (!existsSync(p)) return [];
    const lines = (await readFile(p, 'utf8')).trim().split('\n').filter(Boolean);
    // Append-only log: one torn or hand-edited line must not hide the rest.
    return lines.slice(-limit).flatMap((l) => {
      try {
        return [JSON.parse(l) as unknown];
      } catch {
        return [];
      }
    });
  }

  async names() {
    const files = existsSync(this.dir) ? await readdir(this.dir, { withFileTypes: true }) : [];
    const plain = files.filter((f) => f.isFile() && !f.name.endsWith('.tmp')).map((f) => f.name);
    return { documents: plain.filter((n) => n.endsWith('.json')), logs: plain.filter((n) => n.endsWith('.jsonl')).map((n) => n.slice(0, -'.jsonl'.length)) };
  }
}

/**
 * Postgres: `ci_documents (workspace, name, value jsonb)` and `ci_log_entries (workspace, log, value jsonb)`. Every
 * statement runs in a transaction that sets `ci.workspace`, which the row-level security policies check, so a
 * workspace never reads another's rows (with a role that is not a superuser and does not bypass RLS).
 */
export class PgBackend implements Backend {
  constructor(
    private readonly pool: Pool,
    readonly workspace: string,
  ) {}

  async init() {}

  /** Runs `fn` in a transaction scoped to this workspace. */
  private async scoped<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
    return inWorkspace(this.pool, this.workspace, fn);
  }

  async read(name: string) {
    return this.scoped(async (c) => {
      const r = await c.query<{ value: unknown }>('select value from ci_documents where workspace = $1 and name = $2', [this.workspace, name]);
      return r.rows[0]?.value;
    });
  }

  async write(name: string, value: unknown) {
    await this.scoped((c) =>
      c.query('insert into ci_documents (workspace, name, value) values ($1, $2, $3) on conflict (workspace, name) do update set value = excluded.value, updated_at = now()', [
        this.workspace,
        name,
        JSON.stringify(value),
      ]),
    );
  }

  async append(log: string, entry: unknown) {
    await this.scoped((c) => c.query('insert into ci_log_entries (workspace, log, value) values ($1, $2, $3)', [this.workspace, log, JSON.stringify(entry)]));
  }

  async tail(log: string, limit: number) {
    return this.scoped(async (c) => {
      const r = await c.query<{ value: unknown }>('select value from (select id, value from ci_log_entries where workspace = $1 and log = $2 order by id desc limit $3) t order by id', [this.workspace, log, limit]);
      return r.rows.map((x) => x.value);
    });
  }

  async names() {
    return this.scoped(async (c) => {
      const d = await c.query<{ name: string }>('select name from ci_documents where workspace = $1 order by name', [this.workspace]);
      const l = await c.query<{ log: string }>('select distinct log from ci_log_entries where workspace = $1 order by log', [this.workspace]);
      return { documents: d.rows.map((x) => x.name), logs: l.rows.map((x) => x.log) };
    });
  }
}

/** A transaction with `ci.workspace` set to `workspace` for the row-level security policies. */
export async function inWorkspace<T>(pool: Pool, workspace: string, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('begin');
    await c.query("select set_config('ci.workspace', $1, true)", [workspace]);
    const out = await fn(c);
    await c.query('commit');
    return out;
  } catch (e) {
    await c.query('rollback').catch(() => undefined);
    throw e;
  } finally {
    c.release();
  }
}

/**
 * The schema, applied in order under an advisory lock so two servers starting together do not race. Each entry runs
 * once; `ci_schema_migrations` remembers which did.
 */
export const MIGRATIONS: readonly string[] = [
  `create table ci_documents (
     workspace text not null,
     name text not null,
     value jsonb not null,
     updated_at timestamptz not null default now(),
     primary key (workspace, name)
   );
   create table ci_log_entries (
     id bigserial primary key,
     workspace text not null,
     log text not null,
     value jsonb not null,
     at timestamptz not null default now()
   );
   create index ci_log_entries_tail on ci_log_entries (workspace, log, id);
   alter table ci_documents enable row level security;
   alter table ci_documents force row level security;
   alter table ci_log_entries enable row level security;
   alter table ci_log_entries force row level security;
   create policy ci_documents_workspace on ci_documents
     using (workspace = current_setting('ci.workspace', true))
     with check (workspace = current_setting('ci.workspace', true));
   create policy ci_log_entries_workspace on ci_log_entries
     using (workspace = current_setting('ci.workspace', true))
     with check (workspace = current_setting('ci.workspace', true));`,
];

const MIGRATION_LOCK = 7_431_205;

/** Brings the schema up to date; returns how many migrations ran. */
export async function migrate(pool: Pool): Promise<number> {
  const c = await pool.connect();
  try {
    await c.query('select pg_advisory_lock($1)', [MIGRATION_LOCK]);
    await c.query('create table if not exists ci_schema_migrations (version integer primary key, applied_at timestamptz not null default now())');
    const done = new Set((await c.query<{ version: number }>('select version from ci_schema_migrations')).rows.map((r) => r.version));
    let ran = 0;
    for (const [i, sql] of MIGRATIONS.entries()) {
      const version = i + 1;
      if (done.has(version)) continue;
      await c.query('begin');
      try {
        await c.query(sql);
        await c.query('insert into ci_schema_migrations (version) values ($1)', [version]);
        await c.query('commit');
        ran++;
      } catch (e) {
        await c.query('rollback');
        throw e;
      }
    }
    return ran;
  } finally {
    await c.query('select pg_advisory_unlock($1)', [MIGRATION_LOCK]).catch(() => undefined);
    c.release();
  }
}

/** Moves a deleted workspace's rows aside under a new workspace name (`deleted:<id>-<time>`); nothing is erased. */
export async function archiveWorkspace(pool: Pool, workspace: string, archivedAs: string) {
  // Rows move from one workspace to another, which the per-workspace policy forbids in one statement: they are taken
  // under the old name and written under the new one, in one transaction, so a failure leaves them where they were.
  await inWorkspace(pool, workspace, async (c) => {
    const docs = (await c.query<{ name: string; value: unknown }>('delete from ci_documents where workspace = $1 returning name, value', [workspace])).rows;
    const logs = (await c.query<{ log: string; value: unknown; at: Date }>('with d as (delete from ci_log_entries where workspace = $1 returning id, log, value, at) select log, value, at from d order by id', [workspace])).rows;
    await c.query("select set_config('ci.workspace', $1, true)", [archivedAs]);
    for (const d of docs) await c.query('insert into ci_documents (workspace, name, value) values ($1, $2, $3)', [archivedAs, d.name, JSON.stringify(d.value)]);
    for (const l of logs) await c.query('insert into ci_log_entries (workspace, log, value, at) values ($1, $2, $3, $4)', [archivedAs, l.log, JSON.stringify(l.value), l.at]);
  });
}
