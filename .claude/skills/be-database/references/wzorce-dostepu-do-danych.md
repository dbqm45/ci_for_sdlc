# Wzorce logiki i dostępu do danych (PoEAA)

Klasyczne wzorce z *Patterns of Enterprise Application Architecture* (M. Fowler) — słownik, którym nazywasz decyzje
w ADR i review. Taktyczne DDD (agregaty, repozytoria domenowe): ddd-tactical-design.

## 1. Gdzie żyje logika biznesowa
| Wzorzec | Na czym polega | Kiedy | Sygnał, że już nie wystarcza |
|---|---|---|---|
| **Skrypt transakcji** (Transaction Script) | jedna procedura na żądanie: waliduje, liczy, zapisuje | prosty CRUD, mało reguł, raporty, integracje | te same reguły kopiowane do wielu skryptów; skrypty po kilkaset linii z `if` po typach |
| **Moduł tabeli** (Table Module) | jedna klasa na tabelę, operuje na zbiorach rekordów | rzadko dziś; ekosystemy z rekordami w pamięci | — |
| **Model domeny** (Domain Model) | obiekty z danymi i zachowaniem, niezmienniki w środku | dużo reguł, które się zmieniają (subdomena główna) | — (koszt: mapowanie, ORM, nauka) |
Wybór zależy od złożoności logiki, nie od mody: subdomena generyczna → skrypt transakcji, główna → model domeny
(ddd-strategic-analysis). Przejście w drugą stronę jest drogie, więc decyzja trafia do ADR.
**Model anemiczny** = klasy domeny z samymi polami i „serwisy” z logiką — to skrypt transakcji z narzutem modelu.
Świadomy skrypt transakcji jest uczciwszy niż model anemiczny udający model domeny.

## 2. Odwzorowanie obiektów na bazę
| Wzorzec | Na czym polega | Uwagi |
|---|---|---|
| **Active Record** | obiekt = wiersz, sam się zapisuje (`order.save()`) | szybki start, ale domena zależy od bazy; dobry dla prostych modeli |
| **Data Mapper** | osobny mapper przenosi dane między obiektem a bazą; obiekt nie wie o bazie | wymagany dla modelu domeny niezależnego od infrastruktury |
| **Repozytorium** | kolekcja agregatów z perspektywy domeny (`orders.byId(id)`, `orders.save(order)`) | interfejs w domenie, implementacja w infrastrukturze; bez ogólnego `findAll(filter)` dla każdego przypadku |
| **Unit of Work** | śledzi zmiany w obiektach w ramach transakcji i zapisuje je razem | granica = jedna transakcja = zwykle jeden agregat |
| **Identity Map** | w ramach jednej jednostki pracy jeden obiekt na jeden identyfikator | brak dwóch kopii tego samego rekordu, mniej zapytań; nie jest cache'em między żądaniami |
| **Lazy Load** | dane powiązane ładowane przy pierwszym użyciu | źródło N+1 i błędów po zamknięciu sesji — w odczytach jawne `join`/eager albo DTO |

Co dają popularne narzędzia:
- JPA/Hibernate: kontekst trwałości = Identity Map + Unit of Work (śledzenie zmian, zapis przy `flush`).
- MikroORM: Data Mapper z Unit of Work i Identity Map.
- TypeORM: oba style (Active Record i Data Mapper), bez pełnego Unit of Work.
- Prisma: klient zapytań bez Identity Map i Unit of Work; spójność zapewniasz transakcją (`$transaction`).
Sprawdź wersję i dokumentację w projekcie (core-stack-sync), zanim zaprojektujesz coś, co zakłada te mechanizmy.

## 3. Zapis przez ORM, odczyt przez SQL
- Strona zapisu (zmiany stanu, niezmienniki): ORM z Unit of Work, agregat ładowany w całości.
- Strona odczytu (listy, raporty, wyszukiwanie): zapytanie SQL, widok lub lekki builder zwracający **DTO** dopasowane
  do ekranu — bez ładowania agregatów i bez lazy loadingu. To lekka forma CQRS (ddd-tactical-design), bez osobnej bazy.
- ORM jest abstrakcją przeciekającą: znajomość SQL, planów zapytań i indeksów nadal jest potrzebna (SKILL.md).

## 4. DTO i mappery
- **DTO** przenosi dane przez granicę (API, kolejka, warstwa odczytu): proste pola, bez zachowania, wersjonowany jak
  kontrakt (be-api-design). Encja ani agregat nie wychodzą poza swój moduł.
- **Mapper** tłumaczy reprezentacje (wiersz ↔ obiekt domeny, obiekt domeny ↔ DTO) w warstwie, która zna obie strony —
  zwykle aplikacji lub infrastruktury, nigdy w domenie.
- Mapowanie pisane ręcznie jest jawne i typowane (w TS nie ma refleksji w czasie działania); generatory (MapStruct
  w Javie) — przy wielu prostych DTO. Test mappera: pola dodane do DTO bez mapowania mają powodować błąd kompilacji lub
  testu, nie ciche `undefined`.

## Źródła
- M. Fowler, *Patterns of Enterprise Application Architecture* (2002);
  [katalog wzorców](https://martinfowler.com/eaaCatalog/) (m.in. [Transaction Script](https://martinfowler.com/eaaCatalog/transactionScript.html)).
- V. Khorikov, [Do you need an ORM?](https://enterprisecraftsmanship.com/posts/do-you-need-an-orm/) — ORM po stronie
  zapisu, SQL po stronie odczytu, Identity Map, Unit of Work, pułapki lazy loadingu.
- [roadmap.sh — Software Design and Architecture](https://roadmap.sh/software-design-architecture) (enterprise patterns).
Opisane własnymi słowami.
