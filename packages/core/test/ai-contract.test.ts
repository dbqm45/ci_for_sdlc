import { afterEach, describe, expect, it } from 'vitest';
import { OUTPUT_SCHEMA, SYSTEM_PROMPT, createSemanticAnalyzer, renderUserPrompt, type SemanticInput } from '../src/index.js';
import { DUMMY_AI_API_KEY, mockReview, startAiMock, type AiMock } from './mocks/ai-mock.js';

// Contract test: the real `custom` (OpenAI-compatible) analyzer (real fetch, real HTTP) against the local AI mock.
let mock: AiMock | undefined;

afterEach(async () => {
  await mock?.close();
  mock = undefined;
});

const input: SemanticInput = {
  itemKey: 'PAY-123',
  itemType: 'story',
  title: 'Pay by card',
  sources: [
    { ref: 'S1', entityId: 'jira:PAY-123', source: 'jira', title: 'PAY-123 Pay by card', content: 'Type: story\nDescription:\nThe customer pays by card.' },
    { ref: 'S2', entityId: 'confluence:1', source: 'confluence', title: 'Payments', content: 'Card payments time out after 30 s.' },
  ],
  knownFindings: [],
  knownQuestions: [],
};

describe('custom AI provider against the mock API', () => {
  it('AC-01: returns the deterministic review, citing the first source with a quote from it', async () => {
    mock = await startAiMock();
    const analyzer = createSemanticAnalyzer({ provider: 'custom', model: 'mock-model', baseUrl: mock.apiBase }, { customApiKey: DUMMY_AI_API_KEY });
    const out = await analyzer!.analyze(input);
    expect(out).toEqual(mockReview(renderUserPrompt(input)));
    expect(out.findings[0]?.evidence).toEqual([{ ref: 'S1', quote: 'Type: story' }]);
    expect(out.findings[0]?.title).toMatch(/^PAY-123: /);
    expect(out.challenges).toHaveLength(1);
  });

  it('AC-02: sends the system prompt, the rendered sources and the strict JSON schema', async () => {
    mock = await startAiMock();
    await createSemanticAnalyzer({ provider: 'custom', model: 'mock-model', baseUrl: `${mock.apiBase}/` }, { customApiKey: DUMMY_AI_API_KEY })!.analyze(input);
    const [request] = mock.requests;
    expect(request?.path).toBe('/v1/chat/completions');
    expect(request?.body.model).toBe('mock-model');
    expect(request?.body.messages).toEqual([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: renderUserPrompt(input) },
    ]);
    expect(request?.body.response_format).toEqual({ type: 'json_schema', json_schema: { name: 'specification_review', strict: true, schema: OUTPUT_SCHEMA } });
  });

  it('AC-03: a key other than the dummy one gets 401 and the error says so', async () => {
    mock = await startAiMock();
    const analyzer = createSemanticAnalyzer({ provider: 'custom', model: 'mock-model', baseUrl: mock.apiBase }, { customApiKey: 'sk-real-looking' });
    await expect(analyzer!.analyze(input)).rejects.toThrow(/custom request failed: HTTP 401/);
    expect(mock.requests).toEqual([]);
  });

  it('AC-04: without a key no Authorization header is sent, so the mock refuses the request', async () => {
    mock = await startAiMock();
    const analyzer = createSemanticAnalyzer({ provider: 'custom', model: 'mock-model', baseUrl: mock.apiBase });
    await expect(analyzer!.analyze(input)).rejects.toThrow(/HTTP 401/);
  });
});
