import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_PORT, accountsOf, missingRequired, modeOf, needsInstall, nodeOk, optionalStatus, parseArgs, plan, shouldUseOp } from './local.mjs';

// Expected behaviour: docs/CONNECT-ATLASSIAN.md (modes, callback) and docs/LOCAL-ENVIRONMENT.md, section 2
// (keys from the environment or 1Password, never from a file the script writes).

describe('LOC-ARGS: npm run local options', () => {
  it('LOC-ARGS-1: no options = token mode decided later, production build, prompting on', () => {
    assert.deepEqual(parseArgs([]), { dev: false, prompt: true, help: false });
  });
  it('LOC-ARGS-2: reads every option', () => {
    assert.deepEqual(parseArgs(['--oauth', '--dev', '--port', '4317', '--env-file', '~/x.env', '--no-prompt']), { mode: 'oauth', dev: true, port: 4317, envFile: '~/x.env', prompt: false, help: false });
  });
  it('LOC-ARGS-4: --accounts turns on logging in, with either connection mode', () => {
    assert.deepEqual(parseArgs(['--accounts']), { dev: false, prompt: true, help: false, accounts: true });
    assert.deepEqual(parseArgs(['--accounts', '--oauth']), { mode: 'oauth', dev: false, prompt: true, help: false, accounts: true });
  });
  for (const [argv, error] of [
    [['--oauth', '--token'], /jedno/],
    [['--port'], /wymaga wartości/],
    [['--port', '70000'], /numer portu/],
    [['--port', 'abc'], /numer portu/],
    [['--verbose'], /Nieznana opcja: --verbose/],
    [['--dev', '--port', '8080'], /tylko z portem 4317/],
  ]) {
    it(`LOC-ARGS-3: refuses ${argv.join(' ')}`, () => assert.match(parseArgs(argv).error ?? '', error));
  }
});

describe('LOC-MODE: which connection mode', () => {
  it('LOC-MODE-1: a flag wins over CI_CONNECT_MODE; only "oauth" selects oauth', () => {
    assert.equal(modeOf({}, {}), 'token');
    assert.equal(modeOf({}, { CI_CONNECT_MODE: 'oauth' }), 'oauth');
    assert.equal(modeOf({ mode: 'token' }, { CI_CONNECT_MODE: 'oauth' }), 'token');
    assert.equal(modeOf({}, { CI_CONNECT_MODE: 'sso' }), 'token');
  });
  it('LOC-MODE-2: oauth needs client id, secret and the encryption key; token mode needs nothing to start', () => {
    assert.deepEqual(missingRequired('oauth', { ATLASSIAN_CLIENT_ID: 'dummy-id', CI_ENCRYPTION_KEY: ' ' }).map((m) => m.name), ['ATLASSIAN_CLIENT_SECRET', 'CI_ENCRYPTION_KEY']);
    assert.deepEqual(missingRequired('token', {}), []);
  });
  it('LOC-MODE-3: optional keys are reported by name and presence only, never by value', () => {
    const status = optionalStatus('token', { JIRA_API_TOKEN: 'dummy-secret-value' });
    assert.deepEqual(status.find((s) => s.name === 'JIRA_API_TOKEN'), { name: 'JIRA_API_TOKEN', set: true });
    assert.equal(JSON.stringify(status).includes('dummy-secret-value'), false);
  });
});

