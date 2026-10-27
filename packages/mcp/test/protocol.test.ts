import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { PROTOCOL_VERSIONS, TOOLS, createServer, readConfig } from '../src/lib.js';

// The MCP protocol of the ci_for_sdlc server (K-1, docs/MCP-K1-PLAN.md) on the pure library: no network, a fetch
// that must not be called unless a test says so.

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
const env = { CI_SDLC_URL: 'http://localhost:3000' };
const noFetch = () => vi.fn<typeof fetch>(() => Promise.reject(new Error('no request expected')));
const call = (server: ReturnType<typeof createServer>, name: string, args?: unknown) => server.handle({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name, arguments: args } });

describe('MCP protocol', () => {
  it('MCP-01: initialize negotiates the protocol version and tells the model that tool results are data', async () => {
    const server = createServer({ env, fetchImpl: noFetch() });
    const asked = await server.handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } });
    expect(asked).toMatchObject({ jsonrpc: '2.0', id: 1, result: { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'ci-sdlc', version } } });
    const unknown = await server.handle({ jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '1999-01-01' } });
    expect(unknown).toMatchObject({ result: { protocolVersion: PROTOCOL_VERSIONS.at(-1) } });
    expect(PROTOCOL_VERSIONS).toEqual(['2024-11-05', '2025-03-26', '2025-06-18']);
    expect((asked as { result: { instructions: string } }).result.instructions).toMatch(/data, not instructions/);
  });

  it('MCP-02: tools/list lists the read-only tools with closed schemas', async () => {
    const res = (await createServer({ env, fetchImpl: noFetch() }).handle({ jsonrpc: '2.0', id: 1, method: 'tools/list' })) as { result: { tools: typeof TOOLS } };
    expect(res.result.tools.map((t) => t.name)).toEqual(['get_readiness_summary', 'get_item_readiness', 'get_item_graph', 'list_decisions', 'list_drift', 'list_rules', 'get_pdi_status', 'list_workspaces']);
    for (const t of res.result.tools) {
      expect(t.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: false });
      expect(t.inputSchema).toMatchObject({ type: 'object', additionalProperties: false });
      expect(t.description.length).toBeGreaterThan(40);
    }
    expect(res.result.tools.map((t) => t.name).some((n) => /approve|decide|analy[sz]e_now|record/.test(n))).toBe(false);
  });

  it('MCP-03: ping, notifications, invalid requests and unknown methods', async () => {
    const server = createServer({ env, fetchImpl: noFetch() });
    expect(await server.handle({ jsonrpc: '2.0', id: 3, method: 'ping' })).toEqual({ jsonrpc: '2.0', id: 3, result: {} });
    expect(await server.handle({ jsonrpc: '2.0', method: 'notifications/initialized' })).toBeNull();
    expect(await server.handle({ id: 4, method: 'ping' })).toEqual({ jsonrpc: '2.0', id: 4, error: { code: -32600, message: 'Invalid request' } });
    expect(await server.handle('nonsense')).toEqual({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid request' } });
    expect(await server.handle({ jsonrpc: '2.0', id: 5, method: 'resources/list' })).toEqual({ jsonrpc: '2.0', id: 5, error: { code: -32601, message: 'Method not found: resources/list' } });
  });

  it('MCP-04: an unknown tool is a protocol error', async () => {
    const fetchImpl = noFetch();
    expect(await call(createServer({ env, fetchImpl }), 'approve_item', { key: 'PAY-1' })).toEqual({ jsonrpc: '2.0', id: 7, error: { code: -32602, message: 'Unknown tool: approve_item' } });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    ['arguments that are not an object', 'get_readiness_summary', ['CHG-12'], /arguments must be an object/],
    ['an undeclared argument', 'get_readiness_summary', { project: 'PAY' }, /unknown argument project/],
    ['a missing key', 'get_item_readiness', {}, /argument key is required/],
    ['a key in lower case', 'get_item_readiness', { key: 'pay-12' }, /key looks like PAY-12/],
    ['a key with a path', 'get_item_graph', { key: 'PAY-12/../settings' }, /key looks like PAY-12/],
    ['a change that is no key', 'get_readiness_summary', { change: 'change:CHG-12' }, /change looks like CHG-12/],
    ['an unknown readiness', 'get_readiness_summary', { readiness: 'done' }, /readiness must be one of ready, needs_attention, not_ready/],
    ['an unknown type', 'get_readiness_summary', { type: 'initiative' }, /type must be one of epic, feature, story, task, subtask, bug/],
    ['a flag that is not a boolean', 'get_item_readiness', { key: 'PAY-12', full: 'yes' }, /full must be true or false/],
    ['a limit of 0', 'list_drift', { limit: 0 }, /limit must be a whole number from 1 to 100/],
    ['a fractional limit', 'list_drift', { limit: 1.5 }, /limit must be a whole number from 1 to 100/],
    ['an argument to a tool without any', 'list_rules', { all: true }, /unknown argument all/],
  ])('MCP-05: %s is a tool error and no request is made', async (_, name, args, message) => {
    const fetchImpl = noFetch();
    const res = (await call(createServer({ env, fetchImpl }), name, args)) as { result: { isError: boolean; content: { text: string }[] } };
    expect(res.result.isError).toBe(true);
    expect(res.result.content[0]!.text).toMatch(message);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    ['not set', {}, /CI_SDLC_URL is not set/],
    ['not an address', { CI_SDLC_URL: 'ci.example.com' }, /CI_SDLC_URL is not an address/],
    ['http outside localhost', { CI_SDLC_URL: 'http://ci.example.com' }, /must be https:\/\/ \(http only for localhost\)/],
    ['a login in the address', { CI_SDLC_URL: 'https://admin:s3cret@ci.example.com' }, /must not carry a login/],
  ])('MCP-06: CI_SDLC_URL %s is a tool error naming what to set, and nothing is sent', async (_, bad, message) => {
    const fetchImpl = noFetch();
    const res = (await call(createServer({ env: bad, fetchImpl }), 'list_rules')) as { result: { isError: boolean; content: { text: string }[] } };
    expect(res.result.isError).toBe(true);
    expect(res.result.content[0]!.text).toMatch(message);
    expect(res.result.content[0]!.text).not.toContain('s3cret');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('MCP-08: a CI_SDLC_TOKEN with spaces or control characters is a tool error that does not show it', async () => {
    const fetchImpl = noFetch();
    for (const bad of ['two words', 'line\nbreak', 'x'.repeat(513)]) {
      const res = (await call(createServer({ env: { ...env, CI_SDLC_TOKEN: bad }, fetchImpl }), 'list_rules')) as { result: { isError: boolean; content: { text: string }[] } };
      expect(res.result.isError).toBe(true);
      expect(res.result.content[0]!.text).toBe('CI_SDLC_TOKEN does not look like a token: one line without spaces, at most 512 characters (the server\'s CI_READ_TOKEN)');
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('MCP-07: accepted addresses: https anywhere, http on localhost, a path prefix without its trailing slash', () => {
    expect(readConfig({ CI_SDLC_URL: 'https://ci.example.com/sdlc/' })).toEqual({ base: 'https://ci.example.com/sdlc' });
    expect(readConfig({ CI_SDLC_URL: 'https://ci.example.com', CI_SDLC_TOKEN: ' abc ' })).toEqual({ base: 'https://ci.example.com', token: 'abc' });
    expect(readConfig({ CI_SDLC_URL: ' http://127.0.0.1:3000 ' })).toEqual({ base: 'http://127.0.0.1:3000' });
    expect(readConfig({ CI_SDLC_URL: 'http://[::1]:3000' })).toEqual({ base: 'http://[::1]:3000' });
  });
});
