---
name: data-engineering
description: Użyj przy potokach danych — pozyskiwanie (wsad, CDC, strumień), idempotencja, backfill, kontrakty, orkiestracja, dbt, testy.
metadata:
  katalog: "Użyj przy budowie i utrzymaniu potoków danych — cykl życia danych, pozyskiwanie (wsad, CDC, strumień), idempotencja, backfill, spóźnione dane, kontrakty danych, orkiestracja (Airflow, Dagster), dbt, formaty plików i tabel, reverse ETL, testy potoków. Nie do analizy (data-analysis) ani wyboru architektury danych (arch-quality-attributes)."
---

# Inżynieria danych

Celem jest dostarczanie **wiarygodnych danych na czas** tym, którzy z nich korzystają (analityka, aplikacje, modele).
Wybór architektury (hurtownia, lakehouse, OLTP vs OLAP, ETL vs ELT, CDC, wsad vs strumień): arch-quality-attributes,
`architektura-danych.md`. Jakość, pochodzenie, katalog, maskowanie i prawo: `references/jakosc-zarzadzanie-i-zgodnosc.md`.

## Cykl życia danych
**Wytwarzanie** (systemy źródłowe, zdarzenia, pliki, API, IoT) → **przechowywanie** → **pozyskiwanie** →
**transformacja** → **serwowanie** (analityka, BI, uczenie maszynowe, reverse ETL). Przez wszystkie etapy przechodzą:
bezpieczeństwo, zarządzanie danymi (jakość, metadane, pochodzenie), DataOps (automatyzacja, monitorowanie,
reagowanie), architektura, orkiestracja i praktyki inżynierii oprogramowania (testy, przegląd, CI/CD, IaC).

## Pozyskiwanie
| Sposób | Kiedy | Uwaga |
|---|---|---|
| wsadowe pełne | małe tabele słownikowe | proste, ale kosztowne przy wzroście |
| wsadowe przyrostowe (po znaczniku czasu lub kluczu) | większość tabel | usunięcia w źródle niewidoczne bez znacznika „usunięto”; zegar źródła musi być wiarygodny |
| CDC z logu bazy (np. Debezium) | zmiany w niemal czasie rzeczywistym, z usunięciami | dostęp do logu replikacji, koszt operacyjny; wewnętrzny schemat źródła staje się zależnością |
| zdarzenia domenowe z brokera | integracja z aplikacjami (be-messaging-outbox) | najlepszy kontrakt — zdarzenie zaprojektowane do publikacji |
| API i pliki od partnerów | dane zewnętrzne | limity, paginacja, ponowienia, walidacja na wejściu — dane z zewnątrz są niezaufane |
**Komunikaty kontra strumienie**: kolejka (RabbitMQ, SQS) — wiadomość znika po przetworzeniu, jeden odbiorca na
wiadomość; log (Kafka, Kinesis) — zdarzenia przechowywane, wielu niezależnych czytelników, możliwość ponownego
odczytu od dowolnego miejsca.

## Projekt potoku — zasady
1. **Idempotencja**: ponowne uruchomienie dla tego samego okresu daje ten sam wynik — zapis przez nadpisanie partycji
   lub `MERGE` po kluczu, nie dopisywanie. Bez tego każde ponowienie tworzy duplikaty.
2. **Przetwarzanie po partycjach czasu** (np. dzień) z parametrem daty, a nie „od ostatniego razu” w pamięci zadania
   — wtedy **backfill** (przeliczenie historii po poprawce) to uruchomienie dla zakresu dat.
3. **Spóźnione dane**: okno ponownego przeliczenia (np. ostatnie 3 dni) albo znacznik czasu zdarzenia vs przetworzenia
   rozróżniony w modelu.
4. **Ewolucja schematu**: zmiany addytywne bezpieczne; usunięcie lub zmiana typu kolumny to zmiana łamiąca —
   **kontrakt danych** ze źródłem (schemat, semantyka pól, częstotliwość, właściciel, sposób ogłaszania zmian), sprawdzany
   w CI producenta, jak kontrakt API (be-api-design).
5. **Deklaratywnie, gdzie się da**: SQL i konfiguracja zamiast kodu proceduralnego dla transformacji; kod (Python,
   Spark) dla tego, czego SQL nie wyrazi.
6. **Mały zasięg awarii**: jedno zadanie = jeden krok z jasnym wejściem i wyjściem; porażka zatrzymuje zależnych, nie
   publikuje częściowych wyników (zapis do tabeli tymczasowej i atomowa zamiana).
