import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { DEFAULT_WORKSPACE } from '@ci/core';
import type { Storage } from './workspaces.js';

/**
 * Backups outside the hosting provider (T5, docs/BACKUPS.md). A backup is a logical export of every workspace read
 * through its own backend, so in Postgres each one is read under its own row-level security scope with the
 * application's role (a `pg_dump` with that role sees no rows: the tables force row-level security). Documents
 * are copied as stored, so the ones encrypted with CI_ENCRYPTION_KEY stay encrypted; the whole export is then
 * compressed and sealed with BACKUP_ENCRYPTION_KEY before it leaves the server.
 */

/** The platform's own space (accounts, organizations, beta enrollments, usage), kept beside the workspaces. */
export const PLATFORM_SPACE = '_platform';

/** How many entries a log may hold in a backup (the audit is append-only and can grow). */
const MAX_LOG_ENTRIES = 1_000_000;

export interface BackupSpace {
  id: string;
  documents: Record<string, unknown>;
  logs: Record<string, unknown[]>;
}

export interface Backup {
  format: 'quorum-backup';
  version: 1;
  createdAt: string;
  spaces: BackupSpace[];
}

export interface BackupSummary {
  spaces: number;
  documents: number;
  entries: number;
}

/**
 * The spaces a backup holds: `default`, `_platform` and every workspace listed in `default`'s `workspaces.json`.
 * Workspaces archived on deletion (`deleted:<id>-<time>`) are listed nowhere and are not in the backup.
 */
export async function backupSpaceIds(storage: Storage): Promise<string[]> {
  const listed = await storage.backend(DEFAULT_WORKSPACE).read('workspaces.json');
  if (listed !== undefined && !Array.isArray(listed)) throw new Error('workspaces.json is not a list; nothing was backed up.');
  const ids = (listed ?? []).map((w: { id?: unknown }) => w?.id).filter((id): id is string => typeof id === 'string');
  return [...new Set([DEFAULT_WORKSPACE, PLATFORM_SPACE, ...ids])];
}

/** Reads every space into one backup. */
export async function exportStorage(storage: Storage, at: Date): Promise<Backup> {
  const spaces: BackupSpace[] = [];
  for (const id of await backupSpaceIds(storage)) {
    const b = storage.backend(id);
    const { documents, logs } = await b.names();
    const space: BackupSpace = { id, documents: {}, logs: {} };
    for (const name of documents) {
      const value = await b.read(name);
      if (value !== undefined) space.documents[name] = value;
    }
    for (const log of logs) space.logs[log] = await b.tail(log, MAX_LOG_ENTRIES);
    spaces.push(space);
  }
  return { format: 'quorum-backup', version: 1, createdAt: at.toISOString(), spaces };
}

/** Counts, for logs and for comparing a restore with its backup; never a value. */
export function summarize(backup: Backup): BackupSummary {
  return {
    spaces: backup.spaces.length,
    documents: backup.spaces.reduce((n, s) => n + Object.keys(s.documents).length, 0),
    entries: backup.spaces.reduce((n, s) => n + Object.values(s.logs).reduce((m, l) => m + l.length, 0), 0),
  };
}

/**
 * Writes a backup into empty storage (a restore). A space that already has data is refused before anything is
 * written, so a restore never mixes with live data or runs twice.
 */
export async function importBackup(storage: Storage, backup: Backup): Promise<void> {
  for (const s of backup.spaces) {
    const existing = await storage.backend(s.id).names();
    if (existing.documents.length || existing.logs.length) throw new Error(`Space ${s.id} already has data in the target; nothing was restored.`);
  }
  for (const s of backup.spaces) {
    const to = storage.backend(s.id);
    await to.init();
    for (const [name, value] of Object.entries(s.documents)) await to.write(name, value);
    for (const [log, entries] of Object.entries(s.logs)) for (const e of entries) await to.append(log, e);
  }
}

// ---- sealing: gzip, then AES-256-GCM with a key derived from BACKUP_ENCRYPTION_KEY ----

const MAGIC = Buffer.from('QBK1');
const IV_BYTES = 12;
const TAG_BYTES = 16;
/** A key shorter than this is refused: it is the only thing between a stolen backup and the data. */
export const MIN_SECRET_LENGTH = 32;

