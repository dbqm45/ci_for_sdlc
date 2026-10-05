# Drzewa, grafy i struktury zaawansowane

## Drzewa
- **Drzewo binarne** i przechodzenie: preorder (korzeń, lewe, prawe — kopiowanie, serializacja), inorder (lewe,
  korzeń, prawe — w BST daje porządek rosnący), postorder (dzieci przed rodzicem — usuwanie, obliczenia od liści),
  poziomami (BFS z kolejką).
- **Drzewo poszukiwań binarnych** (BST): lewe < węzeł < prawe; O(log n) tylko gdy zrównoważone — bez tego
  degeneruje do listy (O(n)) przy danych posortowanych.
- **Drzewa zrównoważone**: AVL (ściśle zrównoważone, szybsze odczyty), czerwono-czarne (mniej przebudów przy zapisie
  — `TreeMap` w Javie), drzewa 2-3 (idea stojąca za czerwono-czarnymi).
- **B-drzewa i B+-drzewa**: szerokie węzły dopasowane do stron dysku → mało odczytów; podstawa indeksów baz danych
  i systemów plików (w B+ dane w liściach połączonych listą — szybkie zakresy). ISAM — starsza, statyczna metoda
  indeksowania.
- **Kopiec**: drzewo zupełne w tablicy, rodzic ≤ dzieci; kolejka priorytetowa, sortowanie przez kopcowanie,
  harmonogramy.
- **Trie**: drzewo prefiksów — podpowiedzi, słowniki, routing po ścieżkach.
- **Drzewo przedziałowe** (segment tree) i **drzewo Fenwicka**: sumy, minima lub maksima w przedziale z aktualizacjami
  w O(log n) — gdy sumy prefiksowe nie wystarczą, bo dane się zmieniają.
- **Drzewa i tablice sufiksów**: wyszukiwanie podciągów, najdłuższe powtórzenia w tekście (zwykle zastępowane
  indeksem pełnotekstowym lub biblioteką).
- **Lista z przeskokami** (skip list): probabilistyczna alternatywa dla drzew zrównoważonych (np. zbiory posortowane
  w Redis).

## Grafy
- **Reprezentacja**: lista sąsiedztwa (rzadkie grafy — typowe), macierz sąsiedztwa (gęste, szybkie „czy jest
  krawędź”). Skierowane lub nie, ważone lub nie.
- **BFS** (kolejka): najkrótsza ścieżka w grafie bez wag, poziomy, odległość w liczbie kroków. **Dwukierunkowy
  BFS** (jednocześnie od źródła i od celu, aż poszukiwania się spotkają) odwiedza znacznie mniej węzłów, gdy graf
  szybko się rozgałęzia, np. w sieciach znajomych. Na grafie podzielonym między maszyny grupuj zapytania
  o sąsiadów z tej samej maszyny i ustaw limit kroków lub czasu (arch-system-design, `przyklady-projektow.md`).
  **DFS** (stos lub rekurencja): spójność, cykle, sortowanie topologiczne, przeszukiwanie z nawrotami.
- **Najkrótsze ścieżki**: Dijkstra (wagi nieujemne, z kolejką priorytetową — O((V + E) log V)), Bellman-Ford (wagi
  ujemne, wykrywa ujemne cykle — O(V·E)), A* (Dijkstra z heurystyką odległości do celu — mapy, gry).
- **Minimalne drzewo rozpinające**: Kruskal (krawędzie od najtańszych + union-find), Prim (rozrastanie od wierzchołka
  z kolejką priorytetową) — najtańsze połączenie wszystkich punktów (sieci, kable).
- **Sortowanie topologiczne** (DAG): kolejność zadań z zależnościami, wykrywanie cykli w zależnościach (moduły,
  migracje, potoki danych — ddd-algorithm-recognition, `graph-order.md`).
- **Zbiory rozłączne** (union-find) z kompresją ścieżek i łączeniem według rangi: grupy połączonych elementów,
  deduplikacja klientów z wielu źródeł.
- Duże grafy i zapytania o relacje w produkcji: baza grafowa lub biblioteka grafowa, nie własna implementacja
  (arch-quality-attributes, `architektura-danych.md`).

## Źródła
- T. Cormen i in., *Introduction to Algorithms*; R. Sedgewick, K. Wayne, *Algorithms*
- [roadmap.sh — Data Structures and Algorithms](https://roadmap.sh/datastructures-and-algorithms) (trees, traversal,
  BST, AVL, 2-3, B-trees, ISAM, heap, trie, segment and Fenwick trees, suffix trees, skip list, graphs, BFS, DFS,
  Dijkstra, Bellman-Ford, A*, Kruskal, Prim, union-find)
Opisane własnymi słowami.