describe('LOC-ACC: logging in with Atlassian (docs/ACCOUNTS-PLAN.md)', () => {
  it('LOC-ACC-1: --accounts wins; otherwise CI_AUTH_MODE=accounts turns it on', () => {
    assert.equal(accountsOf({ accounts: true }, {}), true);
    assert.equal(accountsOf({}, { CI_AUTH_MODE: 'accounts' }), true);
    assert.equal(accountsOf({}, { CI_AUTH_MODE: 'token' }), false);
    assert.equal(accountsOf({}, {}), false);
  });
  it('LOC-ACC-2: logging in needs the Atlassian app, not the encryption key; with oauth the variables are not asked twice', () => {
    assert.deepEqual(missingRequired('token', {}, true).map((m) => m.name), ['ATLASSIAN_CLIENT_ID', 'ATLASSIAN_CLIENT_SECRET']);
    assert.deepEqual(missingRequired('oauth', {}, true).map((m) => m.name), ['ATLASSIAN_CLIENT_ID', 'ATLASSIAN_CLIENT_SECRET', 'CI_ENCRYPTION_KEY']);
    assert.deepEqual(missingRequired('token', { ATLASSIAN_CLIENT_ID: 'dummy-id', ATLASSIAN_CLIENT_SECRET: 'dummy-secret' }, true), []);
  });
  it('LOC-ACC-3: CI_AUTH_MODE=accounts is set and CI_BOOTSTRAP_EMAIL is reported by name only', () => {
    const p = plan({ mode: 'token', dev: false, accounts: true }, {});
    assert.equal(p.vars.CI_AUTH_MODE, 'accounts');
    assert.equal(p.callbackUrl, 'http://localhost:4317/api/connections/atlassian/callback');
    assert.equal(plan({ mode: 'token', dev: false }, {}).vars.CI_AUTH_MODE, undefined);
    const status = optionalStatus('token', { CI_BOOTSTRAP_EMAIL: 'owner@example.test' }, true);
    assert.deepEqual(status.find((s) => s.name === 'CI_BOOTSTRAP_EMAIL'), { name: 'CI_BOOTSTRAP_EMAIL', set: true });
    assert.equal(JSON.stringify(status).includes('owner@example.test'), false);
    assert.equal(optionalStatus('token', {}).some((s) => s.name === 'CI_BOOTSTRAP_EMAIL'), false);
  });
});

describe('LOC-PLAN: what starts where', () => {
  it('LOC-PLAN-1: default = npm start on 4317, callback on the same address', () => {
    const p = plan({ mode: 'oauth', dev: false }, {});
    assert.equal(p.npmScript, 'start');
    assert.equal(p.appUrl, `http://localhost:${DEFAULT_PORT}`);
    assert.equal(p.healthUrl, `http://127.0.0.1:${DEFAULT_PORT}/api/health`);
    assert.equal(p.callbackUrl, 'http://localhost:4317/api/connections/atlassian/callback');
    assert.deepEqual(p.vars, { CI_CONNECT_MODE: 'oauth', PORT: '4317', HOST: '127.0.0.1', CI_PUBLIC_URL: 'http://localhost:4317' });
  });
  it('LOC-PLAN-2: --dev opens Vite on 5173, which also receives the callback', () => {
    const p = plan({ mode: 'oauth', dev: true }, {});
    assert.equal(p.npmScript, 'dev');
    assert.equal(p.appUrl, 'http://localhost:5173');
    assert.equal(p.callbackUrl, 'http://localhost:5173/api/connections/atlassian/callback');
  });
  it('LOC-PLAN-3: --port and an existing CI_PUBLIC_URL are kept', () => {
    const p = plan({ mode: 'token', dev: false, port: 8080 }, { CI_PUBLIC_URL: 'https://ci.example.test/' });
    assert.equal(p.vars.PORT, '8080');
    assert.equal(p.vars.CI_PUBLIC_URL, 'https://ci.example.test/');
    assert.equal(p.callbackUrl, 'https://ci.example.test/api/connections/atlassian/callback');
  });
});

describe('LOC-ENV: dependencies, 1Password, Node', () => {
  it('LOC-ENV-1: installs when nothing is installed or the lockfile is newer', () => {
    assert.equal(needsInstall({ lockMtimeMs: 2 }), true);
    assert.equal(needsInstall({ lockMtimeMs: 2, installedMtimeMs: 1 }), true);
    assert.equal(needsInstall({ lockMtimeMs: 1, installedMtimeMs: 2 }), false);
  });
  it('LOC-ENV-2: re-runs under op only with the CLI and a references file, and never twice', () => {
    assert.equal(shouldUseOp({ underOp: false, opAvailable: true, envFileExists: true }), true);
    assert.equal(shouldUseOp({ underOp: true, opAvailable: true, envFileExists: true }), false);
    assert.equal(shouldUseOp({ underOp: false, opAvailable: false, envFileExists: true }), false);
    assert.equal(shouldUseOp({ underOp: false, opAvailable: true, envFileExists: false }), false);
  });
  it('LOC-ENV-3: Node 22 or newer', () => {
    assert.equal(nodeOk('v22.12.0'), true);
    assert.equal(nodeOk('v24.1.0'), true);
    assert.equal(nodeOk('v20.18.0'), false);
  });
});
