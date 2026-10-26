# Testy regresji

Cel: zmiana w jednym miejscu nie psuje po cichu czegoś, co już działało — ścieżek użytkownika, dostępności,
wyglądu, kontraktu API ani reguł bramki jakości. Testy istnieją w jednej kopii; zestawy wybiera się tagami i konfiguracją.

## Zestawy

| Zestaw | Kiedy | Co uruchamia | Budżet |
|---|---|---|---|
| **smoke** | każdy push i PR (`.github/workflows/ci.yml`) | e2e z tagiem `@smoke`: po jednej ścieżce krytycznej na obszar (NAV-01, OVR-01, ITM-01, DEC-01, DRF-01, IMP-01, SET-02, AUD-01) | ~1 min |
| **PR** | każdy push i PR (`ci.yml`) | typecheck, testy jednostkowe z progiem pokrycia 80% (w tym kontrakt API), pełne e2e na Chromium z `@a11y` | < 15 min |
| **nocny** | w poniedziałki 02:17 UTC i ręcznie (`.github/workflows/regression-nightly.yml`) | e2e na Chromium, Firefox i WebKit, każdy test 2× (`--repeat-each=2`), test niestabilny = błąd; regresja wizualna; testy mutacyjne `core` | ~1 h |
| **przed wydaniem** | kandydat do wydania | ostatni zielony przebieg nocny + ręczna lista kontrolna na trybie live (Jira, Confluence, Figma) | wg planu |

Kwarantanna (`@quarantine`) jest wyłączona z bramki PR, ale uruchamiana w przebiegu nocnym.

## Polecenia

| Polecenie | Co robi |
|---|---|
| `npm run test:e2e:smoke` | tylko `@smoke` |
| `npm run test:e2e` | pełne e2e (Chromium); `E2E_BROWSERS=firefox` / `webkit` / `chromium,firefox` zmienia przeglądarki |
| `npm run test:a11y` | tylko `@a11y` |
| `npm run test:visual` | zrzuty ekranu (`playwright.visual.config.ts`) — tylko w obrazie Docker, patrz niżej |
| `npm run test:contract` / `test:contract:update` | kontrakt OpenAPI / akceptacja zmiany kontraktu |
| `npm run test:mutation` | Stryker na modułach krytycznych `core`, raport w `packages/core/reports/mutation/index.html` |
| `TF_DIR=../tf npm run test:parity` | zgodność reguł STORY/AC z `requirements_lint.py` tf na zestawie wzorcowym pdi i historyjkach demo (plan G1/G2 §4.8); bez `TF_DIR` test jest pomijany. W przebiegu nocnym (job `parity`) z tf przypiętym w `TF_REF`. Różnica spoza listy `KNOWN` w `tf-parity.test.ts` oblewa test, a wyjątek, którego żadna historyjka już nie potrzebuje, też — wtedy usuń go z listy |

Zmienne środowiskowe e2e: `E2E_PORT` (domyślnie 4399), `E2E_BROWSERS`, `E2E_FAIL_ON_FLAKY=1` (test zielony dopiero
po ponowieniu oblewa przebieg), `E2E_INCLUDE_QUARANTINE=1`, `PW_CHROMIUM_PATH` (własna binarka Chromium).

## Warstwy regresji

### Ścieżki użytkownika (e2e)
Pliki `e2e/*.spec.ts`, jeden na obszar aplikacji (tabela w README). Każdy test zaczyna od czystego stanu przez API
(`resetWorkspace`), więc kolejność nie ma znaczenia — sprawdza to `--repeat-each=2` w przebiegu nocnym.

### Dostępność (`e2e/accessibility.spec.ts`, `@a11y`)
- **axe** (WCAG 2.0/2.1 A i AA) na każdej stronie: zero naruszeń poza kontrastem.
- **Kontrast — znany defekt.** Obecna paleta ma 8 par kolorów poniżej 4,5:1 (plakietki ostrzeżeń, krytyczne i „healthy”,
  wyciszony tekst pomocniczy; lista `KNOWN_LOW_CONTRAST` w teście). Styl na razie zostaje bez zmian, więc test blokuje tylko
  **nowe** pary o złym kontraście. Po poprawieniu kolorów usuń parę z listy; dopisywanie pary, żeby test był zielony, jest zabronione.
- **Migawki drzewa dostępności** (`toMatchAriaSnapshot`, dopasowanie częściowe): menu boczne, strona elementu, stan projektu.
  Łapią zmiany struktury (zgubiony nagłówek, przycisk bez nazwy) bez kruchości pikseli.

### Regresja wizualna (`e2e/visual.spec.ts`, `@visual`)
Zrzuty całych stron: overview, backlog, PAY-123, impact, settings, na czystym demo i w oknie 1440×900. Teksty zależne od zegara
(„Last analysis”, „Analyzed … in N ms”, „Approved …”) są zamaskowane, animacje i kursor wyłączone, tolerancja 1% pikseli.

