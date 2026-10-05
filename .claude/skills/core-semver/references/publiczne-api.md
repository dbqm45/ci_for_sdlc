# Publiczne API i rodzaj podbicia — przypadki szczegółowe

Reguła ogólna: zmiana jest **niezgodna wstecz** (MAJOR), jeśli istniejący, poprawny sposób użycia przestaje działać
albo zaczyna działać inaczej bez zmiany po stronie użytkownika.

## Biblioteka (TypeScript, JavaScript, Java)
| Zmiana | Podbicie | Uwagi |
|---|---|---|
| nowa eksportowana funkcja lub klasa | MINOR | |
| nowy opcjonalny parametr na końcu | MINOR | w Javie przeciążenie zamiast zmiany sygnatury |
| nowy wymagany parametr albo zmiana kolejności | MAJOR | |
| zawężenie typu wejścia (`string \| number` → `string`) | MAJOR | kod użytkownika przestaje się kompilować |
| poszerzenie typu wyniku (`string` → `string \| null`) | MAJOR | użytkownik musi obsłużyć nowy przypadek |
| poszerzenie typu wejścia, zawężenie typu wyniku | MINOR | zgodne |
| nowe pole w obiekcie wyniku | MINOR | chyba że typ jest „exact” lub sprawdzany przez równość strukturalną |
| nowy wariant w unii lub enumie zwracanym użytkownikowi | MAJOR | `switch` bez `default` przestaje być wyczerpujący |
| zmiana klasy rzucanego wyjątku | MAJOR | |
| podniesienie minimalnej wersji Node, Javy, przeglądarki | MAJOR | |
| usunięcie eksportu, nawet nieudokumentowanego, którego ktoś używa | MAJOR, jeśli był w publicznym API; inaczej sprawdź, czy był importowalny | dlatego jawne `exports` w package.json |
| oznaczenie `@deprecated` | MINOR | z opisem zastępstwa |

## HTTP API
| Zmiana | Podbicie |
|---|---|
| nowy endpoint, nowa opcjonalna kwerenda, nowe pole w odpowiedzi | MINOR |
| nowe pole wymagane w żądaniu, usunięcie lub zmiana nazwy pola, zmiana typu | MAJOR |
| zmiana kodu statusu lub formatu błędu, na który klient reaguje | MAJOR |
| zaostrzenie walidacji (np. krótszy limit długości) | MAJOR |
| nowa wartość enum w odpowiedzi | MAJOR, chyba że kontrakt zapowiada nieznane wartości |
| zmiana limitów częstości zapytań bez zmiany kontraktu | PATCH (z ogłoszeniem) |

## CLI
- Nowe polecenie lub flaga → MINOR.
- Usunięcie lub zmiana flagi, zmiana kodów wyjścia → MAJOR.
- Zmiana formatu wyjścia czytanego przez skrypty (JSON, kolumny) → MAJOR. Zmiana tekstu dla człowieka → PATCH.

## Aplikacja, serwis, konfiguracja
- Nowa opcjonalna zmienna środowiskowa z bezpieczną wartością domyślną → MINOR.
- Zmiana nazwy zmiennej albo nowa wymagana → MAJOR. Okres przejściowy ze starą nazwą jako aliasem pozwala na MINOR
  z wycofaniem.
- Migracja bazy wymagająca działania operatora → MAJOR. Migracja automatyczna i zgodna wstecz → MINOR lub PATCH.
- Zdarzenia i wiadomości: nowe pole opcjonalne → MINOR; usunięcie lub zmiana znaczenia → MAJOR (be-messaging-outbox,
  testy kontraktu).

## Moduł IaC i obraz kontenera
- Moduł: nowa zmienna z wartością domyślną → MINOR; zmiana, która niszczy i odtwarza zasób → MAJOR.
- Obraz: tag z pełną wersją jest niezmienny. Ruchome tagi (`1`, `1.4`, `latest`) przesuwasz tylko w przód, w obrębie
  zgodności.

## Fabryka (claude-team-factory)
Publiczne API fabryki opisuje `factory/PUBLIC_API.md`. Tam jest też procedura wydania i kontrole CHANGELOG.
