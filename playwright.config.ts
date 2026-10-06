import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 4399);
const baseURL = `http://127.0.0.1:${PORT}`;
// A fresh data directory per run, so e2e never touches .ci-data. Workers inherit it through the environment.
process.env.E2E_DATA_DIR ??= mkdtempSync(join(tmpdir(), 'ci-e2e-'));

export default defineConfig({
  testDir: 'e2e',
  // The server keeps one shared workspace (approvals, demo changes), so tests run one at a time.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Optional: a preinstalled Chromium when the bundled build is not downloaded.
        launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
      },
    },
  ],
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
