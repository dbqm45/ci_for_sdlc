# Rodzaje i reguły rozbijania na wiersze

| Ranga | Rodzaj | Umowa | Przykład przez granicę |
|---|---|---|---|
| 1 | nazwa | obie strony używają tej samej nazwy | wywołanie `availability.block(...)` |
| 2 | typ | obie strony zgadzają się co do typu | DTO/zdarzenie przekazywane przez granicę |
| 3 | znaczenie | wspólna interpretacja wartości | `status == 3` znaczy „anulowane” po obu stronach |
| 4 | pozycja | kolejność elementów ma znaczenie | `(from, to)` dwóch dat tego samego typu obok siebie |
| 5 | algorytm | ten sam algorytm po obu stronach | ten sam sposób zaokrąglania kwot / hash / normalizacja |
| 6 | kolejność wykonania | wywołania muszą iść w określonej kolejności | najpierw `reserve`, potem `confirm` w drugim module |
| 7 | czas | wynik zależy od czasu wykonania | timeout, okno ponowień, „w ciągu 5 s” |
| 8 | wartość | wartości w dwóch miejscach muszą się zgadzać | liczba miejsc w A i suma rezerwacji w B |
| 9 | tożsamość | obie strony muszą mieć **tę samą instancję** | współdzielony obiekt/cache/połączenie przez DI |

## Reguły rozbijania
- Transakcja obejmująca obie strony → **dwa wiersze**: kolejność wykonania + wartość (dla magazynów, które muszą się zgadzać).
- Typ przechodzący przez granicę → **jeden** wiersz „typ” na szew (nie na każde użycie); użycia podbijają stopień.
- Wiersz „znaczenie” wymaga **dwóch** dowodów: gdzie znaczenie powstaje i gdzie druga strona na nim polega.
- Wiersz „pozycja” tylko przy sąsiadujących parametrach tego samego typu (inaczej kompilator pilnuje typu).
- Dwie równe kopie wartości to „znaczenie” (lub „wartość”, gdy muszą być zsynchronizowane w czasie działania), nie „tożsamość”.
- Typy ze **wspólnego jądra** (shared kernel) zatwierdzonego przez człowieka nie dają wierszy — zapisz to w ramie.

## Szwy sieciowe (HTTP, zdarzenia, pliki)
Nazwa = ścieżka/temat/nazwa pola; typ = schemat; znaczenie = kody/enumy w polach; pozycja = kolumny CSV bez nagłówka;
kolejność = wymagana sekwencja wywołań/zdarzeń; czas = timeouty, TTL, okna ponowień; wartość = dane zdublowane w obu systemach.
