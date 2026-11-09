import pg from 'pg';
import { errorMessage } from '@ci/core';
import { retentionFrom } from './backup.js';
import { runBackup } from './backup-run.js';
import { s3ConfigFrom } from './s3.js';
import { PgStorage } from './workspaces.js';

// npm run backup — the daily backup (T5, docs/BACKUPS.md), run by the Render cron job `quorum-backup`: every space
// from CI_DATABASE_URL, sealed with BACKUP_ENCRYPTION_KEY, to Backblaze B2 locked in compliance mode. One JSON line
// with counts; exit 1 on any failure, so Render marks the run failed and notifies.
const log = (level: 'info' | 'error', msg: string, extra: Record<string, unknown> = {}) =>
  console[level === 'error' ? 'error' : 'log'](JSON.stringify({ time: new Date().toISOString(), level, service: 'quorum-backup', msg, ...extra }));

const url = process.env.CI_DATABASE_URL;
const secret = process.env.BACKUP_ENCRYPTION_KEY ?? '';
let pool: pg.Pool | undefined;
try {
  if (!url) throw new Error('Set CI_DATABASE_URL.');
  const s3 = s3ConfigFrom(process.env);
  pool = new pg.Pool({ connectionString: url, max: 2 });
  const r = await runBackup({ storage: new PgStorage(pool), s3, secret, retention: retentionFrom(process.env) });
  log('info', 'backup uploaded', { keys: r.keys, bytes: r.bytes, ...r.summary });
} catch (e) {
  log('error', 'backup failed', { err: errorMessage(e) });
  process.exitCode = 1;
} finally {
  await pool?.end();
}
