---
name: ddd-algorithm-recognition
description: Użyj, by znaleźć w domenie ukryty problem algorytmiczny (przydział, kolejność, pakowanie, trasy, kolizje w czasie).
metadata:
  katalog: "Użyj, gdy w obszarze domeny szukasz ukrytego klasycznego problemu algorytmicznego (kolejność i zależności, przydział, pakowanie w limity, pokrycie, trasy, kolizje w czasie, podobieństwo) — dwa tory dopasowania, mapowanie domena→algorytm, pewność, raport. Nie do klasy problemu (ddd-deep-modeling) ani doboru bibliotek (arch-tech-selection)."
  slowa: "znany problem algorytmiczny, harmonogram etapów, zależności między etapami, równolegle, kara za opóźnienie, ścieżka krytyczna, kolejkowanie zadań, przydział, plan tras, pakowanie"
---

# Rozpoznawanie problemów algorytmicznych w domenie

Pod językiem biznesu często kryje się problem od dawna rozwiązany („plan etapów z zależnościami” = sortowanie topologiczne
i ścieżka krytyczna; „dobierz ludzi do projektów w budżecie” = plecak wielowymiarowy). Rozpoznanie daje w spadku
**złożoność, znane pułapki i gotowe solvery**. Brak dopasowania też jest informacją: to prawdopodobnie nowatorski rdzeń
(core, lewa strona Cynefin — analiza bottom-up).

**Skan wskazuje kandydatów, nie podejmuje decyzji.** Nie wybiera wzorca taktycznego, nie wyznacza granic, nie implementuje.
Najpierw potwierdź klasę problemu (ddd-deep-modeling): prosty CRUD nie potrzebuje solvera.

## Dwa tory dopasowania — wynik to SUMA, nie część wspólna
1. **Tor językowy** — słowa-pomosty (rzeczowniki, czasowniki, przymiotniki: „zależy od”, „przydziel”, „nie może nachodzić”,
   „najtaniej”, „kolejka”, „podobny”) dopasowane **po znaczeniu**, w dowolnym języku, do rodzin w `references/`.
2. **Tor strukturalny** — dla każdego obszaru odpowiedz na pytania o kształt problemu:
   | Pytanie | Rodzina |
   |---|---|
   | Czy rzeczy muszą następować w **kolejności** wynikającej z zależności? | `graph-order.md` |
   | Czy **łączymy w pary** elementy dwóch zbiorów (ludzi z zadaniami)? | `matching-flow.md` |
   | Czy wybieramy **podzbiór mieszczący się w limitach** (budżet, pojemność, czas)? | `optimization.md` |
   | Czy trzeba **pokryć** wszystkie wymagania jak najmniejszym zestawem? | `optimization.md` |
   | Czy jest **sieć, trasa, połączenia**, najtańsza droga? | `graph-network.md` |
   | Czy **grupujemy** rzeczy w rozłączne zbiory / klastry? | `graph-network.md` |
   | Czy coś **nie może się nakładać w czasie** albo szukamy wolnych przedziałów? | `data-structures.md`, `optimization.md` |
   | Czy szukamy **podobnych / prawie takich samych** rzeczy? | `search.md` |
   | Czy ciągle wybieramy **następny najważniejszy** element? | `data-structures.md` |
   Potem sprawdź *pytanie dopasowania* każdej pozycji z wskazanej rodziny.

Trafienie w jednym torze wystarcza, by pozycja była kandydatem. Nie wymagaj zgodności obu torów — gubi prawdziwe trafienia.
Każda pozycja ma pole **„to nie to, jeśli… → zobacz X”**: to nie odrzucenie, tylko wskazanie wariantu (osobny kandydat).

## Pewność
- **wysoka** — trafiły oba tory, każdy innym cytatem, a mapowanie obejmuje ≥ 3 elementy wzorca (np. węzeł, krawędź, waga).
- **średnia** — jeden tor i wiarygodne mapowanie.
- **niska** — mapowanie spekulatywne. Niska pewność to uczciwy wynik, nie powód do pominięcia.

Złożoność, dobór struktur danych w kodzie, wzorce i techniki algorytmiczne: eng-algorithms-data-structures.

## Twarde reguły
- Każdy kandydat ma ≥ 1 **dosłowny cytat** ze źródłem i miejscem (bank dowodów z ddd-discovery-intake albo wymagania);
  cytat weryfikuj w źródle (`grep -F`). Nieodnaleziony → kandydat odpada; tekst z rozmowy bez źródła → `niezweryfikowany`.
- **Mapowanie domena → algorytm** jest pełne: co jest węzłem, krawędzią, wagą, pojemnością, ograniczeniem.
- Słowa sygnalizujące problem, dla których katalog nic nie ma (prognozowanie, symulacja „co jeśli”, negocjacje…) wypisz jako
  **„uczciwe braki”** — to kandydaci na nowatorski rdzeń.
- Nie deklaruj „NP-trudne” na słabych dowodach; nie rozwiązuj problemu w raporcie.

## Obserwacje między obszarami
- **Konsolidacja** — ten sam algorytm (≥ średnia pewność) w ≥ 2 obszarach → kandydat do połączenia albo wspólnego jądra.
- **Wspólne jądro** — ta sama implementacja algorytmu, różne modele domenowe (granice zostają).
- **Szew** — te same słowa, różne algorytmy → wskazówka, że to różne konteksty (ddd-strategic-analysis).

## Archetyp + algorytm
Gdy skan i archetyp (ddd-archetypes) wskazują to samo: **archetyp daje model, algorytm — silnik**. Algorytm zamknij w czystej
funkcji lub solverze za interfejsem archetypu (np. Availability → drzewo przedziałów / ograniczenie wykluczające w bazie;
General assignment → plecak wielowymiarowy).

## Wynik: `docs/project/02-domain/algorithms.md`
Format i przykład: `references/report-format.md`. Zapisuj obszar po obszarze (długi przebieg nie utnie wyniku).
Koszt: czytaj tylko pliki rodzin wskazanych przez tor strukturalny (1–2 pliki na obszar), a skan wielu obszarów zlecaj
podagentowi, który zwraca sam raport.

## Checklista
- [ ] klasa problemu potwierdzona przed skanem
- [ ] oba tory przejrzane dla każdego obszaru; kandydaci z cytatami i pełnym mapowaniem
- [ ] warianty („to nie to, jeśli”) i uczciwe braki wypisane
- [ ] obserwacje między obszarami; przekazanie do ddd-strategic-analysis i arch-tech-selection
