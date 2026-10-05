# Podstawy: czym jest wzorzec i jak kategorie naprowadzają na problem

## Definicja
Wzorzec projektowy to **nazwany, sprawdzony kształt rozwiązania powtarzającego się problemu projektowego**. Nie jest
gotowym kodem ani biblioteką — to opis ról, relacji i kompromisów, który w każdym projekcie wyrażasz na nowo, w jego
słownictwie i konwencjach.

Opis wzorca (także w plikach tego skilla) składa się z: **problemu** (co boli i dlaczego), **rozwiązania** (role
i relacje), **zastosowań**, **kosztów**, **powiązań** z innymi wzorcami i **przykładu** w konkretnym języku.
Powiązania bywają ważniejsze niż sam wzorzec — wiele par wygląda w kodzie identycznie (Dekorator/Pełnomocnik,
Strategia/Stan, Adapter/Most), a różni je motywacja.

## Wzorzec a algorytm i biblioteka
- **Algorytm** to dokładny ciąg kroków — wykonany tak samo daje ten sam wynik.
- **Wzorzec** opisuje kształt na wyższym poziomie; szczegóły (nazwy, podział, API) należą do projektu. Dwie poprawne
  realizacje tego samego wzorca w jednym repozytorium mogą wyglądać różnie — to nie błąd, tylko dopasowanie.
- **Biblioteki** się importuje; wzorca nie da się „zainstalować”. Przykłady kodu w `kreacyjne/`, `strukturalne/`,
  `behawioralne/` ilustrują kształt — nie wklejaj ich 1:1.

## Trzy kategorie (katalog GoF)
| Kategoria | Pytanie, na które odpowiada | Wzorce |
|---|---|---|
| **Kreacyjne** | **jak i gdzie powstaje obiekt** — kto decyduje o konkretnej klasie, jak złożyć obiekt, ile ma być instancji | Metoda wytwórcza, Fabryka abstrakcyjna, Budowniczy, Prototyp, Singleton |
| **Strukturalne** | **jak elementy są złożone** — kto kogo opakowuje/zawiera, jak pogodzić interfejsy, jak współdzielić dane | Adapter, Most, Kompozyt, Dekorator, Fasada, Pyłek, Pełnomocnik |
| **Behawioralne** | **kto z kim rozmawia i kto za co odpowiada w czasie działania** — przepływ żądań, powiadomień, zmian stanu | Łańcuch zobowiązań, Polecenie, Iterator, Mediator, Pamiątka, Obserwator, Stan, Strategia, Metoda szablonowa, Odwiedzający |

Zaklasyfikowanie problemu do kategorii to pierwszy filtr przed tabelą „symptom → wzorzec” w `SKILL.md`:
- problem z `new`, konfiguracją przy tworzeniu, liczbą instancji → kreacyjne;
- problem ze statycznym kształtem (niezgodne interfejsy, wybuch podklas, drzewa, warstwy) → strukturalne;
- problem z przepływem w czasie (reakcje na zdarzenia, zmiana zachowania ze stanem, kolejkowanie akcji) → behawioralne.

Oryginalna książka GoF dzieli też wzorce na klasowe i obiektowe; tu nie jest to potrzebne — we współczesnym TS niemal
wszystko realizujemy kompozycją obiektów i funkcji.

## Wzorce GoF a pozostałe „wzorce” w repozytorium
| Poziom | Przykłady | Skill |
|---|---|---|
| zasady (dlaczego) | SOLID, KISS, YAGNI, kompozycja > dziedziczenie | eng-design-principles |
| wzorce GoF (jak w kodzie) | ten skill | eng-design-patterns |
| building blocks DDD | agregat, polityka (= strategia), specyfikacja (= kompozyt), fabryka, repozytorium | ddd-tactical-design |
| archetypy biznesowe | Party, Availability, Pricing, Accounting | ddd-archetypes |
| wzorce UI | compound components, stany ładowania, granice błędów | fe-architecture |
| idiomy języka | unie dyskryminowane, generatory, `satisfies` | lang-typescript |

Źródła: E. Gamma, R. Helm, R. Johnson, J. Vlissides, „Design Patterns” (1994); katalog refactoring.guru — treść
opracowana własnymi słowami, przykłady kodu napisane od nowa.
