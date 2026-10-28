# OpenAPI jako źródło — kontrakt API obok wymagań i projektu

Stan: 2026-10-28 — kroki 1–5 zrealizowane. Decyzja właściciela z 2026-10-28: „Rób OpenAPI” (Faza 2, Level 2 w `docs/ROADMAP.md`).

## TL;DR
ci_for_sdlc sprawdza dziś, czy dobrze zdefiniowaliśmy funkcję (Jira, Confluence, Figma). Kontrakt API odpowiada na
pytanie poziomu 2: **czy wymagania, UX i API są spójne?** Plan: każda operacja z pliku OpenAPI 3.x staje się
dokumentem kontekstu (`source: 'api'`) z faktami kontraktu: metoda, ścieżka, kody sukcesu i błędów, nagłówek
`Idempotency-Key`, limit liczby elementów. Dołącza do historyjek tak jak strony Confluence (wzmianka klucza, link,
podobieństwo treści). Z kontraktu powstają twarde twierdzenia (claims), więc istniejące reguły ARCH-001…003 i CON-001
od razu dostają dowód z API. Nowa reguła API-001 zgłasza kody błędów API, dla których ani historyjka, ani projekt
nie mają stanu ekranu.

## Dlaczego to ważne
- **Twarde dowody zamiast domysłów.** Dziś „API jest asynchroniczne” albo „żądania są idempotentne” reguły
  wyczytują z prozy w Confluence. Kontrakt mówi to wprost: `202 Accepted`, parametr nagłówka `Idempotency-Key`,
  `maxItems: 100`. Dowód z kontraktu ma wysoką pewność i wskazuje operację.
- **Rozjazdy wychodzą przed implementacją.** Historyjka obiecuje natychmiastowy wynik, a API zwraca `202` (ARCH-003);
  API zwraca `409` albo `429`, a nikt nie zaprojektował, co wtedy widzi użytkownik (API-001); historyjka mówi o 200
  elementach, a API przyjmuje 100 (CON-001).
- **Tanio i bez analizy kodu.** Kontrakt jest ustrukturyzowany; nie trzeba czytać repozytorium ani wysyłać kodu do AI.

## Model
- `DocumentItem.source: 'api'` (obok `confluence` i `code`) i `DocumentItem.api: ApiOperationFacts`:
  plik, tytuł i wersja specyfikacji, metoda, ścieżka, `operationId`, kody sukcesu, kody błędów z opisami,
  `idempotencyKey` (czy operacja ma parametr nagłówka `Idempotency-Key`), `maxItems` (limit tablicy w treści żądania).
- `SourceSystem` i źródło AI dostają `'api'`; dowód (`Evidence`) z API ma tytuł `API POST /payments/{id}/retry`.
- Treść dokumentu to czytelne podsumowanie kontraktu, np.
  `POST /payments/{id}/retry — Retry a payment. Responds 202 Accepted: processed asynchronously. Requests carry an
  Idempotency-Key header. Errors: 409 Conflict — payment already settled; 429 Too Many Requests.`
  To samo podsumowanie czyta człowiek w UI, recenzent AI i ekstraktory twierdzeń (`analysis/claims.ts`), które już
  rozpoznają `202 accepted`, `idempotency-key` i `at most N items` — bez osobnej maszynerii twierdzeń dla API.

## Zakres

### 1. Konektor `packages/core/src/connectors/openapi.ts` (TDD)
- `parseOpenApi(text, file)`: JSON albo YAML (pakiet `yaml` już jest), tylko OpenAPI 3.0/3.1; Swagger 2.0 i inne
  pliki to błąd z powodem (nigdy „zero operacji”). Lokalne `$ref` (`#/components/...`) rozwiązywane dla parametrów,
  odpowiedzi i schematu treści żądania; zewnętrzne `$ref` pomijane z uwagą.
- Jedna operacja → jeden dokument; id `METHOD path` w obrębie pliku. Powiązanie z wymaganiami: klucze z rozszerzeń
  `x-requirements` / `x-jira` i z opisu trafiają do treści („Requirements: PAY-123”), więc graf łączy je jawnie
  (`Page mentions PAY-123`); poza tym podobieństwo treści jak dla stron.
