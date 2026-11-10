#!/usr/bin/env node
// `npm run test:pg`: the Postgres storage tests before a push, not only in CI. Uses CI_TEST_DATABASE_URL or the
// local test database from docker-compose.test.yml (`npm run db:test:up`). Without a database it stops with a hint
// instead of letting vitest skip the tests silently.
import { spawnSync } from 'node:child_process';
import { connect } from 'node:net';
import { hostPort, testDatabaseUrl, unreachableHint } from './lib/test-pg.mjs';

const url = testDatabaseUrl(process.env);
const { host, port } = hostPort(url);

const reachable = await new Promise((resolve) => {
  const socket = connect({ host, port, timeout: 2000 });
  socket.once('connect', () => (socket.end(), resolve(true)));
  socket.once('timeout', () => (socket.destroy(), resolve(false)));
  socket.once('error', () => resolve(false));
});
if (!reachable) {
  console.error(`✗ ${unreachableHint(url)}`);
  process.exit(1);
}

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const run = spawnSync(npm, ['run', 'test', '-w', '@ci/server', '--', 'test/postgres.test.ts'], {
  stdio: 'inherit',
  env: { ...process.env, CI_TEST_DATABASE_URL: url },
  shell: process.platform === 'win32',
});
process.exit(run.status ?? 1);
