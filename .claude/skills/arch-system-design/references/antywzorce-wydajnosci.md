# Antywzorce wydajności (katalog Azure Architecture Center)

| Antywzorzec | Objaw | Jak wykryć | Naprawa |
|---|---|---|---|
| **Zajęta baza** (Busy Database) | baza wykonuje logikę (procedury, formatowanie, przetwarzanie dużych zbiorów) i staje się wąskim gardłem | wysoki CPU bazy przy umiarkowanym ruchu, długie procedury w `pg_stat_statements` | przenieś obliczenia do skalowalnej warstwy aplikacji; baza do przechowywania i zapytań |
| **Zajęty front** (Busy Front End) | ciężkie zadania w procesie obsługującym żądania (także w wątkach w tle tego procesu) spowalniają wszystkie żądania | rośnie opóźnienie wszystkich endpointów, gdy działa jedno ciężkie zadanie | kolejka i osobne procesy robocze, `202` i zasób statusu (be-api-design) |
| **Gadatliwe I/O** (Chatty I/O) | wiele małych żądań do bazy, usługi lub plików zamiast jednego | liczba zapytań na żądanie, N+1, ślady z dziesiątkami krótkich wywołań | zapytania zbiorcze, batch, odpowiedzi z potrzebnymi danymi (be-database) |
| **Zbędne pobieranie** (Extraneous Fetching) | pobieranie więcej danych niż potrzeba (wszystkie kolumny, cała kolekcja, filtrowanie w aplikacji) | duże odpowiedzi, transfer z bazy nieproporcjonalny do wyniku | projekcja kolumn, filtrowanie i paginacja w bazie, DTO dla odczytów |
| **Niewłaściwe tworzenie instancji** (Improper Instantiation) | nowy klient HTTP, połączenie do bazy lub obiekt kosztowny tworzony przy każdym żądaniu | wyczerpanie gniazd lub połączeń, rosnące `TIME_WAIT`, czas tworzenia w profilu | jeden współdzielony klient, pule połączeń (`checklista-wydajnosci-backendu.md`) |
| **Monolityczne utrwalanie** (Monolithic Persistence) | jedna baza dla danych o skrajnie różnych wzorcach (transakcje, logi, analityka, pliki) | rywalizacja o zasoby, wolne zapytania transakcyjne podczas raportów | rozdziel magazyny według wzorca dostępu (repliki, hurtownia, magazyn obiektów) — tylko z pomiaru |
| **Brak cache** (No Caching) | te same, rzadko zmienne dane czytane za każdym razem ze źródła | powtarzalne identyczne zapytania w logach | cache z TTL i unieważnianiem; uwaga na lawinę zapytań |
| **Hałaśliwy sąsiad** (Noisy Neighbor) | jeden najemca lub proces zużywa nieproporcjonalnie dużo zasobów wspólnych | metryki per najemca, skoki u wszystkich przy aktywności jednego | limity per najemca, kolejki z priorytetami, izolacja (grodzie, osobne pule, Deployment Stamps) |
| **Burza ponowień** (Retry Storm) | wielu klientów ponawia bez odstępu i limitu, dobijając odradzającą się usługę | ruch rośnie po awarii zamiast spadać | wykładniczy odstęp z rozrzutem, budżet ponowień, bezpiecznik, `Retry-After` |
| **Synchroniczne I/O** (Synchronous I/O) | wątek blokowany na czas operacji wejścia–wyjścia | wyczerpana pula wątków przy niskim CPU | asynchroniczne API (w Node domyślnie; w Javie wątki wirtualne lub reaktywnie), limity czasu |
Każdy antywzorzec potwierdzasz pomiarem (profil, ślady, metryki) przed naprawą i po niej (qa-performance-testing).

## Źródła
- [Microsoft — Performance antipatterns for cloud applications](https://learn.microsoft.com/en-us/azure/architecture/antipatterns/)
- [roadmap.sh — System Design](https://roadmap.sh/system-design) (performance antipatterns)
Opisane własnymi słowami.
