// Shared by playwright.live-mock.config.ts, start-mocks.mts and the @live-mock specs: where the mocks listen and which
// dummy credentials they accept. Real tokens never belong here — the mocks reject anything else.
export const ATLASSIAN_MOCK_PORT = Number(process.env.E2E_ATLASSIAN_MOCK_PORT ?? 4396);
export const FIGMA_MOCK_PORT = Number(process.env.E2E_FIGMA_MOCK_PORT ?? 4397);
export const AI_MOCK_PORT = Number(process.env.E2E_AI_MOCK_PORT ?? 4395);
export const SANDBOX_CONTROL_PORT = Number(process.env.E2E_SANDBOX_CONTROL_PORT ?? 4394);
export const APP_PORT = Number(process.env.E2E_LIVE_MOCK_PORT ?? 4398);
export const APP_URL = `http://127.0.0.1:${APP_PORT}`;
export const SANDBOX_CONTROL_URL = `http://127.0.0.1:${SANDBOX_CONTROL_PORT}`;
export const AI_MOCK_API_BASE = `http://127.0.0.1:${AI_MOCK_PORT}/v1`;
export const ATLASSIAN_MOCK_URL = `http://127.0.0.1:${ATLASSIAN_MOCK_PORT}`;
export const FIGMA_MOCK_API_BASE = `http://127.0.0.1:${FIGMA_MOCK_PORT}/v1`;