function backupKey(secret: string): Buffer {
  if (secret.length < MIN_SECRET_LENGTH) throw new Error(`BACKUP_ENCRYPTION_KEY must be at least ${MIN_SECRET_LENGTH} characters (e.g. openssl rand -hex 32).`);
  return Buffer.from(hkdfSync('sha256', Buffer.from(secret, 'utf8'), Buffer.alloc(0), 'quorum-backup-v1', 32));
}

/** `QBK1` + IV + ciphertext + tag; the magic is authenticated too. */
export function sealBackup(backup: Backup, secret: string): Buffer {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', backupKey(secret), iv);
  cipher.setAAD(MAGIC);
  const body = Buffer.concat([cipher.update(gzipSync(Buffer.from(JSON.stringify(backup), 'utf8'))), cipher.final()]);
  return Buffer.concat([MAGIC, iv, body, cipher.getAuthTag()]);
}

/** Opens a sealed backup and checks its shape; a wrong key or a changed byte is an error, never partial data. */
export function openBackup(sealed: Buffer, secret: string): Backup {
  if (sealed.length < MAGIC.length + IV_BYTES + TAG_BYTES || !sealed.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('Not a Quorum backup (QBK1).');
  const iv = sealed.subarray(MAGIC.length, MAGIC.length + IV_BYTES);
  const decipher = createDecipheriv('aes-256-gcm', backupKey(secret), iv);
  decipher.setAAD(MAGIC);
  decipher.setAuthTag(sealed.subarray(sealed.length - TAG_BYTES));
  let plain: Buffer;
  try {
    plain = Buffer.concat([decipher.update(sealed.subarray(MAGIC.length + IV_BYTES, sealed.length - TAG_BYTES)), decipher.final()]);
  } catch {
    throw new Error('The backup cannot be opened: wrong BACKUP_ENCRYPTION_KEY or the file was changed.');
  }
  return checkBackup(JSON.parse(gunzipSync(plain).toString('utf8')) as unknown);
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** The shape a restore relies on, checked before anything is written. */
export function checkBackup(v: unknown): Backup {
  if (!isRecord(v) || v.format !== 'quorum-backup' || v.version !== 1 || typeof v.createdAt !== 'string' || !Array.isArray(v.spaces)) throw new Error('Not a version 1 Quorum backup.');
  for (const s of v.spaces as unknown[]) {
    if (!isRecord(s) || typeof s.id !== 'string' || !isRecord(s.documents) || !isRecord(s.logs)) throw new Error('A space in the backup has the wrong shape.');
    if (!Object.values(s.logs).every(Array.isArray)) throw new Error(`A log of space ${s.id} is not a list.`);
  }
  return v as unknown as Backup;
}

// ---- where a backup goes ----

export interface Retention {
  dailyDays: number;
  monthlyDays: number;
}

export const DEFAULT_RETENTION: Retention = { dailyDays: 35, monthlyDays: 100 };

/**
 * The objects one run writes, each locked until its date: `daily/<date>.qbk` every run and, on the first day of a
 * month (UTC), also `monthly/<month>.qbk`.
 */
export function backupObjects(at: Date, retention: Retention = DEFAULT_RETENTION): { key: string; retainUntil: Date }[] {
  const day = at.toISOString().slice(0, 10);
  const plus = (days: number) => new Date(at.getTime() + days * 86_400_000);
  const out = [{ key: `daily/${day}.qbk`, retainUntil: plus(retention.dailyDays) }];
  if (at.getUTCDate() === 1) out.push({ key: `monthly/${day.slice(0, 7)}.qbk`, retainUntil: plus(retention.monthlyDays) });
  return out;
}

/** Days from an environment variable: a whole number from 1 to 3650, else the default. */
export function retentionFrom(env: NodeJS.ProcessEnv): Retention {
  const days = (name: string, fallback: number) => {
    const raw = env[name];
    if (raw === undefined || raw === '') return fallback;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1 || n > 3650) throw new Error(`${name} must be a whole number of days from 1 to 3650.`);
    return n;
  };
  return { dailyDays: days('BACKUP_DAILY_DAYS', DEFAULT_RETENTION.dailyDays), monthlyDays: days('BACKUP_MONTHLY_DAYS', DEFAULT_RETENTION.monthlyDays) };
}
