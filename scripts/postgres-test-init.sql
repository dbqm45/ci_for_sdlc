-- Test database for packages/server/test/postgres.test.ts, the same as in the `test` job of .github/workflows/ci.yml.
-- Row-level security does not apply to a superuser: the tests use a plain role that owns its database.
create role ci_app login password 'ci-throwaway';
create database ci_test owner ci_app;
