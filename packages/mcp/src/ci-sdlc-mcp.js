#!/usr/bin/env node
// The ci_for_sdlc MCP server for Claude (K-1, docs/MCP-K1-PLAN.md): newline-delimited JSON-RPC 2.0 on stdin/stdout,
// answered one message at a time in order (lib.js). stdout carries only protocol messages; anything else goes to stderr.
//
//   CI_SDLC_URL=https://ci.example.com node packages/mcp/src/ci-sdlc-mcp.js
//
// Setup in Claude Code and Claude Desktop: packages/mcp/README.md.
import { createInterface } from 'node:readline';
import { createServer } from './lib.js';

const server = createServer({ env: process.env });
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
/** @type {Promise<unknown>} */
let queue = Promise.resolve();

lines.on('line', (line) => {
  if (!line.trim()) return;
  queue = queue
    .then(async () => {
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })}\n`);
        return;
      }
      const answer = await server.handle(message);
      if (answer) process.stdout.write(`${JSON.stringify(answer)}\n`);
    })
    .catch((err) => process.stderr.write(`ci-sdlc-mcp: ${err.message}\n`));
});
lines.on('close', () => queue.then(() => process.exit(0)));
