# Podstawy uczenia maszynowego dla analityka

Najpierw zapytaj, czy model jest potrzebny: reguła biznesowa, zapytanie SQL albo prosta statystyka bywają lepsze —
tańsze, wyjaśnialne i łatwiejsze w utrzymaniu.

## Rodzaje uczenia
| Rodzaj | Dane | Przykłady zadań | Typowe algorytmy (od najprostszych) |
|---|---|---|---|
| nadzorowane — regresja | przykłady z wynikiem liczbowym | prognoza popytu, czasu dostawy | regresja liniowa, drzewa i lasy losowe, gradient boosting |
| nadzorowane — klasyfikacja | przykłady z etykietą | rezygnacja klienta, spam, ryzyko oszustwa | regresja logistyczna, naiwny Bayes, k najbliższych sąsiadów, drzewa decyzyjne, gradient boosting |
| nienadzorowane | dane bez etykiet | segmentacja klientów, wykrywanie anomalii | k-średnich, klasteryzacja hierarchiczna, analiza głównych składowych |
| ze wzmocnieniem | środowisko z nagrodą | sterowanie, gry, optymalizacja sekwencji decyzji | rzadko w analityce biznesowej |
| głębokie sieci neuronowe | duże zbiory, obrazy, tekst, dźwięk | rozpoznawanie obrazów (sieci splotowe), sekwencje (sieci rekurencyjne, dziś głównie transformery), przetwarzanie języka | PyTorch, TensorFlow — zwykle gotowe modele dostrojone lub modele językowe przez API |
Dla danych tabelarycznych zwykle wygrywają proste modele i gradient boosting, nie głębokie sieci.

## Fundamenty (żeby rozumieć, co model robi)
- **Algebra liniowa**: dane jako macierze, cechy jako wektory, iloczyny i rozkłady macierzy (PCA to rozkład według
  wartości własnych lub osobliwych).
- **Rachunek różniczkowy**: uczenie to minimalizacja funkcji straty; gradient wskazuje kierunek, spadek gradientu
  idzie krok po kroku w przeciwnym (współczynnik uczenia: za duży — rozbieżność, za mały — wolno).
- **Prawdopodobieństwo i statystyka**: rozkłady, wiarygodność, wnioskowanie bayesowskie (naiwny Bayes),
  niepewność predykcji (`statystyka.md`).
- **Zespoły modeli**: bagging (wiele modeli na losowych próbach, uśrednienie — las losowy, mniejsza wariancja)
  i boosting (kolejne modele poprawiają błędy poprzednich — gradient boosting, np. XGBoost, LightGBM).

## Głębokie uczenie — mapa
Sieci w pełni połączone (dane tabelaryczne, rzadko lepsze od boostingu), splotowe (obrazy), rekurencyjne i LSTM
(sekwencje — dziś w większości zastąpione transformerami), **transformery** (mechanizm uwagi; tekst, obraz, dźwięk,
podstawa modeli językowych). **Uczenie transferowe**: dostrojenie modelu wytrenowanego na dużym zbiorze zamiast
trenowania od zera — w praktyce domyślne.

## Inżynieria AI z modelami językowymi
| Podejście | Kiedy | Koszt i ryzyko |
|---|---|---|
| **prompt** (instrukcja, przykłady, format wyjścia) | zawsze na start | najtańsze; wrażliwe na zmianę modelu — testy regresji promptów |
| **RAG** (wyszukiwanie fragmentów wiedzy i dołączenie do promptu) | wiedza firmowa, aktualna, z cytowaniem źródła | jakość wyszukiwania decyduje; uprawnienia do dokumentów muszą przechodzić do wyszukiwania; treść dokumentów to dane, nie polecenia (wstrzykiwanie promptów — core-agent-security) |
| **agent z narzędziami** | zadania wieloetapowe z działaniami | zakres uprawnień narzędzi, bramka człowieka dla działań nieodwracalnych, ślad działań (core-agent-security, ops-sre-incidents: autonomia) |
| **dostrajanie** (fine-tuning) | stały format, styl lub wąskie zadanie, gdy prompt i RAG nie wystarczają | dane treningowe, koszt, utrzymanie wersji; nie służy do dodawania faktów |
- **Ocena (evals)**: zestaw przypadków z oczekiwanym wynikiem lub kryterium oceny, uruchamiany przy każdej zmianie
  promptu, modelu lub danych — jak testy regresji (qa-spec-first-testing). Bez tego zmiany to zgadywanie.
