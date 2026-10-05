# Stopień i koszt

## Co liczymy jako miejsce (stopień)
- jedno miejsce = jedna linia kodu produkcyjnego, która **zmieniłaby się**, gdyby umowa się zmieniła;
- nie liczymy: importów, nieużywanych deklaracji, komentarzy; testy — osobna kolumna (informacyjnie);
- funkcja pomocnicza, która zamyka umowę w jednym miejscu, liczy się jako **jedno** miejsce (to dobra praktyka — ma to być widać);
- jedna linia może liczyć się w kilku wierszach, jeśli wiąże kilka umów.

| Rodzaj | Liczymy |
|---|---|
| nazwa | wywołania/odwołania po drugiej stronie |
| typ | miejsca konstruujące lub rozpakowujące typ po drugiej stronie |
| znaczenie | miejsca interpretujące wartość (porównania, mapowania) po obu stronach |
| pozycja | wywołania z pozycyjną listą argumentów |
| algorytm | kopie algorytmu |
| kolejność | kroki, które muszą zachować kolejność |
| czas | miejsca z założeniem czasowym (timeout, retry, sleep) |
| wartość | zapisy do każdego z magazynów, które muszą się zgadzać |
| tożsamość | komponenty otrzymujące tę samą instancję |

## Koszt wiersza
`koszt = ranga × log2(1 + stopień)`, zaokrąglony do 0,01. Stopień jako przedział → licz **górną** granicą.
Logarytm: dziesiąte miejsce boli mniej niż drugie, ale rodzaj (ranga) dominuje.

## Sortowanie (deterministyczne)
koszt malejąco → pierwsza ścieżka źródła → linia → id wiersza.

## Pasma
statyczne słabe (1–2) · statyczne semantyczne (3–5) · dynamiczne (6–9). Wiersz z > 8 źródłami: pełna lista w załączniku.
