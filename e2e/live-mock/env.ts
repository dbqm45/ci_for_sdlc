// Shared by playwright.live-mock.config.ts, start-mocks.mts and the @live-mock specs: where the mocks listen and which
// dummy credentials they accept. Real tokens never belong here — the mocks reject anything else.
export const ATLASSIAN_MOCK_PORT = Number(process.env.E2E_ATLASSIAN_MOCK_PORT ?? 4396);
export const FIGMA_MOCK_PORT = Number(process.env.E2E_FIGMA_MOCK_PORT ?? 4397);
export const ATLASSIAN_MOCK_URL = `http://127.0.0.1:${ATLASSIAN_MOCK_PORT}`;
export const FIGMA_MOCK_API_BASE = `http://127.0.0.1:${FIGMA_MOCK_PORT}/v1`;
