# Statystyka dla analityka

## Statystyki opisowe
- **Położenie**: średnia (wrażliwa na wartości skrajne), mediana (odporna — dla wynagrodzeń, czasów, kwot zamówień
  zwykle lepsza), dominanta (dla danych kategorycznych).
- **Rozproszenie**: rozstęp (min–max, wrażliwy na skrajności), rozstęp międzykwartylowy (IQR = Q3 − Q1), wariancja
  i odchylenie standardowe; percentyle (p50, p90, p95, p99) — dla czasów odpowiedzi i kwot ważniejsze niż średnia.
- **Kształt rozkładu**: skośność (prawostronna — długi ogon dużych wartości, typowa dla kwot i czasów), kurtoza
  (grubość ogonów), wielomodalność (kilka garbów = zwykle kilka populacji — rozdziel segmenty). Zawsze patrz na
  histogram, nie tylko na liczby.
- **Wartości odstające**: poza [Q1 − 1,5·IQR, Q3 + 1,5·IQR] albo |z| > 3 (dla rozkładów zbliżonych do normalnego).
  Usuwasz tylko błędy; prawdziwe skrajności analizujesz osobno i raportujesz.

## Wnioskowanie
- **Próba i populacja**: wynik z próby ma niepewność — podawaj **przedział ufności** (np. 95%), nie samą liczbę.
- **Test hipotezy**: hipoteza zerowa (brak efektu), poziom istotności ustalony przed testem (zwykle α = 0,05),
  statystyka testowa, wartość p = prawdopodobieństwo uzyskania takiego lub bardziej skrajnego wyniku, **gdyby
  hipoteza zerowa była prawdziwa** (nie prawdopodobieństwo, że hipoteza jest prawdziwa).
- Dobór testu:
  | Sytuacja | Test |
  |---|---|
  | średnie dwóch grup, rozkład zbliżony do normalnego | t-Studenta (wariant Welcha przy różnych wariancjach) |
  | dwie grupy, rozkład skośny lub mała próba | Manna-Whitneya |
  | więcej grup | ANOVA (lub Kruskala-Wallisa) i porównania post hoc |
  | proporcje, tabele liczności | chi-kwadrat lub test dla proporcji |
  | ta sama grupa przed i po | test dla prób zależnych (t sparowany, Wilcoxona) |
- **Istotność to nie wielkość**: przy dużej próbie mały, bez znaczenia biznesowego efekt bywa „istotny”. Raportuj
  wielkość efektu (różnica z przedziałem, d Cohena) i znaczenie praktyczne.
- **Wiele porównań**: przy wielu testach część wyjdzie „istotna” przypadkiem — korekta (Bonferroni, Holm,
  Benjamini-Hochberg) albo hipotezy ustalone z góry. Przeszukiwanie danych aż coś wyjdzie (p-hacking) daje fałszywe
  odkrycia.
- Eksperymenty kontrolowane (A/B) — proc-product-discovery, `eksperymenty-i-wydanie.md`.

## Zależności
- **Korelacja Pearsona** (liniowa, wrażliwa na skrajności), **Spearmana** (monotoniczna, na rangach). Wartość od −1
  do 1; zawsze z wykresem rozrzutu — ten sam współczynnik mogą mieć zupełnie różne układy punktów (kwartet Anscombe'a).
- **Korelacja to nie przyczynowość**: zmienna zakłócająca, odwrotny kierunek, przypadek, selekcja próby. Przyczynę
  ustala eksperyment albo staranna metoda przyczynowa (np. różnica w różnicach), nie sama korelacja.
- **Regresja liniowa**: wpływ zmiennych na wynik przy kontroli pozostałych; sprawdź założenia (liniowość, reszty bez
  wzorca, brak silnej współliniowości) i nie ekstrapoluj poza zakres danych.

## Źródła
- D. Diez, M. Çetinkaya-Rundel, C. Barr, *OpenIntro Statistics*; ASA Statement on p-Values (2016)
- [roadmap.sh — Data Analyst](https://roadmap.sh/data-analyst) (central tendency, dispersion, distribution shape,
  outliers, hypothesis testing, correlation, regression)
Opisane własnymi słowami.
