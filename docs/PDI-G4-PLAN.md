# G4 w ci_for_sdlc — ślad kryterium akceptacji do testu i wyniku

Stan: 2026-10-27. Luka G4 z mapy ekosystemu SDLC: QA poznaje wymagania późno, a testy nie mają śladu do kryteriów
akceptacji, więc nikt nie wie, które kryterium ma test i czy ten test przechodzi. Elementy już są: ci_for_sdlc nadaje
kryteriom identyfikatory `AC-n` (`analysis/acceptance.ts`, G2.1), a tf każe nazywać test akceptacyjny identyfikatorem
scenariusza (`qa-spec-first-testing`, „Śledzenie”: `US-02/AC-3`). Brakuje odczytu wyników testów i reguł.

## Model
- **Wyniki testów** to pliki JUnit XML, które wypisuje prawie każdy runner (Vitest, Jest, pytest, JUnit, Playwright).
  `connectors/tests.ts`: `parseJUnit(xml, file)` → przypadki testowe (`TestCase`: nazwa, klasa, plik, wynik `passed`
  / `failed` / `skipped`, pierwsza linia komunikatu błędu), `readTestResults(paths)` czyta pliki albo katalogi
  (`*.xml`). Bez zależności: parser czyta tylko `<testsuite>`, `<testcase>` i ich `<failure>`/`<error>`/`<skipped>`,
  z limitem 5 MB na plik i 20 000 przypadków. Plik, którego nie da się odczytać, to widoczny problem z powodem, nigdy
  cichy brak testów.
- **Ślad:** nazwa albo klasa testu zawiera `<KLUCZ>/AC-n` (także `KLUCZ AC-n`, `KLUCZ › AC-n`), gdzie `KLUCZ` to klucz
  elementu (`PAY-140`, `TSK-57`). Klucz, którego nie ma wśród elementów, ale cięcie z repo wymienia go w kolumnie
  wymagań `plan.md` (`US-02`), wskazuje to cięcie. `ProjectContext.tests` niesie przypadki z odwołaniami.
- **Wynik kryterium:** `passed`, gdy wszystkie jego testy przeszły (pominięte się nie liczą); `failed`, gdy któryś nie
  przeszedł; `untested`, gdy nie ma testu albo wszystkie są pominięte. `ItemAnalysis.acTests` podaje to per `AC-n`.

## Reguły (wymiar `requirements`)
| Reguła | Co wykrywa | Kategoria | Ważność |
|---|---|---|---|
| TEST-001 | Element ma już testy z jego kluczem, ale któreś kryterium nie ma żadnego (albo tylko pominięte). Bez żadnego testu reguła milczy: przed implementacją to normalne. | MISSING_COVERAGE | warning |
| TEST-002 | Test kryterium nie przeszedł. | CONFLICT | warning |
| TEST-003 | Test wskazuje kryterium, którego element nie ma (kryteria przenumerowane albo usunięte). | OUTDATED | warning |

Reguły działają tylko wtedy, gdy analiza dostała wyniki testów. Żadna nie jest krytyczna: czerwony test i tak
zatrzymuje CI, a te reguły mówią, którego kryterium dotyczy i czego brakuje.

## Wejście
`npm run analyze -- --tests <plik albo katalog>` (powtarzalne, także z `--repo`). W GitHub Actions ustalenia TEST
idą jak inne jako adnotacje, a plik testu, który się nie wczytał, to błąd bramki. Serwer i UI bez zmian w tym kroku.

## Testy (najpierw czerwone)
`test/tests-connector.test.ts`: parser (Vitest, Jest, pytest, Playwright w kształcie JUnit, encje, CDATA, zły XML,
limity), odwołania (`KLUCZ/AC-n` w nazwie i klasie, kilka w jednym teście, `US-02` przez wymagania cięcia).
`test/test-trace.test.ts`: wynik kryterium, TEST-001…003. `rule-coverage.test.ts`: dane demo z plikiem
`fixtures/junit/results.xml`. `server/test/gate.test.ts`: `--tests`, plik nieczytelny, adnotacje.
