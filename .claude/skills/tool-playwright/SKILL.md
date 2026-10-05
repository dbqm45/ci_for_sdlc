---
name: tool-playwright
description: Użyj przy testach e2e i API w Playwright — lokatory wg ról, asercje z oczekiwaniem, fixtures, trace, flaky w CI.
metadata:
  katalog: "Użyj przy testach e2e i API w Playwright (@playwright/test) — lokatory wg ról, asercje z oczekiwaniem, fixtures, projekty i tagi, migawki dostępności, zegar, trace, sharding, flaky w CI, test agents. Nie do wyboru przypadków (qa-test-design) ani zasad wyroczni (qa-spec-first-testing)."
---

# Playwright

## Zasady
1. **Oczekiwany wynik z przypadku testowego** (TC/AC w nazwie), nigdy „z tego, co pokazuje aplikacja” — qa-spec-first-testing.
2. **Lokatory jak użytkownik:** `getByRole(…, { name })` > `getByLabel` > `getByText` > `getByTestId`; CSS/XPath tylko w ostateczności.
   Brak dobrego lokatora wg roli to często **defekt dostępności** — zgłoś go.
3. **Asercje z oczekiwaniem** (`await expect(locator).toHaveText/ToBeVisible/…`) — nigdy `waitForTimeout` ani ręczne `sleep`.
4. **Izolacja:** każdy test ma świeży `context`; stan (użytkownik, dane) przygotuj przez API lub `storageState` w projekcie
   „setup”, nie przez klikanie. Zero zależności między testami.
5. **Czas pod kontrolą:** `page.clock.setFixedTime(...)` / `page.clock.install()` zamiast prawdziwego zegara.
6. **Sieć:** zewnętrzne usługi przez `page.route()` (albo HAR); własne API — prawdziwe (to test e2e).
7. **Mało e2e** — tylko ścieżki krytyczne; reguły biznesowe testuj niżej (qa-test-design).

## Wzorzec (sprawdzony: Playwright 1.63, Chromium)
```ts
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('zamówienie @smoke', () => {
  test.beforeEach(async ({ page }) => { await page.goto('/'); });

  test('TC-014 H1-AC2: 10 szt. z rabatem 5%', async ({ page }) => {
    await page.getByLabel('Ilość').fill('10');
    await page.getByRole('button', { name: 'Przelicz' }).click();
    await expect(page.getByRole('status')).toHaveText('Suma: 190,00 zł'); // wartość z requirements.md
  });

  test('struktura strony', async ({ page }) => {
    await expect(page.getByRole('main')).toMatchAriaSnapshot(`
      - heading "Zamówienie" [level=1]
      - spinbutton "Ilość"
      - button "Przelicz"
    `);
  });

  test('dostępność (axe)', async ({ page }) => {
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
});
```
Znany defekt: `test.fail(true, 'BUG-7')` lub `test.fixme()` z linkiem — oczekiwanej wartości nie zmieniaj.

## Konfiguracja (fragmenty)
```ts
export default defineConfig({
  fullyParallel: true, forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,           // retries wykrywają flaky, nie ukrywają ich
  failOnFlakyTests: !!process.env.CI,        // (1.52+) np. w zestawie nocnym
  use: { baseURL: 'http://localhost:4173', trace: 'on-first-retry' },
  webServer: { command: 'npm run preview', url: 'http://localhost:4173', reuseExistingServer: !process.env.CI },
});
```
Zestawy (qa-regression): tagi w tytule/`{ tag: '@smoke' }` + `--grep @smoke`; PR: `--only-changed=origin/main` (1.46+);
CI: `--shard=1/4` + `merge-reports`. Page Object tylko gdy upraszcza — preferuj fixtures (`test.extend`) i funkcje pomocnicze.
Testy API: fixture `request` (`request.post(...)`, `expect(res).toBeOK()`).

## Test agents (1.56+)
`npx playwright init-agents` generuje agentów planner → generator → healer. Traktuj ich wynik jak kod od juniora:
plan zestawiaj z przypadkami z qa-test-design, a **healer nie może zmieniać oczekiwanych wartości** — tylko lokatory/czekanie.

## Zależne od wersji
| Wersja | Co się zmieniło |
|---|---|
| 1.44 | punkt odniesienia: `getByRole`, `toHaveAccessibleName`, `expect.toPass`, tagi (`{ tag }`), `webServer`, projekty i zależności |
| 1.45 | API zegara `page.clock` |
| 1.46 | `--only-changed` (tylko testy dotknięte zmianą w git) |
| 1.49 | `toMatchAriaSnapshot` (migawki drzewa dostępności); `chromium-headless-shell` domyślnie w trybie headless |
| 1.52 | `failOnFlakyTests`; `toContainClass` |
| 1.56 | Playwright Test Agents (`init-agents`: planner, generator, healer) |
| 1.57 | usunięte `page.accessibility` (używaj migawek aria / axe) |
| 1.63 | testy komponentów (`@playwright/experimental-ct-*`) wycofywane — komponenty testuj w Vitest (tryb przeglądarki) |

## Checklista
- [ ] nazwa zawiera ID przypadku/kryterium, oczekiwanie ma źródło
- [ ] tylko lokatory wg ról/etykiet; brak `waitForTimeout`
- [ ] dane i logowanie przez API/`storageState`; test niezależny
- [ ] trace przy ponowieniu; flaky raportowane, nie ukrywane
