# Jak sprawdzić twierdzenie, zanim je napiszesz

Najpierw sprawdzenie najtańsze i najpewniejsze: plik w repozytorium, polecenie, dokumentacja wersji używanej
w projekcie. Pamięć modelu jest na końcu i tylko dla wiedzy stałej.

| Twierdzenie | Sprawdzenie (przykłady) |
|---|---|
| plik, katalog, symbol istnieje | `ls`, `git ls-files <ścieżka>`, Grep po nazwie; podaj `plik:linia` |
| funkcja robi X | przeczytaj ją (Read) i jej testy; nie wnioskuj z nazwy |
| test / build przechodzi | uruchom polecenie z CLAUDE.md i pokaż wynik; „powinno przejść” to nie dowód |
| wersja zależności w projekcie | `python3 .claude/hooks/detect_stack.py`, `package.json`, `pom.xml` (core-stack-sync) |
| najnowsza wersja pakietu, czy pakiet istnieje | `npm view <pakiet> version`, `npm view <pakiet> time.modified`; Maven Central; core-source-research |
| flaga CLI, opcja konfiguracji | `<narzędzie> --help`, dokumentacja dla wersji z projektu; schemat konfiguracji |
| API biblioteki (metoda, parametr) | typy w pakiecie (`grep` w konkretnym pliku `.d.ts` paczki, bez czytania całego `node_modules`), dokumentacja wersji |
| zachowanie przeglądarki lub platformy | dokumentacja (MDN, specyfikacja) z datą; tabela obsługi |
| CVE, RFC, numer normy, artykuł ustawy | źródło pierwotne (NVD, IETF, Dziennik Ustaw / EUR-Lex) z datą odczytu |
| cena, limit usługi, termin prawny | strona dostawcy lub akt prawny z datą; zaznacz, że może się zmienić |
| liczba w szacunku | pokaż rachunek (dane wejściowe × przelicznik); policz poleceniem, gdy to możliwe |
| cytat z dokumentu, rozmowy, issue | dosłowny fragment z miejscem; parafraza oznaczona jako parafraza |
| „ktoś zgłaszał / społeczność uważa” | core-source-research: konkretne źródła z datą, a nie ogólne „wiadomo, że” |

## Oznaczenia pewności (gdy nie da się sprawdzić)
- **[sprawdzone: <jak>]** — wynik polecenia, plik:linia, źródło z datą.
- **[założenie]** — wniosek z dostępnych danych; dopisz, jak go potwierdzić.
- **[niezweryfikowane]** — fakt z pamięci, którego teraz nie da się sprawdzić (np. brak sieci); dopisz ryzyko.
- **nie wiem** — gdy nie ma podstaw nawet do założenia; zaproponuj, kto lub co da odpowiedź.

## Sygnały, że odpowiedź może być zmyślona
- Bardzo konkretna nazwa (flaga, opcja, metoda), która nie pojawiła się w żadnym przeczytanym pliku ani źródle.
- Liczba bez rachunku lub źródła („zwykle 30%”, „limit to 1000”).
- Odpowiedź idealnie dopasowana do pytania z fałszywym założeniem.
- Powtarzane poprawki tej samej rzeczy w jednej sesji: kontekst jest zaśmiecony, a model zaczyna łatać objawy.

Opisane własnymi słowami.
