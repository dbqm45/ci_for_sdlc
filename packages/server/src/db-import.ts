import type { Pool } from 'pg';
import { FileBackend, PgBackend, migrate } from './backend.js';
import { DEFAULT_WORKSPACE } from '@ci/core';
import { FileStorage } from './workspaces.js';

/** How many entries a log may hold when it is copied (audit is append-only and can grow). */
const MAX_LOG_ENTRIES = 1_000_000;

export interface ImportReport {
  workspace: string;
  documents: number;
  entries: number;
}

/**
 * Copies a file data directory into Postgres (F5, `npm run db:import`): `default` and every workspace listed in its
 * `workspaces.json`, each document as it is (encrypted ones stay encrypted) and each log in order. A workspace that
 * already has rows in the database is refused, so running it twice never duplicates the audit trail.
 */
export async function importFiles(dataDir: string, pool: Pool): Promise<ImportReport[]> {
  await migrate(pool);
  const files = new FileStorage(dataDir);
  const listed = ((await new FileBackend(dataDir).read('workspaces.json')) ?? []) as { id?: unknown }[];
  const ids = [DEFAULT_WORKSPACE, ...listed.map((w) => w.id).filter((id): id is string => typeof id === 'string' && id !== DEFAULT_WORKSPACE)];
  for (const id of ids) {
    const existing = await new PgBackend(pool, id).names();
    if (existing.documents.length || existing.logs.length) throw new Error(`Workspace ${id} already has data in the database; nothing was imported.`);
  }
  const report: ImportReport[] = [];
  for (const id of ids) {
    const from = files.backend(id);
    const to = new PgBackend(pool, id);
    const { documents, logs } = await from.names();
    let entries = 0;
    for (const name of documents) {
      const value = await from.read(name);
      if (value !== undefined) await to.write(name, value);
    }
    for (const log of logs) {
      for (const entry of await from.tail(log, MAX_LOG_ENTRIES)) {
        await to.append(log, entry);
        entries++;
      }
    }
    report.push({ workspace: id, documents: documents.length, entries });
  }
  return report;
}
