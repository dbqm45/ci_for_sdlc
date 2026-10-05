# Architektura danych: spójność, rodzaje baz, analityka i przetwarzanie

## Gwarancje i kompromisy
- **ACID** (atomowość, spójność, izolacja, trwałość) — transakcje w jednej bazie relacyjnej. Poziom izolacji ma
  znaczenie: domyślny „read committed” w PostgreSQL nie chroni przed każdą anomalią — reguły „nie więcej niż N” wymagają
  blokady, ograniczenia lub `SERIALIZABLE` (be-database: transakcje).
- **CAP**: przy podziale sieci system rozproszony wybiera między spójnością a dostępnością. **PACELC** dodaje, że
  nawet bez podziału trzeba wybierać między opóźnieniem a spójnością — to częstszy, codzienny kompromis.
- **BASE** (podstawowa dostępność, stan miękki, spójność ostateczna) — typowe dla systemów rozproszonych i wielu baz
  NoSQL. **Spójność ostateczna** wymaga projektu: co widzi użytkownik w międzyczasie (read-your-writes, monotoniczne
  odczyty), jak rozwiązujesz konflikty (wersje, ostatni zapis wygrywa — z utratą danych, scalanie).
- Między usługami nie ma transakcji ACID: outbox i idempotentni odbiorcy (be-messaging-outbox), saga z kompensacjami
  (ddd-tactical-design), CQRS z modelem odczytu aktualizowanym zdarzeniami.

## Rodzaje baz — wybór
| Rodzaj | Model | Dobre do | Uwaga |
|---|---|---|---|
| relacyjna (PostgreSQL, MySQL, SQL Server, Oracle) | tabele, SQL, transakcje | domyślny wybór dla danych biznesowych | JSONB w PostgreSQL pokrywa wiele potrzeb „dokumentowych” |
| dokumentowa (MongoDB, Couchbase) | dokumenty JSON | dane o zmiennej strukturze czytane całością | relacje i transakcje wielodokumentowe są droższe |
| klucz–wartość (Redis, DynamoDB) | klucz → wartość | cache, sesje, liczniki, bardzo duża skala prostych odczytów | zapytania tylko po kluczu (lub zaprojektowanych indeksach) |
| szerokokolumnowa (Cassandra, ScyllaDB) | wiersze z wieloma kolumnami, partycje | ogromne wolumeny zapisów, szeregi czasowe | model danych z góry pod zapytania |
| grafowa (Neo4j, Neptune) | węzły i krawędzie | relacje wielopoziomowe (rekomendacje, sieci, uprawnienia ReBAC) | |
| szeregów czasowych (TimescaleDB, InfluxDB, Prometheus) | pomiar w czasie | metryki, IoT, telemetria (np. ładowarki — dom-ev-charging) | retencja i agregacja w czasie |
| wyszukiwania (Elasticsearch, OpenSearch) | indeks odwrócony | wyszukiwanie pełnotekstowe, filtry fasetowe | nie jako źródło prawdy |
**Wiele baz w jednym systemie** (polyglot persistence) tylko z powodu — każda to koszt operacyjny, kopie, monitoring
i kompetencje. Domyślnie jedna baza relacyjna plus cache.

## Analityka: OLTP a OLAP
- Baza transakcyjna (OLTP) obsługuje aplikację; zapytania analityczne (OLAP) na niej spowalniają produkcję. Analityka
  w osobnym magazynie: hurtownia danych (BigQuery, Snowflake, Redshift, ClickHouse) lub lakehouse (pliki kolumnowe
  w magazynie obiektów + format tabel, np. Apache Iceberg lub Delta Lake).
- Modelowanie hurtowni: **schemat gwiazdy** — tabela faktów (zdarzenia, miary) i tabele wymiarów (kto, co, kiedy,
  gdzie); płatek śniegu — wymiary znormalizowane. Historia zmian wymiarów: SCD typ 2 (nowy wiersz z okresem ważności).
- **ETL** (przekształcenie przed załadowaniem) czy **ELT** (ładowanie surowych danych, przekształcenia w hurtowni,
  np. dbt) — dziś częściej ELT. Dane osobowe: minimalizacja i pseudonimizacja przed trafieniem do analityki (RODO).
- **CDC** (przechwytywanie zmian z logu bazy, np. Debezium) zamiast okresowych pełnych zrzutów; zdarzenia domenowe
  jako lepszy kontrakt niż wewnętrzny schemat tabel (ddd-context-mapping: Published Language).

## Przetwarzanie dużych danych
- **Wsadowe**: MapReduce (historyczny model Hadoopa: mapowanie i redukcja rozproszone po klastrze), dziś zwykle Apache
  Spark (przetwarzanie w pamięci, SQL, DataFrame) albo silnik hurtowni.
- **Strumieniowe**: Kafka Streams, Apache Flink, Spark Structured Streaming — gdy wynik potrzebny w sekundach (wykrywanie
  nadużyć, alerty, liczniki na żywo). Okna czasowe, opóźnione zdarzenia, dokładnie-raz kontra co-najmniej-raz.
- Najpierw sprawdź, czy dane naprawdę są „duże”: wiele obciążeń mieści się w jednej bazie lub hurtowni bez klastra
  Spark (KISS, koszt — ops-finops).

## Źródła
- M. Kleppmann, *Designing Data-Intensive Applications* (2017); D. Abadi — PACELC (2012);
  R. Kimball — modelowanie wymiarowe
- [roadmap.sh — Software Architect](https://roadmap.sh/software-architect) (ACID, CAP, CQRS i spójność ostateczna,
  NoSQL, hurtownie, ETL, Hadoop, Spark, MapReduce)
Opisane własnymi słowami.