Czcionki i renderowanie różnią się między maszynami, dlatego wzorce **powstają i są porównywane wyłącznie** w obrazie
`mcr.microsoft.com/playwright:v1.64.1-noble` (job `visual` w przebiegu nocnym). Wzorców z laptopa nie commitujemy.

Procedura wzorców (pierwszy raz i po zamierzonej zmianie wyglądu):
1. *Actions → Regression (nightly) → Run workflow*, zaznacz `update_snapshots`.
2. Pobierz artefakt `visual-baselines` i **obejrzyj każdy zrzut** — wzorzec utrwala to, co widać, także błędy.
3. Skopiuj pliki do `e2e/__screenshots__/` i dodaj je w PR z opisem, co się zmieniło i dlaczego.

Dopóki katalogu `e2e/__screenshots__/` nie ma, job `visual` kończy się ostrzeżeniem, nie błędem.
Przy podnoszeniu `@playwright/test` zmień też tag obrazu w workflow i wygeneruj wzorce ponownie.

### Kontrakt API (`packages/server/test/openapi.contract.test.ts`)
Dokument `/api/openapi.json` jest porównywany z `packages/server/contracts/openapi.json`. Różnica oznacza zmianę API:
przejrzyj ją jak zmianę publicznego interfejsu (web, klienci, README → API), a potem zaakceptuj `npm run test:contract:update`
i commitnij plik razem ze zmianą kodu. Test biegnie w ramach zwykłych testów jednostkowych, więc jest częścią bramki PR.

### Testy mutacyjne (`packages/core/stryker.config.json`)
Stryker 10 mutuje moduły, od których zależy decyzja bramki: polityka, decyzje, analiza wpływu, hierarchia, strażniki,
odcisk zmian (drift) i stany UI. Runner `command` uruchamia dla każdego mutanta `vitest run --no-isolate --maxWorkers=1`.
Runner `@stryker-mutator/vitest-runner` 10 z Vitest 5 nie aktywuje mutantów i zgłasza fałszywe 0% — nie wracaj do niego
bez sprawdzenia wyniku na jednym module (`npx stryker run --mutate src/guards.ts`).
Wynik jest wskaźnikiem jakości testów, nie celem: przeżyty mutant to brakujący przypadek testowy.
Próg `break` jest ustawiony tuż pod zmierzonym wynikiem, żeby wynik nie spadał niezauważony.

Pomiar po przejściu na Vitest 5 (946 mutantów, w tym statyczne; ok. 14 min na 4 rdzeniach): **32,5%**, próg
`break: 30`. Najsłabiej: `impact.ts` (21,2%), `analysis/states.ts` (21,3%), `analysis/fingerprint.ts` (37,5%);
najlepiej `guards.ts` (77,8%) i `hierarchy.ts` (68,6%). Poprzedni pomiar (28,6%, Vitest 3, bez mutantów statycznych) nie
jest wprost porównywalny.
Każdy dopisany test, który zabija przeżyte mutanty, uzasadnia podniesienie progu.

## Niestabilne testy i kwarantanna

- Test raz zielony, raz czerwony bez zmiany kodu to **defekt** (testu albo aplikacji), nie pech.
- W CI ponowienia (`retries: 2`) służą do **wykrywania** niestabilności — raport HTML pokazuje test jako *flaky*.
  W przebiegu nocnym `E2E_FAIL_ON_FLAKY=1` oblewa przebieg.
- **Kwarantanna**: test, który blokuje PR, a nie da się go naprawić od ręki, dostaje tag `@quarantine` **i** komentarz
  z właścicielem, numerem zgłoszenia i terminem naprawy, np.:

  ```ts
  // Kwarantanna: @jan.kowalski, #123, do 2026-11-15 — wyścig przy zapisie ustawień
  test('SET-04: …', { tag: '@quarantine' }, async ({ page }) => { … });
  ```

  Test w kwarantannie nie blokuje PR, ale biegnie w przebiegu nocnym. Po terminie: napraw albo usuń. Bez właściciela i terminu — nie ma kwarantanny.
- Nigdy: `waitForTimeout`, `test.skip` bez zgłoszenia, zwiększanie `retries`, żeby ukryć problem.

## Utrzymanie

- Nowa ścieżka użytkownika → test w pliku obszaru z ID w nazwie; ścieżka krytyczna → także `@smoke`.
- Nowa strona → dopisz ją do `PAGES` w `accessibility.spec.ts` (i w `visual.spec.ts`, jeśli jest kluczowa).
- Test, który dubluje niższy poziom i nigdy nie złapał błędu — usuń.
