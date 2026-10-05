---
name: eng-design-patterns
description: Użyj przy projekcie i review, gdy kusi wzorzec GoF — diagnoza symptom → wzorzec, kiedy nie, lżejsze formy w TS.
metadata:
  katalog: "Użyj, gdy projektujesz lub refaktoryzujesz kod i rozważasz wzorzec GoF albo oceniasz jego użycie w review — diagnoza „symptom → wzorzec”, kiedy NIE używać, klasyfikacja, 22 wzorce (fabryki, budowniczy, adapter, dekorator, pełnomocnik, obserwator, stan, strategia, odwiedzający…) z lżejszymi formami w TS. Nie do zasad SOLID/KISS (eng-design-principles) ani building blocks DDD (ddd-tactical-design)."
---

# Wzorce projektowe (GoF)

Wzorzec to odpowiedź na **rozpoznany, powtarzający się problem** — nie cel sam w sobie. Zaczynaj od nazwania problemu
w kodzie; jeśli go nie umiesz nazwać (zmienność, która się powtarza, bolesne sprzężenie, wybuch podklas), wzorca nie
potrzebujesz. Prostszy kod wygrywa remis (`references/krytyka-i-pulapki.md`).

## Jak pracować
1. **Nazwij problem, nie wzorzec**: co wymaga edycji w wielu miejscach? który `switch` rośnie? co jest trudne do testu?
2. **Zawęź kategorią**: tworzenie obiektów → kreacyjne; statyczny kształt i składanie → strukturalne; przepływ w czasie
   → behawioralne (`references/podstawy.md`).
3. **Dobierz kandydata** z tabeli niżej i przeczytaj jego plik — zwłaszcza „Kiedy NIE używać”.
4. **Wybierz najlżejszą formę**, jaką daje język (funkcja, closure, unia, generator, moduł), zanim sięgniesz po
   hierarchię klas z podręcznika.
5. **W review** proponuj wzorzec tylko przy wskazanym, powtarzającym się problemie; w uwadze podaj problem, koszt
   i prostszą alternatywę (format uwag — eng-design-principles).

## Symptom → kandydat
| Symptom w kodzie | Kandydat | Najpierw sprawdź lżejsze |
|---|---|---|
| `new` konkretnej klasy wewnątrz logiki, `switch` po typie przy tworzeniu | Metoda wytwórcza | funkcja fabrykująca |
| elementy muszą pochodzić z jednej „rodziny” (kraj, platforma, motyw) | Fabryka abstrakcyjna | mapa `Record<Rodzina, Kit>` |
| konstruktor z wieloma opcjami, obiekt składany warunkowo, walidacja całości | Budowniczy | obiekt opcji z domyślnymi |
| kopiowanie obiektu bez znajomości klasy, z prywatnym stanem | Prototyp | `structuredClone`, niezmienność |
| „musi być jedna instancja” | Singleton (ostrożnie) | moduł ES, zakres DI |
| cudze API nie pasuje do naszego portu | Adapter | funkcja mapująca |
| klasy = iloczyn dwóch cech (`CsvRevenue`, `PdfRevenue`…) | Most | kompozycja jednego wymiaru |
| element i grupa elementów, drzewo dowolnej głębokości | Kompozyt | unia + rekurencja |
| retry/cache/log/metryki w różnych kombinacjach | Dekorator | funkcja wyższego rzędu, middleware |
| wywołujący koordynuje 4 moduły w ustalonej kolejności | Fasada | funkcja przypadku użycia |
| dziesiątki tysięcy obiektów powtarzają te same dane (zmierzone) | Pyłek | — |
| leniwa inicjalizacja, uprawnienia, cache przed istniejącą usługą | Pełnomocnik | `??=`, `Map`, `if` |
| „obsłuż albo przekaż dalej”, zmienny skład kroków | Łańcuch zobowiązań | tablica funkcji |
| akcje do kolejki, dziennika, cofania | Polecenie | closure w mapie |
| przechodzenie po stronicowanym API/drzewie bez ujawniania struktury | Iterator | generator, `Symbol.iterator` |
| komponenty UI znają się nawzajem „każdy z każdym” | Mediator | kontener/store stanu |
| cofnij/wersje przy prywatnym stanie | Pamiątka | historia niezmiennych stanów |
| wielu odbiorców zmiany, zbiór zmienny w runtime | Obserwator | `EventTarget`, RxJS, sygnały |
| ten sam `switch (status)` w wielu metodach | Stan | unia dyskryminowana + `switch` |
| `switch` wybierający wariant algorytmu/reguły | Strategia | funkcja jako parametr |
| kilka klas z prawie identycznym procesem | Metoda szablonowa | funkcja szkieletu + obiekt kroków |
| nowe operacje na stabilnym zbiorze typów węzłów | Odwiedzający | unia + funkcja ze `switch` |

