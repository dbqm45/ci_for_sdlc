# Diagramy, strony wyjaśniające i prezentacje

## 1. Kiedy obraz, a kiedy tekst
- Tabela z 4+ wierszami lub 3+ kolumnami albo porównanie kilku opcji → tabela (w Markdown) lub strona HTML, a w czacie
  krótkie podsumowanie, nie ASCII-art.
- Przepływ, sekwencja, stany, model danych, kontekst systemu → diagram. Długi opis w prozie → karty/sekcje.
- Przy 15+ elementach: mały diagram przeglądowy + szczegóły w kartach lub osobnych diagramach.

| Co pokazujesz | Forma |
|---|---|
| przepływ, decyzje | Mermaid `flowchart` (domyślnie `TD`; `LR` tylko dla 3–4 węzłów) |
| wymiana komunikatów w czasie | `sequenceDiagram` |
| stany obiektu (np. agregatu) | `stateDiagram-v2` |
| model danych | `erDiagram` / `classDiagram` |
| system i jego otoczenie, kontenery | C4 (PlantUML C4; w Mermaid C4 jest eksperymentalne) |
| oś czasu, roadmapa | tabela lub `timeline` |

## 2. Treść diagramu
- Rysuj **mechanizm**, a nie pudełka z nazwami: co płynie, kto wywołuje, co jest zapisywane.
- **Każda strzałka ma etykietę** (≤ 3 słowa). Jeden diagram = jedno twierdzenie, a podpis je wypowiada.
- Porównując opcje, rysuj różnicę między nimi, nie dwa pełne systemy.
- Nie wymyślaj odpowiedzialności, protokołów ani liczb — jeśli faktu brakuje, zapytaj albo oznacz „do ustalenia”.

## 3. Konwencje notacji
| Element | Znaczenie |
|---|---|
| linia ciągła, gruba | główny przepływ |
| linia ciągła | sterowanie / wywołanie |
| przerywana | zapis danych, komunikacja asynchroniczna (zdarzenia, kolejka) — w legendzie, który wariant |
| walec | trwały magazyn danych |
| sześciokąt | API / brama |
| romb | decyzja |
| obramowanie przerywane | system zewnętrzny lub tymczasowy |
UML: pusty trójkąt = dziedziczenie (przerywany — implementacja interfejsu), pełny romb = kompozycja, pusty romb =
agregacja; liczności na końcach; na przejściach stanów `zdarzenie [warunek] / akcja`.
Dwa lub więcej rodzajów strzałek → legenda.

## 4. Czytelny układ
- 0 skrzyżowań linii jako cel; najwyżej 2 załamania na krawędź — więcej oznacza, że trzeba przesunąć węzły.
- Elementy jednej warstwy w jednym rzędzie; między warstwami wolny korytarz na połączenia.
- Za ciasno → poszerz lub podziel diagram, **nie zmniejszaj tekstu**.
- **Obejrzyj wynik**, zanim uznasz pracę za skończoną (podgląd Mermaid, PNG): ucięte etykiety, nakładanie, kontrast.
  Jeśli nie możesz go zobaczyć, napisz to.

## 5. Mermaid — pułapki
- Złamanie wiersza w etykiecie: `<br/>`, nie `\n`.
- Nie nadpisuj w CSS strony klasy `.node` — Mermaid jej używa.
- Złożone diagramy: układ ELK, jeśli renderer go obsługuje (Mermaid 11+: `layout: elk` z pakietem `@mermaid-js/layout-elk`); motyw `base` z własnymi zmiennymi zamiast domyślnego, jeśli repo ma tokeny kolorów.

## 6. Strona HTML z wyjaśnieniem (przegląd planu, diffu, architektury)
- Kolejność stylu: to, czego chce człowiek → tokeny projektu (kolory, typografia z repo) → domyślne skilla.
- Diagram w `<figure>` z `<figcaption>`; `role="img"` i `aria-label` na opakowaniu, nie na SVG (re-render go podmienia).
- Tokeny CSS (`--bg`, `--surface`, `--text`, `--text-dim`, 3–5 akcentów); tryb ciemny = inne wartości tokenów,
  nie odwrócenie kolorów. Kolory stanów oddzielone od akcentu i wsparte kształtem (etykieta, pasek), nie tylko kolorem.
- Tekst: baza 16–18 px, linie ok. 65 znaków, liczby w tabelach `tabular-nums`; elementy siatki z `min-width: 0`,
  szerokie tabele i kod w kontenerach z przewijaniem — bez poziomego przewijania strony.
- Biblioteki z CDN przypinaj do wersji (lub kopiuj lokalnie) — to też łańcuch dostaw.

## 7. Prezentacje (demo sprintu, przegląd architektury)
- Najpierw tryb: prezentacja **z mówcą** (1–3 punkty na slajd) czy **do czytania** (4–8 punktów).
- Za dużo treści → nowy slajd, nie mniejsza czcionka. Treść źródłowa trafia na slajdy w całości — dokładaj slajdy
  zamiast pomijać.
- Stała scena (np. 1920×1080 skalowana całościowo) zamiast przelewania układu na każdym slajdzie; sprawdź na 1280×720.
- Na slajdach nie zostają robocze etykiety („Opcja A”, ścieżki plików, nazwy szablonów).
- Gdy styl jest otwarty, pokaż 2–3 podglądy do wyboru zamiast pytać o przymiotniki.
- Publikacja w internecie (hosting, link publiczny) tylko za zgodą człowieka.

## Źródła inspiracji
[visual-explainer](https://github.com/nicobailon/visual-explainer) (wybór formy, zasady Mermaid, dostępność figur,
tokeny i tryb ciemny), [fireworks-tech-graph](https://github.com/yizhiyanhua-ai/fireworks-tech-graph) (budżet układu,
znaczenie strzałek i kształtów, notacja UML, obejrzenie wyniku przed oddaniem) i
[frontend-slides](https://github.com/zarazhangrui/frontend-slides) (tryby gęstości, stała scena, podział zamiast
zmniejszania, podglądy do wyboru) — opisane własnymi słowami, bez ich skryptów.
