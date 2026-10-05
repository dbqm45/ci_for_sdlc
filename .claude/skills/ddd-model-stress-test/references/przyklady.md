# Przykłady — test obciążeniowy modelu

## 1. Marża na projekcie: od briefu do raportu wpływu
**Sytuacja.** „Software house, system do prowadzenia projektów klientów. Moduły: `oferty`, `projekty`, `czas-pracy`,
`fakturowanie`. Sprawdź, czy model wytrzyma to, czego zarząd zechce za rok. Metryka zarządu: marża na projekcie.”

**Jak.**
1. **Metryka** podana przez człowieka dosłownie — „marża na projekcie”; nie zmieniam jej i nie dopisuję własnej.
2. **Brief** (`_blind/brief.md`) o działalności: wyceny ryczałtowe i godzinowe, kary za opóźnienia, ławka między projektami,
   skala 30 projektów rocznie. Nazwy modułów usunięte; test lustra i niezmienności przechodzi.
3. **Generator** `blind-analyst` jako podagent: dostaje tylko metrykę, ścieżkę briefu i liczbę wymagań (8). Każde wymaganie
   ma Prośbę, Mechanizm i Podstawę. Człowiek zatwierdza i zamraża zbiór.
4. **Ocena wpływu** dopiero teraz, z inwentarzem zdolności modułów (`stress/modules.md`): używa / rozszerza / zyskuje /
   bez miejsca, klasa górną granicą, każdy wiersz z „dlaczego”.

**Wynik** — wymaganie z generatora (`_blind/requirements.md`):
```markdown
### W-3
Prośba: co gdyby biznes chciał wyceniać projekty ryczałtowe z rezerwą na ryzyko zależną od rodzaju klienta?
Mechanizm: rezerwa pokrywa przekroczenia godzin → mniej projektów z ujemnym wynikiem → wyższa średnia marża.
Podstawa: brief, „Gdzie tracimy”: „co trzeci ryczałt przekracza budżet godzin”.
```
Fragment raportu (`stress/marza-na-projekcie.md`):

| Wymaganie | oferty | projekty | czas-pracy | fakturowanie | Klasa | Dlaczego |
|---|---|---|---|---|---|---|
| W-1 alert, gdy zużyte godziny > 80% budżetu | używa | rozszerza | używa | — | lokalne (1) | budżet żyje w projekcie, godziny tylko odczytywane |
| W-3 rezerwa na ryzyko w ryczałcie | rozszerza | używa | — | rozszerza | rozproszone (2) | rezerwa zmienia wycenę i kwotę na fakturze końcowej |
| W-5 koszt ławki doliczany do projektów | — | rozszerza | rozszerza | — | rozproszone (2) | czas bez projektu nie ma dziś właściciela |
| W-7 premia od marży dla kierownika projektu | — | używa | — | używa | nowy moduł: 0 (+1 nowy) | wynagrodzenia — żaden moduł nie jest naturalnym miejscem |

Rozkład klas (8 wymagań): lokalne 3 · rozproszone 4 · nowy moduł 1. Zestawienie per moduł: `projekty` — 4 zmiany, 3 użycia;
`fakturowanie` — 2 zmiany. Bez ocen jakości; nota: „ten zbiór można powtórzyć na innej dekompozycji”.

## 2. Ten sam zbiór, dwie dekompozycje
**Sytuacja.** „Architekt proponuje połączyć `czas-pracy` z `projekty` w jeden moduł `realizacja`. Czy to lepszy podział?”

**Jak.**
1. Nie generuję nowych wymagań — biorę **zamrożony** zbiór z przykładu 1 (8 wymagań).
2. Powtarzam tylko krok 5 (ocenę wpływu) dla wariantu B.
3. Pokazuję, gdzie każdy wariant się napina; nie rozstrzygam — decyzja i ADR należą do człowieka (ddd-strategic-analysis).

**Wynik**:

| Klasa | Wariant A (4 moduły) | Wariant B (`realizacja`) |
|---|---|---|
| lokalne (0–1) | 3 | 5 |
| rozproszone (≥ 2) | 4 | 2 |
| nowy moduł | 1 | 1 |
| moduł z największą liczbą zmian | `projekty` (4) | `realizacja` (6) |

Obserwacja do ADR: B lokalizuje W-5 i W-6, ale skupia 6 zmian w jednym module — tam przenosi się napięcie.
W-7 w obu wariantach wymaga nowego modułu.

## 3. Metryka opisana rozwiązaniem i brief, który nie przeszedł testu lustra
**Sytuacja.** „Potrząśnij modelem sklepu. Metryka: szybsze API zamówień.”

**Jak.**
1. „Szybsze API” to rozwiązanie, nie liczba biznesowa → przeformułowanie **z człowiekiem** (bramka); propozycja:
   „czas od zamówienia do dostawy”, człowiek potwierdza brzmienie.
2. Pierwsza wersja briefu ma sekcje „Katalog”, „Koszyk”, „Płatności”, „Wysyłka” — 1:1 z modułami → test lustra nie przechodzi.
3. Przepisuję brief wokół działań biznesu i usuwam czasowniki ostrzegawcze (*synchronizuje*, *wysyła*).
4. Test niezmienności: brief brzmiałby tak samo dla sklepu prowadzonego z zeszytem i telefonem.

**Wynik** — zmiana briefu:

| Przed (zawiera rozwiązanie) | Po (działalność) |
|---|---|
| „Moduł Płatności synchronizuje status z operatorem i wysyła zdarzenie do Wysyłki.” | „Paczkę pakujemy dopiero po potwierdzeniu wpłaty; przy przelewie tradycyjnym czekamy średnio 1,5 dnia.” |
| „Wysyłka przechowuje w bazie trzy kurierów.” | „Współpracujemy z trzema firmami kurierskimi; jedna odbiera paczki tylko do 14:00.” |
| sekcje: Katalog · Koszyk · Płatności · Wysyłka | sekcje: Kto kupuje i dlaczego · Od zamówienia do paczki · Gdzie tracimy czas i pieniądze · Słownik |
