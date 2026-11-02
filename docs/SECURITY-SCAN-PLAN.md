# Z8c (część 1) w ci_for_sdlc — wyniki skanu bezpieczeństwa (SARIF) przy cięciach i zmianach

Stan: 2026-11-02. Krok Z8c planu pdi „zespół jednoosobowy” (§8.2, decyzja DZ11: Semgrep z regułami OWASP plus audyt
zależności menedżera pakietów, oba jako SARIF). Bramka czyta dziś JUnit (`--tests`) i OpenAPI (`--openapi`); brakuje
odczytu wyników skanu bezpieczeństwa. Cel: `npm run analyze -- --repo <ścieżka> --sarif <plik albo katalog>` czyta
wyniki skanu tak, jak `--tests` czyta JUnit. Wynik trafia do elementu, którego plik dotyczy, a blokujący wynik oblewa
bramkę i jest adnotacją na pliku i linii.

Uwaga: dokumentów pdi (`docs/plan-zespol-jednoosobowy.md`, `docs/decyzje.md`) nie dało się przeczytać z tej sesji
(repozytorium dbqm45/pdi poza zakresem dostępu). Plan opiera się na treści zadania.

## Model
- **Wynik skanu** (`ScanResult`, `connectors/sarif.ts`): narzędzie (`tool.driver.name`), identyfikator reguły, poziom
  (`error` / `warning` / `note`), komunikat (pierwsza linia `message.text`), plik i linia (pierwsza
  `physicalLocation`), lista CWE, link pomocy reguły, plik raportu.
  - Poziom: `result.level`, a gdy go nie ma, `defaultConfiguration.level` reguły (po `ruleIndex`, `rule.index`
    albo `ruleId` w `tool.driver.rules`), a gdy i tego nie ma, `warning` (domyślna wartość w SARIF 2.1.0). Semgrep
    nie zapisuje `level` w wyniku, tylko w regule (sprawdzone lokalnie, niżej).
  - Pomijane: `level: none`, `kind` inny niż `fail` (`pass`, `notApplicable`, `informational`, `review`, `open`) oraz
    wynik z `suppressions`, w których żadne tłumienie nie ma stanu `underReview` ani `rejected` (np. `nosemgrep`).
  - CWE z `properties.tags` reguły i wyniku (`CWE-78: …` u Semgrepa, `external/cwe/cwe-078` u CodeQL) oraz z
    `properties.cwe` (tekst albo lista).
  - Ścieżka: `artifactLocation.uri` bez `file://`, z `/` zamiast `\`, bez `./`; ścieżka bezwzględna wewnątrz
    repozytorium staje się względna względem jego korzenia.
- **Odczyt** (`readSarif(paths, { root })`): pliki albo katalogi (`*.sarif`, `*.sarif.json`, rekurencyjnie,
  posortowane). Limity jak w czytniku JUnit: 10 MB na plik (wyjście Semgrepa z fragmentami kodu bywa większe od
  raportu JUnit), 20 000 wyników łącznie. Plik, którego nie da się odczytać, to problem z powodem (brak pliku,
  za duży, nie JSON, `version` inna niż `2.1.0`, brak `runs`, przebieg z `executionSuccessful: false`), i problem
  oblewa bramkę: **skan, który się nie wykonał, nigdy nie znaczy „brak wyników”.**
- **Pliki cięć** (`packages/server/src/slice-files.ts`): `git log --no-merges --name-only` z trailerem
  `Change: TSK-n` (kilka kluczy po przecinku albo w kilku trailerach). Plik z commitu z trailerem należy do tego
  cięcia. Z `--base <ref>` (w CI: gałąź docelowa PR) historia to tylko commity PR (`<ref>..HEAD`), a zmienione pliki
  PR to `git diff --name-only <ref>...HEAD`. Bez `--base` czytana jest cała historia (do 10 000 commitów). Gdy git nie
  działa: z `--base` to problem skanu (bramka oblana), bez `--base` brak plików cięć (wszystko idzie do zmiany).
- **Przypisanie** (`analysis/security-scan.ts`, `securityByItem`):
  1. wynik na pliku, którego dotknął commit cięcia (`Change: TSK-n`), należy do tego cięcia (do każdego takiego);
  2. inaczej należy do zmiany: zmiany z folderu `docs/project/changes/CHG-n/`, gdy wynik jest w nim; inaczej zmian,
     których dotyka PR (cięcia z commitów PR i foldery zmian w diffie PR, tylko z `--base`); a gdy tych nie ma,
     **wszystkich zmian repozytorium**. To celowo bezpieczne: blokujący wynik nigdy nie ginie, najwyżej pokazuje się
     przy kilku zmianach. Adnotacje GitHub o tej samej treści wypisywane są raz.
- **`ProjectContext.securityScan`** (`{ results, sliceFiles, pr?: { files, slices } }`) przekazuje Engine (jak `tests`);
  `AnalysisEnv.securityByItem` dzieli wyniki na elementy. Bez `--sarif` reguły SEC milczą.

## Reguły (wymiar `architecture`, kategoria `CONFLICT`, źródło dowodu `security`)
| Reguła | Co wykrywa | Ważność |
|---|---|---|
| SEC-001 | Wynik skanu blokujący: poziom `error` albo `warning` z CWE z listy OWASP Top 10. | critical |
| SEC-002 | Inne ostrzeżenie skanu (`warning` bez CWE z listy). | warning |
| SEC-003 | Uwaga skanu (`note`). | info |

Jedno ustalenie na wynik (dyskryminator: narzędzie, reguła, plik, linia), dowód z plikiem i linią wyniku, więc
adnotacja trafia w miejsce wyniku. `actions` i `disabledRules` z polityki działają jak dla każdej reguły (domyślnie
`critical` blokuje, `warning` powiadamia, `info` tylko zapisuje).

**Lista CWE OWASP Top 10** (`OWASP_TOP10_CWES`): suma sekcji „List of Mapped CWEs” edycji 2021 (A01–A10) i 2025
(A01–A10), pobranych 2026-11-02. Suma, bo reguły `p/owasp-top-ten` w Semgrepie mają tagi edycji 2021, a 2025 jest
aktualna.

## Wejście i wyjście
- `npm run analyze -- --repo <ścieżka> --sarif <plik albo katalog> [--sarif …] [--base <ref>]`. `--sarif` wymaga
  `--repo` (inaczej kod 2 przed analizą), bo przypisanie idzie po plikach repozytorium.
- Wyjście: wiersz `Security scan: N results (E error, W warning, I note) from K file(s)` i lista plików, których nie
  dało się odczytać. Kody wyjścia bez zmian: 0 przeszła, 1 oblana (także nieczytelny SARIF albo błąd gita z
  `--base`), 2 nie dało się uruchomić.
- GitHub Actions: problem to `::error file=…,title=Security scan::…`; SEC-001, które oblewa bramkę, to `::error` na
  pliku i linii wyniku; SEC-002 to `::warning`, SEC-003 to `::notice`. W podsumowaniu przebiegu tabela
  „Security scan” (reguła, element, poziom, miejsce, komunikat).
- pdi: `changeReadiness` liczy dotąd tylko historie; teraz zmiana jest też `not_ready`, gdy jej element `epic` ma
  otwarte blokujące ustalenie SEC (wynik przypisany do zmiany). `--send-to-pdi` poza tym bez zmian.
- **Szablon** `docs/templates/change-check.yml`: `fetch-depth: 0` (historia dla trailerów), opcjonalny krok skanu
  (`semgrep scan --config p/owasp-top-ten --sarif --output …` i `npm audit --json` przez
  `scripts/npm-audit-sarif.mjs`, oba z `continue-on-error`, bo brak pliku i tak obleje bramkę), zmienna
  `SARIF_REPORTS` (jak `TEST_REPORTS`, kilka ścieżek po spacji; pusta = bez skanu) i `--base "origin/$BASE_REF"`.
- **Konwerter** `scripts/npm-audit-sarif.mjs <audit.json> <wyjście.sarif> [--lockfile package-lock.json]`: npm audit
  (npm 10) nie ma wyjścia SARIF. Jeden wynik na poradę (`via` z obiektem) i pakiet: `critical`/`high` → `error`,
  `moderate` → `warning`, `low`/`info` → `note`; reguła `npm-audit/<GHSA…>`; CWE w tagach; miejsce: plik blokady i
  linia wpisu `node_modules/<pakiet>`. Zły JSON, brak `auditReportVersion: 2` albo obiekt `error` → kod 1 i brak pliku
  wyjściowego.

## Kolejność
1. Ten plan. 2. Testy czytnika (czerwone) → `connectors/sarif.ts`. 3. Testy przypisania i reguł → 
`analysis/security-scan.ts`, `SourceSystem` `security`, rejestr `RULES`, `context.ts`. 4. Testy pdi →
`changeReadiness`. 5. Testy bramki → `slice-files.ts`, `gate.ts` (`--sarif`, `--base`), `engine.ts`. 6. Konwerter z
testem. 7. Szablon i jego test, `docs/REPO-CHANGES.md`, README. 8. Bramki: `npm test`, `npm run typecheck`,
`npm run test:contract`, `npm run lint:commit`, `npm run test:scripts`.

## Testy (najpierw czerwone)
- `core/test/sarif.test.ts`: poprawny log Semgrepa (poziom z reguły, CWE z tagów, URI z `%SRCROOT%`), CodeQL
  (`result.level`, `external/cwe/cwe-079`), tłumione i `kind: pass` pominięte, `executionSuccessful: false`, nie JSON,
  zła wersja, brak `runs`, za duży plik, za dużo wyników, brak pliku, katalog.
- `core/test/security-scan.test.ts`: przypisanie do cięcia po pliku, do zmiany (folder zmiany, zmiany PR, wszystkie),
  poziomy SEC-001/002/003, lista CWE (A03:2021 CWE-78, A10:2021 CWE-918, A10:2025 CWE-476, CWE-400 poza listą),
  `disabledRules` i `actions`, `changeReadiness` z blokującym SEC na zmianie.
- `core/test/rule-coverage.test.ts`: zmiany z `fixtures/repo-changes` z plikiem `fixtures/sarif/scan.sarif`.
- `server/test/gate.test.ts`: `--sarif` (kod 1 przy SEC-001, 0 przy samych SEC-002 z `--fail-on critical`),
  nieczytelny plik, `--sarif` bez `--repo`, adnotacje na pliku i linii, tabela w podsumowaniu, przypisanie przez
  trailer `Change:` w prawdziwym repozytorium git, `--base`, linia szablonu (`SARIF_REPORTS`, `--sarif`, krok skanu).
- `scripts/npm-audit-sarif.test.mjs`: mapowanie poziomów i CWE, linia w pliku blokady, zły JSON.

## Weryfikacja narzędzi (§8.4, 2026-11-02)
| Co | Źródło | Wynik |
|---|---|---|
| SARIF 2.1.0 (`version`, `runs`, `level`, `defaultConfiguration`, `kind`, `suppressions`, `ruleIndex`) | https://docs.oasis-open.org/sarif/sarif/v2.1.0/ | Host niedostępny z sesji (sieć). Pola sprawdzone na rzeczywistym wyjściu Semgrepa; domyślny `warning` według specyfikacji (z pamięci, do potwierdzenia). |
| Semgrep CLI 1.183.0, `--sarif`, `--config p/…` | https://semgrep.dev/docs/cli-reference (host niedostępny); kod źródłowy zainstalowanego pakietu (pip, `semgrep==1.183.0`) | Wynik SARIF: `level` tylko w `tool.driver.rules[].defaultConfiguration`, tagi `CWE-…`/`OWASP-A0x:2021`, URI względne z `uriBaseId: %SRCROOT%`, bez logowania `fingerprints` = „requires login”. Rejestr: `p/…` to `GET {semgrep_url}/c/p/…` bez tokenu. |
| `semgrep scan --config p/owasp-top-ten --sarif` bez logowania, czysta instalacja (pusty `HOME`, bez `SEMGREP_APP_TOKEN`) | lokalny test | CLI próbuje anonimowo pobrać `https://semgrep.dev/c/p/owasp-top-ten`; proxy sesji odrzuca semgrep.dev (403), więc **pobrania nie dało się potwierdzić tutaj**. Według kodu żądanie nie wymaga tokenu. Gdy pobranie się nie uda, semgrep kończy się błędem bez pliku SARIF, a bramka (brak pliku) jest oblana. Do potwierdzenia na pierwszym przebiegu w GitHub Actions. |
| npm audit (npm 10.9.9) `--json` | https://docs.npmjs.com/cli/v10/commands/npm-audit (host niedostępny); lokalne uruchomienie | Brak SARIF; kształt JSON `auditReportVersion: 2`, `vulnerabilities.<pakiet>.via[]` z `source`, `title`, `url`, `severity`, `cwe[]`, `range`. Kod 1, gdy są podatności. |
| OWASP Top 10 2021 i 2025, „List of Mapped CWEs” | https://github.com/OWASP/Top10 (`2021/docs/en/A0x_2021-*.md`, `2025/docs/en/A0x_2025-*.md`, przez raw.githubusercontent.com) | Pobrane; lista w `analysis/security-scan.ts`. |
| Polecenia przepływu GitHub (`::error file=,line=,title=`), `$GITHUB_STEP_SUMMARY`, `actions/checkout` `fetch-depth: 0` | https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands (host niedostępny) | Format jak w istniejącej bramce (F2, G4). `fetch-depth: 0` pobiera całą historię i gałęzie, więc `origin/<base_ref>` istnieje. |

Hosty do odblokowania, żeby potwierdzić oficjalne dokumentacje: docs.oasis-open.org, semgrep.dev, docs.npmjs.com,
docs.github.com.
