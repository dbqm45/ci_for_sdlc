# Przykłady projektów — wzorcowe rozwiązania i decyzje, które z nich wynikają

Skróty ośmiu ćwiczeń z system-design-primer, przepisane jako wzorce do ponownego użycia. Nie kopiuj ich w całości.
Weź z nich **kształt problemu** i **decyzję, która go rozwiązuje**, a liczby policz dla swojego przypadku
(procedura w SKILL.md). Każdy przykład stosuje tę samą procedurę: przypadki użycia i zakres → szacunki → projekt
ogólny → pogłębienie → skalowanie iteracyjne.

## Przeliczniki do szacunków
- Miesiąc ma około 2,5 mln sekund. 1 żądanie/s to ~2,5 mln żądań na miesiąc. 40 żądań/s to ~100 mln na miesiąc,
  a 400 żądań/s to ~1 mld na miesiąc.
- Potęgi dwójki (rozmiary i zakresy):

  | Potęga | Wartość | Przybliżenie | Bajty |
  |---|---|---|---|
  | 2⁸ | 256 | | |
  | 2¹⁰ | 1024 | tysiąc | 1 KB |
  | 2¹⁶ | 65 536 | | 64 KB |
  | 2²⁰ | 1 048 576 | milion | 1 MB |
  | 2³⁰ | ~1,07·10⁹ | miliard | 1 GB |
  | 2³² | ~4,29·10⁹ | 4 miliardy (zakres `INT` bez znaku; ze znakiem ~2,1 mld) | 4 GB |
  | 2⁴⁰ | ~1,1·10¹² | bilion | 1 TB |

- Długość identyfikatora: k znaków z alfabetu o m symbolach daje mᵏ wartości. Base62 (`[a-zA-Z0-9]`, bez znaków
  wymagających kodowania w URL) przy 7 znakach daje 62⁷ ≈ 3,5·10¹² wartości.

## Drabina skalowania (od jednego serwera do milionów użytkowników)
Każdy szczebel uzasadnia **pomiar**: test obciążenia, profil, wąskie gardło. Bez pomiaru nie wchodzisz na następny.
Często wystarczy jeden albo dwa kroki z danego szczebla.
1. **Jeden serwer**: aplikacja i baza na jednej maszynie, skalowanie pionowe, podstawowe metryki (CPU, pamięć, I/O,
   sieć). Stały adres IP i DNS. Otwarte tylko potrzebne porty.
2. **Rozdzielenie**: pliki statyczne i pliki użytkowników do magazynu obiektów, baza na osobnej, zarządzanej
   maszynie (kopie, wiele stref, szyfrowanie). Sieć prywatna dla wszystkiego poza punktem wejścia.
3. **Skalowanie poziome**: load balancer, kilka bezstanowych serwerów w różnych strefach, baza w trybie główna +
   rezerwa. Osobna warstwa serwera WWW (reverse proxy) i aplikacji, a w razie potrzeby osobne serwery dla API
   odczytu i zapisu. CDN dla treści statycznych.
4. **Przewaga odczytów**: cache w pamięci (popularne dane, sesje) i repliki do odczytu. Aplikacja kieruje zapisy do
   bazy głównej, a odczyty do replik.
5. **Zmienny ruch**: autoskalowanie z minimum i maksimum, automatyzacja infrastruktury (ops-iac-terraform), metryki na
   poziomie hosta i load balancera, analiza logów, monitoring z zewnątrz, dyżury, raportowanie błędów
   (ops-observability).
6. **Duże dane i zapisy**: stare dane do hurtowni lub magazynu obiektów, federacja, sharding, denormalizacja, część
   danych w NoSQL, praca niepilna asynchronicznie przez kolejki (be-database, be-messaging-outbox).

