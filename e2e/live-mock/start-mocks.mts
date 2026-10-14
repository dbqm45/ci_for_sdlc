// Starts the Atlassian (Jira + Confluence) and Figma API mocks with the demo world, the OpenAI-compatible AI mock and
// the sandbox control endpoint that applies change scenarios and notifies the app by webhook, for the @live-mock e2e
// run. Started by playwright.live-mock.config.ts as a web server; listens on 127.0.0.1 only and never forwards upstream.
import { demoProject } from '../../packages/core/src/index.js';
import { startAiMock } from '../../packages/core/test/mocks/ai-mock.js';
import { startAtlassianMock } from '../../packages/core/test/mocks/atlassian-mock.js';
import { startFigmaMock } from '../../packages/core/test/mocks/figma-mock.js';
import { startSandboxControl } from '../../packages/core/test/mocks/sandbox-control.js';
import { AI_MOCK_PORT, APP_URL, ATLASSIAN_MOCK_PORT, FIGMA_MOCK_PORT, SANDBOX_CONTROL_PORT } from './env.js';

// One mutable world: scenarios change it in place and the mocks read it on every request.
const world = demoProject();
const atlassian = await startAtlassianMock({
  get requirements() {
    return world.requirements;
  },
  get documents() {
    return world.documents;
  },
  port: ATLASSIAN_MOCK_PORT,
});
const figma = await startFigmaMock({
  get frames() {
    return world.frames;
  },
  port: FIGMA_MOCK_PORT,
});
const ai = await startAiMock({ port: AI_MOCK_PORT });
const control = await startSandboxControl({ world, webhookBase: APP_URL, port: SANDBOX_CONTROL_PORT });
console.log(`Atlassian mock on ${atlassian.baseUrl}, Figma mock on ${figma.apiBase}, AI mock on ${ai.apiBase}, sandbox control on ${control.url}`);

// The app keeps HTTP connections alive, so server.close() could wait for them; nothing needs flushing, just exit.
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => process.exit(0));
