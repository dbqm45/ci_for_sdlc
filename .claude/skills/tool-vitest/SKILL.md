---
name: tool-vitest
description: Użyj przy testach w Vitest — struktura, tabele przykładów, dublery, kontrolowany czas, tryb przeglądarki, Stryker.
metadata:
  katalog: "Użyj przy testach jednostkowych, integracyjnych i komponentowych w Vitest — struktura testów, tabele przykładów, dublery (vi.fn, vi.when), kontrolowany czas, projekty, tryb przeglądarki, pokrycie, testy mutacyjne ze Strykerem, migracje wersji. Nie do zasad wyroczni (qa-spec-first-testing) ani Jest (tool-jest)."
---

# Vitest

## Zasady
1. **Tabela przykładów ze specyfikacji** (`it.each`) z ID przypadku i komentarzem, skąd oczekiwana wartość; granice: pod/na/nad.
2. **Test najpierw i czerwony** — uruchom `vitest` w trybie watch; nowy test ma paść z właściwego powodu (qa-spec-first-testing).
3. **Logika domeny bez frameworka i DOM** — środowisko `node`; DOM/komponenty w **trybie przeglądarki** (prawdziwa przeglądarka)
   zamiast jsdom, gdy liczy się zachowanie UI.
4. **Dublery na granicach (porty), nie wewnątrz modułu:** fake > stub (`vi.when(...).calledWith(...).thenReturn(...)`) > mock.
   `vi.mock` modułów własnych tylko wyjątkowo — sygnał złego podziału zależności.
5. **Czas:** `vi.useFakeTimers()` + `vi.setSystemTime(...)`, przywracanie w `afterEach(() => vi.useRealTimers())`.
6. **Znany defekt:** `it.fails('TC-020 (BUG-7): …')` — test pozostaje ze specyfikacji; oczekiwanie zmienia tylko nowe źródło.
7. **Właściwości** (fast-check) dla obliczeń i niezmienników.

## Wzorce (sprawdzone: Vitest 5.0, fast-check 4, Chromium)
```ts
import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';

describe('H1-AC2 rabat ilościowy', () => {       // źródło: requirements.md „od 10 sztuk włącznie 5%”
  it.each([
    { id: 'TC-013', qty: 9,  expected: 18000 },
    { id: 'TC-014', qty: 10, expected: 19000 },
    { id: 'TC-015', qty: 11, expected: 20900 },
  ])('$id: $qty szt. × 20,00 zł = $expected gr', ({ qty, expected }) => {
    expect(orderTotal(2000, qty)).toBe(expected);
  });
});

it('suma części = kwota', () => {
  fc.assert(fc.property(fc.integer({ min: 0, max: 1e6 }), fc.integer({ min: 1, max: 50 }), (total, parts) => {
    expect(splitEvenly(total, parts).reduce((a, b) => a + b, 0)).toBe(total);
  }));
});

it('H3-AC1: kurs z portu', () => {
  const rates = vi.fn<(c: string) => number>();
  vi.when(rates, { onUnmatched: 'throw' }).calledWith('EUR').thenReturn(4.25);   // Vitest 5
  expect(priceIn(42500, 'EUR', rates)).toBe(10000);
});
```
Komponent w przeglądarce:
```ts
import { page } from 'vitest/browser';
await page.getByRole('button', { name: 'Dodaj' }).click();
await expect.element(page.getByRole('status', { name: 'Liczba' })).toHaveTextContent('1');
```
```ts
// vitest.config.ts — projekty zamiast workspace; dostawca przeglądarki jako obiekt
import { playwright } from '@vitest/browser-playwright';
export default defineConfig({ test: { projects: [
  { test: { name: 'unit', include: ['src/**/*.spec.ts'] } },
  { test: { name: 'browser', include: ['src/**/*.browser.spec.ts'],
      browser: { enabled: true, provider: playwright(), instances: [{ browser: 'chromium' }] } } },
] } });
```
Plik konfiguracji w ESM: `"type": "module"` w package.json albo `vitest.config.mts`.
Zestawy (qa-regression): `vitest --changed origin/main`, `--project unit`, `--shard`.

## Testy mutacyjne (Stryker)
`@stryker-mutator/core` 10 z **`testRunner: "command"`** (`"commandRunner": { "command": "npx vitest run" }`) działa z Vitest 5
(sprawdzone: wynik 93,55%, przeżyły mutant `quantity < 1 → <= 1` wskazał brak testu dla 1 sztuki).
`@stryker-mutator/vitest-runner` 10 z Vitest 5 **zgłosił 0% (wszystkie mutanty przeżyły) — to fałszywy wynik**; przy wyniku
0% lub podejrzanie 100% najpierw sprawdź, czy runner w ogóle aktywuje mutanty. Mutuj logikę domeny (`mutate`), nie całe repo.

## Zależne od wersji
| Wersja | Co się zmieniło |
|---|---|
| 3.0 | punkt odniesienia: `workspace`, tryb przeglądarki eksperymentalny, `vi.fn`/`vi.spyOn`, `it.each`, `it.fails`, `--changed` |
| 3.2 | `projects` zamiast pliku `workspace` (stary sposób wycofywany) |
| 4.0 | tryb przeglądarki stabilny; dostawcy jako obiekty z paczek `@vitest/browser-playwright`/`-webdriverio`/`-preview`, import `vitest/browser`; `workspace` usunięte → `projects`; `coverage.all` usunięte (ustaw `coverage.include`); `poolOptions` spłaszczone do opcji głównych; reporter `basic` usunięty |
| 5.0 | Node ≥ 22.12, Vite ≥ 6.4; `clearMocks: true` domyślnie (historia wywołań czyszczona przed każdym testem); `vi.when(...)` do warunkowych stubów (także z `using`); ścisłe lokatory w trybie przeglądarki; wyniki reporterów domyślnie w katalogu `.vitest`; Stryker: używaj runnera `command` |

## Checklista
- [ ] ID przypadku w nazwie, oczekiwanie ze źródła, test był czerwony
- [ ] brak `vi.mock` własnych modułów bez uzasadnienia; dublery tylko na portach
- [ ] fałszywy zegar przywracany; brak prawdziwej sieci
- [ ] mutation score modułów krytycznych mierzony i wiarygodny (nie 0%)
