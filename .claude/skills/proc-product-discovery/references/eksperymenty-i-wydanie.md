# Eksperymenty A/B i gotowość do wydania

## Kiedy A/B, a kiedy nie
A/B odpowiada na pytanie „czy zmiana X poprawia metrykę Y” przy dużym ruchu. Nie nadaje się do pytania „dlaczego”
(wywiady, testy użyteczności), przy małym ruchu (wynik nie osiągnie mocy), dla zmian, których nie da się cofnąć,
ani dla funkcji wymaganych prawem.

## Projekt testu (przed startem, zapisany)
1. **Hipoteza**: „Jeśli [zmiana], to [metryka] wzrośnie o [minimalny istotny efekt], bo [dowód z odkrywania]”.
2. **Metryka główna** (jedna) i **ochronne** (błędy, czas ładowania, rezygnacje, przychód).
3. **Jednostka losowania** (użytkownik, nie sesja — inaczej ta sama osoba widzi oba warianty) i grupa docelowa.
4. **Wielkość próby i czas trwania** z kalkulatora mocy: poziom istotności (zwykle 5%), moc (zwykle 80%), minimalny
   wykrywalny efekt, wartość wyjściowa. Czas: pełne tygodnie (cykl tygodniowy), co najmniej 1–2.
5. **Reguła decyzji**: co zrobisz przy wygranej, przegranej i braku różnicy.
Realizacja przez flagi funkcji z przypisaniem wariantu po stronie serwera (eng-continuous-delivery, ops-release-engineering).

## Inne rodzaje testów
- **Test przyrostowy (A/B jednej zmiany)**: jedna różnica między wariantami, więc wynik da się jej przypisać. Domyślny
  wybór przy walidacji pojedynczej decyzji projektowej.
- **Test wielowariantowy**: kilka elementów naraz (nagłówek × obraz × przycisk) i ich interakcje. Liczba kombinacji
  rośnie mnożąco, więc potrzebny jest dużo większy ruch — przy małym ruchu rób kolejne testy A/B.
- **Test inkrementalności** (grupa kontrolna bez żadnej interwencji, np. bez kampanii lub powiadomień): mierzy, ile
  efektu w ogóle dała interwencja, a nie która wersja jest lepsza.

## Pułapki
- **Podglądanie wyników** i kończenie testu, gdy „wyszło istotne” — fałszywe wygrane. Albo stały czas, albo metoda
  sekwencyjna przewidziana od początku.
- **Niezgodność proporcji grup** (SRM, np. 50/50 zaplanowane, 52/48 wyszło przy dużej próbie) — błąd przypisania lub
  zbierania danych; wynik do kosza, najpierw naprawa.
- **Wiele metryk i segmentów** bez korekty — któryś „wygra” przypadkiem. Segmenty jako hipotezy na następny test.
- **Efekt nowości** — wzrost z ciekawości opada po tygodniach; patrz na trend dzienny.
- Etyka i prawo: bez testowania cen dyskryminujących, wzorców zwodniczych i zmian w zgodach; informacja w polityce
  prywatności, że prowadzisz eksperymenty.

## Gotowość do wydania (launch readiness)
- **Cele**: metryki sukcesu i ochronne, wartości wyjściowe, dashboard, data przeglądu po wydaniu (np. 2 i 6 tygodni).
- **Produkt**: stany brzegowe i błędów sprawdzone (fe-ux-design), dostępność (WCAG 2.2 AA), treści i tłumaczenia,
  zgody i polityka prywatności, jeśli zbierasz nowe dane.
- **Technika**: flagi i plan stopniowego włączania, wycofanie przećwiczone, monitoring i alerty, testy obciążenia,
  jeśli ruch wzrośnie (ops-release-engineering, ops-sre-incidents).
- **Organizacja**: wsparcie klienta przeszkolone i z odpowiedziami na typowe pytania, dokumentacja i notatki
  o wydaniu, sprzedaż i marketing wiedzą, co i kiedy; właściciel decyzji „wydajemy / wstrzymujemy”.
- **Ograniczenia**: prawo i regulacje (dział prawny), terminy partnerów, zależności od innych zespołów.

## Źródła
- R. Kohavi, D. Tang, Y. Xu, *Trustworthy Online Controlled Experiments* (2020)
- [Atlassian — product launch checklist](https://www.atlassian.com/agile/product-management/product-launch-checklist);
  [roadmap.sh — Product Design](https://roadmap.sh/product-design) (A/B testing, experimentation, launch readiness)
Opisane własnymi słowami.
