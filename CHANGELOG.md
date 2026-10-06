# Changelog

Wszystkie istotne zmiany w aplikacji. Format według [Keep a Changelog](https://keepachangelog.com/pl/1.1.0/),
wersje według [Semantic Versioning](https://semver.org/lang/pl/). Najnowsza wersja jest na górze. Jak powstaje nowy
wpis, opisuje [`docs/RELEASING.md`](docs/RELEASING.md).

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
