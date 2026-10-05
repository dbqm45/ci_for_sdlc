# Wizualizacja danych

## Dobór wykresu do pytania
| Pytanie | Wykres | Unikaj |
|---|---|---|
| zmiana w czasie | liniowy (wiele serii — maks. kilka, reszta szara) | słupkowy dla długich szeregów |
| porównanie kategorii | słupkowy poziomy, posortowany | kołowy z wieloma kawałkami |
| część całości | słupek skumulowany 100% lub kołowy dla 2–3 części | kołowy dla porównania wielu całości |
| rozkład | histogram, wykres gęstości, pudełkowy, skrzypcowy (wiele grup) | sama średnia |
| zależność dwóch zmiennych | rozrzutu (z linią trendu, przezroczystością przy dużej liczbie punktów) | liniowy dla danych bez porządku |
| intensywność w dwóch wymiarach | mapa ciepła (dzień tygodnia × godzina) | tęczowa paleta |
| etapy procesu z odpływem | lejek (lub słupkowy z odsetkiem przejścia między etapami) | lejek bez liczb |
| jedna liczba z kontekstem | kafelek: wartość, zmiana, odniesienie (cel, okres poprzedni) | wskaźnik-zegar |

## Zasady
- **Tytuł mówi wniosek** („Konwersja spadła w segmencie mobilnym po 12 maja”), nie temat („Konwersja”).
- Oś Y wykresów słupkowych od zera; skrócona oś tylko dla liniowych i z wyraźnym oznaczeniem. Jednakowe skale przy
  wykresach do porównania.
- Mniej elementów: bez 3D, cieni, zbędnych siatek; podpisy bezpośrednio przy seriach zamiast legendy, gdy się da.
- Kolor ma znaczenie: jeden akcent na to, co ważne; palety dostępne dla daltonistów; kolor nigdy jedynym nośnikiem
  informacji (fe-ux-design: kolor). Kontrast i tekst alternatywny lub tabela z danymi dla wykresów w raportach.
- Liczby z jednostkami i okresem; źródło i data danych pod wykresem.
- Wykres kłamie przez dobór okresu, osi i agregacji — sprawdź, czy inny rozsądny wybór nie zmienia wniosku.

## Narzędzia
Python: matplotlib (pełna kontrola), seaborn (wykresy statystyczne), Plotly (interaktywne). R: ggplot2 (gramatyka
grafiki). BI: Power BI, Tableau, Looker, Metabase — dashboardy z definicjami miar w warstwie semantycznej i
odświeżaniem danych. W aplikacji webowej: biblioteka wykresów frontendu, dane agregowane po stronie serwera.

## Dashboard
Odpowiada na kilka stałych pytań jednego odbiorcy: najważniejsze miary na górze (z odniesieniem), szczegóły niżej,
filtry tylko potrzebne; każda miara z definicją dostępną po najechaniu lub w słowniku. Dashboard, którego nikt nie
otwiera przez miesiąc, usuń.

## Źródła
- E. Tufte, *The Visual Display of Quantitative Information*; C. Nussbaumer Knaflic, *Storytelling with Data*;
  F. Anscombe (1973)
- [roadmap.sh — Data Analyst](https://roadmap.sh/data-analyst) (charting, bar/line/pie/stacked/funnel charts,
  histograms, scatter plot, heatmap, matplotlib, seaborn, ggplot2, Power BI, Tableau)
Opisane własnymi słowami.