Pary łatwe do pomylenia (rozstrzyga motywacja, nie kształt): Dekorator/Pełnomocnik, Strategia/Stan, Adapter/Most/Fasada,
Łańcuch/Dekorator, Mediator/Fasada — sekcje „Powiązania” w plikach wzorców.

## Kiedy NIE sięgać po wzorzec
- Jest jeden wariant i brak konkretnego drugiego na horyzoncie (YAGNI).
- Prosty warunek lub funkcja jest krótsza i równie jasna.
- Mechanizm frameworka już to robi (DI, middleware, interceptory, store, sygnały) — nie dubluj.
- Struktura wzorca jest widoczna, a problemu, który miała rozwiązać, nie ma.
- `@dekorator` w TS to mechanizm języka, nie wzorzec Dekorator.

## Granice z sąsiednimi skillami
- **eng-design-principles** — *dlaczego* (SOLID, KISS, kompozycja > dziedziczenie, rozstrzyganie konfliktów);
  ten skill — *jaki kształt* w kodzie.
- **eng-clean-code** — zapachy kodu i bezpieczne kroki refaktoryzacji; przejście na wzorzec rób małymi krokami
  (eng-behavior-preserving-refactoring).
- **ddd-tactical-design** — polityka (= Strategia nazwana językiem biznesu), specyfikacja (= Kompozyt warunków),
  fabryka agregatu, maszyna stanów, zdarzenia; tam decydujesz o modelu, tu o technice.
- **ddd-archetypes** — archetypy to poziom modelu biznesowego, nie wzorce GoF.
- **fe-architecture** — wzorce UI (compound components, stany ładowania, granice błędów).
- **lang-typescript** — idiomy, którymi realizujesz lżejsze formy (unie, generatory, `satisfies`, `#pola`, `using`).

## Materiały (czytaj tylko potrzebny plik)
- `references/podstawy.md` — gdy trzeba wyjaśnić, czym jest wzorzec, czym różni się od algorytmu/biblioteki,
  klasyfikacja i mapa „wzorce w repozytorium”.
- `references/krytyka-i-pulapki.md` — przed zaproponowaniem wzorca w review/refaktorze; tabela lżejszych form w TS,
  sygnały nadużycia.
- `references/katalog.md` — gdy wybierasz między kilkoma kandydatami: 22 wzorce z „jednym zdaniem” i „kiedy NIE”.
- `references/kreacyjne/{factory-method,abstract-factory,builder,prototype,singleton}.md`
- `references/strukturalne/{adapter,bridge,composite,decorator,facade,flyweight,proxy}.md`
- `references/behawioralne/{chain-of-responsibility,command,iterator,mediator,memento,observer,state,strategy,template-method,visitor}.md`
  — pełny opis wzorca: problem, uczestnicy, kiedy używać, koszty, powiązania, forma idiomatyczna w TS, przykład,
  pułapki. Przykłady (30 bloków) kompilują się w TS 6.0.3 i 7.0.2 (`strict`, `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `erasableSyntaxOnly`) i uruchamiają w Node 22 przez usuwanie typów — bez `enum`
  i parameter properties.

## Checklista
- [ ] Problem nazwany konkretnie i występuje co najmniej drugi raz (nie „na przyszłość”)
- [ ] Sprawdzona lżejsza forma w języku / mechanizm frameworka
- [ ] Przeczytane „Kiedy NIE używać” wybranego wzorca
- [ ] Liczba nowych typów proporcjonalna do zysku; nazwy z domeny, nie z nazwy wzorca
- [ ] Reguły biznesowe zostały w domenie (polityki, specyfikacje), nie w warstwie technicznej

Źródła: katalog GoF (Gamma, Helm, Johnson, Vlissides, 1994) i refactoring.guru — opisy przeredagowane własnymi
słowami, przykłady kodu napisane od nowa.
