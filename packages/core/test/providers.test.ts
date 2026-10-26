import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSemanticAnalyzer, parseOutput, renderUserPrompt, type AiProviderConfig, type SemanticInput } from '../src/index.js';

/** Fake for the network port: records every request and answers with the queued responses. */
function fakeFetch(...responses: Response[]) {
  const calls: { url: string; headers: Record<string, string>; body: Record<string, unknown> }[] = [];
  const fn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    calls.push({ url: String(input instanceof Request ? input.url : input), headers, body: JSON.parse(String(init?.body ?? '{}')) });
    const next = responses.shift();
    if (!next) throw new Error('unexpected request');
    return next;
  });
  vi.stubGlobal('fetch', fn);
  return calls;
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const input: SemanticInput = {
  itemKey: 'PAY-1',
  itemType: 'story',
  title: 'Retry payment',
  sources: [{ ref: 'S1', entityId: 'jira:PAY-1', source: 'jira', title: 'Say "hi"', content: 'Body' }],
  knownFindings: [],
  knownQuestions: ['Who pays?'],
};

const finding = { category: 'GAP', severity: 'warning', dimension: 'design', title: 't', explanation: 'e', evidence: [{ ref: 'S1', quote: 'q' }] };
const output = JSON.stringify({ findings: [finding], challenges: [] });
const openAiReply = (content: string) => json({ choices: [{ message: { content } }] });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('renderUserPrompt', () => {
  it('AI-01: wraps sources in tagged blocks, escapes quotes in titles and lists known questions', () => {
    const p = renderUserPrompt(input);
    expect(p).toContain('Work item: PAY-1 (story) — Retry payment');
    expect(p).toContain(`<source ref="S1" type="jira" title="Say 'hi'">\nBody\n</source>`);
    expect(p).toMatch(/<already_known_findings>\n- none\n/);
    expect(p).toMatch(/<already_asked_questions>\n- Who pays\?\n/);
  });
});

describe('parseOutput', () => {
  it.each([
    { id: 'AI-02', text: 'no json here' },
    { id: 'AI-03', text: '} reversed {' },
  ])('$id: rejects a response without a JSON object', ({ text }) => {
    expect(() => parseOutput(text)).toThrow('AI response did not contain JSON');
  });

  it('AI-04: extracts JSON surrounded by prose', () => {
    expect(parseOutput(`Here you go:\n${output}\nThanks`).findings).toEqual([finding]);
  });

  it.each([
    { id: 'AI-05', text: '{"findings": "x", "challenges": 3}' },
    { id: 'AI-06', text: '[{}]' },
  ])('$id: falls back to empty lists when the shape is wrong', ({ text }) => {
    expect(parseOutput(text)).toEqual({ findings: [], challenges: [] });
  });
});

describe('createSemanticAnalyzer', () => {
  it('AI-07: returns nothing when AI is disabled', () => {
    expect(createSemanticAnalyzer({ provider: 'none', model: '' })).toBeUndefined();
  });

  it('AI-08: OpenAI uses the default model, bearer key and default temperature', async () => {
    const calls = fakeFetch(openAiReply(output));
    const a = createSemanticAnalyzer({ provider: 'openai', model: '' }, { openaiApiKey: 'sk-test' })!;
    expect(a.model).toBe('gpt-5');
    const out = await a.analyze(input);
    expect(out.findings).toEqual([finding]);
    expect(calls[0]?.url).toBe('https://api.openai.com/v1/chat/completions');
    expect(calls[0]?.headers.authorization).toBe('Bearer sk-test');
    expect(calls[0]?.body).toMatchObject({ model: 'gpt-5', temperature: 0.2, response_format: { type: 'json_schema' } });
  });

  it('AI-09: Azure OpenAI builds the deployment URL and sends the api-key header', async () => {
    const calls = fakeFetch(openAiReply(output));
    const cfg: AiProviderConfig = { provider: 'azure-openai', model: 'my deploy', baseUrl: 'https://res.openai.azure.com/', temperature: 0 };
    await createSemanticAnalyzer(cfg, { azureOpenaiApiKey: 'az-key' })!.analyze(input);
    expect(calls[0]?.url).toBe('https://res.openai.azure.com/openai/deployments/my%20deploy/chat/completions?api-version=2024-10-21');
    expect(calls[0]?.headers['api-key']).toBe('az-key');
    expect(calls[0]?.body.temperature).toBe(0);
  });

  it.each([
    { id: 'AI-10', key: undefined, auth: undefined },
    { id: 'AI-11', key: 'local-key', auth: 'Bearer local-key' },
  ])('$id: custom endpoint sends Authorization only when a key is set', async ({ key, auth }) => {
    const calls = fakeFetch(openAiReply(output));
    await createSemanticAnalyzer({ provider: 'custom', model: 'llama', baseUrl: 'http://llm.local/v1' }, { customApiKey: key })!.analyze(input);
    expect(calls[0]?.url).toBe('http://llm.local/v1/chat/completions');
    expect(calls[0]?.headers.authorization).toBe(auth);
  });

  it('AI-12: reports the provider and HTTP status of a failed request', async () => {
    fakeFetch(new Response('rate limited', { status: 429 }));
    await expect(createSemanticAnalyzer({ provider: 'openai', model: 'gpt-5' })!.analyze(input)).rejects.toThrow('openai request failed: HTTP 429 rate limited');
  });

  it('AI-13: an empty choice list is treated as a response without JSON', async () => {
    fakeFetch(json({ choices: [] }));
    await expect(createSemanticAnalyzer({ provider: 'openai', model: 'gpt-5' })!.analyze(input)).rejects.toThrow('did not contain JSON');
  });
});

describe('Claude analyzer (Anthropic API)', () => {
  const message = (stop_reason: string, text = output) =>
    json({ id: 'msg_1', type: 'message', role: 'assistant', model: 'm', content: [{ type: 'text', text }], stop_reason, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } });

  it('AI-14: requests structured output with the configured effort and parses the text blocks', async () => {
    const calls = fakeFetch(message('end_turn'));
    const a = createSemanticAnalyzer({ provider: 'anthropic', model: 'claude-sonnet-5', effort: 'low' }, { anthropicApiKey: 'ak' })!;
    expect((await a.analyze(input)).findings).toEqual([finding]);
    // @anthropic-ai/sdk 1.x sends the API key as a bearer token instead of x-api-key.
    expect(calls[0]?.headers.authorization).toBe('Bearer ak');
    expect(calls[0]?.body).toMatchObject({ model: 'claude-sonnet-5', output_config: { effort: 'low', format: { type: 'json_schema' } } });
    expect(calls[0]?.body.fallbacks).toBeUndefined();
  });

  it('AI-15: the default model opts in to the server-side refusal fallback', async () => {
    const calls = fakeFetch(message('end_turn'));
    const a = createSemanticAnalyzer({ provider: 'anthropic', model: '' }, { anthropicApiKey: 'ak' })!;
    expect(a.model).toBe('claude-opus-5-5');
    await a.analyze(input);
    expect(calls[0]?.body).toMatchObject({ fallbacks: 'default', output_config: { effort: 'high' } });
  });

  it.each([
    { id: 'AI-16', stop: 'refusal', error: 'declined' },
    { id: 'AI-17', stop: 'max_tokens', error: 'cut off' },
  ])('$id: stop_reason $stop is reported as an error', async ({ stop, error }) => {
    fakeFetch(message(stop));
    await expect(createSemanticAnalyzer({ provider: 'anthropic', model: 'claude-opus-5-5' }, { anthropicApiKey: 'ak' })!.analyze(input)).rejects.toThrow(error);
  });
});
