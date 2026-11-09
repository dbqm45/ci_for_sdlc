import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { errorMessage } from '@ci/core';
import { migrate } from './backend.js';
import { getObject, latestBackupKey, runRestoreCheck } from './backup-run.js';
import { s3ConfigFrom } from './s3.js';
import { PgStorage } from './workspaces.js';

// npm run restore-check [-- <file.qbk | daily/<date>.qbk>] — the restore check of T5 (docs/BACKUPS.md): restores a
// backup (the newest daily one by default) into the EMPTY database at RESTORE_DATABASE_URL, reads it back and
// compares. Never CI_DATABASE_URL: a restore into live data is refused.
const target = process.env.RESTORE_DATABASE_URL;
const secret = process.env.BACKUP_ENCRYPTION_KEY ?? '';
const source = process.argv[2];
let pool: pg.Pool | undefined;
try {
  if (!target) throw new Error('Set RESTORE_DATABASE_URL to an empty scratch database (docs/BACKUPS.md, "Próba odtworzenia").');
  if (process.env.CI_DATABASE_URL && process.env.CI_DATABASE_URL === target) throw new Error('RESTORE_DATABASE_URL is CI_DATABASE_URL: restore only into an empty scratch database.');
  let sealed: Buffer;
  let from: string;
  if (source && !source.startsWith('daily/') && !source.startsWith('monthly/')) {
    sealed = await readFile(source);
    from = source;
  } else {
    const s3 = s3ConfigFrom(process.env);
    from = source ?? (await latestBackupKey(s3));
    sealed = await getObject(s3, from);
  }
  pool = new pg.Pool({ connectionString: target, max: 2 });
  await migrate(pool);
  const r = await runRestoreCheck({ storage: new PgStorage(pool), sealed, secret });
  console.log(`OK: ${from} (made ${r.createdAt}) restored: ${r.summary.spaces} spaces, ${r.summary.documents} documents, ${r.summary.entries} log entries, all as in the backup.`);
} catch (e) {
  console.error(`Restore check failed: ${errorMessage(e)}`);
  process.exitCode = 1;
} finally {
  await pool?.end();
}
