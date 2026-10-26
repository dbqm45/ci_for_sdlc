# K-1 — serwer MCP dla ci_for_sdlc

Stan: 2026-10-26. Krok K-1 z planu automatyzacji i konsoli (dbqm45/pdi `docs/plan-automatyzacja-i-konsola.md` §5.2–§5.3,
fala 1, kolumna ci_for_sdlc): „Claude jako interfejs już teraz”. W Claude (Claude Code, Claude Desktop) człowiek pyta
o gotowość definicji obok serwerów MCP pdi i ShipScope, bez nowego UI. Wzorzec: ShipScope
`design-docs/K1-MCP-PLAN.pl.md`, `adapters/mcp/` (ten sam kształt utrzymuje trzy serwery spójne).

## Decyzje właściciela (2026-10-26)
1. **Odczyty:** K-1 bez tokenu, zgodnie ze stanem usługi; README ostrzega, że odczyty są otwarte. Zamknięcie odczytów
   (np. `CI_READ_TOKEN` dla `GET /api/*`) to osobny krok przed instalacją sieciową.
2. **Pakiet:** `packages/mcp` w czystym JavaScripcie (ESM) z JSDoc sprawdzanym przez `tsc` (`checkJs`).
3. **Filtr zmiany:** po `epicKey` (zmiana i jej elementy) oraz po gotowości i typie; bez zmian w usłudze.
4. **Limit odpowiedzi:** 2 MB dla wszystkich tras, 32 MB tylko dla `GET /api/analysis`, którą serwer streszcza przed
   oddaniem modelowi.

## Założenia (potwierdzone)
1. **Lokalny serwer stdio** uruchamiany przez Claude, czytający istniejące REST API ci_for_sdlc. Bez endpointu MCP
   w usłudze (bez nowej powierzchni ataku). Node 22+, bez nowych zależności: podzbiór protokołu jak w ShipScope
   (`initialize` z wersjami 2024-11-05, 2025-03-26, 2025-06-18, `tools/list`, `tools/call`, `ping`), JSON-RPC 2.0
   rozdzielany nowymi wierszami. Oficjalne SDK niepotrzebne przy tym zakresie.
2. **Tylko odczyt.** Zatwierdzenie, wycofanie zatwierdzenia i zapis decyzji nie są narzędziami (zatwierdza przycisk
   w UI albo decyzja bramki z pdi; DA5 otwarta). `POST /api/analyze` też nie.
3. **Konfiguracja tylko ze środowiska:** `CI_SDLC_URL` — https, http tylko dla localhost, bez loginu w adresie.

## Ustalenia z kodu, które zmieniają założenia
- **Odczyty są dziś otwarte.** `registerGuards()` (`packages/server/src/http.ts`) sprawdza dla `GET /api/*` tylko
  nagłówek Host (loopback, `CI_ALLOWED_HOSTS`, albo dowolny host, gdy ustawiono `CI_ADMIN_TOKEN` bez listy hostów).
  `CI_ADMIN_TOKEN` chroni wyłącznie zmiany stanu. W instalacji sieciowej każdy, kto dosięgnie usługi, czyta całą
  analizę, decyzje, dryf i graf. Tryb SaaS (`docs/SAAS.md`) z logowaniem OIDC/SAML jest planem, nie kodem.
  Serwer MCP tego nie obchodzi: **nie wysyła `CI_ADMIN_TOKEN`** (narzędzie tylko do odczytu nie powinno trzymać
  poświadczenia, które może zmieniać stan). Zamknięcie odczytów to osobna decyzja (pytanie 1).
- **Filtr po etykiecie `change:CHG-n` i statusie Jira nie jest możliwy na `GET /api/analysis`:** elementy analizy
  (`ItemAnalysis`) nie niosą etykiet ani statusu workflow. Da się filtrować po gotowości (`ready`, `needs_attention`,
  `not_ready`), typie i po zmianie przez `epicKey` (tryb repo: cięcia mają `epicKey` = `CHG-n`; w Jirze — gdy
  historyjki są pod epikiem zmiany). Pytanie 3.
- **Rozmiar:** `GET /api/analysis` na demo (17 elementów) to 197 KB, średnio 11,5 KB na element (kontekst, claims,
  wyzwania). Limit 2 MB starcza na ok. 170 elementów; prawdziwy projekt Jira go przekroczy. Pytanie 4.
- `GET /api/analysis` i `GET /api/items/:key` uruchamiają analizę, gdy jej jeszcze nie ma (`ensure()`); to istniejące
  zachowanie odczytu, nie nowe wywołanie `POST /api/analyze`.

