# Odłożone na później

Lista propozycji, które świadomie odłożono, żeby o nich nie zapomnieć. Każda pozycja ma źródło: ustalenie z rozmowy (P1–P8) albo punkt raportu [`reviews/2026-10-05-review.md`](reviews/2026-10-05-review.md).

## Model domeny

- **P6b. Uzasadnienie wymuszenia powiązane z ustaleniami.** Teraz wymuszone zatwierdzenie wymaga tylko tekstu. Później: wskazanie, których blokujących ustaleń dotyczy uzasadnienie.
- **P8b. Role i uprawnienia (SaaS).** Teraz każdy z tokenem administratora może potwierdzać, zatwierdzać i wymuszać. Później: role, np. tylko lider może wymusić zatwierdzenie albo potwierdzić ustalenie AI.
- **P7b. Osobne zatwierdzanie feature i epic.** Odrzucone na teraz (gotowość jest wyliczana ze story). Do ponownej oceny, jeśli zespoły będą chciały zatwierdzać całe funkcjonalności.
- **K1b. Token odczytu (2026-10-26).** Odczyty `GET /api/*` nie wymagają dziś tokenu (`CI_ADMIN_TOKEN` chroni tylko
  zmiany), więc w instalacji sieciowej każdy, kto dosięgnie usługi, czyta analizę, decyzje i dryf — też przez serwer
  MCP z K-1 (`packages/mcp`), który świadomie nie wysyła tokenu administratora. Do zrobienia przed instalacją sieciową:
  np. `CI_READ_TOKEN` wymagany dla `GET /api/*`, gdy ustawiony, i `CI_SDLC_TOKEN` w serwerze MCP. Plan: `docs/MCP-K1-PLAN.md`.
- **P1b. Mapowanie hierarchii poza typem zgłoszenia.** Np. po etykiecie, komponencie albo polu niestandardowym Jira.

## Kształt historyjki i kryteria akceptacji (G2)

- **G2.3. Propozycje AI: podział historyjki i przepisanie AC (wstrzymane do decyzji, 2026-10-25).** Krok planu
  G1/G2 (pdi `docs/plan-g1-g2.md` §4.7): osobne wywołanie AI ze schematem propozycji, odrzucanie propozycji bez
  cytatu, karta „Proponowany podział” przy ustaleniu, zatwierdzenie jako decyzja (`POST /api/items/:key/proposals/:id/accept`).
  Przesunięte na koniec listy: nie wiadomo jeszcze, czy go robimy. Bez niego działają reguły G2.2 (STORY-*, AC-*)
  i plan wydania G1.2 (REL-*); od G2.3 zależy tylko pierwszy punkt G2-L1 poniżej.
- **G2-L1. AC zapisane jako lista.** Reguły kształtu (G2.2) zakładają GWT jako format domyślny. Lista punktów jest
  czytana (każdy punkt to jednostka `free` z własnym AC-n), ale tylko AC-001 (info), AC-002 i AC-003 oceniają ją
  w pełni. Do zrobienia:
  - przepisanie listy na GWT jako propozycja AI z cytatem punktu i pytaniem tam, gdzie brakuje warunku albo
    akcji (G2.3, `rewrite_ac`); bez automatycznej podmiany, bo dopisane warunki zmieniałyby gotowość bez decyzji
    człowieka;
  - akcje z punktów listy dla STORY-001 i STORY-002 (dziś liczone tylko ze scenariuszy GWT);
  - czy STORY-002 ma liczyć punkty listy jako scenariusze (dziś nie, pytanie do kontraktu pdi: `scenarios`
    w `expected.json` obejmuje jednostki `free`, ale w zestawie wzorcowym nie ma listy dłuższej niż próg);
  - `COV-001` po scenariuszach zamiast po liniach (zmienia identyfikatory ustaleń `ac<i>`, do których są przypięte
    decyzje, więc wymaga migracji decyzji).

## Kolejne kroki naprawcze z raportu

