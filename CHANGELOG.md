# Changelog

Wszystkie istotne zmiany w aplikacji. Format według [Keep a Changelog](https://keepachangelog.com/pl/1.1.0/),
wersje według [Semantic Versioning](https://semver.org/lang/pl/). Najnowsza wersja jest na górze. Jak powstaje nowy
wpis, opisuje [`docs/RELEASING.md`](docs/RELEASING.md).

## [0.1.32] - 2026-10-27

### Nowe

- **core:** read the frame table of design.md from a change (#87)

## [0.1.31] - 2026-10-27

### Nowe

- **server:** rename and delete workspaces, workspace in MCP tools (#88)

## [0.1.30] - 2026-10-27

### Nowe

- **server:** add workspaces with their own sources and analysis (#86)

## [0.1.29] - 2026-10-27

### Nowe

- **core:** pin pdi contract copies and check them in CI (#85)

## [0.1.28] - 2026-10-27

### Nowe

- **server:** ask pdi to approve a change that is not ready (#84)

## [0.1.27] - 2026-10-27

### Nowe

- **server:** send auto-close decisions to the pdi register (#82)

## [0.1.26] - 2026-10-27

### Nowe

- **core:** propose closing findings with answers quoted from sources (#81)

## [0.1.25] - 2026-10-27

### Nowe

- **server:** require a read token for API reads when CI_READ_TOKEN is set (#80)

## [0.1.24] - 2026-10-27

### Nowe

- **web:** show each acceptance criterion's tests on the item page (#77)

## [0.1.23] - 2026-10-27

### Nowe

- **server:** pass test results to the definition check template (#76)

## [0.1.22] - 2026-10-27

### Nowe

- **core:** trace acceptance criteria to tests and their results (#75)

## [0.1.21] - 2026-10-26

### Nowe

- **mcp:** add a read-only MCP server for readiness questions in Claude (#74)

## [0.1.20] - 2026-10-26

### Nowe

- **core:** detect EV claim conflicts with a per-domain claim pack (#73)

## [0.1.19] - 2026-10-26

### Nowe

- **core:** check flag plans and plan self-check in repo changes (#72)

## [0.1.18] - 2026-10-26

### Nowe

- **core:** read changes from a repo checkout and gate pull requests (#71)

## [0.1.17] - 2026-10-26

### Nowe

- **core:** read tf reconstruction from code as a source (#69)

## [0.1.16] - 2026-10-26

### Poprawione

- **deps:** update zod and fast-uri to fix npm audit findings (#67)

## [0.1.15] - 2026-10-26

### Nowe

- **server:** send change readiness to pdi and approve from pdi gates (#66)

## [0.1.14] - 2026-10-25

### Nowe

- **core:** add release plan rules for epics (#61)

## [0.1.13] - 2026-10-25

### Nowe

- **web:** add story-shape policy to settings (#60)

## [0.1.12] - 2026-10-25

### Nowe

- **core:** add story-shape rules for stories and acceptance criteria (#59)

## [0.1.11] - 2026-10-25

### Nowe

- **core:** group acceptance criteria into AC-n scenarios (#58)

## [0.1.10] - 2026-10-23

### Nowe

- add npm run local to start the app with one command (#55)

## [0.1.9] - 2026-10-19

### Nowe

- connect Atlassian with one click behind CI_CONNECT_MODE (#53)

## [0.1.8] - 2026-10-15

### Poprawione

- **core:** read Figma fresh after a Figma webhook (#48)

## [0.1.7] - 2026-10-15

### Poprawione

- **sandbox:** show Figma Retry-After wait on rate limit (#46)

## [0.1.6] - 2026-10-15

### Nowe

- **sandbox:** add Figma plugin and Figma links to the seeder (#45)

## [0.1.5] - 2026-10-14

### Nowe

- **sandbox:** add Atlassian seeder with seed, reset and status (#44)

## [0.1.4] - 2026-10-14

### Poprawione

- **server:** flush SSE headers and test change webhooks end to end (#39)

## [0.1.3] - 2026-10-14

### Nowe

- **core:** allow loopback Figma API base for mocks (#33)
- **core:** add backlog intake demo scenario (#32)

## [0.1.2] - 2026-10-11

### Nowe

- **web:** Redesign and improvements
- **web:** Extend gitignore
- **web:** Improvements to figma requests
- **jira:** add Jira API diagnostic script

### Poprawione

- **web:** Fix unit tests after redesign
- **figma:** bound nested node fetching
- **figma:** reduce API payloads and handle rate limits
- **jira:** read API token from generated env file

## [0.1.1] - 2026-10-06

### Poprawione

- Zakładka Context: sekcje Jira, Confluence i Figma są wyświetlane jedna pod drugą zamiast w kolumnach, dzięki czemu
  są czytelniejsze (#25).

## [0.1.0] - 2026-10-06

Pierwsza wersja (MVP: Definition Intelligence dla Jira, Confluence i Figmy).

### Nowe

- Analiza backlogu: luki, konflikty, niejednoznaczności, nieaktualne informacje i brakujące scenariusze, z dowodami
  i oceną gotowości do implementacji.
- Pytania i log decyzji z historią wersji, zatwierdzanie elementów i wykrywanie driftu po zatwierdzeniu.
- Graf kontekstu elementu (kolumny według źródła, zoom, powiększenie, filtry), analiza wpływu, audyt.
- Opcjonalna recenzja semantyczna AI (Anthropic, Amazon Bedrock, dostawcy zgodni z OpenAI).
- HTTP API z kontraktem OpenAPI, webhooki, Server-Sent Events, CLI `npm run analyze`.
- Obraz Dockera publikowany do GHCR i środowisko lokalne `docker compose`.
