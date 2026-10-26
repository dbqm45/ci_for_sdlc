# ci_for_sdlc MCP server

Lets Claude (Claude Code, Claude Desktop) ask ci_for_sdlc whether work items are ready for implementation, next to
pdi's and ShipScope's MCP servers: one conversation sees the decisions (pdi), the definition (ci_for_sdlc) and the
delivery state (ShipScope). Read only. Plan: [`docs/MCP-K1-PLAN.md`](../../docs/MCP-K1-PLAN.md).

`src/ci-sdlc-mcp.js` speaks MCP over stdio (newline-delimited JSON-RPC 2.0) and reads ci_for_sdlc's REST API
(`/api/*`). Node 22+, no dependencies: from a checkout of this repository it runs with plain `node`.

## Tools

| Tool | Arguments | What it answers |
| --- | --- | --- |
| `get_readiness_summary` | `change` (`CHG-12`), `readiness` (`ready`, `needs_attention`, `not_ready`), `type` — all optional | Counts, metrics, top risks and up to 100 items with readiness, health and blocking issues; `change` keeps the change or epic and the items under it |
| `get_item_readiness` | `key` (`PAY-12`, `CHG-12`, `TSK-57`), `full` (optional) | Readiness, open findings with rule, severity and evidence, open questions, approval, active decisions, child items, recent drift; `full: true` returns the whole answer |
| `get_item_graph` | `key` | The issues, pages, frames, code and decisions linked to the item and how |
| `list_decisions` | `key`, `all` (optional) | Active decisions (all versions with `all: true`): question, answer, who, when, effect |
| `list_drift` | `key`, `limit` (optional, 20 by default) | What changed in the sources and which items it affects, newest first |
| `list_rules` | — | The rules: id, name, what they check, item types |
| `get_pdi_status` | — | The link to pdi: events sent and received, the last readiness sent, events waiting |

Approving, withdrawing an approval, recording a decision and starting an analysis are not tools: approval stays a
button in the UI or a gate decision from pdi.

## Setup

Claude Code (from a checkout of this repository, with `npm install` done once):

```sh
claude mcp add ci-sdlc -e CI_SDLC_URL=http://localhost:4317 -- node /path/to/ci_for_sdlc/packages/mcp/src/ci-sdlc-mcp.js
```

Claude Desktop (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "ci-sdlc": {
      "command": "node",
      "args": ["/path/to/ci_for_sdlc/packages/mcp/src/ci-sdlc-mcp.js"],
      "env": { "CI_SDLC_URL": "https://ci.example.com" }
    }
  }
}
```

Then ask, for example: "Is CHG-12 ready for implementation and what blocks it?", "Which stories of PAY-110 are not
ready, and which questions are still open?", "What changed in the sources since PAY-125 was approved?", "What did we
decide about the retry limit?".

## Behaviour

- `CI_SDLC_URL` must be `https://` (`http://` only for localhost) without a login in it. A missing or wrong address
  is a tool error saying what to set, and nothing is sent.
- **No credential is sent.** ci_for_sdlc's reads (`GET /api/*`) need no token today: `CI_ADMIN_TOKEN` guards only
  changes, and the server never uses it, since a read-only client should not hold a credential that can change state.
  On a network deployment anyone who reaches the service can read it, with or without this server (FAQ §12); a read
  token is a separate step ([`docs/BACKLOG-DEFERRED.md`](../../docs/BACKLOG-DEFERRED.md)).
- Arguments are checked before any request (only the declared ones, keys like `PAY-12`, values from their lists);
  paths are built with `encodeURIComponent`.
- A refusal from ci_for_sdlc (404 unknown item, 403 host not allowed, 422, 429 with `Retry-After`) is a tool error with
  the status and the service's reason. Each request has 30 s; an answer at most 2 MB, the analysis at most 32 MB (it is
  summarized before Claude sees it).
- Reading the analysis or an item runs an analysis first when there is none yet, as the UI does.
- What the tools return comes from Jira, Confluence, Figma and code (titles, descriptions, criteria, evidence); the
  server tells Claude it is data, not instructions.