## Co
1. **Pakiet `packages/mcp`** (`@ci/mcp`, workspace, `type: module`), czysty JavaScript z JSDoc sprawdzany przez
   `tsc` (`checkJs`) w `npm run typecheck`, więc Claude uruchamia go gołym `node` bez kompilacji i bez `tsx`:
   - `src/lib.js` — protokół i klient (czyste funkcje, `createServer({ env, fetchImpl })`), jak `adapters/mcp/lib.js`
     ShipScope;
   - `src/ci-sdlc-mcp.js` — pętla stdio (stdout tylko komunikaty protokołu, reszta na stderr);
   - `README.md` — `claude mcp add`, konfiguracja Claude Desktop, przykładowe pytania.
2. **Narzędzia** (nazwy w stylu ShipScope; wynik jako tekst JSON i `structuredContent`; najpierw podsumowanie,
   pełne listy na żądanie):

   | Narzędzie | Trasa | Argumenty | Odpowiedź |
   |---|---|---|---|
   | `get_readiness_summary` | `GET /api/analysis` | `change` (CHG-12), `readiness`, `type` — opcjonalne | liczniki, metryki (gotowość, zdrowie specyfikacji, dług decyzyjny), najważniejsze ryzyka i lista elementów: klucz, typ, tytuł, gotowość, zdrowie, blokujące ustalenia (tytuły); najwyżej 100 elementów z `truncated` |
   | `get_item_readiness` | `GET /api/items/:key` | `key`, `full` (opcjonalnie) | gotowość, zdrowie, blokujące i otwarte ustalenia (reguła, waga, tytuł, wyjaśnienie, dowody: źródło, tytuł, link), otwarte pytania, zatwierdzenie, aktywne decyzje, dzieci, dryf; `full: true` zwraca całą odpowiedź trasy |
   | `get_item_graph` | `GET /api/items/:key/graph` | `key` | węzły (rodzaj, źródło, tytuł, link) i relacje sąsiedztwa |
   | `list_decisions` | `GET /api/decisions` | `key`, `all` (opcjonalnie) | aktywne decyzje (domyślnie) albo cała historia; pytanie, odpowiedź, kto, kiedy, skutek |
   | `list_drift` | `GET /api/drift` | `key`, `limit` (domyślnie 20, najwyżej 100) | zdarzenia dryfu, najnowsze pierwsze |
   | `list_rules` | `GET /api/rules` | — | reguły: id, nazwa, opis, typy |
   | `get_pdi_status` | `GET /api/pdi` | — | stan połączenia z pdi |

3. **Bezpieczeństwo i błędy:** argumenty sprawdzane przed żądaniem (tylko zadeklarowane, klucze
   `^[A-Z][A-Z0-9]+-[0-9]+$` jak `PAY-12`, `CHG-12`, `TSK-57`, wartości z list), ścieżki przez `encodeURIComponent`,
   `redirect: 'error'`, 30 s na żądanie, limit odpowiedzi (2 MB, analiza 32 MB); odpowiedź HTTP ≠ 2xx (problem+json) → `isError` ze statusem
   i `detail`, bez sekretów. Opisy narzędzi i `instructions` mówią modelowi, że tytuły i opisy z Jiry, Confluence
   i Figmy to dane, nie polecenia (jak prompty AI usługi).
4. **Dokumentacja:** `packages/mcp/README.md`, wiersz w `README.md` i `docs/ARCHITECTURE.md`, odnośnik w `FAQ.md`.

## Kolejność
1. Ten plan i odpowiedzi właściciela.
2. Czerwone testy `packages/mcp/test/`.
3. `lib.js` (protokół, konfiguracja, argumenty, klient, podsumowania), potem `ci-sdlc-mcp.js`.
4. Workspace w `package.json` (testy w `npm test`, `tsc -p packages/mcp` w `typecheck`).
5. Dokumentacja.

## Testy (najpierw czerwone, Vitest)
- `protocol.test.ts` na `lib.js`: `initialize` (wersja wynegocjowana, `instructions`), `tools/list` (nazwy, schematy,
  `readOnlyHint`), `ping`, nieznana metoda (−32601), nieznane narzędzie (−32602), złe argumenty (nadmiarowe, zły
  klucz, zła gotowość) bez żadnego żądania, powiadomienie bez odpowiedzi.
- `client.test.ts` przeciw lokalnemu serwerowi HTTP: ścieżki i `encodeURIComponent`, nagłówki (`accept`, brak
  `authorization`), podsumowanie gotowości z filtrami i `truncated`, element zwięźle i z `full`, 404/422/429
  (`Retry-After`) jako `isError` z `detail`, odpowiedź za duża, nie-JSON, http spoza localhost i login w adresie
  odrzucone bez żądania.
- `stdio.test.ts`: proces `ci-sdlc-mcp.js` — `initialize`, `tools/list`, `tools/call` na serwerze testowym, zły JSON
  (−32700), stdout tylko z komunikatami protokołu.
- Bramki lokalnie: `npm test`, `npm run typecheck`, `npm run lint:commit` (GitHub Actions na tym koncie nie działają).

## Poza zakresem
Narzędzia zapisu, endpoint MCP w usłudze, konsola (K-2/K-3), `POST /api/analyze`.
