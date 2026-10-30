# L3 w ci_for_sdlc — gotowość zmian z repozytorium do pdi z bramki CLI

Stan: 2026-10-30. Krok L3 planu „cały przepływ lokalnie przez `sdlc up`” (dbqm45/pdi, `docs/plan-sdlc-lokalnie.md`,
§2 wiersz Z4 i §4 L3). Dziś `npm run analyze -- --repo <ścieżka>` (`packages/server/src/gate.ts`, `runGate()`) czyta
`docs/project/changes/` i raportuje, ale z pdi nie rozmawia. `readiness.changed` wysyła tylko serwer po analizie
(`PdiLink` w `packages/server/src/pdi.ts`, F4: podpis `v1=HMAC-SHA256(PDI_SIGNING_SECRET, "<ts>.<body>")`, kolejka,
ponowienia, wysyłka tylko wtedy, gdy gotowość różni się od ostatnio wysłanej). Bez serwera zmiana gotowa w repo nie
otwiera w pdi bramki „approve-for-implementation” — trzeba ręcznie prosić o bramkę.

## Cel
Po `npm run analyze -- --repo <ścieżka> --send-to-pdi` pdi dostaje `readiness.changed` dla każdej zmiany CHG-n
przeczytanej z repozytorium, tak samo jak od serwera w trybie Jira. Zmiana gotowa otwiera w skrzynce pdi
„approve-for-implementation” bez ręcznej prośby o bramkę.

## Zachowanie
- **Flaga** `--send-to-pdi` (bez wartości). Wymaga `--repo` oraz zmiennych `PDI_EVENTS_URL` (https albo http tylko dla
  localhost, jak w F4) i `PDI_SIGNING_SECRET`. Brak którejś albo adres nie do użycia → kod 2 i jasny komunikat
  **przed** analizą (nic nie jest czytane ani wysyłane).
- **Po analizie**: gotowość zmian liczy `changeReadiness()` z `@ci/core` na elementach analizy i wymaganiach repo
  (etykieta `change:CHG-n`, którą nadaje konektor repo; prefiks z ustawień Jira tu nie obowiązuje). Wysyłane są wszystkie
  zmiany z repozytorium, także te pominięte przez `--items` (filtr dotyczy tylko raportu). Zmiana bez cięć (sam
  `intent.md`) i zmiana z plikiem nie do odczytu nie mają gotowości — jak w serwerze nie idą do pdi.
- **Kolejka**: ten sam `PdiLink` i jego magazyn w `CI_DATA_DIR` (`pdi-state`, `pdi-outbox`). `enqueue()` dodaje zdarzenie
  tylko przy zmianie gotowości względem ostatnio wysłanej; potem jedno `deliver()` z krótkim, ograniczonym czasem
  (łącznie najwyżej 15 s, pojedyncze żądanie najwyżej 5 s), bo CLI się kończy. Co nie doszło, zostaje w kolejce
  (z ponowieniem po czasie jak w F4) na następny przebieg i jest wypisane.
- **Wyjście** (po raporcie, na stdout; wiersze stałe — wejście dla L4):
  ```
  pdi: <PDI_EVENTS_URL>
    pdi readiness.changed CHG-12 ready delivered
    pdi readiness.changed CHG-13 not_ready queued (pdi answered 500)
    pdi readiness.changed CHG-14 ready unchanged
    pdi queued readiness.changed CHG-9 attempts=2 next=2026-10-30T10:02:00.000Z (pdi unreachable: …)
  ```
  `delivered` — pdi przyjął; `queued (<powód>)` — zostało w kolejce; `unchanged` — ta sama gotowość co ostatnio
  wysłana, nic nie wysłano. Wiersze `pdi queued …` to wpisy, które nadal czekają w kolejce po tym przebiegu (także
  z wcześniejszych). Sekret nie pojawia się nigdzie.
- **Kod wyjścia** bez zmian: 0/1 jak dziś (gotowość względem `--fail-on`, problemy plików), 2 gdy analiza nie ruszy albo
  brakuje konfiguracji pdi. Nieudana dostawa jest wypisana, ale kodu nie zmienia.
- **Bez flagi** nic się nie zmienia: brak ruchu do pdi, to samo wyjście, zmienne `PDI_*` ignorowane.

## Pliki i kolejność
1. `docs/PDI-L3-PLAN.md` — ten plan.
2. Testy (czerwone): `packages/server/test/gate.test.ts` — nowy blok `analyze --send-to-pdi (L3)` z lokalnym odbiornikiem
   pdi (`node:http` na 127.0.0.1):
   - L3-01: z flagą i zmiennymi odbiornik dostaje jedno podpisane `readiness.changed` na zmianę (nagłówki
     `x-pdi-event`, `x-pdi-timestamp`, `x-pdi-signature` = HMAC), kształt jak przykład kontraktu, wiersze `delivered`;
   - L3-02: drugi przebieg z tą samą gotowością nic nie wysyła (`unchanged`), zmiana gotowości wysyła tylko ją;
   - L3-03: bez `PDI_EVENTS_URL` albo `PDI_SIGNING_SECRET` (i bez `--repo`) kod 2 przed analizą, bez ruchu;
   - L3-04: odbiornik odpowiada 500 albo nie działa → kod wyjścia jak bez flagi, wiersz `queued`, wpis w kolejce;
     następny przebieg (po czasie ponowienia) go dostarcza;
   - L3-05: bez flagi, ze zmiennymi, zero żądań i to samo wyjście.
   `packages/server/test/pdi.test.ts`: `enqueue()` zwraca dodane zdarzenia; `deliver()` z budżetem czasu nie czeka
   dłużej niż budżet na odbiornik, który nie odpowiada. Kontrakt: zdarzenie z bramki przechodzi schemat z kopii
   kontraktu pdi (`packages/core/test/fixtures/pdi-contract/0.7.0/event.schema.json`, Ajv 2020) i ma kształt przykładu
   `0.4.0/events/event-readiness.changed.json`.
3. `packages/server/src/pdi.ts`: `enqueue()` zwraca dodane zdarzenia; opcja `timeoutMs` (domyślnie 10 s) i
   `deliver({ budgetMs })` — po wyczerpaniu budżetu kolejne wpisy czekają w kolejce bez próby.
4. `packages/server/src/gate.ts`: flaga, walidacja przed analizą, kolejka i dostawa po raporcie, wiersze wyjścia.
5. Dokumentacja: `docs/REPO-CHANGES.md` (uruchomienie z pdi), tabela zmiennych w `README.md`, opcjonalny zakomentowany
   wiersz w `docs/templates/change-check.yml`.

## Bramki
`npm test`, `npm run typecheck`, `npm run test:contract`, `npm run lint:commit` — lokalnie (GitHub Actions na tym koncie
teraz nie działają; PR to mówi).
