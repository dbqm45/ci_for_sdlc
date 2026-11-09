import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

// The closed beta's whole flow (docs/BETA-LOCAL.md) on a server in the local walkthrough mode: fake login, in-app
// mailbox, a clock that moves forward. No Atlassian, no Resend, no secrets; its own data directory.
const PORT = Number(process.env.E2E_BETA_PORT ?? 4398);
const baseURL = `http://localhost:${PORT}`;
process.env.E2E_BETA_DATA_DIR ??= mkdtempSync(join(tmpdir(), 'ci-e2e-beta-'));

export default defineConfig({
  testDir: 'e2e/beta-local',
  // One server, one beta, a clock that only moves forward: the steps run in order.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // No retries: a retry would meet the same server with the beta already moved on, and fail for that reason.
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-beta-local' }]] : 'list',
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {} },
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
      CI_DATA_DIR: process.env.E2E_BETA_DATA_DIR,
      CI_PUBLIC_URL: baseURL,
      CI_AUTH_MODE: 'accounts',
      CI_BETA_LOCAL: '1',
      CI_BOOTSTRAP_EMAIL: 'operator@quorum.local',
      CI_OPERATOR_EMAILS: 'operator@quorum.local',
      ATLASSIAN_CLIENT_ID: 'local-beta-not-used',
      ATLASSIAN_CLIENT_SECRET: 'local-beta-not-used',
      CI_DISABLE_SCHEDULE: 'true',
      LOG_LEVEL: 'silent',
    },
  },
});
