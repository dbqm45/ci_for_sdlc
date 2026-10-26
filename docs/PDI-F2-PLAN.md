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
(R1 zbyt duże, brak MVP). `packages/server/test/cli.test.ts`: `--repo` na katalogu testowym — raport, kod wyjścia 0
i 1, adnotacje i podsumowanie w trybie GitHub Actions.
