import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_ENV_FILE, loadEnvFile } from '../src/env-file.js';

// npm start / npm run dev read the repository's .env, so secrets need not precede the command.

const dir = mkdtempSync(join(tmpdir(), 'ci-env-'));
afterEach(() => {
  delete process.env.CI_ENV_TEST_A;
  delete process.env.CI_ENV_TEST_B;
});

describe('.env file', () => {
  it('ENV-01: values from the file are loaded; a variable already in the environment wins', () => {
    const file = join(dir, '.env');
    writeFileSync(file, 'CI_ENV_TEST_A=from-file\nCI_ENV_TEST_B=from-file\n');
    process.env.CI_ENV_TEST_A = 'from-env';
    expect(loadEnvFile(file)).toBe(true);
    expect(process.env.CI_ENV_TEST_A).toBe('from-env');
    expect(process.env.CI_ENV_TEST_B).toBe('from-file');
  });

  it('ENV-02: no file, nothing loaded and no error', () => {
    let called = false;
    expect(loadEnvFile(join(dir, 'missing.env'), () => (called = true))).toBe(false);
    expect(called).toBe(false);
  });

  it('ENV-03: the default is the .env at the repository root', () => {
    expect(DEFAULT_ENV_FILE).toBe(resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env'));
  });
});

process.on('exit', () => rmSync(dir, { recursive: true, force: true }));
