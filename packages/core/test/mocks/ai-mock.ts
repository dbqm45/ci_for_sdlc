import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { SemanticOutput } from '../../src/index.js';

/**
 * OpenAI-compatible chat completions mock (test data generator, stage E2) for the `custom` AI provider. Answers every
 * review with the same deterministic finding and challenge built from the prompt, so tests need no model and no key.
 * Listens on 127.0.0.1 only, accepts a single dummy key and never forwards anything upstream.
 */
export interface AiMockOptions {
  /** The only API key accepted; real keys never belong in tests. */
  apiKey?: string;
  /** Fixed port (e2e web servers need a known URL); 0 or unset picks a free one. */
  port?: number;
}

export interface AiMockRequest {
  path: string;
  /** Parsed JSON body of the chat completions request. */
  body: { model?: string; messages?: { role: string; content: string }[]; response_format?: { type?: string; json_schema?: { name?: string } } };
}

export interface AiMock {
  /** Value for the `custom` provider's baseUrl (settings ai.baseUrl). */
  apiBase: string;
  /** Chat completions requests in arrival order. */
  requests: AiMockRequest[];
  close(): Promise<void>;
}

export const DUMMY_AI_API_KEY = 'dummy-ai-key';

/**
 * The review the mock returns for a user prompt (renderUserPrompt): one finding citing the first source with its first
 * non-empty line as the quote, and one challenge. Exported so tests derive expectations instead of copying them.
 */
export function mockReview(prompt: string): SemanticOutput {
  const itemKey = /^Work item: (\S+)/m.exec(prompt)?.[1] ?? 'UNKNOWN';
  const source = /<source ref="([^"]+)"[^>]*>\n([\s\S]*?)\n<\/source>/.exec(prompt);
  const ref = source?.[1] ?? 'S1';
  const quote = (source?.[2] ?? '').split('\n').find((l) => l.trim())?.trim() ?? '';
  return {
    findings: [
      {
        category: 'GAP',
        severity: 'warning',
        dimension: 'errorHandling',
        title: `${itemKey}: mock reviewer expects a documented timeout fallback`,
        explanation: 'Deterministic finding from the AI provider mock; it cites the first source it was given.',
        evidence: [{ ref, quote }],
      },
    ],
    challenges: [
      {
        question: `What should ${itemKey} show when the upstream service never answers?`,
        rationale: 'Deterministic challenge from the AI provider mock.',
        options: ['An error with a retry button', 'A cached result'],
        topic: 'ai mock',
      },
    ],
  };
}

export async function startAiMock(opts: AiMockOptions = {}): Promise<AiMock> {
  const apiKey = opts.apiKey ?? DUMMY_AI_API_KEY;
  const requests: AiMockRequest[] = [];

  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    const error = (status: number, message: string, type: string) => send(status, { error: { message, type } });
    if (req.method !== 'POST') return error(405, 'Method not allowed', 'invalid_request_error');
    if (req.headers.authorization !== `Bearer ${apiKey}`) return error(401, 'Incorrect API key provided', 'invalid_request_error');
    if (url.pathname !== '/v1/chat/completions') return error(404, 'Not found', 'invalid_request_error');

    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      let body: AiMockRequest['body'];
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as AiMockRequest['body'];
      } catch {
        return error(400, 'Invalid JSON body', 'invalid_request_error');
      }
      requests.push({ path: url.pathname, body });
      const prompt = body.messages?.find((m) => m.role === 'user')?.content ?? '';
      send(200, {
        id: `chatcmpl-mock-${requests.length}`,
        object: 'chat.completion',
        created: 0,
        model: body.model ?? 'mock',
        choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(mockReview(prompt)) } }],
      });
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(opts.port ?? 0, '127.0.0.1', resolve);
  });
  const { port } = server.address() as AddressInfo;
  return {
    apiBase: `http://127.0.0.1:${port}/v1`,
    requests,
    close: () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}
