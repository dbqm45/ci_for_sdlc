import { backupObjects, exportStorage, importBackup, openBackup, sealBackup, summarize, type BackupSummary, type Retention } from './backup.js';
import { getObject, listKeys, putLockedObject, type S3Config } from './s3.js';
import type { Storage } from './workspaces.js';

/**
 * The two runs of T5 (docs/BACKUPS.md): the daily backup (Render cron job `quorum-backup`) and the restore check
 * the owner runs by hand into an empty database. Both log counts only, never a value or a key.
 */

type Fetch = typeof fetch;

export interface BackupRunInput {
  storage: Storage;
  s3: S3Config;
  secret: string;
  retention: Retention;
  at?: Date;
  fetchImpl?: Fetch;
}

/** Exports, seals and uploads; returns what was written. Any failure throws, so the cron job is marked failed. */
export async function runBackup(i: BackupRunInput): Promise<{ keys: string[]; bytes: number; summary: BackupSummary }> {
  const at = i.at ?? new Date();
  const backup = await exportStorage(i.storage, at);
  const sealed = sealBackup(backup, i.secret);
  // Check the sealed copy opens before it is uploaded: a backup that cannot be read is worse than a failed run.
  const reopened = summarize(openBackup(sealed, i.secret));
  const summary = summarize(backup);
  if (JSON.stringify(reopened) !== JSON.stringify(summary)) throw new Error('The sealed backup does not match the export; nothing was uploaded.');
  const objects = backupObjects(at, i.retention);
  for (const o of objects) await putLockedObject(i.s3, o.key, sealed, o.retainUntil, i.fetchImpl, at);
  return { keys: objects.map((o) => o.key), bytes: sealed.length, summary };
}

/** The newest daily backup's key (`daily/<date>.qbk` sorts by date). */
export async function latestBackupKey(s3: S3Config, fetchImpl?: Fetch): Promise<string> {
  const keys = (await listKeys(s3, 'daily/', fetchImpl)).filter((k) => /^daily\/\d{4}-\d{2}-\d{2}\.qbk$/.test(k)).sort();
  const key = keys.at(-1);
  if (!key) throw new Error('No backup under daily/ in the bucket.');
  return key;
}

export interface RestoreCheckInput {
  /** The empty target (a scratch database, never the production one). */
  storage: Storage;
  sealed: Buffer;
  secret: string;
}

/**
 * Restores a backup into empty storage, reads it back and compares the counts: the restore check of T5. Returns the
 * backup's date and counts; throws when anything differs.
 */
export async function runRestoreCheck(i: RestoreCheckInput): Promise<{ createdAt: string; summary: BackupSummary }> {
  const backup = openBackup(i.sealed, i.secret);
  await importBackup(i.storage, backup);
  const expected = summarize(backup);
  const restored = await exportStorage(i.storage, new Date());
  const got = summarize(restored);
  if (JSON.stringify(got) !== JSON.stringify(expected)) throw new Error(`Restored ${JSON.stringify(got)}, the backup holds ${JSON.stringify(expected)}.`);
  // Same content, not only the same counts: each document and log as it was backed up.
  const byId = new Map(restored.spaces.map((s) => [s.id, s]));
  for (const s of backup.spaces) {
    const r = byId.get(s.id);
    if (!r || canonical(r.documents) !== canonical(s.documents) || canonical(r.logs) !== canonical(s.logs)) {
      throw new Error(`Space ${s.id} differs after the restore.`);
    }
  }
  return { createdAt: backup.createdAt, summary: expected };
}

/** JSON with object keys sorted at every level: Postgres' jsonb does not keep the order keys were written in. */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(v);
}

export { getObject };
