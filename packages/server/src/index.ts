import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.js';

const here = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 4317);
const host = process.env.HOST ?? '127.0.0.1';

const { app } = await buildApp({
  dataDir: resolve(process.env.CI_DATA_DIR ?? resolve(here, '../../../.ci-data')),
  webDir: resolve(here, '../../web/dist'),
  logger: process.env.LOG_LEVEL !== 'silent',
});

await app.listen({ port, host });
console.log(`\n  Continuous Intelligence running at http://${host}:${port}\n`);
