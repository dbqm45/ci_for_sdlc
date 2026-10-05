---
name: eng-testing
description: Użyj przy strategii testów w dowolnym języku — TDD, BDD, piramida testów, dublery, kontraktowe, mutacyjne.
metadata:
  katalog: "Użyj przy projektowaniu strategii testów i pisaniu testów w dowolnym języku — TDD (red-green-refactor), BDD i Example Mapping, piramida/trofeum testów, dublery testowe, testy kontraktowe, mutacyjne i charakteryzujące. Nie do narzędzi konkretnego frameworka testowego (tool-*) ani pracy testera (qa-*)."
  slowa: "jakość testów, pokrycie kodu, czy testy coś sprawdzają, mocki, dublery, testy mutacyjne, TDD"
---

# Testowanie

## TDD — cykl
1. **Red** — najmniejszy test opisujący następne zachowanie (i sprawdź, że pada z właściwego powodu).
2. **Green** — najprostszy kod, który przechodzi.
3. **Refactor** — popraw strukturę przy zielonych testach.
Przy bugfixie: najpierw test odtwarzający błąd. Testuj **zachowanie przez publiczne API**, nie implementację.
Praca agenta: najpierw uzgodnione spoiny, potem pionowe plasterki po jednym teście, refaktoryzacja jako jawny osobny krok,
anty-wzorce (test związany z implementacją, tautologiczny, cięcie poziome) — `references/tdd-z-agentem.md`.

### TDD w fabryce — obowiązkowe dla kodu produkcyjnego
- **Kolejność, nie deklaracja:**
  1. edytujesz plik testu;
  2. uruchamiasz testy — nowy test **nie przechodzi** z właściwego powodu (brak funkcji, zła wartość, a nie literówka
     w teście);
  3. dopiero teraz kod produkcyjny.

  Hook `tdd_guard` blokuje edycję kodu produkcyjnego bez tej sekwencji, osobno w sesji i w każdym subagencie.
- **Test od razu zielony** niczego nie dowodzi: popraw go tak, żeby sprawdzał brakujące zachowanie. Wyjątek: test
  charakteryzujący przed refaktoryzacją kodu bez testów; oznaczasz go `[charakteryzujący]` (qa-spec-first-testing).
- **Następne zachowanie = następny test.** Po kilkunastu zmianach kodu bez nowego testu hook znów wymaga testu
  (`CLAUDE_TDD_MAX_EDITS`, domyślnie 12).
- **Bez oszustw:**
  - nie zmieniasz oczekiwań w teście, żeby kod przeszedł;
  - nie piszesz implementacji „pod test” (zwracanie stałej, warunek na dane testowe);
  - nie oznaczasz testu jako pominięty.

  Jeśli test jest błędny, mówisz to w raporcie i poprawiasz go jawnie, z uzasadnieniem.
- **Kluczowa logika** (pieniądze, uprawnienia, reguły domeny): testy akceptacyjne pisze ktoś inny niż autor kodu
  (qa-analyst w clean-room). Autor kodu dostaje je jako gotowy kontrakt.
- **Poza bramką:** konfiguracja, style, szablony, dokumentacja, typy `.d.ts`, wygenerowane pliki. Prototyp lub spike
  to decyzja człowieka (`CLAUDE_TDD=off`); `CLAUDE_TDD=ask` oddaje każdą blokadę człowiekowi.
- **Raport:** polecenie i fragment czerwonego wyniku, potem zielony wynik całego zestawu.

## BDD i przykłady
- Reguły biznesowe jako scenariusze **Given / When / Then** w języku domeny (te same przykłady co w modelowaniu — ddd-deep-modeling).
- **Example Mapping** przed implementacją: historia → reguły → przykłady → pytania. Za dużo pytań = historia nie jest gotowa.

## Proporcje testów
- Dużo szybkich testów logiki domeny (bez frameworka, bazy, sieci) — tu jest wartość i szybka informacja zwrotna.
- Testy integracyjne na krawędziach: repozytorium z prawdziwą bazą (np. kontenery testowe), klient HTTP, kolejka.
- Nieliczne testy end-to-end dla krytycznych ścieżek użytkownika.
- Front: więcej testów komponentów/integracji niż jednostkowych szczegółów („trofeum testów”).

## Dublery
- Fake (prosta działająca implementacja, np. repozytorium w pamięci) > stub > mock. Mockuj tylko to, czego nie posiadasz
  (zewnętrzne systemy), i to przez własny port, nie bibliotekę zewnętrzną bezpośrednio.

## Techniki specjalne
- **Testy kontraktowe** (consumer-driven) między kontekstami/usługami zamiast kruchych E2E przez wiele systemów.
- **Testy charakteryzujące** przed refaktorem legacy — utrwalają obecne zachowanie.
- **Testy mutacyjne** do oceny jakości testów krytycznej logiki (pokrycie linii to za mało).
- **Testy oparte na właściwościach** dla obliczeń (np. suma podzielonej kwoty = kwota).

## Dobre testy
Szybkie, niezależne, powtarzalne, samosprawdzające się, czytelne (nazwa = zachowanie: `rejects_block_when_resource_disabled`).
Jeden powód porażki na test. Brak `sleep` — kontrolowany czas (zegar jako zależność).

## Skąd oczekiwany wynik
Oczekiwana wartość pochodzi z wymagania lub przykładu, **nigdy z uruchomienia kodu** — szczegóły, clean-room i protokół
rozbieżności: qa-spec-first-testing. Techniki doboru przypadków: qa-test-design. Regresja i flaky: qa-regression.

## Testy czytelne dla biznesu
- **Buildery w języku domeny** zamiast ręcznego składania obiektów: `projekt("P1").wymaga(kompetencja("JAVA-MID"), styczeń).zarabia(10_000)`.
- **Asercje dziedzinowe**: `assertThat(harmonogram).maEtap("Projekt").naPoziomie(2)` — błąd mówi językiem domeny.
- **Konfiguracja testowa modułu**: prawdziwa fasada złożona z fake'ów (repozytorium w pamięci) — szybkie testy przypadków użycia bez bazy.
- **Testuj własne asercje i buildery** — pomocnicza asercja, która porównuje wartość samą ze sobą, przechodzi zawsze
  (sprawdź ją raz na przypadku, który MUSI paść).
- Konwencja nazw plików testów musi pasować do wzorca uruchamiania — plik z inną końcówką po cichu się nie uruchamia.
- Współbieżność: dla blokady optymistycznej test z N równoległymi próbami i asercją na spójny stan końcowy.

## Warstwy testu akceptacyjnego
Scenariusz → DSL (czasowniki domeny) → sterownik (tłumaczy na wywołania systemu) → system. Scenariusz i DSL nie znają implementacji,
więc przeżywają refaktoryzację; wymienia się tylko sterownik (poziom domeny / aplikacji / systemu). Sterownik bez asercji.
Procedura refaktoryzacji z dowodem zachowania: eng-behavior-preserving-refactoring.
