---
name: qa-spec-first-testing
description: Użyj, gdy testy mają sprawdzać wymaganie, nie implementację — niezależna wyrocznia, clean-room, ATDD, mutacje.
metadata:
  katalog: "Użyj przy każdym pisaniu testów — jak sprawić, by test sprawdzał WYMAGANIE, a nie powielał implementację (wyrocznia niezależna od kodu, TDD/ATDD, clean-room, protokół rozbieżności, testy charakteryzujące, mutacyjne i oparte na właściwościach). Nie do technik wyboru przypadków (qa-test-design) ani składni narzędzi (tool-*)."
---

# Testy od specyfikacji, nie od implementacji

## Problem
Test napisany przez **czytanie istniejącej metody** koduje jej zachowanie — razem z błędami. Taki test („lustrzany”)
przechodzi zawsze i niczego nie dowodzi: jeśli metoda liczy rabat od `> 10` zamiast od `>= 10`, test wygenerowany z kodu
sprawdzi `11` i utrwali błąd.

## Zasada: niezależna wyrocznia
**Oczekiwany wynik testu pochodzi spoza kodu produkcyjnego**, zawsze ze wskazanym źródłem:
1. kryteria akceptacji (Given/When/Then) i reguły biznesowe z `docs/project/03-requirements/`,
2. przykłady od eksperta (Example Mapping, ddd-deep-modeling) — konkretne liczby i daty,
3. wartości policzone **ręcznie lub inną metodą** niż kod (tabela w teście, arkusz, model referencyjny),
4. przepisy, standardy, kontrakty API (OpenAPI, typy publiczne),
5. właściwości i niezmienniki („suma rat = kwota”, „nigdy dwie rezerwacje na ten sam przedział”).

**Nigdy:** uruchomienie kodu i przepisanie wyniku jako „expected”; ta sama formuła w teście co w produkcji;
mock zwracający to, co potem jest asertowane.

## Przepływy pracy
### Nowa funkcja — test najpierw (TDD / ATDD)
1. Tester z kryteriów akceptacji pisze **testy akceptacyjne** (e2e/API) — przed implementacją.
2. Programista w cyklu TDD: test jednostkowy **czerwony z właściwego powodu** → minimalny kod → zielony → refaktor (eng-testing).
3. Każdy nowy test **musi najpierw nie przejść** — test, który od razu jest zielony, nic nie udowodnił (sprawdź, czy w ogóle wykonuje asercję).

### Kod istniejący bez testów
Dwa różne rodzaje testów — nigdy ich nie mieszaj:
- **Testy ze specyfikacji** (projektowane w clean-room, patrz niżej). Porażka = defekt albo luka w specyfikacji — **nie poprawka testu**.
- **Testy charakteryzujące** — tylko jako siatka bezpieczeństwa przed refaktoryzacją; utrwalają obecne zachowanie, nie jego
  poprawność. Oznacz je (`describe('[charakteryzujący] …')`, tag `@characterization`) i nie licz jako dowodu działania.
  Przy przepisywaniu takich testów na wyższy poziom prowadź **rejestr asercji** (co nowa asercja przestała rozróżniać i dlaczego to OK),
  a zmianę, która „przy okazji” naprawia błąd, zgłoś jako ukryty defekt (eng-behavior-preserving-refactoring).

### Clean-room (rozdzielenie ról)
- **Projektant testów** (`*-qa-analyst`) widzi specyfikację, kontrakty i istniejące testy, **nie widzi implementacji** —
  wymusza to hook `cleanroom_guard.py`. Produkuje przypadki testowe z oczekiwanymi wynikami i ich źródłem.
- **Automatyk** (`*-qa-automation`) może czytać kod, żeby podpiąć testy (selektory, API), ale **oczekiwane wartości bierze
  wyłącznie z przypadków testowych** — nie z kodu.

### Clean-room poza testami
Ta sama zasada działa przy generowaniu wymagań do testu obciążeniowego modelu (ddd-model-stress-test): agent w profilu `blind`
czyta wyłącznie brief biznesowy — wymagania pisane ze znajomością architektury pasują do niej z konstrukcji.

## Protokół rozbieżności (test ze specyfikacji nie przechodzi)
1. Sprawdź test względem specyfikacji: czy dobrze odczytałeś wymaganie i dane wejściowe?
2. Test zgodny ze specyfikacją → **zgłoszenie defektu** (qa-exploratory-manual: format zgłoszenia) z ID przypadku i cytatem ze źródła.
   Test zostaje czerwony albo oznaczony jako znany błąd (`test.fails` / `test.fixme` z linkiem do zgłoszenia) — **nigdy
   nie zmieniaj oczekiwanej wartości, żeby „przeszło”**.
3. Specyfikacja niejednoznaczna → otwarte pytanie do właściciela produktu (core-project-record); test oznaczony jako oczekujący.
4. Zmiana oczekiwanej wartości tylko z nowym źródłem (zaktualizowane kryterium) — w commicie podaj źródło.

## Czy testy w ogóle łapią błędy?
- **Testy mutacyjne** (Stryker dla JS/TS, PIT dla Javy) na logice domenowej: narzędzie wprowadza drobne błędy (`>=` → `>`,
  `+` → `-`); przeżyły mutant = brakujący test. Mierz *mutation score* krytycznych modułów, nie pokrycie linii.
  Wynik 0% albo podejrzane 100% na starcie = najpierw sprawdź, czy narzędzie w ogóle aktywuje mutanty (tool-vitest).
- **Testy oparte na właściwościach** (fast-check, jqwik) dla obliczeń i niezmienników — wyrocznią jest właściwość, nie kod.
- **Wartości brzegowe** z qa-test-design — tam najczęściej chowają się błędy „o jeden”.

## Sygnały testu lustrzanego (odrzucaj w review)
oczekiwana wartość liczona tą samą formułą co w kodzie · asercje na wywołania wewnętrznych metod zamiast na wynik ·
cały wynik jako snapshot zaakceptowany bez przeglądu · nazwa testu = nazwa metody (`test calculate()`) zamiast zachowania ·
brak odwołania do wymagania · test napisany po kodzie, który nigdy nie był czerwony.

## Śledzenie
Nazwa lub tag testu zawiera ID kryterium/przypadku (`H1-AC2`, `TC-014`). Pokrycie mierzymy **wymaganiami** (każde kryterium ma test),
nie procentem linii.
