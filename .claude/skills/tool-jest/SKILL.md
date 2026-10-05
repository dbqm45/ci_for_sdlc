---
name: tool-jest
description: Użyj przy testach w Jest — struktura, test.each, dublery i fake timers, ESM, konfiguracja, migracja do Jest 30 i na Vitest.
metadata:
  katalog: "Użyj przy testach w Jest (projekty istniejące, Node, React Native, Angular z jest-preset) — struktura, test.each, dublery i fake timers, ESM, konfiguracja, migracja do Jest 30 i kiedy przejść na Vitest. Nie do zasad wyroczni (qa-spec-first-testing) ani Vitest (tool-vitest)."
  slowa: "jestjs, Jest w projekcie, jest.useFakeTimers, fałszywy zegar, setSystemTime, jest.mock, jest.config, snapshot"
---

# Jest

## Zasady
Te same co w tool-vitest (tabela przykładów ze specyfikacji z ID, test najpierw czerwony, dublery tylko na portach,
kontrolowany czas, znany defekt jako `test.failing`), w składni Jest:

| Cel | Jest |
|---|---|
| tabela przykładów | `test.each([...])('TC-014: %i szt.', …)` |
| znany defekt | `test.failing('TC-020 (BUG-7): …', …)` — przechodzi, dopóki błąd istnieje; po naprawie zaczyna padać → usuń `failing` |
| czas | `jest.useFakeTimers().setSystemTime(new Date(...))` |
| sprzątanie dublerów | `restoreMocks: true` w konfiguracji (albo `using spy = jest.spyOn(...)` — wymaga środowiska z obsługą `using`, np. transpilacji TS) |
| dopasowanie tablic | `expect.arrayOf(expect.objectContaining({...}))` (30+) |

## Wzorzec (sprawdzony: Jest 30.5, ESM, Node 22)
```js
import { jest } from '@jest/globals';
import { createCart } from './cart.js';
const fixedClock = { now: () => new Date('2026-03-01T10:00:00Z') };   // fake zamiast mocka

test.each([
  [[['A', 1]], 1],
  [[['A', 2], ['B', 3]], 5],
])('H2-AC1: liczba sztuk dla %j = %i', (adds, expected) => {
  const cart = createCart(fixedClock);
  adds.forEach(([s, q]) => cart.add(s, q));
  expect(cart.count()).toBe(expected);
});

test.failing('H2-AC3 (BUG-9): łączy te same SKU w jedną pozycję', () => {
  const cart = createCart(fixedClock);
  cart.add('A', 1); cart.add('A', 2);
  expect(cart.lines()).toEqual([{ sku: 'A', qty: 3 }]);
});
```
ESM bez transpilacji: `transform: {}` w konfiguracji i `NODE_OPTIONS=--experimental-vm-modules jest`.
Składnia `using` nie działa w Node 22 bez transpilacji (sprawdzone: `SyntaxError`).

## Jest czy Vitest?
Nowy projekt na Vite/ESM/TS → **Vitest** (natywny ESM i TS, tryb przeglądarki, szybszy watch). Istniejący zestaw w Jest →
zostań, dopóki nie boli; migracja to zmiana importów (`vi` zamiast `jest`) i konfiguracji — rób ją osobnym krokiem, nie przy okazji.
Nie podnoś wersji Jest w projekcie bez prośby (core-stack-sync) — stosuj składnię z wersji projektu.

## Zależne od wersji
| Wersja | Co się zmieniło |
|---|---|
| 29 | punkt odniesienia: `test.each`, `test.failing`, nowoczesne fake timers domyślnie, `--testPathPattern` (liczba pojedyncza) |
| 30 | usunięte wsparcie Node 14/16/19/21; TypeScript ≥ 5.4; `--testPathPattern` → `--testPathPatterns`; jsdom 26; usunięte aliasy matcherów (`toBeCalled`, `toBeCalledWith`… → `toHaveBeenCalled*`); spy z `using` (sprzątanie automatyczne); `expect.arrayOf`; `jest.unstable_mockModule` dla ESM; szybsze i mniej pamięciożerne uruchomienia |

## Checklista
- [ ] ID przypadku w nazwie, oczekiwanie ze źródła
- [ ] `restoreMocks`/`clearMocks` w konfiguracji; brak przecieków stanu między testami
- [ ] matchery w pełnej formie (`toHaveBeenCalledWith`) — zgodne z Jest 30
