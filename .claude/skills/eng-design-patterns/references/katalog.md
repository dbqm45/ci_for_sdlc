# Katalog 22 wzorców — skrót „kiedy tak / kiedy nie”

Pełny opis w pliku wzorca (problem, rozwiązanie, koszty, powiązania, forma idiomatyczna w TS, przykład sprawdzony
kompilatorem, pułapki).

## Kreacyjne
| Wzorzec | Jednym zdaniem | Kiedy NIE (skrót) | Plik |
|---|---|---|---|
| Metoda wytwórcza | podklasa wymienia tworzony produkt, logika bazowa zostaje | jeden wariant; wystarczy funkcja fabrykująca | `kreacyjne/factory-method.md` |
| Fabryka abstrakcyjna | spójne rodziny obiektów bez znajomości klas | jedna rodzina „na zapas”; częściej przybywa typów niż rodzin | `kreacyjne/abstract-factory.md` |
| Budowniczy | złożony obiekt krokami, walidacja przy `build()` | kilka opcji — obiekt opcji wystarczy | `kreacyjne/builder.md` |
| Prototyp | obiekt sam się klonuje, także z prywatnym stanem | płaskie DTO — `structuredClone`/spread | `kreacyjne/prototype.md` |
| Singleton | jedna instancja + globalny dostęp | prawie zawsze: moduł ES lub zakres DI zamiast klasy | `kreacyjne/singleton.md` |

## Strukturalne
| Wzorzec | Jednym zdaniem | Kiedy NIE (skrót) | Plik |
|---|---|---|---|
| Adapter | tłumaczy cudze API na nasz port | obie strony są nasze — ujednolić u źródła | `strukturalne/adapter.md` |
| Most | dwa niezależne wymiary zmienności jako dwie hierarchie | rośnie tylko jeden wymiar | `strukturalne/bridge.md` |
| Kompozyt | element i grupa pod jednym interfejsem, rekurencyjnie | dane nie są drzewem | `strukturalne/composite.md` |
| Dekorator | warstwy zachowania składane w runtime, ten sam interfejs | 1–2 stałe dodatki; nie mylić z `@dekoratorem` TS | `strukturalne/decorator.md` |
| Fasada | prosty interfejs do złożonego podsystemu | podsystem już jest prosty; fasada-bóg | `strukturalne/facade.md` |
| Pyłek | współdzielenie niezmiennego stanu tysięcy obiektów | brak zmierzonego problemu z pamięcią | `strukturalne/flyweight.md` |
| Pełnomocnik | kontrola dostępu (leniwość, uprawnienia, cache) za tym samym interfejsem | motywacją jest nowe zachowanie (Dekorator) albo wystarczy `if`/`??=` | `strukturalne/proxy.md` |

Dekorator i Pełnomocnik wyglądają w kodzie tak samo — rozstrzyga motywacja.

## Behawioralne
| Wzorzec | Jednym zdaniem | Kiedy NIE (skrót) | Plik |
|---|---|---|---|
| Łańcuch zobowiązań | obsłuż albo przekaż dalej; można przerwać | stała, krótka sekwencja; framework ma middleware | `behawioralne/chain-of-responsibility.md` |
| Polecenie | akcja jako obiekt: kolejka, log, cofanie | bez cofania/serializacji — closure wystarczy | `behawioralne/command.md` |
| Iterator | przechodzenie bez ujawniania struktury | protokół iteracji i generatory są w języku | `behawioralne/iterator.md` |
| Mediator | komponenty rozmawiają przez pośrednika | 2–3 obiekty z jedną relacją; store frameworka | `behawioralne/mediator.md` |
| Pamiątka | migawka stanu bez łamania hermetyzacji | stan niezmienny — historia to tablica stanów | `behawioralne/memento.md` |
| Obserwator | subskrybenci dowiadują się o zmianie | jeden znany odbiorca — callback | `behawioralne/observer.md` |
| Stan | zachowanie zależne od stanu w obiektach-stanach | stany różnią się danymi — unia + `switch` | `behawioralne/state.md` |
| Strategia | wymienny wariant algorytmu/polityki | to zwykle po prostu funkcja; jeden wariant | `behawioralne/strategy.md` |
| Metoda szablonowa | stały szkielet, nadpisywane kroki | różnice rozproszone lub zmienne w runtime — Strategia | `behawioralne/template-method.md` |
| Odwiedzający | nowe operacje na stabilnej hierarchii typów | typy często przybywają; mało typów i operacji | `behawioralne/visitor.md` |

Polecenie, Iterator i Strategia najczęściej mają w TS lżejszą formę niż klasowa — `krytyka-i-pulapki.md`, pkt 1.
