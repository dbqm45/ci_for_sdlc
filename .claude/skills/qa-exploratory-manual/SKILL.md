---
name: qa-exploratory-manual
description: Użyj przy testach ręcznych i eksploracyjnych — sesje z kartą, heurystyki, UAT, ręczna dostępność, zgłoszenia defektów.
metadata:
  katalog: "Użyj przy testach ręcznych i eksploracyjnych — sesje z kartą (session-based testing), heurystyki eksploracji, testy akceptacyjne z użytkownikami (UAT), ręczna dostępność, listy kontrolne regresji ręcznej i zgłaszanie defektów. Nie do automatyzacji (tool-*, qa-regression)."
  slowa: "zgłoszenie błędu, zgłoszenie defektu, jak napisać zgłoszenie, raport defektu, testy ręczne, sesja eksploracyjna, UAT, jak opisać błąd"
---

# Testy ręczne i eksploracyjne

Automaty sprawdzają to, co przewidzieliśmy. Eksploracja szuka tego, czego **nie przewidzieliśmy**: dziur w wymaganiach,
problemów użyteczności, nieoczekiwanych kombinacji. Oba rodzaje się uzupełniają.

## Sesja eksploracyjna (session-based)
- **Karta:** „Zbadaj *<obszar>* przy użyciu *<zasobów/danych/roli>*, aby odkryć *<rodzaj informacji/ryzyko>*”.
  Np. „Zbadaj rezerwację sali jako dwóch użytkowników jednocześnie, aby odkryć problemy ze współbieżnością”.
- **Czas:** 45–90 minut, bez przerw na inne zadania.
- **Notatki:** co sprawdzono, pomysły na kolejne karty, **defekty**, **pytania** (niejasności w wymaganiach).
- **Podsumowanie:** pokrycie, znalezione problemy, ryzyka, rekomendacje nowych testów automatycznych.

## Heurystyki
- **SFDPOT**: Struktura, Funkcje, Dane, Platforma, Operacje (jak naprawdę używają), Czas (strefy, terminy, współbieżność).
- **CRUD** na każdym obiekcie; **Złotowłosa** (za mało / za dużo / w sam raz); **przerwij** (odśwież, wstecz, utrata sieci, zamknij kartę w połowie);
  **granice** (qa-test-design); **role i uprawnienia** (co widzi inny użytkownik?); **lokalizacja** (polskie znaki, format daty, waluty).

## Kiedy ręcznie, kiedy automatycznie
| Ręcznie | Automatycznie |
|---|---|
| nowe funkcje (pierwsze poznanie), użyteczność, ocena wizualna, dostępność z czytnikiem ekranu, UAT | powtarzalne sprawdzenia, regresja, dane brzegowe, wiele kombinacji, ścieżki krytyczne |
Ręczny przypadek wykonywany trzeci raz bez zmian → kandydat do automatyzacji.

## Agent w roli testera ręcznego
Agent eksploruje przez przeglądarkę (np. Playwright w trybie z oknem albo narzędzia przeglądarki), prowadząc notatki jak w sesji.
Czego nie może ocenić sam (odczucia użytkownika, czytnik ekranu), przygotowuje jako **kartę sesji dla człowieka**.

## Testy akceptacyjne użytkownika (UAT)
Scenariusze z kryteriów akceptacji w języku biznesu, wykonywane przez użytkowników; wynik: akceptacja / lista uwag z priorytetem.

## Zgłoszenie defektu
```markdown
**Tytuł:** <co jest źle, gdzie> (np. „Rabat 5% nie jest naliczany dla dokładnie 10 sztuk”)
**Środowisko:** wersja/commit, przeglądarka, dane
**Kroki:** 1. … 2. … 3. …
**Oczekiwane:** … — **źródło:** requirements.md H1-AC2 / TC-014
**Rzeczywiste:** …
**Dowody:** zrzut, trace, log, test automatyczny (plik:linia)
**Waga / priorytet:** krytyczny | wysoki | średni | niski — z uzasadnieniem (wpływ × częstość)
```
Jeden defekt = jedno zgłoszenie; bez oceniania osób, same fakty.
