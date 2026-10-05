---
name: be-database
description: Użyj przy relacyjnej bazie — schemat, migracje, indeksy, zapytania SQL/ORM, transakcje, N+1, wydajność i skalowanie.
metadata:
  katalog: "Użyj przy pracy z relacyjną bazą danych — schemat, migracje, indeksy, zapytania SQL/ORM, transakcje, wydajność zapytań (N+1), wzorce PoEAA (Unit of Work, Identity Map, Data Mapper). Nie do projektowania endpointów (be-api-design) ani infrastruktury bazy (ops-iac-terraform)."
---

# Baza danych

## Migracje — bezpieczne na produkcji
1. Każda zmiana schematu = migracja w repo. Nigdy ręczne zmiany na bazie.
2. Migracje są **wstecznie kompatybilne** z poprzednią wersją aplikacji (deploy i rollback bez przestoju).
3. Wzorzec expand → migrate → contract dla zmian niekompatybilnych:
   - dodaj nową kolumnę (nullable) → zapisuj do obu → backfill partiami → przełącz odczyt → usuń starą w osobnym wydaniu.
4. Nie dodawaj `NOT NULL` bez wartości domyślnej do dużej tabeli w jednym kroku.
5. Indeksy na dużych tabelach: `CREATE INDEX CONCURRENTLY` (PostgreSQL).
6. Migracja danych w partiach (np. 1000 wierszy), nie jednym `UPDATE`.
7. Każda migracja ma sensowny `down` albo jest jawnie oznaczona jako nieodwracalna.

## Zapytania
- Zawsze parametryzowane. Konkatenacja stringów w SQL = błąd krytyczny.
- Wybieraj potrzebne kolumny, nie `SELECT *` w kodzie produkcyjnym.
- Wykrywaj N+1: pętla z zapytaniem w środku → join / `IN (...)` / eager loading.
- Wzorce logiki i dostępu do danych (skrypt transakcji vs model domeny, Active Record vs Data Mapper, Unit of Work,
  Identity Map, lazy loading, ORM do zapisu i SQL do odczytu, DTO i mappery): `references/wzorce-dostepu-do-danych.md`.
- Każde zapytanie po kolumnie w `WHERE`/`JOIN`/`ORDER BY` na dużej tabeli ma indeks — sprawdź `EXPLAIN ANALYZE`.
- Wydajność w produkcji (pula połączeń i jej rozmiar, wolne zapytania i `pg_stat_statements`, VACUUM, repliki,
  widoki zmaterializowane, partycjonowanie, sharding): `references/wydajnosc-bazy.md`.

## Transakcje
- Operacje, które muszą się udać razem, w jednej transakcji; transakcje krótkie, bez wywołań sieciowych w środku.
- Wyścigi: `SELECT … FOR UPDATE`, unikalne ograniczenia lub optymistyczne wersjonowanie.
- Masowy zapis z wersją (`UPDATE … FROM (VALUES …) WHERE version = …`): sprawdź, że liczba zmienionych wierszy = oczekiwanej;
  mniej → konflikt, wycofaj całość.
- **Outbox:** tabela (id nadane przy zapisie, typ, ładunek, status, czas utworzenia; indeks po statusie i czasie) zapisywana w tej
  samej transakcji co stan; sprzątanie wysłanych; wielu pobierających → `FOR UPDATE SKIP LOCKED` lub compare-and-set statusu.
- **Inbox (deduplikacja):** `UNIQUE(message_id)` + `INSERT … ON CONFLICT DO NOTHING` w tej samej transakcji co efekt — nie
  „sprawdź, potem zapisz”. Szczegóły: be-messaging-outbox.

## Read modele
Łączenie ciągłych okresów i agregaty po przedziałach rób funkcjami okna (`LAG`, `SUM() OVER`) w SQL — zamiast pętli w aplikacji.
Dla przedziałów czasu: typy zakresów + ograniczenie wykluczające (PostgreSQL), gdy baza je ma (ddd-archetypes → availability).
Schemat per moduł (np. osobny `schema` w PostgreSQL) wzmacnia granice modułów w monolicie.

## Integralność
- Klucze obce, `UNIQUE`, `CHECK` w bazie — nie tylko walidacja w aplikacji.
- Czas w UTC (`timestamptz`), pieniądze jako `numeric`/liczby całkowite w groszach, nigdy `float`.

## Checklista
- [ ] migracja kompatybilna wstecz i przetestowana (up + down)
- [ ] brak N+1, indeksy dla nowych zapytań
- [ ] brak surowego SQL z konkatenacją
