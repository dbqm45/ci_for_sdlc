# Wersjonowanie i wydania

Aplikacja ma jeden numer wersji zgodny z [Semantic Versioning 2.0.0](https://semver.org/lang/pl/) (`MAJOR.MINOR.PATCH`).
Wydaniem jest obraz Dockera i stan repozytorium, więc wszystkie pakiety (`package.json` w katalogu głównym, `@ci/core`,
`@ci/server`, `@ci/web`) mają **ten sam** numer. Wydaną wersję oznacza tag git `vX.Y.Z`, np. `v0.2.0`, a do każdego tagu powstaje
[GitHub Release](https://github.com/dbqm45/ci_for_sdlc/releases) z opisem z CHANGELOG.

Numer wersji widać w `GET /api/health` (`version`) i w kontrakcie `GET /api/openapi.json` (`info.version`).

## Commity: Conventional Commits

Od teraz commity i **tytuły PR** mają format [Conventional Commits 1.0.0](https://www.conventionalcommits.org/pl/v1.0.0/).
PR-y łączymy przez *squash merge*, więc to tytuł PR staje się commitem na `main` i decyduje o kolejnej wersji.

```
<typ>(<zakres>)!: <opis>

[treść: dlaczego, nie co]

[stopki, np. Refs: #21  albo  BREAKING CHANGE: <co i jak migrować>]
```

- **Opis**: po angielsku, w trybie rozkazującym, bez kropki na końcu, maks. 72 znaki.
- **Zakres** (opcjonalny), małymi literami: `core`, `server`, `web`, `e2e`, `deps`, `release`.

| Typ | Kiedy | Wpływ na wersję |
|---|---|---|
| `feat` | nowa funkcja dla użytkownika | MINOR |
| `fix` | poprawka błędu | PATCH |
| `perf` | szybciej, bez zmiany zachowania | PATCH |
| `refactor`, `test`, `docs`, `style`, `build`, `ci`, `chore`, `revert` | bez zmiany zachowania dla użytkownika | brak |
| `!` po typie/zakresie albo stopka `BREAKING CHANGE:` | zmiana niezgodna wstecz (dowolny typ) | MAJOR |

Przykłady:

```
feat(web): open the enlarged context graph with Enlarge
fix(server): recognise IAM roles in the AWS_CREDENTIALS status
feat(server)!: require the admin token for webhooks
docs: describe the release process
chore(release): 0.2.0
```

Sprawdzanie:

- **CI**: workflow `PR title` (`.github/workflows/pr-title.yml`) odrzuca tytuł PR niezgodny z formatem. Działa też po
  edycji tytułu.
- **Lokalnie** (opcjonalnie, raz na klon): `npm run hooks:install` włącza hook `commit-msg` z katalogu `.githooks/`.
  Pojedynczy komunikat sprawdzisz poleceniem `npm run lint:commit -- "feat(web): …"`.
- Dependabot tworzy tytuły `build(deps): …`, `build(deps-dev): …` i `ci(deps): …` (`.github/dependabot.yml`).

## Które podbicie (SemVer)

Decyduje **najpoważniejsza** zmiana od ostatniego tagu.

| Zmiana w publicznym API | Od 1.0.0 | W fazie 0.y.z (teraz) |
|---|---|---|
| niezgodna wstecz (usunięcie, zmiana nazwy lub znaczenia, nowe wymagane pole, zmiana domyślnego zachowania) | MAJOR | MINOR |
| nowa funkcja zgodna wstecz, nowe pole w odpowiedzi, oznaczenie czegoś jako przestarzałe | MINOR | PATCH |
| poprawka zgodna wstecz, łatka bezpieczeństwa, aktualizacja zależności | PATCH | PATCH |
| tylko dokumentacja, testy, CI, refaktoryzacja | bez wydania | bez wydania |

Faza **0.y.z** oznacza, że publiczne API nie jest jeszcze stabilne (reguła 4 SemVer). **1.0.0** wydajemy świadomie, gdy
aplikacja działa na produkcji albo ktoś na niej polega (`npm run release -- 1.0.0`). To decyzja człowieka, skrypt jej
nie podejmie.

### Publiczne API

Do zgodności wstecz liczy się to, na czym polegają użytkownicy i integracje. Szczegóły wewnętrzne, takie jak kod,
układ modułów czy treść logów, się nie liczą.

- **HTTP API** `/api/*`: ścieżki, metody, pola żądań i odpowiedzi, kody statusu, format błędów (RFC 9457),
  uwierzytelnianie. Zatwierdzony kontrakt jest w `packages/server/contracts/openapi.json`, a test kontraktu wykrywa
  każdą zmianę.
- **Webhooki** `POST /api/webhooks/{jira,confluence,figma}` i nagłówek `x-ci-webhook-secret`.
- **Konfiguracja**: zmienne środowiskowe z README (`CI_*`, klucze dostawców, `PORT`, `HOST`) oraz pola
  `settings.json`.
- **Dane** w `CI_DATA_DIR`: starsza wersja ustawień musi dać się wczytać, a stare pola są czyszczone przy starcie.
- **Obraz Dockera**: port `4317`, wolumen `/data`, użytkownik `node`, `HEALTHCHECK` na `/api/health`.
- **CLI**: `npm run analyze` (flagi i kod wyjścia).

## Jak wydać nową wersję

1. Na świeżej gałęzi od `main` uruchom `npm run release -- --dry-run`. Skrypt pokaże, ile commitów jest od ostatniego
   tagu, jakie podbicie z nich wynika i jak wygląda szkic wpisu w CHANGELOG.
2. Jeśli wynik się zgadza, uruchom `npm run release`. Gdy commit został źle oznaczony, nadpisz wynik:
   `npm run release -- minor` (lub `major` / `patch` / `X.Y.Z`). Skrypt:
   - ustawia wersję we wszystkich `package.json` i w `package-lock.json` (`npm version --workspaces`);
   - odświeża kontrakt API (`info.version`);
   - dopisuje wpis na górze `CHANGELOG.md` z sekcjami *Niezgodne*, *Nowe* i *Poprawione*.
3. Przejrzyj CHANGELOG. Przeredaguj wpisy dla użytkownika i w razie potrzeby dodaj sekcje *Zmienione*, *Wycofywane* lub
   *Usunięte*. Opcjonalnie sprawdź plik:
   `python3 .claude/skills/core-semver/scripts/semver.py check-changelog CHANGELOG.md`.
4. Wykonaj commit `chore(release): X.Y.Z` i otwórz PR o tym samym tytule.
5. Po merge'u workflow `Release image` (`.github/workflows/release.yml`) zauważa wersję bez tagu i:
   - sprawdza, że `CHANGELOG.md` ma wpis `## [X.Y.Z]` (bez niego nic nie zostanie otagowane);
   - buduje i sprawdza obraz, publikuje go z dodatkowym tagiem `X.Y.Z`;
   - tworzy na tym commicie tag `vX.Y.Z` z adnotacją;
   - tworzy GitHub Release `vX.Y.Z`: treścią jest wpis z CHANGELOG (`node scripts/release-notes.mjs X.Y.Z`)
     i nazwa obrazu. Gdy Release już istnieje, zostaje bez zmian. Gdy go brakuje (np. przebieg padł po utworzeniu
     tagu), dorobi go kolejny przebieg na `main` albo ręczne uruchomienie workflow (*Run workflow*).

Zasady:

- **Wydanej wersji się nie zmienia.** Taga nie przesuwamy ani nie usuwamy. Błąd w wydaniu naprawia kolejna wersja.
- **Wycofywanie funkcji**: najpierw MINOR z oznaczeniem „przestarzałe” i opisem zastępstwa, a usunięcie dopiero
  w kolejnym MAJOR.
- Wersja w ścieżce API (`/api/v1`) to osobna decyzja (`docs/BACKLOG-DEFERRED.md`).
