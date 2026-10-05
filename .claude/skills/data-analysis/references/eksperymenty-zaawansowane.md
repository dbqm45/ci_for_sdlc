# Eksperymenty: moc, czułość i metryki ilorazowe

Podstawy testu A/B (hipoteza, jednostka losowania, pułapki, etyka): proc-product-discovery,
`eksperymenty-i-wydanie.md`. Tu — jak wykryć mniejszy efekt przy tym samym ruchu i jak nie pomylić się w statystyce.

## Prawdopodobieństwo i próbkowanie — minimum
- **Centralne twierdzenie graniczne**: średnia z dużej próby ma rozkład zbliżony do normalnego, nawet gdy dane nie
  są normalne — dlatego test t działa dla średnich. Przy bardzo skośnych danych (przychód, w którym kilku klientów
  robi większość) „duża próba” musi być naprawdę duża; inaczej przedziały są zbyt optymistyczne.
- Losowanie na poziomie jednostki, którą analizujesz (użytkownik), i niezależność jednostek. Efekty sieciowe
  (rynki dwustronne, funkcje społecznościowe) łamią niezależność → losowanie klastrami lub regionami.

## Minimalny wykrywalny efekt (MDE) i moc
- MDE to najmniejszy efekt, który test wykryje z zadaną mocą (np. 80%) przy danym poziomie istotności, wariancji
  i liczebności. MDE rośnie z wariancją metryki i maleje z pierwiastkiem z liczby jednostek: czterokrotnie więcej
  ruchu = dwukrotnie mniejszy MDE.
- Policz MDE **przed** testem. Jeśli realny efekt zmiany jest mniejszy niż MDE, test nic nie rozstrzygnie —
  zmień metrykę, wydłuż test albo zastosuj redukcję wariancji.

## Redukcja wariancji
- **CUPED**: skorygowana metryka `Y' = Y − θ·(X − średnia X)`, gdzie X to ta sama (lub skorelowana) metryka
  użytkownika z okresu **przed** eksperymentem, a θ = cov(X, Y) / var(X). Wariancja maleje o czynnik (1 − R²)
  — przy R² = 0,4 to tak, jakby ruch wzrósł ok. 1,66 raza. Nie wprowadza obciążenia, bo X nie zależy od przydziału
  do grupy.
  - Zmienna X musi pochodzić sprzed ekspozycji (nie może jej zmienić testowana funkcja).
  - Nowi użytkownicy bez historii: X = średnia (lub osobny wskaźnik), korekta działa wtedy słabiej.
  - Zysk zależy od metryki — dla części metryk prawie żaden; sprawdzaj na danych historycznych.
- **CUPAC**: zamiast jednej metryki z przeszłości — predykcja modelu z wielu cech sprzed eksperymentu jako zmienna X.
- **Stratyfikacja**: losowanie lub analiza w warstwach (kraj, platforma, segment), żeby różnice między warstwami nie
  zwiększały wariancji.
- **Ciężkie ogony**: obcięcie lub winsoryzacja skrajnych wartości (próg ustalony przed testem) albo transformacja
  rangowa — inaczej kilku nietypowych użytkowników decyduje o wyniku.

## Metryki ilorazowe
- Gdy jednostka analizy jest inna niż jednostka losowania — CTR na sesję, przychód na zamówienie, czas na stronę —
  obserwacje w obrębie jednego użytkownika nie są niezależne. Zwykły test t na poziomie sesji zaniża wariancję
  i daje fałszywe „istotne” wyniki.
- Licz iloraz jako stosunek sum per grupa (suma kliknięć / suma sesji) i wariancję **metodą delta** (przybliżenie
  wariancji ilorazu dwóch średnich z kowariancją licznika i mianownika) albo **bootstrapem po użytkownikach**.
- Sprawdzaj też licznik i mianownik osobno — iloraz może wzrosnąć, bo spadł mianownik (mniej sesji), co bywa złą
  wiadomością.

## Źródła
- A. Deng i in., „Improving the Sensitivity of Online Controlled Experiments by Utilizing Pre-Experiment Data” (2013)
  — CUPED; [Microsoft Research — Deep Dive Into Variance Reduction](https://www.microsoft.com/en-us/research/articles/deep-dive-into-variance-reduction/)
- [Booking.com — How Booking.com increases the power of online experiments with CUPED](https://booking.ai/how-booking-com-increases-the-power-of-online-experiments-with-cuped-995d186fff1d);
  DoorDash — CUPAC; Netflix — stratyfikacja; A. Deng i in. — metoda delta dla metryk ilorazowych (2018)
- R. Kohavi, D. Tang, Y. Xu, *Trustworthy Online Controlled Experiments*; [roadmap.sh — AI and Data Scientist](https://roadmap.sh/ai-data-scientist)
Opisane własnymi słowami.
