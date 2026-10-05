---
name: ddd-tactical-design
description: Użyj przy modelu wewnątrz kontekstu — agregaty, encje, obiekty wartości, zdarzenia, polityki, saga, CQRS.
metadata:
  katalog: "Użyj przy projektowaniu modelu wewnątrz kontekstu — building blocks (agregat, encja, obiekt wartości, serwis, polityka, specyfikacja, fabryka, repozytorium, zdarzenia, saga), warstwy, granice spójności, CQRS, ocena sprzężeń przez connascence. Nie do granic i relacji kontekstów (ddd-strategic-analysis, ddd-context-mapping)."
  slowa: "magiczne wartości, zduplikowany algorytm, agregat, granica transakcji, obiekt wartości"
---

# Projekt taktyczny

## Warstwy
- **Warstwa aplikacji** — cienkie serwisy aplikacyjne: realizują przypadek użycia, zarządzają transakcją i bezpieczeństwem,
  pobierają agregaty z repozytoriów, wywołują metody biznesowe, zapisują, publikują zdarzenia. **Bez reguł biznesowych.**
- **Warstwa domeny** — czyste reguły biznesowe, bez frameworków i infrastruktury; testowalna bez serwera i bazy.
- Operuj identyfikatorami na wejściu serwisu aplikacyjnego (klient nie przekazuje „gotowych” obiektów domenowych).
- Architektura heksagonalna: domena w środku, porty (interfejsy) definiuje domena, adaptery (REST, baza, kolejki) na zewnątrz.

## Building blocks — kiedy którego użyć
| Element | Użyj, gdy | Zasady |
|---|---|---|
| **Obiekt wartości** | pojęcie opisane wartościami, bez tożsamości (kwota, okres, adres, prawdopodobieństwo) | niezmienny, sam się waliduje; zastępuje prymitywy i usuwa rozproszone walidacje („150 miejsc sprawdzania nulla”) |
| **Encja** | liczy się tożsamość i cykl życia | tylko odpowiedzialności właściwe jej naturze |
| **Agregat** | grupa obiektów, które muszą być spójne natychmiast | jeden korzeń; zmiany tylko metodami biznesowymi (bez setterów); jedna transakcja = jeden agregat; odwołania do innych agregatów przez ID |
| **Serwis domenowy** | operacja nie należy naturalnie do żadnego agregatu (transformacja, obliczenie na kilku obiektach) | bezstanowy; zapobiega „klasom-bogom” |
| **Polityka** | reguła ma warianty (np. rabatowanie, naliczanie kar) | wzorzec strategii; nowe warianty bez zmiany rdzenia (supple design) |
| **Specyfikacja** | złożone warunki biznesowe do łączenia (i/lub/nie) | wzorzec kompozytu; nazwa warunku w języku biznesu |
| **Fabryka** | tworzenie złożonego agregatu wymaga decyzji (jakie polityki, jacy współpracownicy) | gwarantuje poprawny stan od początku; mniej `new` w domenie = łatwiejsze testy |
| **Repozytorium** | trwałość agregatów danego typu | kolekcja agregatów, nie DAO z setkami metod pod ekrany; zapytania pod operacje biznesowe |
| **Zdarzenie domenowe** | coś ważnego się wydarzyło i inni mogą chcieć zareagować | czas przeszły, niezmienne; umożliwia rozszerzenia, asynchroniczność, luźne sprzężenie |
| **Saga / proces menedżer** | proces trwa długo i obejmuje wiele zdarzeń/agregatów | stan procesu zapisany; reaguje na kolejne zdarzenia; kompensacje |
| **Maszyna stanów** | zachowanie zależy od stanu | jawne przejścia i warunki zamiast rozproszonych `if (status == …)` |
| **Decider (funkcyjny rdzeń)** | chcesz oddzielić decyzję od efektów (testowalność, droga do event sourcingu) | `decide(stan, komenda)` → nowy stan / zdarzenia / odrzucenie; niezmienny stan; I/O w powłoce: wczytaj → decyduj → zapisz → publikuj. Przejście z bogatego agregatu: eng-behavior-preserving-refactoring |

Heurystyka: metody charakterystyczne i wielokrotnie używane w wielu przypadkach użycia → do agregatu;
specyficzne dla jednego przypadku → do serwisu.