7. **Koszt**: partycjonowanie i klastrowanie tabel po kolumnach filtrów, odczyt tylko potrzebnych kolumn, limit
   kosztu zapytań w hurtowni (ops-finops).

## Orkiestracja
- Narzędzia: Apache Airflow (DAG w Pythonie; w wersji 3 m.in. wersjonowanie DAG-ów i planowanie na podstawie
  zasobów danych), Dagster (aktywa danych zamiast zadań), Prefect, usługi chmurowe (Step Functions, Data Factory,
  Workflows); Luigi — starsze. Prosty harmonogram (cron, zadanie w Kubernetesie) wystarcza dla kilku niezależnych
  zadań.
- Każde zadanie: ponowienia z odstępem, limit czasu, alert do właściciela, umowa na świeżość (SLA danych: „tabela
  zamówień gotowa do 6:00”), zależności przez dane, nie przez godzinę startu.
- Orkiestrator nie wykonuje ciężkiej pracy sam — zleca ją silnikowi (hurtownia, Spark, kontener).

## Transformacje: dbt i warstwy
- **Warstwy**: surowe (kopia źródła, bez zmian) → oczyszczone i ujednolicone (typy, nazwy, deduplikacja) → modele
  biznesowe (fakty i wymiary, metryki) → udostępnianie (hurtownia tematyczna dla działu, widoki dla BI). Te same idee
  występują jako bronze/silver/gold w lakehouse.
- **dbt**: modele jako `SELECT` w repozytorium, zależności przez `ref()`, źródła z testami świeżości, testy danych
  (`unique`, `not_null`, relacje, wartości dozwolone), migawki dla historii zmian (SCD2), dokumentacja i graf pochodzenia
  generowane z projektu. Przegląd w PR, uruchomienie w CI na próbce danych.
- Modelowanie: schemat gwiazdy dla analityki (`architektura-danych.md`), normalizacja w systemach źródłowych,
  denormalizacja w warstwie udostępniania.

## Przechowywanie: formaty
- Pliki analityczne kolumnowe: **Parquet** (domyślny), ORC; wierszowe z obsługą ewolucji schematu do przesyłu
  i strumieni: **Avro**; CSV i JSON tylko na wejściu i wyjściu wymiany.
- Formaty tabel w lakehouse: Apache Iceberg, Delta Lake, Apache Hudi — transakcje ACID na plikach, ewolucja schematu,
  podróż w czasie. Wybór zależy od silników, które mają czytać dane.
- Hurtownie i silniki: BigQuery, Snowflake, Redshift, Databricks, ClickHouse; rozproszone przetwarzanie: Spark.

## Serwowanie i reverse ETL
- Dane dla BI przez warstwę semantyczną (jedna definicja miary — data-analysis), dla aplikacji przez API lub
  zmaterializowane tabele z kontraktem, dla modeli przez magazyn cech.
- **Reverse ETL**: wyniki z hurtowni (segmenty, wynik ryzyka, przychód klienta) wysyłane do narzędzi operacyjnych
  (CRM, marketing, wsparcie). Te same zasady co w potoku: idempotencja, limity API odbiorcy, zgoda RODO na cel
  przetwarzania.

## Testy potoków
- **Jednostkowe**: logika transformacji na małych, ręcznie przygotowanych danych z oczekiwanym wynikiem (qa-spec-first-testing).
- **Testy danych** przy każdym uruchomieniu: schemat, unikalność kluczy, braki, zakresy, relacje, liczba wierszy
  względem poprzedniego dnia (odchylenie ponad próg = alert lub zatrzymanie).
- **Integracyjne i end-to-end** na środowisku testowym z próbką danych; **dymny** test po wdrożeniu; **obciążeniowy**
  przy zmianie skali (qa-performance-testing).

## Checklista
- [ ] potok idempotentny, po partycjach czasu, z backfillem przez zakres dat
- [ ] kontrakt danych ze źródłem; zmiana łamiąca wykrywana w CI
- [ ] orkiestracja z ponowieniami, limitem czasu, alertem i SLA świeżości
- [ ] testy danych przy każdym uruchomieniu; częściowe wyniki nie są publikowane
- [ ] format i partycjonowanie dobrane do zapytań; koszt monitorowany

## Źródła
- J. Reis, M. Housley, *Fundamentals of Data Engineering* (2022) — cykl życia i „nurty”; M. Kleppmann,
  *Designing Data-Intensive Applications*; dokumentacja Apache Airflow, dbt, Apache Iceberg
- [roadmap.sh — Data Engineer](https://roadmap.sh/data-engineer)
Opisane własnymi słowami.
