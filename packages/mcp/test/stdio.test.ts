import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { ITEM, fakeApi, type FakeApi } from './fixtures.js';

// The server as Claude runs it (K-1, docs/MCP-K1-PLAN.md): `node src/ci-sdlc-mcp.js`, newline-delimited JSON-RPC on
// stdin/stdout, answered in order; stdout carries only protocol messages.

const BIN = fileURLToPath(new URL('../src/ci-sdlc-mcp.js', import.meta.url));
let api: FakeApi | undefined;
afterEach(async () => api?.close());

async function converse(env: Record<string, string>, lines: string[]): Promise<unknown[]> {
  const child = spawn(process.execPath, [BIN], { env: { PATH: process.env.PATH ?? '', ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
  const out: unknown[] = [];
  const rl = createInterface({ input: child.stdout });
  rl.on('line', (l) => out.push(JSON.parse(l)));
  for (const l of lines) child.stdin.write(`${l}\n`);
  child.stdin.end();
  const code = await new Promise<number | null>((resolve) => child.on('close', resolve));
  expect(code).toBe(0);
  return out;
}

describe('ci-sdlc-mcp.js over stdio', () => {
  it('STD-01: initialize, tools/list and a tool call against the service, in order', async () => {
    api = await fakeApi({ '/api/items/TSK-57': { body: ITEM } });
    const out = await converse({ CI_SDLC_URL: api.url }, [
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } } }),
      JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
      JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
      JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'get_item_readiness', arguments: { key: 'TSK-57' } } }),
    ]);
    expect(out.map((m) => (m as { id: number }).id)).toEqual([1, 2, 3]);
    expect(out[0]).toMatchObject({ result: { protocolVersion: '2025-06-18', serverInfo: { name: 'ci-sdlc' } } });
    expect((out[1] as { result: { tools: unknown[] } }).result.tools).toHaveLength(8);
    expect(out[2]).toMatchObject({ result: { structuredContent: { key: 'TSK-57', readiness: 'not_ready' } } });
  });

  it('STD-02: a line that is not JSON is a parse error and the server keeps answering', async () => {
    const out = await converse({ CI_SDLC_URL: 'http://localhost:9' }, ['{not json', '', JSON.stringify({ jsonrpc: '2.0', id: 9, method: 'ping' })]);
    expect(out).toEqual([
      { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } },
      { jsonrpc: '2.0', id: 9, result: {} },
    ]);
  });
});
