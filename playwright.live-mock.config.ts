import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { FIGMA_MOCK_API_BASE } from './e2e/live-mock/env';
import { DUMMY_AI_API_KEY } from './packages/core/test/mocks/ai-mock';
import { DUMMY_ATLASSIAN_TOKEN } from './packages/core/test/mocks/atlassian-mock';
import { DUMMY_FIGMA_TOKEN } from './packages/core/test/mocks/figma-mock';

// Live mode against local API mocks (docs/TEST-DATA-GENERATOR.md, 6.2): the real Jira, Confluence and Figma connectors
// read the demo world from mocks on 127.0.0.1 and the `custom` AI provider talks to a deterministic AI mock, with dummy
// tokens and keys only — no secrets needed in CI.
const PORT = Number(process.env.E2E_LIVE_MOCK_PORT ?? 4398);
const baseURL = `http://127.0.0.1:${PORT}`;
// Its own data directory, so this run never shares settings with the demo e2e run or .ci-data.
process.env.E2E_LIVE_MOCK_DATA_DIR ??= mkdtempSync(join(tmpdir(), 'ci-e2e-live-mock-'));

export default defineConfig({
  testDir: 'e2e/live-mock',
  // One server and one shared settings document, so tests run one at a time.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-live-mock' }]] : 'list',
  use: { baseURL, trace: 'on-first-retry' },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {} },
    },
  ],
  webServer: [
    {
      command: 'npx tsx e2e/live-mock/start-mocks.mts',
      // Without the dummy token the mock answers 403, which Playwright accepts as "up".
      url: `${FIGMA_MOCK_API_BASE}/files/health`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: 'npm run start',
      url: `${baseURL}/api/health`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        PORT: String(PORT),
        HOST: '127.0.0.1',
        CI_DATA_DIR: process.env.E2E_LIVE_MOCK_DATA_DIR,
        LOG_LEVEL: 'silent',
        CI_DISABLE_SCHEDULE: 'true',
        JIRA_API_TOKEN: DUMMY_ATLASSIAN_TOKEN,
        FIGMA_TOKEN: DUMMY_FIGMA_TOKEN,
        // Accepted only for loopback hosts (figmaApiBase); Jira and Confluence URLs come from the settings.
        CI_FIGMA_API_BASE: FIGMA_MOCK_API_BASE,
        // The AI mock's base URL comes from the settings (ai.baseUrl), like any custom endpoint.
        CUSTOM_AI_API_KEY: DUMMY_AI_API_KEY,
      },
    },
  ],
});
