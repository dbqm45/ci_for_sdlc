import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { errorMessage } from '@ci/core';
import { importFiles } from './db-import.js';

// npm run db:import — copies CI_DATA_DIR (default .ci-data/) into the database at CI_DATABASE_URL (F5).
const here = fileURLToPath(new URL('.', import.meta.url));
const dataDir = resolve(process.env.CI_DATA_DIR ?? resolve(here, '../../../.ci-data'));
const url = process.env.CI_DATABASE_URL;
if (!url) {
  console.error('Set CI_DATABASE_URL to the database to import into (from the environment or a password manager).');
  process.exit(2);
}
const pool = new pg.Pool({ connectionString: url, max: 2 });
try {
  for (const r of await importFiles(dataDir, pool)) console.log(`${r.workspace}: ${r.documents} documents, ${r.entries} log entries`);
  console.log(`Imported ${dataDir}. Start the server with CI_DATABASE_URL to use the database; the files stay as they were.`);
} catch (e) {
  console.error(`Import failed: ${errorMessage(e)}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
