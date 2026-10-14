// Starts the Atlassian (Jira + Confluence) and Figma API mocks with the demo world, and the OpenAI-compatible AI mock,
// for the @live-mock e2e run. Started by playwright.live-mock.config.ts as a web server; listens on 127.0.0.1 only and
// never forwards upstream.
import { demoProject } from '../../packages/core/src/index.js';
import { startAiMock } from '../../packages/core/test/mocks/ai-mock.js';
import { startAtlassianMock } from '../../packages/core/test/mocks/atlassian-mock.js';
import { startFigmaMock } from '../../packages/core/test/mocks/figma-mock.js';
import { AI_MOCK_PORT, ATLASSIAN_MOCK_PORT, FIGMA_MOCK_PORT } from './env.js';

const { requirements, documents, frames } = demoProject();
const atlassian = await startAtlassianMock({ requirements, documents, port: ATLASSIAN_MOCK_PORT });
const figma = await startFigmaMock({ frames, port: FIGMA_MOCK_PORT });
const ai = await startAiMock({ port: AI_MOCK_PORT });
console.log(`Atlassian mock on ${atlassian.baseUrl}, Figma mock on ${figma.apiBase}, AI mock on ${ai.apiBase}`);

// The app keeps HTTP connections alive, so server.close() could wait for them; nothing needs flushing, just exit.
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => process.exit(0));
