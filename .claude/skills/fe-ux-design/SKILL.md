---
name: fe-ux-design
description: Użyj przy UX funkcji przed kodem — zadania, przepływy ze stanami, architektura informacji, makiety, heurystyki, teksty UI.
metadata:
  katalog: "Użyj przy projektowaniu i ocenie UX funkcji przed kodem — analiza zadań, przepływy ze stanami i przypadkami brzegowymi, architektura informacji, makiety, prototypy, heurystyki, testy użyteczności, hierarchia wizualna, ruch, teksty interfejsu, projekt włączający i etyczny, specyfikacja dla programistów. Nie do decyzji co budować (proc-product-discovery) ani CSS (fe-css)."
  slowa: "powiadomienia, nawyk, onboarding, makieta, przepływ użytkownika, stany ekranu, użyteczność, etyka projektowania, dark patterns"
---

# Projektowanie UX i interfejsu

Projektujesz zachowanie, nie obrazek. Najpierw działa (przepływ, stany, treść), potem wygląda; iteracja zamiast
perfekcji — każda wersja trafia przed użytkownika lub zespół. Spójność z systemem projektowym repo (fe-css:
tokeny, dokument główny) ma pierwszeństwo przed nowym pomysłem.

## Procedura
1. **Wejście**: szansa, problem i metryka sukcesu (proc-product-discovery); użytkownicy i kontekst (ddd-discovery-intake:
   badania). Brakuje — zapytaj zamiast zakładać.
2. **Analiza zadań**: cel użytkownika → kroki → decyzje → informacje potrzebne w każdym kroku → gdzie dziś się
   myli lub czeka. Rób to na prawdziwym przypadku z badań, nie na idealnym.
3. **Przepływ** (Mermaid `flowchart`): ścieżka główna, rozgałęzienia, powroty, wyjścia. Dla każdego ekranu lub kroku
   **tabela stanów**: pusty (pierwsze użycie i brak wyników), ładowanie, częściowe dane, sukces, błąd walidacji,
   błąd systemu, brak uprawnień, offline, bardzo długie i bardzo krótkie treści, wiele elementów (1, 2, 1000).
   Przypadki brzegowe z domeny (anulowanie w trakcie, równoczesna edycja, wygaśnięcie sesji) wpisz jawnie.
4. **Architektura informacji**: jak użytkownicy nazywają i grupują rzeczy (słownik domeny — ddd-facilitation),
   nawigacja i hierarchia; przy dużej strukturze sortowanie kart (jak grupują) i test drzewa (czy znajdują).
5. **Makieta niskiej wierności** (tekst, ASCII, prosty HTML bez stylu): układ, kolejność, treść prawdziwa, nie
   „lorem ipsum”. Dwie–trzy wersje różniące się podejściem, nie kolorem.
6. **Prototyp** o wierności dopasowanej do pytania: klikalny przepływ dla testu zadania, wysoka wierność dopiero
   dla pytań o wygląd i ruch. Prototyp w kodzie: strona HTML lub komponenty w repo za flagą.
7. **Ocena**: heurystyki i przegląd ekspercki, potem test z 5 użytkownikami na segment
   (`references/heurystyki-i-testy.md`). Wyniki → poprawki → kolejna iteracja.
8. **Specyfikacja dla programistów** (sekcja niżej) i przegląd z inżynierią **przed** końcem projektu — ograniczenia
   API, danych, wydajności i platformy wychodzą wtedy taniej.

## Interfejs wizualny i ruch
Hierarchia wizualna, typografia, kolor, siatka, stany komponentów, mikrointerakcje i zasady ruchu:
`references/ui-wizualny-i-ruch.md`. Progi dostępności i lista przed oddaniem: fe-css (`przeglad-ui.md`) i fe-web-platform.

## Treść, włączanie, etyka
Teksty interfejsu (komunikaty błędów, przyciski, puste stany, ton), projekt włączający i wzorce zwodnicze, których
nie stosujesz: `references/tresci-i-etyka.md`.

## Zmiana zachowań
Gdy funkcja ma sprawić, że ludzie zaczną, będą kontynuować albo przestaną coś robić: bramka etyczna, cel (aktor,
działanie, wynik), diagnoza modelem Fogga i lejkiem CREATE, strategie (zrób za użytkownika → nawyk → świadome
działanie), techniki z granicami nadużyć, pomiar — `references/projektowanie-zachowan.md`.

## Specyfikacja dla programistów (handoff)
Umowa, nie obrazek. Zawiera: cel i zakres (co poza zakresem), przepływ, **tabelę stanów** dla każdego ekranu
i komponentu, zachowanie (walidacja — kiedy i jak, przewijanie, fokus po akcji), treści ostateczne z kluczami i18n,
responsywność (zachowanie na 375 px, 768 px, szerokim ekranie), tokeny zamiast wartości, adnotacje dostępności
(kolejność fokusu, nazwy dostępne, regiony `aria-live`), zdarzenia analityczne (proc-product-discovery), otwarte
pytania. Duże specyfikacje dziel na części wdrażane osobno. Zmiany po przekazaniu — w jednym miejscu z datą.

## Przegląd projektu (critique)
Zaczyna się od celu i pytania autora („czy przepływ zwrotu jest jasny?”). Uwagi odnoszą się do celu, użytkowników
i heurystyk, nie do gustu: „klient nie zobaczy kosztu zwrotu przed potwierdzeniem — narusza widoczność stanu”,
a nie „nie podoba mi się”. Autor zbiera uwagi i decyduje; ustalenia z właścicielem.

## Checklista
- [ ] przepływ z rozgałęzieniami i tabela stanów dla każdego ekranu
- [ ] prawdziwe treści i nazwy ze słownika domeny
- [ ] ocena heurystyczna i test z użytkownikami (albo jawne „nie testowano” z ryzykiem)
- [ ] dostępność i responsywność opisane w specyfikacji
- [ ] żadnych wzorców zwodniczych; zgody dobrowolne i równorzędne

## Źródła
- NN/g: [Usability Testing 101](https://www.nngroup.com/articles/usability-testing-101/),
  [UX Expert Reviews](https://www.nngroup.com/articles/ux-expert-reviews/),
  [Task Analysis](https://www.nngroup.com/articles/task-analysis/),
  [Creating Design Specs for Development](https://www.nngroup.com/articles/creating-design-specs-for-development/),
  [Design Critiques](https://www.nngroup.com/articles/design-critiques/)
- [roadmap.sh — Product Design](https://roadmap.sh/product-design)
Opisane własnymi słowami.
