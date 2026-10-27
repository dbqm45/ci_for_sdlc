# F5 w ci_for_sdlc — wiele przestrzeni roboczych

Stan: 2026-10-27, zrobione (PR w toku). Krok F5 z planu jednego flow (pdi `docs/plan-jeden-flow-sdlc.md` §6: „Wiele repo /
projektów — przestrzeń robocza per repo, zgodnie z `docs/SAAS.md`”). Zmiana pdi może obejmować kilka produktów
(backend, frontend, aplikację mobilną), każdy z własnymi źródłami; jedna instancja ci_for_sdlc ma je analizować
razem z jedną gotowością zmiany.

## Decyzje właściciela (2026-10-27)
- **Adres:** trasy przestrzeni pod prefiksem `/api/w/:ws/…`; dotychczasowe `/api/…` działają jak dotąd na przestrzeni
  `default`. MCP, CLI i istniejące linki bez zmian.
- **Podział:** każda przestrzeń ma osobne ustawienia i źródła (Jira, Confluence, Figma, repo, wyniki testów),
  połączenie z Atlassianem, analizę, decyzje, zatwierdzenia, dryf, historię i audyt. Wspólne jest połączenie z pdi
  i jego kolejka; gotowość zmiany `CHG-n` liczy się z historyjek ze wszystkich przestrzeni.
- **Zakres pierwszego PR:** przestrzenie na plikach i przełącznik w UI. Bez Postgresa i bez kont (Identity zostaje
  „jeden zespół”) — to kroki 2–3 z `docs/SAAS.md`.

## Model
- Przestrzeń `default` to dotychczasowy katalog danych (`.ci-data/`); nic się nie przenosi. Kolejne przestrzenie:
  `.ci-data/workspaces/<id>/`, lista w `.ci-data/workspaces.json` (`id`, `name`, `createdAt`). `id`: małe litery,
  cyfry i `-`, do 40 znaków.
- Przestrzeń = `Store` + `Engine` + `AtlassianConnection` (`server/src/workspaces.ts`). Nowa przestrzeń zaczyna od
  ustawień domyślnych (tryb demo), jak świeża instalacja.
- `GET /api/workspaces` (lista), `POST /api/workspaces` (`{ id, name }`, admin). Usuwania na razie nie ma.
- Trasy przestrzeni (analiza, elementy, decyzje, zatwierdzenia, ustawienia, połączenia, dryf, audyt, demo,
  webhooki źródeł, SSE) są zarejestrowane dwa razy: pod `/api` dla `default` i pod `/api/w/:ws` dla każdej
  przestrzeni (nieznana → 404). OpenAPI opisuje obie.
- Globalne: `/api/health`, `/api/openapi.json`, `/api/workspaces`, `/api/rules`, `/api/pdi`, `/api/changes`,
  `/api/changes/:change/request-approval`, `/api/webhooks/pdi`.
- Połączenie OAuth z Atlassianem jest per przestrzeń; powrót z Atlassiana (`CALLBACK_PATH`, jeden adres
  zarejestrowany w aplikacji Atlassiana) trafia do przestrzeni, która wydała `state`.

## pdi
- Jedna kolejka i stan (w przestrzeni `default`). Po analizie którejkolwiek przestrzeni gotowość zmian liczy się
  z elementów i wymagań wszystkich przestrzeni (każda analizowana, zanim pdi coś dostanie).
- `gate.decided` zatwierdza historyjki zmiany w każdej przestrzeni, w której są; prośba o zatwierdzenie
  (`gate.requested`) bierze historyjki ze wszystkich.
- `decision.recorded` z przestrzeni innej niż `default`: `ref` = `<przestrzeń>/<element>/<ustalenie>`, `url` =
  `#/w/<przestrzeń>/item/…`; DEC zapisuje się na decyzji w tej przestrzeni. Dla `default` bez zmian.
- Klucze elementów w jednej zmianie powinny być różne między przestrzeniami (dwie witryny Jiry z tym samym
  `PAY-1` w jednej zmianie — pierwsza wygrywa; zapisane jako ograniczenie).

