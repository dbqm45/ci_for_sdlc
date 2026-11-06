# Z7b-1b — sprawdzanie celów zmiany (`targets`) w ci_for_sdlc

Data: 2026-11-06 · Powiązane: [plan „zespół jednoosobowy” §8.1 Z7b, §8.3 N4, decyzje DZ6 i DZ7](https://github.com/dbqm45/pdi/blob/main/docs/plan-zespol-jednoosobowy.md); plan Z7b-1a: [`pdi/docs/plan-z7b-cele.md`](https://github.com/dbqm45/pdi/blob/main/docs/plan-z7b-cele.md).
Startuje po Z7b-1a (pdi #160 scalone 2026-11-06; kontrakt pdi `0.12.0`, tag `contract-v0.12.0`).

## Cel kroku

Bramka `npm run analyze` czyta cele zmiany z `release.yaml` (pole `targets` z kontraktu pdi 0.12.0) i porównuje je
z realnymi raportami: pokrycie zmienionego kodu (lcov albo Cobertura XML), mutacje zmienionego kodu (StrykerJS albo
mutmut). Zmiana poniżej progu nie jest gotowa przed B4; ustalenie TGT można zamknąć decyzją `accept_risk` tak samo,
jak dziś SEC (Z8c-1, PRB-16). Wynik idzie do pdi w `readiness.changed.targets_status` (pole kontraktu 0.12.0).

Czytanie wejścia wygląda tak samo jak `--tests` (JUnit, `readTestResults`) i `--sarif` (`readSarif`): limit rozmiaru
pliku, jedno „problem” per nieczytelny plik, raport, który mówi „nie uruchomiono” — to błąd, nie zero wyników; brak
raportu dla ustawionego celu skutkuje `status: unknown` i blokuje bramkę (kontrola, która się nie wykonała, nie
jest „met”).

## Sprawdzone źródła (§8.4)

- **Kontrakt pdi 0.12.0** (sprawdzone 2026-11-06 w repo pdi i w tagu `contract-v0.12.0`): `release-plan.schema.json`
  z `properties.targets` i `$defs/targets`, `event.schema.json` z `readiness_changed.targets_status`
  i `gate_requested.targets`. `targets.coverage.min_percent` i `targets.mutation.min_score` są wymagane w obiekcie
  celu, ale same cele są opcjonalne.
- **lcov format** (`geninfo` manpage, [ltp.sourceforge.net](http://ltp.sourceforge.net/coverage/lcov/geninfo.1.php),
  sprawdzone 2026-11-06): plik tekstowy z rekordami `SF:<file>` kończącymi się `end_of_record`; linie w wierszach
  `DA:<line>,<hits>` i podsumowania `LH`/`LF`. Pokrycie liniowe liczymy z `DA` (linia pokryta, gdy `hits > 0`).
- **Cobertura XML** (cobertura-schema, [github.com/cobertura/cobertura](https://github.com/cobertura/cobertura/blob/master/cobertura/src/site/htdocs/xml/coverage-04.dtd),
  sprawdzone 2026-11-06): węzły `<class filename="...">` z `<line number="..." hits="..."/>`. Pokrycie liniowe
  z `hits > 0`.
- **StrykerJS mutation report schema** (`mutation-testing-report-schema`, v1/v2;
  [github.com/stryker-mutator/mutation-testing-elements](https://github.com/stryker-mutator/mutation-testing-elements/blob/master/packages/report-schema/src/mutation-testing-report-schema.json),
  sprawdzone 2026-11-06): `files` obiekt (klucz = ścieżka pliku), każdy z listą `mutants` zawierającą
  `status` (`Killed`/`Survived`/`NoCoverage`/…). Mutation score = `Killed / (Killed + Survived + Timeout)` × 100,
  klasycznie; `NoCoverage` nie wlicza się do mianownika. Trzymamy wariant „classic”.
- **mutmut** (`mutmut.readthedocs.io/en/stable/`, sprawdzone 2026-11-06): JSON wynikowy `mutmut-stats.json` albo
  tekstowy wynik `mutmut results` — czytamy **JSON** z `mutmut-stats --json` (zalecany od 3.x): per plik lista
  mutantów z `status` (`killed`, `survived`, `timeout`, `suspicious`, `no_tests`). Ten sam wzór liczenia co Stryker.
- **Zmieniony kod**. Wybieramy pliki z listą linii zmienionych w zakresie `--base <ref>..HEAD` (jak dziś robi
  `readSliceFiles` dla SARIF z `connectors/sarif.ts` i `scan-slices`). Pokrycie na zmienionych liniach liczymy
  jako: suma `DA`/`<line hits>` dla linii z zestawu zmienionych linii, które są w raporcie. Mutacje
  na zmienionym kodzie: mutant liczy się, gdy mieści się w zmienionych liniach swojego pliku (pozycja mutanta
  mieści się w zakresie `startLine..endLine` zmienionego bloku).

## Co zmienia się w ci_for_sdlc

1. **`scripts/pdi-contract.json`:** nowy set `0.12.0` z `release-plan.schema.json`, `event.schema.json`,
   `examples/release-plan.json`, `examples/release-plan-ai.json`, `examples/event-readiness.changed.json`
   i `examples/event-gate.requested.json`. Fixtures lądują w `packages/core/test/fixtures/pdi-contract/0.12.0/`.
   Testy kontraktowe (`scripts/lib/pdi-contract.test.mjs`) odczytują nową wersję jako jedną z `sets`.
2. **Model (`packages/core/src/model.ts`):** nowe typy `ChangeTargets` (`coverage`, `mutation`, `performance`,
   `evaluations`) i `TargetsStatus` (`overall`, `checked_at`, `summary`, `details`). Dokładane do `Epic` jako
   `targets?: ChangeTargets` i `targetsStatus?: TargetsStatus`.
3. **Readery:**
   - `packages/core/src/connectors/coverage.ts` — `readCoverage(paths, { root })` zwraca `{ files: Map<path, { lines: Map<lineNumber, hits> }>, problems: ReaderProblem[] }`. Rozróżnia lcov (`DA:` linie) i Cobertura (XML). Limit
     rozmiaru pliku 10 MB (jak SARIF). Raport, który pliku nie ma, jest błędem (jedno „problem”).
   - `packages/core/src/connectors/mutation.ts` — `readMutation(paths, { root })` zwraca `{ files: Map<path, { mutants: Mutant[] }>, problems }`. Rozpoznaje JSON StrykerJS v1/v2 po polu `schemaVersion` albo `files`; mutmut
     po `mutmut`/`mutants` + statusy w dolnym rejestrze.
4. **Reader celów z repo:** `packages/core/src/connectors/release-plan.ts` (nowy) — czyta
   `docs/project/changes/CHG-n/release.yaml` i waliduje `targets` schematem `release_plan.targets`
   z fixtures 0.12.0. Reader już czyta nagłówki zmian; dołożyć parsowanie `release.yaml` i wystawienie `targets`
   po kluczu CHG.
5. **Changed-code filter:** rozszerzyć `readSliceFiles` z `connectors/sarif.ts` o linie zmienione per plik
   (`{ sliceLines: Map<slice, Map<file, LineRange[]>>, prLines: Map<file, LineRange[]> }`). W Z8c-1 wystarczały
   same ścieżki; dla pokrycia i mutacji potrzebne są linie. `git diff --unified=0` daje „hunki” z numerami linii.
6. **Reguły:** `packages/core/src/analysis/targets.ts` (nowy) rejestruje reguły w `RULES` (`rules.ts`):
   - **TGT-001** `coverage.lines.min_percent` — `critical`, gdy pokrycie zmienionych linii zmiany < `min_percent`,
     z pominięciem wzorców z `targets.coverage.exclusions`.
   - **TGT-002** `mutation.changed.min_score` — `critical`, gdy mutation score na mutantach w zmienionych
     liniach < `min_score`, z pominięciem `targets.mutation.exclusions`.
   - **TGT-003** `performance.budget` — `warning` (bez pomiaru: `unknown`; pomiar dojdzie w Z10e).
   - **TGT-004** `evaluations.min` — `critical`, gdy wynik ewaluacji < `min` (zestaw danych z `targets.evaluations[].dataset`;
     bez pomiaru wejście z pliku, analogicznie do innych; implementacja teraz: `unknown`, bo Z7d nie zrealizowany —
     reguła działa, ale nie zwraca `not_met`, dopóki nie ma źródła ocen).
   Każda reguła generuje `Finding` po wzorze `SEC-001` z id `TGT-00x:CHG-n` i `evidence` ze ścieżką raportu.
   Ustalenie TGT można zamknąć decyzją `accept_risk` tak jak SEC (PRB-16, `decision add --finding`).
7. **CLI (`packages/server/src/gate.ts`):** nowe `--coverage <plik_lub_katalog>` i `--mutation <plik_lub_katalog>`
   (powtarzalne). Oba wymagają `--repo` (jak `--sarif`). Nieczytelne raporty → `exit 2` z komunikatem, jak dziś.
   Zmiana z ustawionym `targets.coverage`, ale bez `--coverage`, kończy się ustaleniem TGT-001 ze statusem
   `unknown` i jest `not_ready` (kontrola się nie wykonała).
8. **Readiness do pdi:** gdy w kopii kontraktu mamy 0.12.0 (sprawdzamy w `scripts/pdi-contract.json`), do
   `readiness.changed.payload` idzie `targets_status` z `{ overall, checked_at, summary, details }`. Bez wersji
   0.12.0 nie wysyłamy nieznanych pól — `PdiLink` je pomija (wsteczna kompatybilność).
9. **Annotations:** każde `TGT-00x` dostaje GitHub Actions annotation, jak dziś robi SEC/REL. Blokujące reguły to
   `error`, ostrzeżenia to `warning`.

## Co dojdzie do tf (osobny mały PR)

`modes/mode-pdi/skills/pdi-decisions/templates/change-check.yml`: opcjonalne kroki `Coverage` i `Mutation` (uruchamiane
tylko, gdy `release.yaml` ma `targets.coverage` lub `targets.mutation`), przekazujące ścieżki raportów przez
`--coverage`/`--mutation` do `npm run analyze`. Sekrety i wejścia przez `env`, jak w pozostałych krokach szablonu.
Komendy same (`stryker run`, `npx mutmut run`) są odpowiedzialnością produktu — szablon tylko czyta gotowy raport.

## Kolejność i TDD

1. **Plan** (ten dokument, PR docs-only).
2. **Pin kontraktu 0.12.0** z fixtures (testy `pdi-contract.test.mjs` muszą przechodzić, zanim dołożymy regułę).
3. **Model + typy** (`ChangeTargets`, `TargetsStatus`).
4. **Reader lcov/Cobertura** (`connectors/coverage.ts`): testy wejść poprawnych, niepoprawnych, zbyt dużych
   (ponad `MAX_COVERAGE_FILE_BYTES` = 10 MB), katalog mieszany lcov + XML, konflikt dwóch raportów dla tej samej
   ścieżki (sumujemy hits).
5. **Reader StrykerJS/mutmut** (`connectors/mutation.ts`): te same testy + rozpoznawanie po polu `schemaVersion`
   / `mutants` / `mutmut`.
6. **Changed-lines filter** (rozszerzenie `scan-slices.ts` / `connectors/sarif.ts`): testy diff → linie zmienione
   w parze (slice, plik) i w PR.
7. **Reader `release.yaml`** (`connectors/release-plan.ts`): test schematu, pominięcie zmiany bez `targets`,
   błąd przy nieznanych polach.
8. **Reguły TGT-001..004** (`analysis/targets.ts`): każda reguła ma test na „met” i „not_met” + test z `exclusions`
   + test z brakiem raportu („unknown” z blokadą).
9. **CLI**: testy jednostkowe `gate.ts` dla nowych opcji, test z pełnym przebiegiem (fixture repo z `release.yaml`
   + lcov + stryker JSON).
10. **Readiness.changed**: test, że z pinem 0.12.0 payload zawiera `targets_status`; z pinem 0.11.0 nie.
11. **tf PR** z krokami szablonu (osobny PR po scaleniu tego w ci_for_sdlc).

## Bramki

- `npm test` (`@ci/core`, `@ci/server`, `@ci/web`, `@ci/sandbox`, `@ci/mcp`).
- `npm run typecheck` (TypeScript).
- `npm run test:contract` (`@ci/server`).
- `npm run lint:commit`.
- `node --test "scripts/**/*.test.mjs"` (skrypty pinu).

## Nowe nazwy (wejścia dla innych kroków)

- CLI: `--coverage <ścieżka>` (powtarzalne), `--mutation <ścieżka>` (powtarzalne).
- Reguły: `TGT-001` pokrycie zmienionych linii, `TGT-002` mutacje zmienionego kodu, `TGT-003` budżety wydajności
  (warning; Z10e), `TGT-004` progi ewaluacji (AI).
- Pola modelu: `Epic.targets` (`coverage`, `mutation`, `performance`, `evaluations`),
  `Epic.targetsStatus` (`overall`, `checked_at`, `summary`, `details`).
- Payload `readiness.changed`: `targets_status.{ overall, checked_at, summary, details }` (nazwy z kontraktu
  pdi 0.12.0).
- Kontrakt pin: nowy set `0.12.0` w `scripts/pdi-contract.json`.

## Co zostaje poza Z7b-1b

- Pętla ulepszeń po `not_met` (Z7b-2 w grupie B) — teraz tylko sygnał TGT i blokada; człowiek decyduje.
- Progi `slo` (Z10a) i progi dostępności / rozmiaru paczki (Z10e) — reguła TGT-003 jest przygotowana (ostrzegawcza),
  ale faktyczny pomiar p95 i WCAG dojdzie w swoim kroku.
- Pętla ewaluacji aplikacji AI z realnym zestawem danych (Z7d) — TGT-004 działa, ale źródło wyników dojdzie, gdy
  Z7d powstanie.