## Wzorce z ćwiczeń
| Ćwiczenie | Kształt problemu | Kluczowe decyzje |
|---|---|---|
| **Pastebin / skracacz linków** | mało zapisów, 10× więcej odczytów, krótki identyfikator, wygasanie | metadane w bazie (klucz = identyfikator), treść w magazynie obiektów; identyfikator jako base62 z losowych danych lub skrótu (np. MD5) z wykrywaniem kolizji przy zapisie; popularne wpisy w cache; wygasłe wpisy usuwane okresowym zadaniem; statystyki z logów wsadowo, bo nie muszą być bieżące |
| **Oś czasu i wyszukiwanie (Twitter)** | ogromny odczyt osi czasu, zapis rozsyłany do obserwujących | **rozsyłanie przy zapisie** (fan-out on write): wpis trafia do gotowych osi czasu obserwujących w cache, więc odczyt to jedno pobranie listy identyfikatorów + pobranie wielu kluczy naraz (multiget). Dla kont z milionami obserwujących **rozsyłanie przy odczycie**: ich wpisy dołącza się w chwili czytania (model hybrydowy). W cache tylko kilkaset ostatnich wpisów i tylko aktywni użytkownicy, a oś czasu nieaktywnego odbudowuje się z bazy. Wyszukiwanie: indeks odwrócony z rozesłaniem zapytania do wszystkich shardów i scaleniem wyników (scatter-gather) |
| **Robot sieciowy (web crawler)** | miliard stron, cykle w grafie linków, świeżość | kolejka linków z priorytetem (zbiór posortowany); przetworzone strony z **sygnaturą treści**, a podobna sygnatura obniża priorytet zamiast zapętlenia; duplikaty adresów usuwane wsadowo, a duplikaty treści przez miarę podobieństwa (Jaccard, kosinusowa); odświeżanie według częstotliwości zmian strony; **szacunek dla `robots.txt`** i limit żądań na domenę; własny cache DNS i pula połączeń; indeks odwrócony i opisy stron jako osobne usługi zasilane z kolejek |
| **Budżet domowy (Mint)** | **przewaga zapisów** (transakcje codziennie, mało odwiedzin), integracje z bankami | pobieranie transakcji przez kolejkę (wolne, zawodne źródło); surowe dane w magazynie obiektów, a agregaty miesięczne w osobnej tabeli lub hurtowni; kategoryzacja ze słownika sprzedawca → kategoria (mały, w pamięci) z korektami użytkowników; budżet domyślny z szablonu, a w bazie tylko nadpisania użytkownika; powiadomienia asynchronicznie; automatyczna aktualizacja tylko dla aktywnych kont |
| **Graf społecznościowy** | najkrótsza ścieżka między osobami, graf nie mieści się na jednej maszynie | BFS (graf bez wag) na danych podzielonych na serwery z usługą lokalizacji; ograniczanie skoków między maszynami: grupowanie zapytań o znajomych z tego samego serwera, podział według regionu; **dwukierunkowy BFS** (od źródła i od celu); limit czasu lub liczby kroków; cache wyników i wyliczanie wsadowe; baza grafowa, gdy wolno ją użyć |
| **Cache wyników zapytań** | ograniczona pamięć, popularne zapytania, szybkie trafienia | **LRU**: mapa + lista dwukierunkowa, wszystkie operacje O(1) (eng-algorithms-data-structures); TTL na wypadek zmian źródła; skalowanie przez **podział cache między maszyny** z wyborem maszyny po skrócie klucza i **haszowaniem spójnym**. Odrzucone warianty: osobny cache na każdej maszynie (niski odsetek trafień), pełna kopia na każdej (marnuje pamięć) |
| **Ranking sprzedaży w kategoriach** | 100× więcej odczytów niż zapisów, wynik odświeżany co godzinę | **wyliczanie wsadowe** z logów (MapReduce lub zapytanie w hurtowni): suma ilości według (kategoria, produkt), potem sortowanie; wynik zapisany w gotowej tabeli i cache, więc odczyt nic nie liczy; stare dane do hurtowni |
| **Skalowanie do milionów użytkowników** | rosnący ruch bez przepisywania wszystkiego | drabina skalowania powyżej |

## Wzorce przekrojowe
- **Policz, zanim wybierzesz**: 4 zapisy/s obsłuży jedna baza, 2000 zapisów/s już nie (Mint), a 60 000 dostarczeń/s
  wymaga magazynu w pamięci (Twitter).
- **Oddziel ścieżkę odczytu od ścieżki zapisu**: osobne API, osobne modele (gotowe osie czasu, gotowe rankingi,
  agregaty) i osobne skalowanie (ddd-tactical-design: CQRS).
- **Licz z góry to, co da się policzyć z góry**: wyniki wsadowe, rozsyłanie przy zapisie, widoki zmaterializowane.
  Kosztem jest nieaktualność i miejsce, więc zapisz, ile nieaktualności biznes akceptuje.
- **Wolne i zawodne zależności** (banki, sieć, powiadomienia) obsługuj przez kolejkę z ponowieniami
  i idempotencją.
- **Nierówny ruch** (gorące klucze, celebryci, popularne zapytania) jest regułą, nie wyjątkiem. Pomaga cache,
  specjalna ścieżka dla gorących kluczy i limit rozmiaru (np. tylko N ostatnich wpisów).
- **Trzymaj w szybkim magazynie tylko dane aktywne**: ostatni miesiąc lub aktywni użytkownicy. Resztę odbudowujesz
  na żądanie albo przenosisz do hurtowni.
- **Haszowanie spójne** przy podziale cache i danych: po dodaniu lub usunięciu węzła przenosi się tylko część kluczy
  (~1/n), a nie prawie wszystkie, jak przy `hash(klucz) mod n`. Węzły wirtualne wyrównują rozkład.

## Ćwiczenia z projektowania obiektowego (do nauki modelowania)
Primer zawiera też małe zadania obiektowe: tablica mieszająca, cache LRU, centrum obsługi telefonicznej, talia kart,
parking, czat. Przydają się jako ćwiczenie odpowiedzialności klas i stanów (eng-design-principles,
eng-design-patterns). W prawdziwym projekcie model wynika z domeny (ddd-tactical-design), nie z ćwiczenia.

## Źródła
- [donnemartin/system-design-primer](https://github.com/donnemartin/system-design-primer) — `solutions/system_design`
  (pastebin, twitter, web_crawler, mint, social_graph, query_cache, sales_rank, scaling_aws) i
  `solutions/object_oriented_design`; licencja CC BY 4.0, © Donne Martin
- D. Karger i in., „Consistent hashing and random trees” (1997), czyli haszowanie spójne

Opisane własnymi słowami, ze zmianami i uzupełnieniami.
