# Ocena wpływu wymagań na moduły

1. **Inwentarz modułów**, a gdy źródła pozwalają — **inwentarz zdolności** (operacje publiczne / fasady) każdego modułu.
2. Dla każdego wymagania i modułu — **sprawdzenie budowy**:
   - **używa** — korzysta z istniejącej operacji bez zmiany (nie liczy się do zmian, ale trafia do uzasadnienia),
   - **rozszerza** — zmienia istniejącą operację,
   - **zyskuje** — dostaje nową operację,
   - **bez miejsca** — żaden moduł nie jest naturalnym miejscem → potrzebny nowy moduł.
3. Klasa wymagania: **lokalne** (0–1 zmienionych modułów; „tylko złożenie” = wyłącznie istniejące operacje) ·
   **rozproszone** (≥ 2) · **nowy moduł** (wygrywa; zapis `N (+1 nowy)`). Przedział → klasyfikuj górną granicą.
4. Każdy wiersz ma **„dlaczego”** — czemu zmiana dotyka dokładnie tych modułów, nie mniej i nie więcej. Komponenty czysto
   techniczne (logowanie, auth) pomijasz.

## Raport (`docs/project/02-domain/stress/<metryka>.md`)
metryka · zamrożony zbiór wymagań (ze znacznikiem źródła) · tabela wymaganie → moduły (używa/rozszerza/zyskuje/bez miejsca) →
klasa → dlaczego · zestawienie per moduł (kolumna zmian osobno od kolumny użyć) · rozkład klas · nota: „ten zbiór można
powtórzyć na innej dekompozycji”. Bez ocen jakości; wnioski i decyzje — człowiek, ADR.
