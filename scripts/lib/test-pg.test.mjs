import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { LOCAL_URL, hostPort, testDatabaseUrl, unreachableHint } from './test-pg.mjs';

const root = new URL('../../', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, root), 'utf8');

test('local URL matches the role and database of the CI job and of docker-compose.test.yml', () => {
  assert.equal(LOCAL_URL, 'postgres://ci_app:ci-throwaway@localhost:55432/ci_test');
  const ci = read('.github/workflows/ci.yml');
  assert.match(ci, /create role ci_app login password 'ci-throwaway'/);
  assert.match(ci, /create database ci_test owner ci_app/);
  const init = read('scripts/postgres-test-init.sql');
  assert.match(init, /create role ci_app login password 'ci-throwaway'/i);
  assert.match(init, /create database ci_test owner ci_app/i);
  const statements = init.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  assert.doesNotMatch(statements, /superuser/i, 'the test role must not be a superuser (row-level security)');
  const compose = read('docker-compose.test.yml');
  assert.match(compose, /127\.0\.0\.1:55432:5432/);
  assert.match(compose, /healthcheck:/);
  assert.match(compose, /postgres-test-init\.sql:\/docker-entrypoint-initdb\.d\//);
});

test('CI_TEST_DATABASE_URL from the environment wins over the local default', () => {
  assert.equal(testDatabaseUrl({}), LOCAL_URL);
  assert.equal(testDatabaseUrl({ CI_TEST_DATABASE_URL: '' }), LOCAL_URL);
  assert.equal(testDatabaseUrl({ CI_TEST_DATABASE_URL: 'postgres://a:b@db:5432/x' }), 'postgres://a:b@db:5432/x');
});

test('host and port come from the URL, 5432 when the port is missing', () => {
  assert.deepEqual(hostPort(LOCAL_URL), { host: 'localhost', port: 55432 });
  assert.deepEqual(hostPort('postgres://u:p@db.internal/x'), { host: 'db.internal', port: 5432 });
});

test('the hint names the command that starts the database and does not print the password', () => {
  const hint = unreachableHint(LOCAL_URL);
  assert.match(hint, /npm run db:test:up/);
  assert.match(hint, /localhost:55432/);
  assert.doesNotMatch(hint, /ci-throwaway/);
});

test('npm scripts: db:test:up waits for the healthcheck, test:pg runs the Postgres tests', () => {
  const scripts = JSON.parse(read('package.json')).scripts;
  assert.match(scripts['db:test:up'], /docker compose -f docker-compose\.test\.yml up -d --wait/);
  assert.match(scripts['db:test:down'], /docker compose -f docker-compose\.test\.yml down/);
  assert.equal(scripts['test:pg'], 'node scripts/test-pg.mjs');
});
