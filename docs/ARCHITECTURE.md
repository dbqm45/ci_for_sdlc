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
| Claims & semantic conflicts (§17) | `analysis/claims.ts`, rule `CON-001` |
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

## Decisions feed back into the analysis

A decision closes the finding whose question it answers (`resolved`, `accepted_risk` or `dismissed`), and its
answer is parsed into claims. That is how a decision like *"Idempotency key per payment attempt"* surfaces
the fact that the Payments API Reference still says *"accepts repeated requests"* — a new, evidence-backed
conflict instead of a silently ignored inconsistency.

## Persistence

`CI_DATA_DIR` (default `.ci-data/`): `settings.json`, `decisions.json`, `approvals.json`, `snapshot.json`,
`drift.json`, `history.json`, `ai-cache.json`, `audit.jsonl`, `demo-context.json`. Context-bearing files are
encrypted with AES-256-GCM when *Encrypt stored context* is on and `CI_ENCRYPTION_KEY` is set.

The store is fail-closed: a missing file means "empty", but a file that exists and cannot be read, parsed or
decrypted raises `StoreReadError` and is never overwritten (the AI cache is the only exception, since it can be
rebuilt). With encryption on and no key, writes are refused rather than stored in plaintext. All writes go
through one queue, and read-modify-write uses `update*` / `append*`, so concurrent requests cannot lose updates.
