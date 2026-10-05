---
name: eng-clean-code
description: Użyj przy czytelności kodu w dowolnym języku — nazwy, funkcje, komentarze, obsługa błędów, zapachy, małe refaktoryzacje.
metadata:
  katalog: "Użyj przy pisaniu, przeglądzie i refaktoryzacji kodu w dowolnym języku — nazewnictwo, funkcje, komentarze, obsługa błędów, zapachy kodu i bezpieczne refaktoryzacje małymi krokami. Nie do zasad architektonicznych (eng-design-principles) ani idiomów konkretnego języka (lang-*)."
  slowa: "null jako znaczenie, zwracanie null, czytelność, nazwy zmiennych, długa funkcja, refaktoryzacja, Optional, Null Object"
---

# Czysty kod i refaktoryzacja

## Nazwy
- Nazwa mówi **co i po co**, językiem domeny (ubiquitous language): `blockResource`, nie `process`, `handleData`, `doStuff`.
- Bez skrótów i szumu (`Manager`, `Helper`, `Util`, `Data`, `Info`) — jeśli pasuje tylko taka nazwa, odpowiedzialność jest niejasna.
- Wartości logiczne jako pytania (`isAvailable`, `hasRole`); kolekcje w liczbie mnogiej; jednostki w nazwie, gdy typ ich nie niesie.

## Funkcje
- Robią jedną rzecz na jednym poziomie abstrakcji; długość to sygnał, nie reguła (> ~30 linii → sprawdź).
- Mało parametrów (≤ 3); więcej → obiekt parametrów / obiekt wartości. Brak parametrów-flag (`save(true)`) → dwie funkcje.
- Rozdziel polecenia (zmieniają stan) od zapytań (zwracają dane) — CQS.
- Wczesny powrót zamiast głębokich zagnieżdżeń.
- **Złożoność cyklomatyczna** (liczba niezależnych ścieżek: 1 + punkty decyzji `if`, pętle, `case`, `&&`, `||`, `?:`):
  powyżej ok. 10 na funkcję (próg McCabe'a) — dziel. Sposoby: klauzule strażnicze, wydzielenie funkcji, tabela lub mapa
  zamiast długiego `switch`, polimorfizm zamiast `switch` po typie powtarzanego w wielu miejscach. W lincie: reguła ESLint
  `complexity` (domyślny próg 20 — ustaw niższy) albo złożoność kognitywna z SonarJS (domyślnie 15), w Javie Sonar
  lub Checkstyle `CyclomaticComplexity`. Liczba przypadków testowych rośnie razem ze złożonością (qa-test-design).
- **Nie przekazuj `null`** jako znaczenia („brak klienta”, „użyj domyślnego”): osobna funkcja lub przeciążenie, obiekt
  pusty (Null Object), pusta kolekcja zamiast `null`, typ opcjonalny. W TS `strict` (w tym `strictNullChecks`),
  `null`/`undefined` sprawdzane raz na granicy (wejście API, odczyt z bazy), w Javie `Optional` tylko jako typ zwracany.

## Komentarze
- Kod mówi *co*, komentarz *dlaczego* (decyzja, ograniczenie, link do ADR/issue). Zakomentowany kod usuwamy.
- Publiczne API dokumentuj (kontrakt, wyjątki, jednostki).

## Błędy
- Nie połykaj wyjątków; nie zwracaj `null` jako sygnału błędu — typ opcjonalny lub wynik operacji.
- Komunikat błędu mówi, co się stało i co zrobić; bez danych wrażliwych.

## Zapachy → refaktoryzacje (małymi krokami, testy zielone po każdym)
| Zapach | Refaktoryzacja |
|---|---|
| długa funkcja | wydziel funkcję; zamień pętlę na potok |
| powtórzona reguła biznesowa | przenieś do jednego miejsca (obiekt wartości, polityka) |
| długa lista parametrów, zbitki danych | obiekt parametrów / obiekt wartości |
| obsesja typów prostych (kwota jako liczba) | obiekt wartości |
| `switch` po typie w wielu miejscach | polimorfizm / warianty / polityka |
| zazdrość o dane (metoda używa cudzych pól) | przenieś metodę |
| rozproszona zmiana (jedna zmiana → wiele plików) | zbierz odpowiedzialność w jednym module |
| pole-flaga stanu | maszyna stanów / osobne pojęcia |
| powtarzalny problem strukturalny (fabryki, warianty, warstwy, powiadomienia) | wzorzec z eng-design-patterns — najpierw jego lżejsza forma |
| martwy kod | usuń (historia jest w git) |

## Jak refaktoryzować
1. Testy charakteryzujące, jeśli ich brak. 2. Jeden krok naraz. 3. Refaktor w osobnym commicie (`refactor:`), bez zmiany zachowania.
4. Najpierw zrób zmianę łatwą, potem zrób łatwą zmianę.

## Przykład
**Sytuacja:** review `process(data, owner: string | null, notify: boolean)` — zagnieżdżone `if`, `null` znaczy „system”.
**Wynik:** nazwa z domeny `blockResource(resourceId, ownerId)`; flaga → osobne `blockResourceAndNotify`; `null` →
`blockResourceBySystem(resourceId)`; wczesny powrót zamiast trzech poziomów `if`. Każdy krok osobno, testy zielone,
commit `refactor:`; zmianę zwracanego `boolean` na wynik operacji (CQS) proponujesz w osobnym PR.
Więcej przykładów: `references/przyklady.md`.
