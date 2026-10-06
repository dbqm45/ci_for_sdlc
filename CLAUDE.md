# CLAUDE.md

## Praca z gałęziami i PR

1. Przed rozpoczęciem pracy zaktualizuj `main` (`git fetch origin main`) i utwórz od niego nową gałąź
   (`git checkout -b <gałąź> origin/main`). Nie dokładaj nowej pracy do gałęzi, której PR został już zmergowany.
2. Po skończeniu pracy wypchnij gałąź i wystaw pull request do `main`.
3. Commity i tytuły PR piszemy w formacie [Conventional Commits](https://www.conventionalcommits.org/pl/v1.0.0/)
   (`feat(web): …`, `fix(server): …`, `docs: …`; opis po angielsku, tryb rozkazujący, bez kropki, ≤ 72 znaki).
   Zmiana niezgodna wstecz: `!` albo stopka `BREAKING CHANGE:`. Tytuł PR trafia na `main` (squash merge) i decyduje
   o wersji.

## Wersjonowanie

Jedna wersja SemVer dla całej aplikacji, tag `vX.Y.Z` tworzy CI po merge'u PR `chore(release): X.Y.Z`. Szczegóły
i lista publicznego API: [`docs/RELEASING.md`](docs/RELEASING.md). Numer liczy `npm run release`, nie ręcznie.