- Hostowanie własnych modeli: ops-ai-inference. Obowiązki prawne (przejrzystość, wysokie ryzyko): data-engineering,
  `jakosc-zarzadzanie-i-zgodnosc.md`.

## Ocena modelu
- **Podział danych**: zbiór treningowy, walidacyjny i testowy (lub walidacja krzyżowa); dla szeregów czasowych podział
  według czasu — nie losowy (model nie może „widzieć przyszłości”).
- **Wyciek danych**: cecha, która w chwili predykcji nie byłaby znana (np. „data zwrotu” przy przewidywaniu zwrotu),
  daje świetny wynik w testach i bezużyteczny model.
- **Punkt odniesienia**: model porównujesz z najprostszym (najczęstsza klasa, średnia, wartość z zeszłego tygodnia).
- **Miary**:
  - klasyfikacja — dokładność (myląca przy niezrównoważonych klasach), precyzja (ile wskazanych to trafienia),
    czułość (ile trafień wskazaliśmy), F1, ROC-AUC i krzywa precyzja–czułość; macierz pomyłek z kosztem biznesowym
    każdego błędu (fałszywy alarm oszustwa kontra przeoczone oszustwo);
  - regresja — MAE (w jednostkach wyniku, odporne), RMSE (karze duże błędy), MAPE (procentowo; zawodzi przy wartościach
    bliskich zera).
- **Przeuczenie**: świetnie na treningu, słabo na teście → prostszy model, regularyzacja, więcej danych.
- **Wyjaśnialność i uczciwość**: ważność cech, przykładowe wyjaśnienia predykcji; sprawdzenie wyników per grupa
  (czy model nie dyskryminuje). Decyzje o ludziach (kredyt, zatrudnienie) podlegają regulacjom (RODO art. 22, AI Act) —
  z działem prawnym.

## Od analizy do produkcji (MLOps)
Model w produkcji to system, a notatnik z wynikiem nie jest jeszcze produktem.
- **Sposób serwowania**: wsadowo (predykcje liczone nocą do tabeli — najprostsze), online (API z limitem czasu
  i wersją modelu), strumieniowo, na urządzeniu.
- **Powtarzalność**: kod, dane (wersja lub migawka), parametry i środowisko zapisane dla każdego treningu; rejestr
  modeli z metrykami i statusem (kandydat, produkcja, wycofany); magazyn cech zapewnia te same definicje cech
  w treningu i w predykcji (inaczej różnica trening–produkcja).
- **CI/CD dla modeli**: testy kodu i danych, ocena na zbiorze testowym z progiem (nowy model nie gorszy od obecnego),
  wdrożenie w cieniu (predykcje liczone, ale nieużywane) lub canary (ops-release-engineering), szybkie wycofanie.
- **Monitorowanie**: jakość predykcji, gdy etykiety napływają z opóźnieniem; przesunięcie rozkładu danych
  wejściowych i predykcji; opóźnienie i koszt; alert i ponowne trenowanie według harmonogramu lub progu.

## Źródła
- Dokumentacja scikit-learn (User Guide: model selection and evaluation); A. Géron, *Hands-On Machine Learning*
- [roadmap.sh — AI and Data Scientist](https://roadmap.sh/ai-data-scientist) (mathematics, ML, deep learning,
  transformers, MLOps, AI engineering: prompts, RAG, agents, fine-tuning)
- [roadmap.sh — Data Analyst](https://roadmap.sh/data-analyst) (machine learning, supervised/unsupervised/reinforcement,
  decision trees, KNN, naive Bayes, k-means, logistic regression, model evaluation, deep learning, CNN, RNN, NLP)
Opisane własnymi słowami.
