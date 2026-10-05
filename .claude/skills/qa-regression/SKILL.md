---
name: qa-regression
description: Użyj przy regresji — zestawy (smoke, PR, nocne), testy dotknięte zmianą, flaky i kwarantanna, dane testowe, metryki.
metadata:
  katalog: "Użyj przy budowie i utrzymaniu regresji — warstwy zestawów testów (smoke, PR, nocne, przed wydaniem), wybór testów dotkniętych zmianą, niestabilne testy (flaky) i kwarantanna, dane testowe, regresja wizualna i kontraktowa, metryki jakości testów. Nie do projektowania pojedynczych przypadków (qa-test-design)."
---

# Testy regresji

## Warstwy uruchomień
| Zestaw | Kiedy | Zawartość | Budżet czasu |
|---|---|---|---|
| **smoke** | każdy commit / wdrożenie | ścieżki krytyczne, zdrowie aplikacji | < 5 min |
| **PR** | każdy pull request | testy jednostkowe + integracyjne **dotknięte zmianą** (np. `nx affected`, `--only-changed`, `--changed`) + smoke e2e | < 15 min |
| **nocny** | raz na dobę | pełny zestaw, wszystkie przeglądarki, regresja wizualna, testy mutacyjne modułów krytycznych | godziny OK |
| **przed wydaniem** | kandydat do wydania | pełny automat + ręczna lista kontrolna (qa-exploratory-manual) + UAT | wg planu |
Oznaczaj testy tagami (`@smoke`, `@critical`, `@visual`) i uruchamiaj zestawy filtrem, nie osobnymi kopiami testów.

## Niestabilne testy (flaky)
- Test raz zielony, raz czerwony bez zmiany kodu **to defekt** (testu albo aplikacji), nie „pech”.
- Ponowienia (retries) tylko do **wykrywania** niestabilności w CI; raport flaky + opcja „fail on flaky” w nocnym zestawie.
- **Kwarantanna**: test wyjęty z bramki PR, z właścicielem, zgłoszeniem i terminem naprawy; bez terminu → usuń lub napraw.
- Typowe przyczyny: sztywne czekanie (`sleep`) zamiast asercji z oczekiwaniem, współdzielony stan/dane, zależność od kolejności,
  czas i strefa (użyj kontrolowanego zegara), prawdziwa sieć i usługi zewnętrzne, animacje.

## Dane testowe
Każdy test tworzy własne dane (fabryki/budowniczowie, API do przygotowania stanu) i nie zależy od innych testów;
unikalne identyfikatory; brak danych produkcyjnych (RODO). Stan przygotowuj przez API, nie przez klikanie UI.

Szerzej (dane syntetyczne i anonimizacja kopii produkcji, e-maile przez Mailpit, macierz kompatybilności, aplikacje
mobilne, narzędzia testów API, DAST w CI, monitoring syntetyczny po wydaniu): `references/dane-srodowiska-i-specjalne.md`.

## Regresja wizualna i dostępności
Zrzuty ekranu komponentów/stron ze stabilizacją (czcionki, animacje wyłączone, stały zegar i dane); przegląd różnic
przez człowieka przed aktualizacją wzorców. Migawki drzewa dostępności wykrywają zmiany struktury bez kruchości pikseli.

## Regresja kontraktów
Testy kontraktowe (np. Pact, walidacja względem OpenAPI) między frontem a API i między usługami — łapią zmiany łamiące
kompatybilność wcześniej i taniej niż e2e.
**Wiadomości** (zdarzenia, komendy): migawka formatu tym samym serializerem co outbox, stałe id i czasy w danych testowych,
sprawdzenie kompatybilności wstecz; w zestawie PR test **idempotencji konsumenta** — to samo id dwa razy → jeden efekt
(be-messaging-outbox).

## Utrzymanie
Testy to kod: review, refaktoryzacja, usuwanie przestarzałych. Test, który nigdy nie złapał błędu i dubluje inny poziom → usuń.

## Metryki (do uczenia się, nie jako cele)
defekty, które uciekły na produkcję · odsetek niestabilnych testów · czas zestawu PR · mutation score modułów krytycznych ·
pokrycie **wymagań** testami (qa-spec-first-testing). Procent pokrycia linii — tylko jako wskazówka, gdzie brakuje testów.

## Przykład
**Sytuacja:** każdy PR w monorepo Nx uruchamia 1 400 testów (380 e2e na trzech przeglądarkach) — 70 minut.
**Wynik:** zestawy z tagów, jedna kopia testów:

| Zestaw | Polecenie | Budżet |
|---|---|---|
| smoke | `npx playwright test --grep @smoke --project=chromium` | < 5 min |
| PR | `npx nx affected -t test lint` + smoke | < 15 min |
| nocny | pełny Playwright (3 przeglądarki, `@visual`) + Stryker dla `payments` | godziny OK |

Flaky z raportu idzie do kwarantanny (właściciel, zgłoszenie, termin), nie do `retries: 3`.

Więcej przykładów: `references/przyklady.md`.
