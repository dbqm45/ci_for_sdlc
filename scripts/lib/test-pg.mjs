// Postgres storage tests on this computer (packages/server/test/postgres.test.ts): the same role and database as the
// `test` job in .github/workflows/ci.yml, served by docker-compose.test.yml on 127.0.0.1:55432. The password is a
// throwaway value of a container that keeps no data (tmpfs).

export const LOCAL_URL = 'postgres://ci_app:ci-throwaway@localhost:55432/ci_test';

/** CI_TEST_DATABASE_URL from the environment, else the local test database. */
export function testDatabaseUrl(env) {
  return env.CI_TEST_DATABASE_URL || LOCAL_URL;
}

/** Host and port of a Postgres URL (5432 when the URL has no port). */
export function hostPort(url) {
  const u = new URL(url);
  return { host: u.hostname, port: Number(u.port || 5432) };
}

/** What to do when the database does not answer; never includes the password. */
export function unreachableHint(url) {
  const { host, port } = hostPort(url);
  return (
    `Postgres does not answer on ${host}:${port}. Start the test database with \`npm run db:test:up\` ` +
    '(Docker; stop it with `npm run db:test:down`) or set CI_TEST_DATABASE_URL to a database owned by a role ' +
    'that is not a superuser.'
  );
}
