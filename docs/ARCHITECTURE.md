# Architecture

```
                 Jira            Confluence           Figma
                   │                  │                  │
          connectors/atlassian.ts     │       connectors/figma.ts      (demo: connectors/demo.ts)
                   └──────────┬───────┴──────────────────┘
                              ↓
                ProjectContext  (RequirementContext · DocumentationContext · DesignContext)
                  + tf's reconstruction from code (connectors/reconstruction.ts, documents with source "code")
                              ↓
                graph.ts — Context Graph
                  entities + explicit relations (epic link, parent, issue links, remote links,
                  key mentions, page links, prototype transitions, "superseded by")
                  + semantic relations (TF-IDF cosine; Figma flows by frame-name prefix)
                  + domain detection (Jira components ↔ labels / spaces)
                              ↓
                analysis/context.ts — per-item context, traits, claims (analysis/claims.ts)
                              ↓
        ┌─────────────────────┼─────────────────────────┐
        ↓                     ↓                         ↓
  analysis/rules.ts     ai/ (optional)            analysis/states.ts
  deterministic rules   semantic reviewer +       state machine, journeys,
  GAP / CONFLICT /      adversarial questions;    adversarial probes
  AMBIGUITY / OUTDATED  evidence-validated
  / MISSING_COVERAGE
        └─────────────────────┼─────────────────────────┘
                              ↓
                Findings + Questions  →  Human Decisions (server: /api/decisions)
                              ↓
                analysis/analyze.ts — readiness, dimensions, checklist,
                cross-item pass (dependencies, bug root cause, epic rollup)
                              ↓
                project.ts — metrics, decision debt, top risks, snapshot,
                drift (vs previous snapshot and approved baselines)
                              ↓
                impact.ts — impact analysis on the graph + claims
```

## Mapping: product concept → implementation

| Concept | Where |
|---|---|
| Context before code / Context Discovery (§15) | `graph.ts` (`buildContextGraph`, `bundleFor`) |
| Context Graph — entities & relations (§16) | `model.ts` (`Entity`, `Relation`), `graph.ts` |
| Claims & semantic conflicts (§17) | `analysis/claims.ts` (packs per domain: `claim-pack-ev.ts`, `claim-packs.ts`), rule `CON-001` |
| Domain detection (§18) | `graph.ts` (`detectDomains`) |
| AI agents (§19) | Specification Reviewer + Question Agent = `ai/types.ts` prompt; Story/Epic/Bug analyzers = `analysis/analyze.ts`; Context Discovery = `graph.ts` |
| Adversarial review (§20, UC-07) | `analysis/states.ts` (`PROBES`) + AI `challenges` |
| State machine analysis (§21) | `analysis/states.ts` (`requiredStates`, `stateCoverage`), rule `DES-002` |
| User journey coverage (§22) | `analysis/states.ts` (`journeyCoverage`) |
| Hybrid intelligence (§23) | rules (`analysis/rules.ts`) + `ai/` + graph + decisions |
| Feature readiness (§24, UC-01) | `analysis/analyze.ts` (`scoreItem`) — critical overrides the average |
| Epic / Story / Task / Bug analysis (§11–14) | `RULES[].appliesTo`, `crossItemPass` (epic rollup, `DEP-001`, `BUG-004`), `COV-001` |
| Evidence & provenance (§29) | every `Finding.evidence`; AI findings without valid source refs are dropped |
| MCP / provider architecture (§31, §34) | connectors normalize into own context model; `ai/providers.ts` (Anthropic, Bedrock, OpenAI, Azure OpenAI, custom) |
| Security & privacy (§35) | `server/src/store.ts` (encryption at rest), redaction + data minimization in `project.ts`, audit log |
| Configuration & policy (§36) | `policy.ts`, Settings page |
| Continuous drift detection (§32, UC-09) | `project.ts` (`diffSnapshots`, approval baselines → `DRIFT-001`), server scheduler + webhooks |
| Impact analysis (UC-11) | `impact.ts` |
| Decision debt (§42) | `project.ts` (`metrics`) |

## Rules

