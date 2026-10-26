# F2 w ci_for_sdlc — zmiany z repo i bramka na PR

Stan: 2026-10-26. Krok F2 planu jednego flow (pdi `docs/plan-jeden-flow-sdlc.md` §8: „ci_for_sdlc: konektor repo,
status check na PR”; stan w pdi `docs/plan-g1-g2.md` §10: brakuje konektora `changes/` i status checka, co blokuje
G1.4). Rekonstrukcja z kodu jako źródło jest już zrobiona (#69).

## Decyzje właściciela (2026-10-26)
- **Checkout + CLI.** Konektor czyta `docs/project/changes/` z lokalnego katalogu (checkout repo w CI), jak
  rekonstrukcję tf z pliku. Status check to kod wyjścia `npm run analyze -- --repo <ścieżka> --fail-on critical`
  w workflow na PR. Bez trybu SaaS i bez nowych uprawnień GitHuba.
- **Dwa PR-y.** Ten: konektor, istniejące reguły REL-001…006 na zmianach z repo i bramka w CLI. Następny (G1.4):
  REL-007 (flaga bez planu) i REL-008 (fundament bez „Odblokowuje”).

## Model (kontrakt pdi 0.5.0, ten sam odczyt co ShipScope `lib/work-items-model.js`)
- **Zmiana `CHG-n` → epik.** Folder `docs/project/changes/CHG-n/` z `intent.md` (wymagany), `plan.md`
  i `release.yaml` (opcjonalne). Nagłówek YAML (`---`): `change` musi być nazwą folderu; `status` nagłówka to status
  epiku. Tytuł: pierwszy nagłówek `# ` intencji; opis: treść intencji. `mvp` (dla REL-002): z `release.yaml` —
  wynik, metryka z progiem i horyzontem (`horizon_days`), zabezpieczenia; bez niego sekcja „Metryki sukcesu” intencji.
- **Cięcie `TSK-n` → historyjka pod zmianą** (`epicKey`/`parentKey` = zmiana). Z wiersza tabeli w `plan.md`
  (kolumny po nagłówku, polskie albo angielskie: Cięcie/Slice, Wydanie/Release, Flaga/Flag, Wartość/Value,
  Weryfikacja/Verification, Status): tytuł i opis = wartość, kryterium akceptacji = weryfikacja, linia wydania
  i flaga z kolumn. `release.yaml` wygrywa: linia z `releases[].tasks`, flagi z `flags[].tasks`. Cięcie z
  `release.yaml` bez wiersza w planie też jest historyjką (tytuł = klucz). Status `dropped` — pominięte.
- Każdy element dostaje etykietę `change:CHG-n`, więc gotowość zmiany idzie do pdi tak, jak dla Jiry (F4).
- **Zły plik to widoczny problem, nigdy pusty plan.** Nieczytelny YAML, `change` inny niż folder, `release.yaml`
  niezgodny z kształtem kontraktu (pola, które czytamy) → problem z plikiem i powodem (bez treści pliku); tylko ta
  zmiana jest pominięta. Limity: 256 KB na plik, 200 zmian.
- `--repo-url https://github.com/…` daje elementom link do pliku.

## Bramka (CLI)
- `npm run analyze -- --repo <ścieżka> [--repo-url …] [--fail-on critical|warning]`: kontekst to wyłącznie zmiany
  z repo (bez Jiry i dema), ustawienia, decyzje i polityka z `CI_DATA_DIR` jak dotąd. Raport jak dziś plus problemy
  z plikami. Kod wyjścia 1, gdy którykolwiek element nie spełnia progu albo jest problem z plikiem.
- W GitHub Actions (`GITHUB_ACTIONS=true`) problemy z plikami i blokujące ustalenia idą też jako adnotacje
  `::error file=…::`, a raport w Markdown do `$GITHUB_STEP_SUMMARY`.
- Szablon workflow dla repo z `docs/project/changes/`: `docs/templates/change-check.yml` (na PR zmieniający
  `docs/project/changes/**`), opis w `docs/REPO-CHANGES.md`.

## Testy (najpierw czerwone)
`packages/core/test/repo.test.ts`: odczyt zmiany z intencją, planem i `release.yaml` (tytuły, linie, flagi, MVP,
etykieta `change:`), pierwszeństwo `release.yaml`, zły plik jako problem, limity, REL-001…006 na zmianie z repo
(R1 zbyt duże, brak MVP). `packages/server/test/gate.test.ts`: `--repo` na katalogu testowym — raport, kod wyjścia 0
i 1, adnotacje i podsumowanie w trybie GitHub Actions.

## G1.4 — REL-007 i REL-008 (drugi PR)

Cel (pdi `docs/plan-g1-g2.md` §5.3, §10): PR zmieniający `release.yaml` albo `plan.md` zmiany dostaje czerwony albo
opisany adnotacjami check, gdy plan wydania łamie REL-007 lub REL-008 — tak jak dziś REL-001…006. Kontrakt pdi 0.5.0
ma wszystkie potrzebne pola (`release-plan.flags[]`: `owner`, `remove_by`, `rollout[].stage/min_days/exit`;
`task.kind`, `task.unblocks`), więc bez zmian w pdi.

**Model.** `RequirementItem.repo` (tylko elementy czytane z repo; w trybie Jira go nie ma, więc obie reguły tam milczą):
- zmiana (epik): ścieżki `intent.md`, `plan.md` i `release.yaml` (względem korzenia repo, z linkami przy
  `--repo-url`) oraz flagi z `release.yaml` z planem: `owner`, `removeBy`, `rollout[]` (`stage`, `minDays`, `exit`);
- cięcie (historyjka): `kind` (`slice`/`foundation`), `unblocks` (tekst kolumny), `requirements` (ID z kolumny
  wymagań), `planLine` (wiersz w `plan.md`).

`Evidence` dostaje opcjonalne `path` i `line` (plik zmiany względem korzenia repo), żeby bramka wiedziała, gdzie
postawić adnotację.

**Kolumny `plan.md`** (nowe, opcjonalne; plany bez nich czytają się jak dziś):
- Rodzaj/Kind/Typ/Type: `foundation`/`fundament`/`F`/`F-NN` → fundament; `slice`/`cięcie`/`S`/`S-NN` albo pusta →
  cięcie. Wartość zaczynająca się od „(fundament)”/„(foundation)” (zapis wyniku F w `plan-ciec.md` tf) też oznacza
  fundament.
- Odblokowuje/Unblocks: klucze cięć (`TSK-57`) albo tekst (niewiadoma, ścieżka weryfikacji — jak w tf).
- Wymagania/Requirements: ID wymagań (`US-02`, `FR-007`, `AC-1`).

**Reguły** (wymiar `delivery`, epik i feature, tylko zmiany z repo):
- **REL-007** (GAP, info): flaga z `release.yaml` bez planu — brak etapów `rollout`, etap bez `exit`, brak `owner`
  albo `remove_by`. Jedno ustalenie na flagę z listą braków; dowód: `release.yaml` (wiersz `key:` flagi).
- **REL-008** (GAP, warning): samokontrola z `plan-ciec.md` — fundament bez „Odblokowuje”, „Odblokowuje” z kluczem,
  którego nie ma w zmianie (plan + `release.yaml`), albo cięcie bez wymagania (bez weryfikacji i bez ID w kolumnie
  wymagań). Jedno ustalenie na wiersz; dowód: `plan.md` (wiersz cięcia). Cięcia tylko z `release.yaml` (bez wiersza
  w planie) pomija — brak kryteriów zgłasza już ich historyjka.
- Polityka działa jak dla innych reguł: `actions` decyduje, co robi `info`/`warning` (domyślnie info tylko zapisane,
  warning = „wymaga uwagi”), `disabledRules` wyłącza regułę. Osobnego nadpisania ważności per reguła w polityce nie ma.

**Bramka.** Adnotacje w GitHub Actions idą na plik z dowodu ustalenia (`release.yaml` dla REL-007, `plan.md` dla
REL-008), z wierszem, gdy jest znany; reszta jak dziś (`intent.md` dla zmiany, `plan.md` dla cięcia).
Ustalenia blokujące przy elemencie, który nie spełnia progu → `::error`; pozostałe otwarte ustalenia z plikiem zmiany
→ `::warning` (warning) albo `::notice` (info), bez wpływu na kod wyjścia. `change-check.yml` już reaguje na
`docs/project/changes/**`, więc PR zmieniający tylko `release.yaml` albo `plan.md` uruchamia check — sprawdza to test
szablonu.

**Kolejność:** (1) czerwone testy konektora i reguł; (2) konektor: plan flag, kolumny, ścieżki; (3) reguły w
`release-plan.ts`; (4) bramka: adnotacje z plików dowodów; (5) pokrycie reguł: zestaw zmian z repo w
`packages/core/test/fixtures/repo-changes/` czytany przez test pokrycia (świat demo i sandbox to Jira, więc w
`EXPECTATIONS` sandboxa obie reguły mają `gap` z wyjaśnieniem); (6) dokumentacja: `docs/REPO-CHANGES.md`, listy
reguł (`docs/ARCHITECTURE.md`, `FAQ.md`).

**Testy:** `packages/core/test/repo.test.ts` — flaga bez etapów / bez `exit` / bez właściciela / bez `remove_by`,
fundament bez „Odblokowuje”, „Odblokowuje” do nieistniejącego cięcia, cięcie bez wymagania, czysty plan = brak
ustaleń, Jira bez ustaleń, stare plany bez nowych kolumn. `packages/server/test/gate.test.ts` (testy CLI są tam;
`cli.test.ts` nie istnieje) — `--repo` z `--fail-on warning` pada na REL-008, info z REL-007 nie zatrzymuje
`--fail-on critical`, adnotacje na `release.yaml` i `plan.md`. Bramki lokalnie: `npm test`, `npm run typecheck`,
`npm run lint:commit` dla tytułu PR (GitHub Actions na tym koncie nie działają — rozliczenia).
