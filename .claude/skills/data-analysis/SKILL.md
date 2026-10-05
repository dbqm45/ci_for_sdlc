---
name: data-analysis
description: Użyj, gdy na pytanie trzeba odpowiedzieć danymi — czyszczenie, statystyka i testy hipotez, wizualizacja, raport (pandas, SQL).
metadata:
  katalog: "Użyj, gdy trzeba odpowiedzieć na pytanie danymi — od pytania i decyzji przez pozyskanie danych, czyszczenie, analizę opisową i diagnostyczną, statystykę i testy hipotez, wizualizację po raport z wnioskami i ograniczeniami; pandas, SQL, R, arkusze, podstawy uczenia maszynowego. Nie do potoków danych (data-engineering) ani eksperymentów A/B produktu (proc-product-discovery)."
  slowa: "porównanie grup, średnia czy mediana, rozkład skośny, test statystyczny, istotność, wielkość efektu, spadek konwersji, dane z eksperymentu"
---

# Analiza danych

Analiza kończy się **decyzją albo jej brakiem z uzasadnieniem**, nie wykresem. Każda liczba w raporcie ma źródło
i sposób policzenia, który ktoś inny może powtórzyć.

## Rodzaje analizy
| Rodzaj | Pytanie | Przykład |
|---|---|---|
| opisowa | co się stało? | sprzedaż per region w kwartale |
| diagnostyczna | dlaczego? | spadek konwersji po zmianie cennika — w których segmentach |
| predykcyjna | co się stanie? | prognoza popytu, ryzyko rezygnacji klienta |
| preskryptywna | co zrobić? | optymalny poziom zapasów, przydział zasobów (ddd-algorithm-recognition) |
Każdy kolejny rodzaj wymaga poprzednich i jest droższy. Zaczynaj od najprostszego, który odpowiada na pytanie.

## Procedura
1. **Pytanie i decyzja**: kto i co zdecyduje na podstawie wyniku, jaki wynik zmieniłby decyzję, termin.
   Doprecyzuj miary („aktywny klient” = co dokładnie?) — definicje ze słownika domeny (ddd-facilitation) i zapisane.
2. **Dane**: skąd (baza przez SQL — repliki lub hurtownia, nie produkcja OLTP; API; pliki CSV i arkusze; scraping
   tylko zgodnie z regulaminem strony, `robots.txt`, z limitem tempa i bez danych osobowych), za jaki okres, z jakim
   opóźnieniem i jakością. Dane osobowe: minimalizacja, pseudonimizacja, dostęp za zgodą (RODO). Rodzaje zmiennych:
   nominalne, porządkowe, przedziałowe, ilorazowe — decydują o dozwolonych operacjach (średnia ocen 1–5 bywa
   myląca; mediana i rozkład lepsze).
3. **Czyszczenie** (zapisane w skrypcie, nie ręcznie w arkuszu): typy i formaty (daty w UTC, liczby, kodowanie
   znaków), duplikaty (po kluczu biznesowym), wartości brakujące (dlaczego brakuje? usunięcie, uzupełnienie medianą
   lub modelem, osobna kategoria „brak” — decyzja zapisana, bo zmienia wynik), błędne i odstające wartości (błąd
   wprowadzenia czy prawdziwa skrajność? IQR, z-score, wykres pudełkowy), ujednolicenie tekstu (wielkość liter,
   spacje, warianty nazw). Licz wiersze przed i po każdym kroku.
4. **Eksploracja (EDA)**: rozkłady (histogram, gęstość), miary położenia i rozproszenia, braki, zależności między
   zmiennymi, podział na segmenty i czas. Szukasz niespodzianek i błędów w danych, zanim zaczniesz wnioskować.
5. **Analiza**: agregacje i porównania segmentów, korelacje, regresja, testy statystyczne
   (`references/statystyka.md`), modele predykcyjne tylko gdy potrzebne (`references/uczenie-maszynowe.md`:
   także MLOps i inżynieria AI), prognozy i przyczynowość z danych obserwacyjnych
   (`references/szeregi-czasowe-i-ekonometria.md`), czułość eksperymentów i metryki ilorazowe
   (`references/eksperymenty-zaawansowane.md`).
   Kontroluj zmienne zakłócające i sprawdź paradoks Simpsona (trend w całości odwrotny niż w segmentach).
6. **Wizualizacja** dopasowana do pytania (`references/wizualizacja.md`).
7. **Raport**: najpierw odpowiedź na pytanie i rekomendacja, potem dowody, potem metoda; **ograniczenia** (jakość
   danych, okres, czego nie da się stwierdzić — korelacja to nie przyczynowość), niepewność (przedziały, nie tylko
   punkt), jak powtórzyć analizę (skrypt lub notatnik w repo, wersja danych).

## Narzędzia
- **SQL** do pobierania i agregacji przy źródle (funkcje okna, CTE — be-database); **pandas** (lub polars) w Pythonie,
  **R** z dplyr i ggplot2; notatniki (Jupyter) do eksploracji, skrypty i testy do analiz powtarzalnych.
- **Arkusze** (Excel, Google Sheets) dla małych danych i odbiorców biznesowych: tabele przestawne, `XLOOKUP` (zamiast
  starszych `VLOOKUP`/`HLOOKUP`, gdy wersja na to pozwala), `IF`, funkcje tekstu i dat. Formuły zamiast wklejonych
  wartości, żeby dało się sprawdzić obliczenia.
- **BI** (Power BI, Tableau, Looker, Metabase) dla dashboardów wielokrotnego użytku — definicje miar w jednym miejscu
  (warstwa semantyczna), nie w każdym raporcie osobno.
- Duże dane i przetwarzanie rozproszone: najpierw sprawdź, czy naprawdę potrzebne (arch-quality-attributes,
  `architektura-danych.md`).

## Zasady
- Liczby sprawdzasz krzyżowo z drugim źródłem lub sumą kontrolną (np. suma przychodu zgodna z księgowością).
- Nie dopasowujesz analizy do oczekiwanego wyniku; hipotezy zapisujesz przed sprawdzeniem.
- Wynik, który przeczy oczekiwaniom, to najpierw podejrzenie błędu w danych, potem odkrycie.

## Checklista
- [ ] pytanie, decyzja i definicje miar zapisane
- [ ] źródła, okres i jakość danych opisane; dane osobowe zminimalizowane
- [ ] czyszczenie w skrypcie z liczbą wierszy po każdym kroku
- [ ] EDA przed wnioskami; segmenty i czas sprawdzone
- [ ] raport: odpowiedź, dowody, metoda, ograniczenia, niepewność, sposób powtórzenia

## Źródła
- D. Diez i in., *OpenIntro Statistics*; H. Wickham i in., *R for Data Science*; W. McKinney, *Python for Data Analysis*
- [roadmap.sh — Data Analyst](https://roadmap.sh/data-analyst)
Opisane własnymi słowami.
