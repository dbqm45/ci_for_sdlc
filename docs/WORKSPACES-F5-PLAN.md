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

## Poza zakresem
Postgres, konta i role, usuwanie i zmiana nazwy przestrzeni, MCP z wyborem przestrzeni (na razie `default`).
