# Grafy: parowanie i przepływ

## bipartite-matching — najwięcej par
- **Pytanie:** czy łączymy elementy dwóch zbiorów (ludzie–zadania) tak, by jak najwięcej miało parę, a dopuszczalność pary jest tak/nie?
- **Sygnały:** „przydziel”, „dopasuj”, „każdy może obsłużyć tylko…”.
- **To nie to, jeśli** pary mają koszt → `assignment`; obie strony mają preferencje → `stable-matching`; element może mieć wiele par z limitem → `max-flow`.

## assignment (metoda węgierska) — najtańsze parowanie
- **Pytanie:** czy każda para ma koszt/zysk i szukamy parowania o najlepszej sumie?
- **Sygnały:** „najtaniej”, „najlepiej dopasowany”, koszt przydziału, ocena kompetencji.
- **Pułapki:** parowanie maksymalne, stabilne i najtańsze to trzy różne problemy; wersja uogólniona (zadanie zajmuje część
  pojemności osoby — GAP) jest NP-trudna → `optimization.md` (plecak wielowymiarowy / solver).

## stable-matching — preferencje obu stron
- **Pytanie:** czy obie strony mają listy preferencji i nie może istnieć para, która wolałaby siebie nawzajem?
- **Sygnały:** rekrutacja, przydział studentów, „obie strony wybierają”.
- **Pułapki:** wynik faworyzuje stronę proponującą — to decyzja o sprawiedliwości.

## max-flow / min-cut — przepustowość
- **Pytanie:** czy przez sieć płynie coś ograniczonego przepustowością i pytamy o maksimum lub wąskie gardło?
- **Sygnały:** przepustowość, limity dzienne, „wąskie gardło”, rozdział wolumenu między kanały.
- **Mapowanie:** krawędź = pojemność; minimalne cięcie = wąskie gardło. Przydział z limitami po obu stronach = przepływ.
