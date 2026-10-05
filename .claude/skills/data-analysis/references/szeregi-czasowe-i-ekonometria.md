# Szeregi czasowe, prognozowanie i ekonometria

## Szeregi czasowe
- **Najpierw wykres**: trend, sezonowość (dzienna, tygodniowa, roczna), święta i zdarzenia jednorazowe, zmiany
  poziomu (nowy cennik, awaria zbierania danych). Dekompozycja na trend, sezonowość i resztę.
- **Stacjonarność** (stała średnia i wariancja w czasie) — wymagana przez klasyczne modele: test ADF lub KPSS,
  różnicowanie, logarytm przy wariancji rosnącej z poziomem. Funkcje autokorelacji (ACF, PACF) pokazują zależność
  od wartości z przeszłości.
- **Modele od najprostszych** (każdy kolejny musi pobić poprzedni):
  1. naiwny (jutro = dziś) i sezonowy naiwny (ten sam dzień tydzień temu) — **obowiązkowy punkt odniesienia**;
  2. wygładzanie wykładnicze (ETS, Holt-Winters) — trend i sezonowość;
  3. ARIMA / SARIMA — autoregresja, różnicowanie, średnia ruchoma, z sezonowością;
  4. regresja z cechami opóźnień, kalendarza i zmiennych zewnętrznych (np. gradient boosting) — gdy wiele szeregów
     i dużo czynników.
- **Walidacja w czasie**: backtesting z przesuwanym punktem startu (trenuj do dnia t, prognozuj t+1…t+h, przesuń),
  nigdy losowy podział. Miary: MAE, MASE (porównanie z modelem naiwnym — odporna na skalę), sMAPE; MAPE zawodzi przy
  wartościach bliskich zera.
- Prognoza zawsze z **przedziałem** (np. 80% i 95%) — decyzje o zapasach i pojemności zależą od niepewności,
  nie od punktu.

## Ekonometria — zależności przyczynowe z danych obserwacyjnych
- **Regresja metodą najmniejszych kwadratów**: współczynnik to zmiana wyniku przy zmianie zmiennej o jednostkę,
  **przy pozostałych stałych**. Sprawdź założenia; przy niejednorodnej wariancji reszt — odporne błędy standardowe;
  przy danych grupowanych (klienci, sklepy) — błędy klastrowane.
- **Endogeniczność** (zmienna objaśniająca zależy od wyniku lub od pominiętego czynnika) daje obciążone wyniki.
  Narzędzia:
  - **różnica w różnicach** — porównanie zmiany w grupie objętej interwencją ze zmianą w grupie kontrolnej, przy
    założeniu równoległych trendów przed interwencją (sprawdź na wykresie);
  - **efekty stałe** — eliminacja stałych cech jednostek w danych panelowych;
  - **zmienne instrumentalne** — czynnik wpływający na wynik tylko przez badaną zmienną (trudne do uzasadnienia);
  - **nieciągłość regresji** — porównanie tuż nad i tuż pod progiem (np. próg darmowej dostawy).
  Gdy eksperyment jest możliwy, jest lepszy niż każda z tych metod (`eksperymenty-zaawansowane.md`).
- **Dopasowanie rozkładu** (czasy obsługi, wielkości zamówień — do symulacji i planowania pojemności): estymacja
  największej wiarygodności, ocena wykresem kwantyl–kwantyl i testem zgodności; rozkłady z długim ogonem
  (log-normalny, Pareto) zamiast normalnego dla kwot i czasów.

## Źródła
- R. Hyndman, G. Athanasopoulos, *Forecasting: Principles and Practice* (wydanie online); J. Angrist, J.-S. Pischke,
  *Mostly Harmless Econometrics*
- [roadmap.sh — AI and Data Scientist](https://roadmap.sh/ai-data-scientist) (econometrics, regression, time series,
  ARIMA, fitting distributions)
Opisane własnymi słowami.