- `readOpenApi(paths)`: plik albo katalog (`*.json`, `*.yaml`, `*.yml`), limity rozmiaru pliku i liczby operacji;
  plik nie do odczytania → problem z nazwą pliku (jak `readTestResults`).

### 2. Analiza (TDD)
- Graf i kontekst: dokument `api` jest dokumentem kontekstu historyjki (`ItemCtx.docs`) i ma osobną listę `ItemCtx.api`.
  Twierdzenia z podsumowania kontraktu zasilają ARCH-001 (idempotencja), ARCH-002/003 (asynchroniczność) i CON-001
  (np. limit elementów).
- **API-001 — kod błędu API bez stanu w specyfikacji i projekcie** (MISSING_COVERAGE, `errorHandling`, warning;
  tylko historyjki z interfejsem): kod → stan ekranu: 400/422 → `validation_error`, 401 → `session_expired`,
  403 → `permission_denied`, 429 → `retry`. Stan, którego nie ma w tekście historyjki, decyzjach ani ramkach Figmy,
  trafia do jednego ustalenia z listą kodów i operacji oraz pytaniem, co widzi użytkownik. 5xx, 408 i 504 zostają
  przy ERR-002 i ERR-003 (pytają o nie przy każdej operacji sieciowej — bez dublowania ustaleń); kody bez stanu
  ekranu (404, 409) w pierwszej wersji pomijamy.

### 3. Serwer, CLI, UI
- Ustawienia: `integrations.openapi: { enabled, specPath }` (plik albo katalog na dysku serwera, jak `tests`).
  Silnik wczytuje kontrakt przy każdej analizie; plik nie do odczytania zatrzymuje analizę z błędem (jak testy).
- CLI bramki: `npm run analyze -- --openapi <ścieżka>` (obok `--repo` i `--tests`).
- UI: blok *API contract (OpenAPI)* w *Settings → Integrations*; grupa *API* w kontekście pozycji; etykieta źródła
  `api`. Zmiana Settings zmienia nocny wzorzec wizualny `settings.png` — ten sam ręczny krok co dla #77 (`TODO.md`).

### Poza zakresem (świadomie)
- Swagger 2.0, zewnętrzne `$ref`, pobieranie specyfikacji z URL lub repo (najpierw plik na dysku, jak testy).
- Pozytywny sygnał „wymaganie, UX i API są spójne” w ocenie gotowości — po pierwszych wynikach na prawdziwym projekcie.
- Porównanie pól formularza Figmy z polami schematu żądania.
- Dane demo z kontraktem API (zmieniłoby oczekiwania wielu testów demo); przykład w testach i w dokumentacji.

## Kolejność
1. Ten plan. ✓
2. Konektor: testy (czerwone) → `openapi.ts` → zielone. ✓ (core `test/openapi.test.ts` OA-01…11)
3. Model, graf, kontekst, dowody, twierdzenia z podsumowania: testy → kod. ✓ (`test/api-contract.test.ts` API-01…03)
4. API-001: testy → reguła. ✓ (API-04…06; strażnik pokrycia reguł: demo + `test/fixtures/openapi/cards.yaml`)
5. Ustawienia, silnik, CLI, UI, kontrakt OpenAPI serwera, testy serwera. ✓ (serwer API-08, GATE-11, GATE-12;
   sandbox: API-001 jako luka świata bez kontraktu, jak TEST-00x)
6. Dokumentacja (`ROADMAP.md`, `TODO.md`, README integracji), PR.

## Ustalenia z realizacji
- Kolejność operacji: ścieżki w kolejności pliku, metody w kolejności OpenAPI (GET, PUT, POST, DELETE…).
- Graf nazywa jawne powiązanie operacji z historyjką „API operation names PAY-124”.
- Operacje są też dokumentami kontekstu (`ItemCtx.docs`), więc ich treść widzą reguły czytające tekst dokumentacji;
  API-001 liczy pokrycie stanów tylko z historyjki, decyzji i ramek, nie z kontraktu.