## Projektowanie agregatów
1. Wyjdź od **niezmienników** (żółte kartki z Design Level), nie od rzeczowników i relacji w bazie.
2. Zapytaj o **konkurencję o zasoby**: kto zmienia jednocześnie? co jeśli dwie osoby zrobią to naraz? (ddd-deep-modeling)
3. Najmniejsza granica, która chroni niezmiennik. Duży agregat = konflikty i ładowanie zbędnych danych.
4. Reguły między agregatami → spójność ostateczna (zdarzenia, polityki), chyba że biznes naprawdę wymaga natychmiastowej.
5. **Agregat dynamiczny**: gdy granica zależy od żądania (np. zablokuj zasób w przedziale czasu → wczytaj tylko segmenty
   czasu, których dotyczy żądanie), składaj agregat z mniejszych jednostek na potrzeby operacji (ddd-archetypes → dostępność).
6. Wersjonowanie optymistyczne na korzeniu agregatu.
7. **Kto publikuje zdarzenia?** (a) agregat zwraca zdarzenie lub odrzucenie z metody biznesowej, serwis aplikacyjny je publikuje —
   jawne, łatwe w testach; (b) agregat gromadzi zdarzenia, serwis je „wyciąga” po zapisie. Oba OK — wybierz jeden w projekcie.
   Publikacja z pamięci „po commicie” gubi zdarzenia przy awarii; gdy to niedopuszczalne → outbox (be-messaging-outbox).
8. **Saga** trzyma stan procesu i jawny typ kroku; decyzję „co dalej” podejmuje saga (czysto), wykonanie kroków — osobny dispatcher.
9. Anty-wzorzec: metoda, która jednocześnie **mutuje** obiekt i **zwraca nową instancję** — wybierz jedno (niezmienny VO albo mutacja agregatu).

## Odczyty — CQRS
Gdy odczyty i zapisy mają różne potrzeby: model zapisu chroni reguły, osobne **read modele/projekcje** służą ekranom i raportom.
Nie dodawaj CQRS „na zapas” — to dodatkowa złożoność; uzasadnij różnicą wzorców dostępu.

## Anty-wzorce
- **Anemiczny model** — encje jako worki danych z getterami/setterami, logika w serwisach.
- Encje jako DTO na zewnątrz kontekstu; mieszanie modeli kontekstów.
- Gettery/settery pozwalające dowolnie zmienić stan z pominięciem reguł.
- Dziedziczenie tam, gdzie wystarczy kompozycja lub polityka.
- Pola-flagi (`isReserved`, `inMaintenance`, `isCustomer`) zamiast osobnych pojęć lub archetypu.

## Connascence — ocena sprzężeń
Dwa elementy są współzależne (connascent), gdy zmiana jednego wymusza zmianę drugiego. Oceniaj trzy cechy:
- **Siła** (od słabszej): statyczne — nazwa → typ → znaczenie (umowne wartości) → pozycja → algorytm;
  dynamiczne (silniejsze) — kolejność wykonania → czas → wartość → tożsamość.
- **Stopień** — ile elementów jest związanych. **Lokalność** — jak daleko od siebie są.

Zasady: silne connascence akceptuj tylko **lokalnie** (w obrębie agregatu/modułu); przez granice kontekstów dopuszczaj
najsłabsze (nazwa, typ — przez Published Language). Refaktoryzuj w stronę słabszych form:
- magiczne wartości („2 = anulowane”) → obiekt wartości / enum (znaczenie → nazwa);
- długie listy parametrów tego samego typu → obiekt parametrów (pozycja → nazwa);
- ten sam algorytm (np. wyliczanie ceny, hash) w dwóch miejscach → jedno źródło (algorytm → nazwa);
- dwa konteksty muszą mieć „tę samą wartość” danych → jeden właściciel + zdarzenia (wartość → typ zdarzenia);
- wymagana kolejność wywołań → jedna metoda biznesowa lub maszyna stanów (kolejność → nazwa).

Powtarzalny **pomiar** sprzężenia między dwoma modułami (rozbicie na umowy, stopień z linii kodu, koszt, profil pasm):
ddd-connascence-analysis. Wspólna transakcja przez granicę to dwie umowy — kolejność wykonania i wartość.

## Testy domeny
Testuj zachowanie agregatów i polityk przez ich publiczne metody, na przykładach z modelowania (Given/When/Then),
bez bazy i frameworka. Zdarzenia to dobre asercje („po X powstało zdarzenie Y”).
