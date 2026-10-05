---
name: eng-algorithms-data-structures
description: Użyj, gdy liczy się wydajność kodu — złożoność, dobór struktur danych (TS, Java), techniki algorytmów, grafy, LRU.
metadata:
  katalog: "Użyj przy kodzie, w którym liczy się wydajność albo poprawność algorytmu — złożoność (O, czas, pamięć), dobór struktury danych w TS i Javie, wzorce rozwiązywania (dwa wskaźniki, okno, przedziały, top-k, BFS/DFS), techniki (rekurencja, nawroty, programowanie dynamiczne, zachłanne), drzewa i grafy. Nie do rozpoznawania problemu w domenie (ddd-algorithm-recognition)."
---

# Algorytmy i struktury danych w codziennym kodzie

W kodzie produkcyjnym zwykle **wybierasz** gotową strukturę lub algorytm z biblioteki, a nie piszesz go od zera.
Liczy się to, żeby wiedzieć, ile co kosztuje, i rozpoznać, kiedy pętla w pętli zamieni 1000 rekordów w milion
operacji. Klasyczny problem ukryty w wymaganiach biznesowych (harmonogram, przydział, trasy): ddd-algorithm-recognition.

## Złożoność — jak liczyć
- Notacja O opisuje wzrost kosztu względem rozmiaru wejścia n (najgorszy przypadek, chyba że napisano inaczej);
  Θ — dokładny rząd, Ω — dolne ograniczenie. Stałe i niższe składniki pomijasz, ale **w praktyce stałe mają
  znaczenie** dla małego n.
- Typowe klasy: O(1) stała, O(log n) logarytmiczna (dzielenie przestrzeni na pół), O(n) liniowa, O(n log n)
  (dobre sortowanie), O(n²) (pętla w pętli), O(2ⁿ) wykładnicza (wszystkie podzbiory), O(n!) (wszystkie permutacje).
  Przy n = 10⁶: O(n log n) ≈ 2·10⁷ operacji — ułamek sekundy; O(n²) = 10¹² — godziny.
- Liczenie: pętle zagnieżdżone mnożą się, kolejne dodają; rekurencja — liczba wywołań × praca w wywołaniu (np. dziel
  na pół i scalaj liniowo → O(n log n)); **ukryte pętle**: `includes`, `indexOf`, `filter` w pętli, `contains` na liście,
  zapytanie do bazy w pętli (N+1 — be-database).
- **Pamięć** liczy się tak samo (dodatkowe tablice, stos rekurencji). **Amortyzacja**: dopisywanie do tablicy
  dynamicznej to zwykle O(1), czasem O(n) przy powiększeniu — średnio O(1).

## Dobór struktury danych
| Potrzeba | Struktura | TS / JS | Java | Koszt typowych operacji |
|---|---|---|---|---|
| lista z dostępem po indeksie | tablica dynamiczna | `Array` | `ArrayList` | dostęp O(1), dopisanie na końcu O(1)*, wstawienie w środku O(n) |
| wyszukiwanie po kluczu | tablica mieszająca | `Map` (nie zwykły obiekt dla dynamicznych kluczy) | `HashMap` | O(1) średnio |
| unikalność, „czy było” | zbiór mieszający | `Set` | `HashSet` | O(1) średnio |
| kolejka FIFO | kolejka / deque | tablica z indeksem głowy albo biblioteka (`shift()` jest O(n)) | `ArrayDeque` | O(1) |
| stos LIFO | stos | `Array` z `push`/`pop` | `ArrayDeque` | O(1) |
| zawsze najmniejszy / największy, top-k | kopiec (kolejka priorytetowa) | biblioteka (brak w standardzie) | `PriorityQueue` | wstawienie i zdjęcie O(log n), podgląd O(1) |
| klucze posortowane, zakresy, „najbliższy większy” | drzewo zrównoważone | biblioteka albo posortowana tablica z wyszukiwaniem binarnym | `TreeMap`, `TreeSet` | O(log n) |
| lista z częstym wstawianiem w znanym miejscu | lista wiązana | rzadko potrzebna | `LinkedList` (zwykle wolniejsza od `ArrayList` przez pamięć podręczną procesora) | wstawienie O(1) przy węźle, dostęp O(n) |
| prefiksy tekstu (podpowiedzi) | trie | biblioteka / własna | biblioteka | O(długość słowa) |
| grupy połączonych elementów | zbiory rozłączne (union-find) | własna (kilkanaście linii) | własna | prawie O(1) |
Konkretne implementacje i ich właściwości sprawdź dla swojej wersji (lang-typescript, lang-java). W bazie danych
odpowiednikiem wyboru struktury jest indeks (B-drzewo, hash, GIN — be-database).

## Sortowanie i wyszukiwanie w praktyce
- Używaj sortowania z biblioteki: `Array.prototype.sort` jest stabilne (od ES2019), ale **bez komparatora sortuje
  jako tekst** (`[10, 9, 1]` → `[1, 10, 9]`) — zawsze podawaj komparator; `toSorted` nie mutuje. W Javie sortowanie
  obiektów jest stabilne (TimSort), tablic typów prostych — nie musi być (nie ma to znaczenia dla liczb).
- Wyszukiwanie binarne tylko na posortowanych danych; błędy „o jeden” i przepełnienie środka w językach z liczbami
  stałej szerokości (`mid = lo + (hi − lo) / 2`).
- Częste wyszukiwanie w liście → zamień na `Map`/`Set` raz (O(n)) zamiast `find` w pętli (O(n²)).
- Zamiast sortować całość dla k największych — kopiec rozmiaru k (O(n log k)) albo wybór k-tego (średnio O(n)).

## Poprawność
- Dla nietrywialnego algorytmu zapisz **niezmiennik** (co jest prawdą na początku każdego obrotu pętli) i warunki
  brzegowe: pusty zbiór, jeden element, duplikaty, wartości ujemne, przepełnienie.
- Testy oparte na właściwościach (fast-check, jqwik) porównujące z prostą, oczywiście poprawną wersją (np. sortowanie
  biblioteczne, przeszukanie siłowe) na losowych danych (qa-spec-first-testing).
- Rekurencja: głębokość stosu ograniczona (w JS ok. kilku–kilkunastu tysięcy ramek, zależnie od silnika) — dla dużych
  danych wersja iteracyjna z jawnym stosem.

## Więcej
- Wzorce rozwiązywania problemów i techniki projektowania algorytmów: `references/wzorce-i-techniki.md`.
- Drzewa, grafy i struktury zaawansowane: `references/drzewa-i-grafy.md`.

## Checklista przeglądu
- [ ] złożoność pętli i zapytań oszacowana dla realnego n (także ukryte pętle i N+1)
- [ ] struktura danych dobrana do operacji (Map/Set zamiast wyszukiwania w liście)
- [ ] sortowanie z komparatorem; brak mutacji, gdzie nie trzeba
- [ ] warunki brzegowe i niezmienniki; test właściwości dla nietrywialnej logiki
- [ ] rekurencja ograniczona albo iteracyjna

## Źródła
- T. Cormen i in., *Introduction to Algorithms*; S. Skiena, *The Algorithm Design Manual*; specyfikacja ECMAScript
  (`Array.prototype.sort`), dokumentacja Java Collections
- [roadmap.sh — Data Structures and Algorithms](https://roadmap.sh/datastructures-and-algorithms)
Opisane własnymi słowami.
