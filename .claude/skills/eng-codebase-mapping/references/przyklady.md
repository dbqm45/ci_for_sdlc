# Przykłady mapy kodu

## 1. Mapa nieznanego repozytorium Nx
**Sytuacja:** „Dostałem repo `shop` (Nx, Angular + NestJS). Gdzie zacząć czytać i co jest rdzeniem?”

**Jak:**
1. **Inwentarz:** 3 projekty, 84 pliki TS, ok. 9 tys. linii — poniżej ~100 plików w zakresie, więc bez uzgadniania zakresu.
2. **Graf z narzędzi:** `nx graph --file=graph.json` dla projektów, `madge --json apps/api/src` i `madge --circular` dla plików.
3. **Punkty wejścia** wg punktacji (nazwa +3, korzeń/poziom niżej +1, górne 10% importów wychodzących +1, dolne 25%
   przychodzących +1).
4. **Warstwy i kierunek:** kontrolery → usługi → repozytoria; strzałka pod prąd to ustalenie.
5. **Węzły centralne** po odfiltrowaniu barreli `index.ts`; **cykle** wypisane; krawędzie z etykietą pewności.
6. **Zapis:** `docs/project/04-architecture/codebase-map.md`, data i commit `a1b2c3d`.

**Wynik** (fragment mapy):

| Kandydat na punkt wejścia | Nazwa | Poziom | Wychodzące | Przychodzące | Suma |
|---|---|---|---|---|---|
| `apps/api/src/main.ts` | +3 | +1 | +1 | +1 | **6** |
| `apps/web/src/app/app.config.ts` | +3 | +1 | +1 | +1 | **6** |
| `apps/web/src/app/app.routes.ts` | +3 | +1 | 0 | 0 | 4 |
| `libs/orders/src/order.service.ts` | 0 | 0 | +1 | 0 | 1 |

Warstwy (API): `orders/*.controller.ts` → `orders/order.service.ts` → `orders/order.repository.ts` → `libs/db`.
Ustalenie: `libs/db/src/audit.ts` importuje `order.service.ts` — strzałka pod prąd, tworzy cykl
`order.service.ts → order.repository.ts → audit.ts → order.service.ts` (WYCIĄGNIĘTE, madge).
Węzeł centralny: `order.service.ts` (23 połączenia) — tu zmiana ma największy zasięg.
Krawędź `PaymentsModule → StripeGateway` przez token DI: WYWNIOSKOWANE (z konfiguracji modułu, nie z importu).

Trasa czytania (fragment, 7 kroków):
1. `apps/api/src/main.ts` + `app.module.ts` — jak startuje API i jakie moduły ładuje.
2. `orders/orders.controller.ts` — endpointy, czyli co system robi dla klienta.
3. `order.service.ts` + `order.repository.ts` — rdzeń reguł zamówienia i zapis; najwięcej połączeń.
4. `libs/db/src/audit.ts` — przyczyna cyklu, zanim cokolwiek zmienisz w zamówieniach.

## 2. Wpływ diffu do opisu PR
**Sytuacja:** „Oceń wpływ mojej gałęzi przed review — zmieniłem liczenie rabatu”.

**Jak:**
1. Zmienione pliki: `git diff --name-only main...HEAD` → 3 pliki.
2. Świeżość mapy: `git diff --name-only a1b2c3d HEAD -- libs/pricing` pokazuje tylko 3 pliki tej gałęzi, więc mapa
   `libs/pricing` jest aktualna; w Nx dodatkowo `nx show projects --affected` → `pricing`, `api`, `web`.
3. Dla każdego pliku 1 krok w górę i 1 w dół, dotknięte warstwy.
4. Ryzyko ze złożoności, krawędzi między warstwami i zasięgu.

**Wynik** (do opisu PR):

| Plik | Kto go używa (↑) | Czego używa (↓) | Warstwy | Ryzyko |
|---|---|---|---|---|
| `libs/pricing/src/discount.ts` | `order.service.ts`, `cart.store.ts` | `money.ts` | usługi, UI | **wysokie** — 2 aplikacje |
| `libs/pricing/src/money.ts` | `discount.ts`, `invoice.ts` | — | narzędzia | średnie — fundament |
| `libs/pricing/src/discount.spec.ts` | — | `discount.ts` | testy | niskie |

Co przetestować (qa-regression): koszyk w `web`, składanie zamówienia i faktura w `api`.
