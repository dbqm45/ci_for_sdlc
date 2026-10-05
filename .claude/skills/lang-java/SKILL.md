---
name: lang-java
description: Użyj przy kodzie Java 17/21+ — konwencje, niezmienność, błędy, pojęcia domenowe (obiekt wartości, warianty, agregat).
metadata:
  katalog: "Użyj przy pisaniu i przeglądzie kodu Java (17/21+) — konwencje języka, niezmienność, obsługa błędów oraz wyrażanie pojęć domenowych (obiekt wartości, warianty, agregat, wynik operacji, zdarzenia) idiomami Javy. Nie do konfiguracji frameworków (Spring, Jakarta — osobne fw-*) ani modelowania domeny (ddd-*)."
  slowa: "Java, wynik operacji, wyjątki czy wynik, sealed interface, record, pattern matching, BigDecimal"
---

# Java

## Zasady języka
1. Celuj w aktualne LTS (21): `record`, `sealed`, pattern matching w `switch`, `var` lokalnie tam, gdzie typ jest oczywisty.
2. Niezmienność domyślnie: pola `final`, kolekcje kopiowane (`List.copyOf`, `Set.copyOf`) przy wejściu i wyjściu.
3. `null` nie jest wartością domenową: walidacja w konstruktorze (`Objects.requireNonNull`), brak wartości → `Optional`
   w zwracanym typie (nie w polach encji JPA ani parametrach).
4. Pieniądze i ilości: `BigDecimal` z jawną skalą i `RoundingMode` — nigdy `double`; porównania `compareTo`, nie `equals`, gdy skala może się różnić.
5. Wyjątki dla błędów programistycznych i infrastruktury; **odrzucenia biznesowe** jako wynik operacji (patrz niżej).
6. Hermetyzacja przez pakiety: typy i konstruktory domyślnie package-private; publiczny tylko interfejs modułu (fasada).
   Granice modułów pilnuj testami architektury (np. ArchUnit) lub JPMS.
7. Bez setterów w modelu domenowym i bez generowania ich hurtem (Lombok `@Data` na encjach domenowych to anty-wzorzec).
8. Domena bez adnotacji frameworka tam, gdzie to możliwe; mapowanie ORM w adapterze albo z minimalnymi adnotacjami.

## Pojęcia domenowe w Javie
| Pojęcie (słownik) | Idiom w Javie |
|---|---|
| **obiekt wartości** | `record` z walidacją/normalizacją w konstruktorze kompaktowym; operacje zwracają nowy rekord |
| **identyfikator / encja** | `record PartyId(String value)` zamiast gołego `String`/`UUID`; encja = klasa z tożsamością i zachowaniem |
| **warianty** | `sealed interface` + `record`-y; wyczerpujący `switch` z wzorcami (kompilator wymusza obsługę nowego wariantu) |
| **wynik operacji** | `sealed interface Result<E, T>` z `Success`/`Failure` albo zdarzenia sukcesu/odrzucenia jako wynik metody |
| **agregat** | `final class` z prywatnym stanem, metody biznesowe zamiast setterów, `version` do blokady optymistycznej, lista zdarzeń oddawana przez `pullEvents()` |
| **maszyna stanów** | stan jako `sealed interface` (np. `Free`/`Blocked`/`Disabled`), przejścia w `switch` z guardami `when` |
| **zdarzenie** | `record` w czasie przeszłym implementujący `sealed interface` zdarzeń modułu |
| **polityka** | interfejs funkcyjny/strategia wstrzykiwana przez fabrykę agregatu |
| **specyfikacja** | `Predicate<T>` z `and/or/negate` albo własny interfejs z nazwą w języku biznesu |
| **repozytorium / port** | `interface` w pakiecie domeny operujący na agregatach; adapter (JPA/JDBC) w infrastrukturze |
| **read model** | osobny `record` + zapytanie (SQL/projekcja) omijające agregat |
| **moduł** | pakiet z publiczną fasadą, reszta package-private; testy architektury pilnują zależności |

Przetestowane implementacje (Money, Party, Result, TimeSlot, agregat ResourceAvailability z maszyną stanów i zdarzeniami,
port repozytorium): `references/domain-building-blocks.md`.

## Zależne od wersji
| Wersja | Zmiany istotne dla tego skilla |
|---|---|
| 17 (LTS) | `record`, `sealed` (finalne), pattern matching dla `instanceof`, bloki tekstowe, wyrażenia `switch` — **bez** wzorców w `switch`: warianty obsłuż `if (x instanceof A a) … else if …` albo wizytatorem; brak guardów `when` |
| 21 (LTS) | pattern matching w `switch` i wzorce rekordów (finalne), guardy `when`, wyczerpujące `switch` na `sealed`; wirtualne wątki; `SequencedCollection` (`getFirst()`, `reversed()`) |

Projekt na nowszym JDK (np. 25 LTS) → `detect_stack.py` zgłosi `SKILL_OUTDATED`; zaktualizuj skill wg core-stack-sync
(zweryfikuj przykłady kompilatorem tej wersji).

## Checklista
- [ ] kompilacja bez ostrzeżeń (`-Xlint:all`)
- [ ] brak `double` dla kwot, brak publicznych setterów w domenie
- [ ] warianty jako `sealed` i wyczerpujące `switch`
- [ ] testy domeny bez kontenera frameworka (czysta Java)