| Id | Applies to | Detects |
|---|---|---|
| REQ-001 | story | no acceptance criteria |
| REQ-002 | story | no user story / goal statement |
| REQ-003 | story, bug | untestable wording in AC (fast, appropriate, etc., handle errors, TBD …) |
| REQ-004 | story | retry without a defined limit |
| ERR-001 | story | retry failure behaviour undefined (critical for payments) |
| ERR-002 | story | server error behaviour undefined |
| ERR-003 | story | timeout behaviour undefined (uses the documented timeout in the question) |
| ERR-004 | story | destructive action without confirmation / undo |
| ERR-005 | story | session expiry undefined in authenticated flows |
| ARCH-001 | story | retryable payment without idempotency strategy |
| ARCH-002 | story | async API without processing state |
| ARCH-003 | story | requirement expects immediate result, docs describe async |
| DES-001 | story | no Figma design found |
| DES-002 | story | required UI state missing in Figma |
| DOC-001 | story | no documentation found |
| DOC-002 | story, epic, bug | outdated / superseded documentation in context |
| CON-001 | story, epic, bug | conflicting claims across sources (or sources contradicting a decision) |
| COV-001 | story | acceptance criterion without implementation task |
| STORY-001 | story | more than one user action: actions joined in the title or goal, several actors, or ≥ 2 different main actions in the scenarios |
| STORY-002 | story | too large: more GWT/EARS scenarios than `maxScenarios`, more distinct main actions than `maxActions`, or an estimate ≥ `maxStoryPoints` |
| STORY-003 | story | technical layer instead of value: title starts with a layer word, or no actor with technical vocabulary |
| AC-001 | story | an AC unit outside `acFormat` (GWT by default) or a GWT scenario without Then |
| AC-002 | story | result that is not observable ("works", "poprawnie"); skipped where REQ-003 already fired |
| AC-003 | story | AC describes implementation (provider, table, protocol, mechanism) |
| AC-004 | story | more than one action in one scenario |
| BUG-001..003 | bug | incomplete report, no related story, no regression test |
| BUG-004 | bug | bug matches an open finding of the related story (root cause) |
| DEP-001 | all | depends on an item that is not ready |
| EPIC-001..004 | epic | no goal, no stories, stories without design, inconsistent behaviour across stories |
| REL-001 | epic, feature | 3 or more stories and none in release line R1 (no MVP) |
| REL-002 | epic, feature | the "MVP" section is missing, or states no outcome, no metric threshold or no horizon |
| REL-003 | epic, feature | R1 holds more than `maxMvpPercent` (60%) of the stories |
| REL-004 | epic, feature | R1 holds a technical-layer story (STORY-003's signal) |
| REL-005 | epic, feature | a story in R1 is blocked by a story of a later line or without a line (critical) |
| REL-006 | epic, feature | a story in a release line has no feature flag (`requireFlag`: user-facing stories by default) |
| REL-007 | epic, feature | repo mode: a flag in `release.yaml` has no rollout stages, a stage without exit criterion, no owner or no `remove_by` (info) |
| REL-008 | epic, feature | repo mode: a foundation in `plan.md` without "Unblocks" or unblocking a task not in the change, a slice without a requirement |
| DRIFT-001 | approved items | context changed since approval |
| AI-001 | story, bug | semantic findings from the AI reviewer (evidence required) |

Story-shape rules (STORY-*, AC-*, `analysis/story-shape.ts`) read the AC units of `analysis/acceptance.ts` and the
thresholds of `policy.storyShape` (`storyShapeOf`, defaults of the pdi contract 0.4.0: `acFormat: gwt`,
`maxScenarios: 6`, `maxActions: 3`, `maxStoryPoints: 13`; set in *Settings → Policy → Story shape*, stored as
`policy.storyShape`, validated by `settingsBody`). Their expected results are pinned by the contract's
story-shape set (`packages/core/test/story-shape.test.ts`).

Release-plan rules (REL-*, `analysis/release-plan.ts`, step G1.2) read the plan from Jira conventions (pdi contract
0.4.0, DG4): each story's `releaseLine` R1…Rn (R1 = MVP) from `release:R1` labels by default, or a fix version or a
field (`integrations.jira.releaseLineSource`); its `flagKeys` from `flag:` labels or a field, as ShipScope's
`flag_link`; and the epic's `mvp`, the "MVP" section of its description. Their findings go to the `delivery`
dimension ("Release plan"), which only epics and features have (`dimensionsFor`), so a REL-005 conflict makes the
epic NOT READY. Thresholds: `policy.release` (`releaseOf`: `maxMvpPercent: 60`, `requireFlag: user_facing`). Epics
and features carry `releasePlan` (lines, stories without a line, MVP share), shown in the "Release plan" panel of
the item page. Not yet: REL-004's AI check of a missing flow step.

REL-007 and REL-008 (step G1.4) run only on changes read from a repository (`connectors/repo.ts`): they read
`RequirementItem.repo`, which Jira items do not have — each flag's plan from `release.yaml` on the change, and each
slice's `kind`, `unblocks` and `requirements` from `plan.md`'s "Rodzaj/Kind", "Odblokowuje/Unblocks" and
"Wymagania/Requirements" columns. Their evidence carries the change file and line (`Evidence.path`/`line`), which the
gate (`packages/server/src/gate.ts`) uses for GitHub Actions annotations. The demo world is Jira, so the rule-coverage
test also reads the changes in `packages/core/test/fixtures/repo-changes`.

## Code as the current state (tf reconstruction)

ci_for_sdlc does not read code. tf does: its `recon_export.py` writes `reconstruction.json` (format
`tf-reconstruction`, version 1; pdi plan "one SDLC flow", F2) with the rules, requirements and domain terms it
reconstructed, each with evidence `path:line`. `connectors/reconstruction.ts` reads that file from the server's disk
(*Settings → Integrations → Code*, `integrations.code`) in demo and live mode and turns each item into a document with
`source: 'code'` and `code` facts. Such documents:

- state claims only when tf backed them with evidence it could confirm (`isClaimable`: status `evidence`, no
  evidence `verified: false`); assumptions and questions are context only;
- join an item's context when linked by the graph, or when they state a fact (subject + attribute) the item's
  sources also state, since a one-line rule rarely matches a story by text;
- are kept apart from documentation (`ItemCtx.code`, `claims.code`): CON-001 compares them with the specification
  ("Jira says 30 s, the code waits 45 s", evidence `Code src/payments/gateway.ts:1`, linked to the commit when
  `repoUrl` is set), but they never satisfy rules that ask the specification for something (REQ-004, DOC-001,
  the challenges).

The fixture in `packages/core/test/fixtures/tf-reconstruction/` was produced by tf's exporter; regenerate it, never edit it.

## Claude as the interface (MCP, K-1)

`packages/mcp` is a local MCP server (stdio, newline-delimited JSON-RPC 2.0, no dependencies, plain JavaScript checked
by `tsc` with `checkJs`) that Claude runs next to pdi's and ShipScope's. It reads the REST API only (`GET /api/analysis`,
`/api/items/:key`, `/graph`, `/api/decisions`, `/api/drift`, `/api/rules`, `/api/pdi`) and summarizes answers before
the model sees them; there is no MCP endpoint in the server and no write tool. It sends `CI_SDLC_TOKEN`, the server's
read token, when set, and never the admin token. Plan: `docs/MCP-K1-PLAN.md`; setup: `packages/mcp/README.md`.

`CI_READ_TOKEN` (K1b, `docs/READ-TOKEN-K1B-PLAN.md`): when set, `registerGuards()` (`packages/server/src/http.ts`)
requires it, or the admin token, for every read of `/api/*` except `/api/health` and the Atlassian OAuth callback;
webhooks keep their own secrets. The UI asks for it once per session (`lib/auth.ts`) and reads the live updates with
fetch instead of EventSource so the header goes along (`lib/sse.ts`).

## Claim packs per domain

The claim vocabulary (`ClaimPack` in `analysis/claims.ts`: ordered subjects and attribute extractors) is chosen per
project by `settings.project.claimPack` (`general` | `ev`, default `general`). The engine copies it into
`ProjectContext.project.claimPack` in every mode; `createEnv` (claims for CON-001) and `buildContextGraph` (meaning
fingerprints for drift) resolve it with `claimPackOf`. `general` is the checkout vocabulary that existed before packs.
`ev` (`claim-pack-ev.ts`, terms copied from tf `pack-ev` 1.1.0) adds the EV hierarchy as subjects (location, charging
station, charging point = EVSE, connector, vehicle, CSMS, transaction, session, tariff, battery) and the attributes
`power` (kW), `energy` (kWh), `ocpp_version` (subject `charging station`), `uptime_target` and `uptime_definition`
(subject `charging point`) and `connector_status` (subject `connector (<situation>)`, so statuses of different moments
are not compared). An `ocpp_version` conflict goes to the `architecture` dimension. Tests:
`packages/core/test/claim-packs.test.ts`; plan: `docs/CLAIM-PACKS-PLAN.md`.

## Decisions feed back into the analysis

A decision closes the finding whose question it answers (`resolved`, `accepted_risk` or `dismissed`), and its
answer is parsed into claims. That is how a decision like *"Idempotency key per payment attempt"* surfaces
the fact that the Payments API Reference still says *"accepts repeated requests"* — a new, evidence-backed
conflict instead of a silently ignored inconsistency.

## Answers found in sources (A2a)

`analysis/auto-close.ts` looks for the answer to every open finding's question in the item's active decisions,
Confluence pages and Figma frames (never in tf's code), with a pattern per rule that describes behaviour
(`ANSWER_PATTERNS`: REQ-004, ERR-001…005, ARCH-001, ARCH-002); the AI reviewer may propose one too (`answers` in its
output). Every quote must be found word for word in the cited source (`isVerbatimQuote`) or there is no proposal.
The proposal is `Finding.answer`; `policy.autoClose` (`off` | `suggest` | `apply`, default `suggest`) decides whether
it is offered (`POST /api/items/:key/answers/:proposalId` accept / edit / reject) or recorded by the engine itself
(`decidedBy: auto-close`, `automation: { level: 1, rule }`). The decision is an ordinary `resolve` decision with the
pdi contract's `decisionType: finding.auto_close`, `draftedBy: ai`, `draftEdited` and the quote as `evidence`.
`POST /api/decisions/:id/reopen` withdraws it; a reopened or rejected proposal is never made again (`auto-close.json`,
passed to the analysis as `suppressedAnswers`). `GET /api/decisions/acceptance` (`auto-close-stats.ts`) measures the
last 30 reviewed drafts against pdi's thresholds (95% unedited, 10% edited) and never changes the policy. Every step is
an `auto_close` audit entry. Plan: `docs/AUTO-CLOSE-A2A-PLAN.md`.

With the pdi link, every decided step (accept, edit, reject, reopen, apply) also goes to pdi's decision register as
`decision.recorded` (contract 0.7.0, A2b): `recordAutoClose()` hands the steps to a sink, `PdiLink.enqueueDecisions()`
builds the event (`decisionRecordedEvent()` in core: `ref` = `<item>/<finding>`, `url` = `#/item/<item>/<finding>`,
the quote and its source as `evidence`, `change` from the `change:` label) and queues it in the same outbox as
readiness. pdi's DEC is kept as `pdiDecision` on the local decision (and on the log entry of a rejection); a reopen
waits until the decision it reopens has its DEC and sends it as `supersedes`. Decision events are never dropped after
`MAX_ATTEMPTS`; a 400 from pdi marks the entry `failed` with pdi's reason and is not retried. Plan:
`docs/PDI-F4-PLAN.md`, "A2b".

For a change that is not ready, a person can ask pdi to decide "Approve for implementation" anyway
(`POST /api/changes/:change/request-approval`, "Ask pdi to approve" on the story page): `gateRequestedEvent()` in core
lists what blocks the stories as `questions`, and the request goes to the same outbox and is kept like a decision.
`GET /api/changes` lists the changes with their readiness and the last request. A ready change reaches pdi through
`readiness.changed` alone.

## Workspaces (F5)

One installation holds several workspaces (`server/src/workspaces.ts`, plan `docs/WORKSPACES-F5-PLAN.md`): each is a
`Store`, an `Engine` and an `AtlassianConnection` with its own settings, sources, analysis, decisions, approvals,
drift and audit. `default` is `CI_DATA_DIR` itself; the others live in `CI_DATA_DIR/workspaces/<id>/`, listed in
`workspaces.json`. `routes-workspace.ts` registers the routes of a workspace twice: under `/api` for `default` and
under `/api/w/:ws` (an `onRoute` hook adds the `ws` param, a `preHandler` answers 404 for an unknown one). The
Atlassian OAuth callback finds the workspace that issued the `state`. pdi is shared: its queue and state stay with
`default`, readiness is `mergeChangeReadiness()` of every workspace's changes, `gate.decided` approves a change's
stories in each workspace, and `decision.recorded` of another workspace carries it in `ref`, link and event id
(`workspacePath()` in core). The UI keeps the workspace in the address (`#/w/<id>/…`, `lib/workspace.ts`) and sends
its requests to `/api/w/<id>/…`.

## Persistence

With `CI_DATABASE_URL` the same documents and logs live in Postgres instead (`backend.ts`: `PgBackend`,
`ci_documents`/`ci_log_entries`, row-level security per workspace, `MIGRATIONS` applied at start; `npm run db:import`
copies a data directory in). `Store` owns shapes, encryption and the write queue for both.

`CI_DATA_DIR` (default `.ci-data/`; one directory per workspace, see above): `settings.json`, `decisions.json`, `approvals.json`, `snapshot.json`,
`drift.json`, `history.json`, `ai-cache.json`, `audit.jsonl`, `demo-context.json`, `auto-close.json`. Context-bearing files are
encrypted with AES-256-GCM when *Encrypt stored context* is on and `CI_ENCRYPTION_KEY` is set.

The store is fail-closed: a missing file means "empty", but a file that exists and cannot be read, parsed or
decrypted raises `StoreReadError` and is never overwritten (the AI cache is the only exception, since it can be
rebuilt). With encryption on and no key, writes are refused rather than stored in plaintext. All writes go
through one queue, and read-modify-write uses `update*` / `append*`, so concurrent requests cannot lose updates.