- **Krok 3.** Lista dozwolonych hostów `*.atlassian.net`, adresy dostawców AI tylko ze zmiennych środowiskowych, błędy bez treści odpowiedzi zewnętrznej, webhook domyślnie zamknięty z podpisem HMAC (API-12, API-13).
- **Krok 4.** Ujednolicenie modelu: wspólny rejestr reguł, agregaty Decision i Approval (API-02, API-08), rozbicie `project.ts`.
- **Krok 5.** Zmiany łamiące kontrakt pod `/api/v1` z OpenAPI w CI i testami kontraktowymi (API-05, 06, 14, 15, 16, 17).
- **Krok 6.** Port `SourceAdapter` i `CredentialProvider`, rozdzielenie „odśwież” od „przelicz”, `GET /credentials` zamiast nazw zmiennych w `GET /settings`.
- **Krok 7.** SaaS: tenancy, Postgres, workery, egress proxy, limity AI na organizację, `Idempotency-Key`, SSE per tenant z `Last-Event-ID` (API-11), rate limit (API-18).

## API (szczegóły odłożone)

- Paginacja list (ustalenia, decyzje, historia, audyt).
- `ETag` / `If-Match` dla decyzji (dla ustawień zrobione w kroku 2).
- `202 Accepted` i zasób operacji dla długich analiz.
- Wersjonowanie ścieżek `/api/v1`.
- `Last-Event-ID` w SSE.

## Po kroku 2 (bezpieczeństwo i kontrakt API)

- **Pełne schematy odpowiedzi** dla wszystkich tras i typy klienta generowane z OpenAPI (dziś schematy mają głównie wejścia i błędy).
- **Lint kontraktu w CI** (np. Spectral) i test, że `/api/openapi.json` nie zmienia się bez świadomej decyzji.
- **`201 Created` + `Location`** dla nowej decyzji (API-02); dziś `200` z treścią.
- **Prawdziwa tożsamość użytkownika** (SSO/OIDC, konto zamiast nazwy z nagłówka `X-CI-Actor`). Dziś audyt zapisuje nazwę wyświetlaną i sposób autoryzacji (`via`).
- **Rotacja tokenu administratora** bez restartu i kilka tokenów (np. osobny dla CI) — dziś jeden `CI_ADMIN_TOKEN` ze zmiennej środowiskowej.

## Po przeglądzie TypeScript (2026-10-06)

- **Typy z jednego źródła:** TypeBox albo `json-schema-to-ts` z type providerem Fastify, żeby typy żądań wynikały ze schematów zamiast być pisane osobno.
- **Schematy odpowiedzi `200` w OpenAPI** dla wszystkich tras (dziś głównie wejścia i błędy).
- **`400` zamiast `422` dla błędów walidacji** (albo odwrotnie, ale jednolicie). To zmiana łamiąca kontrakt, więc razem z `/api/v1`.
- **`exactOptionalPropertyTypes`** w `tsconfig`. Wymaga przejrzenia wszystkich pól opcjonalnych (`undefined` a brak pola).
- **Runner testów dla `packages/web`** (np. Vitest z Testing Library). Dziś web ma tylko typecheck i build; m.in. przepływ `412` przy zapisie ustawień nie ma testu automatycznego.

## Repozytorium i CI

- **Wymagany check tytułu PR na `main`.** Ruleset (lub klasyczna ochrona gałęzi) z wymaganym checkiem
  `conventional-commit` (workflow `PR title`) i zakazem bezpośrednich pushy. Teraz nie działa: na planie GitHub Free
  reguły w repozytorium prywatnym są tylko zapisane („Not enforced”). Wymaga GitHub Pro/Team albo repozytorium
  publicznego. Do tego czasu tytuł sprawdza sam workflow, ale nie blokuje merge'a. Kroki: Settings → Rules → Rulesets
  → New branch ruleset → Include default branch → Require a pull request + Require status checks to pass
  (`conventional-commit`). Przy okazji: tylko *squash merging* z domyślnym komunikatem *Pull request title*.
