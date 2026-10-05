# Odczyt tablicy Event Stormingu ze zdjęcia lub eksportu

## Zasady
- Czytaj tablicę jako **ponumerowany przepływ w każdym torze** (swimlane), a nie jako worki kartek wg koloru.
  Typ kartki dopisz w nawiasie: `7. Rezerwacja potwierdzona (zdarzenie)`.
- Zdarzenia przełomowe i hot spoty zapisuj jako **indeksy do kroków** (`przełomowe: Klient/7, Planista/3`), bez powtarzania treści.
- Niepewność oznaczaj jawnie: `[nieczytelne]`, `[częściowo: „Rezerw…”]`, `[kolejność niepewna]`. Te miejsca nie są dowodem,
  dopóki człowiek ich nie potwierdzi.
- Nie „poprawiaj” tablicy: literówki i dziwne sformułowania zostają — to język uczestników.

## Stałe sekcje wyniku (`02-domain/boards/<nazwa>.es.md`)
Legenda (kolory → typy) · Tory · Przepływ (per tor, numerowany) · Zdarzenia przełomowe (indeksy) · Hot spoty (indeksy) ·
Słownik (pojęcia z kartek) · Obserwacje z układu (np. „tor Finanse pusty po kroku 5”).
Nagłówek zawiera **skrót (hash) pliku obrazu** (`sha256sum` — liczy agent z powłoką, np. orkiestrator) i wersję instrukcji odczytu — zmiana obrazu unieważnia tylko ten opis.

## Bramka jakości
Pokaż człowiekowi: liczbę kartek per typ i tor, **3 losowe kartki z różnych torów** do porównania ze zdjęciem, liczbę
nieczytelnych. Gdy nieczytelna jest więcej niż co 10. kartka — poproś o lepsze wejście (eksport z narzędzia, zdjęcie per tor)
zamiast ponawiać odczyt.
