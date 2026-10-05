# Wzorce rozwiązywania problemów i techniki projektowania algorytmów

## Wzorce (rozpoznaj kształt problemu)
| Wzorzec | Sygnał w zadaniu | Idea | Koszt |
|---|---|---|---|
| **dwa wskaźniki** | posortowana tablica, para lub trójka o zadanej sumie, usuwanie duplikatów w miejscu | wskaźniki od końców lub szybki i wolny w tym samym kierunku | O(n) zamiast O(n²) |
| **przesuwne okno** | „najdłuższy / najkrótszy podciąg spełniający warunek”, suma w oknie | rozszerzaj prawy koniec, zwężaj lewy, gdy warunek złamany; stan okna w mapie lub liczniku | O(n) |
| **szybki i wolny wskaźnik** | cykl w liście lub sekwencji, środek listy | jeden wskaźnik o krok, drugi o dwa (algorytm Floyda) | O(n), O(1) pamięci |
| **scalanie przedziałów** | nakładające się terminy, rezerwacje, zakresy | sortuj po początku, scalaj z poprzednim, gdy się nakładają | O(n log n) — w bazie: typy zakresów i ograniczenia wykluczające (be-database) |
| **sortowanie cykliczne** | liczby z zakresu 1..n, brakujące lub zdublowane | odkładaj każdą liczbę na jej indeks | O(n), O(1) pamięci |
| **top-k / k-ty element** | k największych, najczęstszych, najbliższych | kopiec rozmiaru k albo wybór (quickselect) | O(n log k) / średnio O(n) |
| **dwa kopce** | mediana strumienia, środek zbioru zmieniającego się | kopiec maksimum dla dolnej połowy, minimum dla górnej | O(log n) na element |
| **przeszukiwanie siatki** („wyspy”) | spójne obszary na mapie, planie, w macierzy | BFS lub DFS z oznaczaniem odwiedzonych | O(wiersze × kolumny) |
| **wyszukiwanie binarne po odpowiedzi** | „najmniejsza wartość, przy której warunek zachodzi”, warunek monotoniczny | binarnie po zakresie odpowiedzi, sprawdzając warunek | O(log zakresu × koszt sprawdzenia) |
| **sumy prefiksowe** | wiele zapytań o sumę w przedziale | `pref[i] = suma do i`; suma przedziału = różnica | budowa O(n), zapytanie O(1) |
| **stos monotoniczny** | „najbliższy większy element”, histogramy | stos utrzymujący porządek | O(n) |

## Techniki
- **Siłowo** (brute force): sprawdź wszystkie możliwości — punkt odniesienia do testów i dla małego n zwykle wystarcza.
- **Rekurencja**: przypadek bazowy + redukcja problemu; uwaga na głębokość stosu.
- **Nawroty** (backtracking): buduj rozwiązanie krok po kroku, cofaj się, gdy częściowe rozwiązanie łamie ograniczenie
  (permutacje, podzbiory, łamigłówki, przydział z ograniczeniami). Wykładnicze — odcinaj gałęzie jak najwcześniej;
  dla dużych problemów biznesowych solver (ddd-algorithm-recognition, `optimization.md`).
- **Dziel i zwyciężaj**: podziel, rozwiąż części, połącz (sortowanie przez scalanie, szybkie sortowanie, wyszukiwanie
  binarne).
- **Programowanie dynamiczne**: problem ma nakładające się podproblemy i optymalną podstrukturę (najkrótsza edycja
  tekstów, plecak, liczba ścieżek, najdłuższy wspólny podciąg). Zdefiniuj stan i przejście; licz od góry z pamięcią
  wyników (memoizacja) albo od dołu tablicą; często da się zmniejszyć pamięć do jednego wiersza.
- **Zachłanne**: wybieraj lokalnie najlepszą opcję — działa tylko, gdy da się to udowodnić (wydawanie reszty dla
  typowych nominałów, harmonogram największej liczby rozłącznych przedziałów, minimalne drzewo rozpinające); w innych
  przypadkach daje szybkie przybliżenie bez gwarancji.
- **Losowe**: losowy wybór elementu dzielącego w quicksorcie, próbkowanie, struktury probabilistyczne (filtr Blooma —
  „na pewno nie ma” lub „chyba jest”, HyperLogLog — przybliżona liczba unikalnych). Wynik poprawny z wysokim
  prawdopodobieństwem albo przybliżony — opisz to w kodzie.

## Struktury złożone z prostych — przykład: cache LRU
Częste zadanie: cache o ograniczonej pojemności, który przy przepełnieniu usuwa element najdawniej używany.
- **Mapa** klucz → węzeł oraz **lista dwukierunkowa** w kolejności użycia (początek to najświeższy, koniec to
  najstarszy). Odczyt: znajdź węzeł w mapie i przenieś go na początek. Zapis: dodaj na początek, a przy
  przepełnieniu usuń koniec listy i jego klucz z mapy. Wszystko w O(1).
- W TS / JS `Map` zachowuje kolejność wstawiania: „przenieś na początek” to `delete` + `set`, a najstarszy to
  `map.keys().next()`. W Javie `LinkedHashMap` z kolejnością dostępu (`accessOrder = true`) i nadpisanym
  `removeEldestEntry`.
- W produkcji użyj biblioteki (np. `lru-cache` w Node, Caffeine w Javie). Dają limity rozmiaru i czasu życia oraz
  statystyki. LRU nie jest jedyną polityką: LFU (najrzadziej używany) lub TinyLFU (Caffeine) lepiej znoszą
  jednorazowe skany.
- Ten sam schemat „mapa do szybkiego dostępu + druga struktura do porządku” stosuje się w kolejce priorytetowej
  z aktualizacją priorytetu (mapa + kopiec) i w rankingach (mapa + drzewo).

## Jak podejść do nowego problemu
1. Przykłady wejścia i wyjścia, także brzegowe; jaki jest maksymalny rozmiar danych (decyduje o dopuszczalnej
   złożoności).
2. Rozwiązanie siłowe i jego koszt.
3. Czy pasuje któryś wzorzec lub technika? Jaka struktura danych usuwa najdroższą operację?
4. Pseudokod, niezmiennik, sprawdzenie na przykładach; dopiero potem kod.
5. Testy: przykłady, brzegi, porównanie z wersją siłową na losowych danych.
Do ćwiczeń: LeetCode, Codewars, Exercism, Edabit — uczą rozpoznawania wzorców; w pracy ważniejsza jest umiejętność
oszacowania kosztu i wyboru gotowego narzędzia.

## Źródła
- S. Skiena, *The Algorithm Design Manual*; materiały „Grokking the Coding Interview” (wzorce)
- [system-design-primer](https://github.com/donnemartin/system-design-primer) — `solutions/object_oriented_design/lru_cache`
  (CC BY 4.0); dokumentacja `LinkedHashMap`, Caffeine
- [roadmap.sh — Data Structures and Algorithms](https://roadmap.sh/datastructures-and-algorithms) (two pointer,
  sliding window, fast and slow pointers, merge intervals, cyclic sort, kth element, two heaps, island traversal,
  brute force, recursion, backtracking, divide and conquer, dynamic programming, greedy, randomised algorithms)
Opisane własnymi słowami.
