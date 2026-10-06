import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices, type Project } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 4399);
const baseURL = `http://127.0.0.1:${PORT}`;
// A fresh data directory per run, so e2e never touches .ci-data. Workers inherit it through the environment.
process.env.E2E_DATA_DIR ??= mkdtempSync(join(tmpdir(), 'ci-e2e-'));

// Chromium by default; the nightly regression runs one matrix job per browser (E2E_BROWSERS=firefox, …).
const BROWSERS: Record<string, Project['use']> = {
  chromium: {
    ...devices['Desktop Chrome'],
    // Optional: a preinstalled Chromium when the bundled build is not downloaded.
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  firefox: devices['Desktop Firefox'],
  webkit: devices['Desktop Safari'],
};
const browsers = (process.env.E2E_BROWSERS ?? 'chromium').split(',').map((b) => b.trim());
for (const b of browsers) if (!(b in BROWSERS)) throw new Error(`Unknown browser in E2E_BROWSERS: ${b}`);

export default defineConfig({
  testDir: 'e2e',
  // Screenshots are compared only by playwright.visual.config.ts, in the pinned Playwright Docker image.
  testIgnore: ['visual.spec.ts'],
  // Quarantined tests (README → Testy regresji) stay out of the PR gate; the nightly run includes them.
  grepInvert: process.env.E2E_INCLUDE_QUARANTINE ? undefined : /@quarantine/,
  // The server keeps one shared workspace (approvals, demo changes), so tests run one at a time.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // Retries only expose flaky tests in the report; the nightly run fails on them.
  retries: process.env.CI ? 2 : 0,
  failOnFlakyTests: !!process.env.E2E_FAIL_ON_FLAKY,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: browsers.map((name) => ({ name, use: BROWSERS[name] })),
  webServer: {
    command: 'npm run build && npm run start -w @ci/server',
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      PORT: String(PORT),
      HOST: '127.0.0.1',
      CI_DATA_DIR: process.env.E2E_DATA_DIR,
      LOG_LEVEL: 'silent',
    },
  },
});