## UI
- Przełącznik przestrzeni w panelu bocznym (z „Nowa przestrzeń”). Adres `#/w/<id>/…` dla przestrzeni innej niż
  `default`; linki wewnątrz aplikacji zostają w bieżącej przestrzeni. Zapytania idą na `/api/w/<id>/…`, globalne
  bez prefiksu.

## Testy (najpierw czerwone)
`packages/server/test/workspaces.test.ts`: lista i tworzenie (zły `id` 422, duplikat 409, bez tokenu admina z
zewnątrz 401/403), rozdzielenie danych (decyzja w jednej przestrzeni nie widać w drugiej, ustawienia osobno),
`/api/…` = `default`, nieznana przestrzeń 404, gotowość zmiany z dwóch przestrzeni do pdi, `gate.decided`
zatwierdza w obu, `decision.recorded` z `ref`/`url` przestrzeni. `packages/web/test/workspace.test.ts`: ścieżki API
i adresy w UI.

## Domknięcie (2026-10-27, drugi PR)
- `PATCH /api/workspaces/:ws` (`{ name }`) zmienia nazwę, także `default` (zapisana w `workspaces.json`); `id`
  i adresy zostają.
- `DELETE /api/workspaces/:ws` (`{ confirm: <id> }`, wpisany ponownie) zatrzymuje przestrzeń i przenosi jej katalog
  do `workspaces-deleted/<id>-<czas>/` — nic nie jest kasowane; `default` nie da się usunąć (409). Ten sam `id`
  można potem użyć dla nowej przestrzeni.
- Settings → Workspace: nazwa przestrzeni, *Rename workspace*, *Delete workspace…*.
- MCP: `workspace` w narzędziach gotowości, elementu, grafu, decyzji i dryfu; nowe `list_workspaces`.

## Postgres (2026-10-27, trzeci PR; krok 2 `docs/SAAS.md`)
Decyzje właściciela: **dokumenty jsonb** (nie pełny schemat relacyjny — ta sama logika `Store`, mniejsze ryzyko),
**`CI_DATABASE_URL` + import** istniejących danych.
- `server/src/backend.ts`: `Backend` (dokumenty po nazwie i logi dopisywane) z dwiema implementacjami — `FileBackend`
  (pliki jak dotąd) i `PgBackend`. `Store` zostaje właścicielem kształtów, szyfrowania i kolejki zapisów.
- Schemat (`MIGRATIONS`, tabela `ci_schema_migrations`, uruchamiany przy starcie pod blokadą doradczą):
  `ci_documents (workspace, name, value jsonb)`, `ci_log_entries (workspace, log, value jsonb)`. Row-level security
  (włączone i wymuszone) po `current_setting('ci.workspace')`, ustawianym w każdej transakcji: zapytanie bez
  przestrzeni nie widzi nic, a zapis do cudzej przestrzeni jest odrzucany. Rola aplikacji nie może być
  superużytkownikiem ani mieć `BYPASSRLS`.
- Przestrzenie: `FileStorage` / `PgStorage`; usunięta przestrzeń w bazie dostaje nazwę `deleted:<id>-<czas>`
  (jedna transakcja, nic nie jest kasowane).
- `npm run db:import` kopiuje `CI_DATA_DIR` (`default` i przestrzenie z `workspaces.json`) do bazy: dokumenty bez
  zmian (zaszyfrowane zostają zaszyfrowane), logi w kolejności; przestrzeń, która ma już dane w bazie, jest
  odrzucana (bez podwójnego audytu). Pliki zostają.
- `GET /api/health` mówi `storage: files | postgres`.
- Testy: `packages/server/test/postgres.test.ts` na prawdziwym Postgresie (`CI_TEST_DATABASE_URL`, rola bez
  superużytkownika); w CI kontener `postgres:17` w jobie `test`. Bez zmiennej testy są pomijane.
- Ograniczenie: jeden serwer na bazę (kolejka zapisów jest w procesie).

## Poza zakresem
Konta i role (krok 3 `docs/SAAS.md`) — kolejny PR.
