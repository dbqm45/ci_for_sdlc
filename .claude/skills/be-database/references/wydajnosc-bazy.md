# Wydajność bazy danych w produkcji (PostgreSQL jako przykład)

Najpierw pomiar, potem zmiana. Kolejność zwykle opłacalna: zapytanie i indeks → pula połączeń → cache → repliki do
odczytu → partycjonowanie → sharding (na końcu i rzadko).

## Pula połączeń
- Każde połączenie do PostgreSQL to proces z pamięcią. Więcej połączeń ≠ większa przepustowość — powyżej pewnej liczby
  rośnie rywalizacja o CPU, blokady i I/O.
- Punkt startowy dla puli aplikacji (wiki HikariCP o rozmiarze puli): **liczba rdzeni bazy × 2 + liczba dysków**
  efektywnie obsługujących I/O, potem dostrajanie na teście obciążenia (qa-performance-testing). Zwykle małe pule
  (kilkanaście–kilkadziesiąt) i kolejka w aplikacji działają lepiej niż setki połączeń.
- Suma: **rozmiar puli × liczba instancji aplikacji (także przy autoskalowaniu i wdrożeniu rolling) ≤ `max_connections`**
  z zapasem na administrację i migracje. Przy wielu instancjach lub funkcjach serverless — pośrednik puli
  (PgBouncer w trybie transakcyjnym; wtedy bez stanu sesji w połączeniu: przygotowane zapytania i `SET` sprawdź
  w dokumentacji wersji).
- Ustaw: limit czasu oczekiwania na połączenie z puli (krótki — lepiej szybki błąd niż kolejka bez końca), maksymalny
  czas życia połączenia (krótszy niż limity sieci i bazy), limit czasu zapytania (`statement_timeout`) i transakcji
  w bezczynności (`idle_in_transaction_session_timeout`).
- Metryki puli w monitoringu: aktywne, bezczynne, oczekujący, czas oczekiwania (ops-observability).

## Wolne zapytania
- `log_min_duration_statement` (np. 250–500 ms) loguje wolne zapytania; rozszerzenie `pg_stat_statements` daje
  ranking według **łącznego** czasu (częste średnio-wolne zapytanie kosztuje więcej niż rzadkie bardzo wolne);
  `auto_explain` zapisuje plany wolnych zapytań.
- `EXPLAIN (ANALYZE, BUFFERS)` na danych w skali produkcji: skan sekwencyjny dużej tabeli, złe oszacowanie liczby
  wierszy (nieaktualne statystyki → `ANALYZE`), sortowanie na dysku, pętle zagnieżdżone na dużych zbiorach.
- Indeksy: kolejność kolumn w złożonym indeksie (równość przed zakresem), indeksy częściowe (`WHERE status = 'open'`)
  i pokrywające (`INCLUDE`); każdy indeks spowalnia zapis — usuwaj nieużywane (`pg_stat_user_indexes`).
- ORM: włącz logowanie SQL w testach i patrz na liczbę zapytań na żądanie (N+1); pobieraj tylko potrzebne kolumny
  (`wzorce-dostepu-do-danych.md`: odczyt przez SQL i DTO).

## Utrzymanie
- **VACUUM i autovacuum**: aktualizacje i usunięcia zostawiają martwe wiersze; autovacuum musi nadążać (dla dużych,
  często zmienianych tabel ustawienia per tabela). Objawy: rosnący rozmiar tabeli i indeksów, wolniejsze skany,
  ostrzeżenia o zawijaniu identyfikatorów transakcji — to ostatnie jest sprawą pilną.
- Sprzątanie danych: retencja (logi, zdarzenia, sesje, outbox po wysłaniu) usuwana partiami lub przez odłączanie
  partycji, nie jednym wielkim `DELETE`.

## Schemat i typy a wydajność
Część popularnych porad (także w system-design-primer) pochodzi z MySQL 5.x. Sprawdź je dla swojej bazy i wersji.
- Pieniądze jako `numeric` / `DECIMAL` (albo liczba całkowita groszy), nigdy jako liczba zmiennoprzecinkowa.
- Identyfikatory i liczniki, które mogą urosnąć, jako `bigint`. `integer` ze znakiem kończy się na ~2,1 mld,
  a zmiana typu dużej tabeli to kosztowna migracja.
- `NOT NULL` tam, gdzie wartość jest wymagana. Chodzi przede wszystkim o poprawność, a planista zapytań też
  korzysta z ograniczeń.
- Duże pliki (obrazy, dokumenty) w magazynie obiektów, a w bazie tylko ich adres i metadane.
- **PostgreSQL**: `text` i `varchar(n)` działają tak samo szybko, a `char(n)` nie jest szybszy (dopełnia spacjami;
  dokumentacja odradza go). Limit długości wyrażaj ograniczeniem, gdy wynika z domeny. Rada „`CHAR` zamiast `VARCHAR`
  dla szybkości” dotyczy starych silników MySQL.
- **MySQL 8.0** nie ma już cache zapytań (query cache). Cache wyników trzymaj w aplikacji (be-api-design,
  `checklista-wydajnosci-backendu.md`).
- Duży import: wyłącz lub usuń indeksy niebędące kluczem, wczytaj dane (`COPY` w PostgreSQL), odbuduj indeksy
  i uruchom `ANALYZE`. Każdy indeks przyspiesza odczyt, ale spowalnia zapis i zajmuje pamięć, więc zostawiaj tylko
  te, których używają zapytania.
- Gorące kolumny lub wiersze w osobnej, mniejszej tabeli mieszczą się w pamięci. Robisz to tylko po pomiarze.

## Skalowanie odczytu i danych
- **Repliki do odczytu**: odciążają raporty i listy. Opóźnienie repliki oznacza, że użytkownik może nie zobaczyć
  własnego zapisu — po zapisie czytaj z primary (read-your-writes) albo poczekaj na pozycję WAL. Replika to też
  redundancja, ale nie kopia zapasowa (błędne `DELETE` replikuje się natychmiast — ops-sre-incidents).
- **Denormalizacja i widoki zmaterializowane** dla obciążeń z przewagą odczytu (dashboardy, wyszukiwanie): odświeżanie
  zaplanowane lub przez zdarzenia; źródłem prawdy pozostaje model znormalizowany (ddd-tactical-design: read modele, CQRS).
- **Partycjonowanie** (deklaratywne, np. po dacie) dla bardzo dużych tabel z naturalnym kluczem czasu: szybkie
  usuwanie starych danych, mniejsze indeksy. Zapytania muszą filtrować po kluczu partycji.
- **Sharding** (podział danych między wiele baz) dopiero gdy pionowe skalowanie, repliki i partycjonowanie nie
  wystarczają: komplikuje transakcje, zapytania przekrojowe, migracje i operacje. Klucz shardowania z domeny
  (najemca, region); decyzja w ADR z alternatywami.

## Źródła
- Dokumentacja PostgreSQL: Routine Vacuuming, `pg_stat_statements`, `auto_explain`, Table Partitioning,
  Runtime Config (Logging, Client Connection Defaults), Character Types, `COPY`; HikariCP wiki „About Pool Sizing”;
  MySQL 8.0 Reference Manual (usunięcie query cache)
- [system-design-primer](https://github.com/donnemartin/system-design-primer) — SQL tuning (CC BY 4.0)
- [roadmap.sh — Backend Performance Best Practices](https://roadmap.sh/backend-performance-best-practices) (Databases)
Opisane własnymi słowami.
