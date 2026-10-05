# Format raportu analizy językowej

## Pojedyncza uwaga
```
[KATEGORIA] | PRIORYTET: WYSOKI / ŚREDNI / NISKI
Lokalizacja: plik:linia albo sekcja / akapit / cytat lokalizujący
ORYGINALNIE: „<dokładny cytat>”
PROBLEM: <1–2 zdania, z odwołaniem do reguły, np. RJP 12.1.1>
SUGESTIA: „<poprawna wersja>”
```
Kategorie: `ORTOGRAFIA` · `INTERPUNKCJA` · `GRAMATYKA` · `KOLOKACJA` · `PLEONAZM` · `KALKA` · `STYL` · `CZYTELNOŚĆ` · `TYPOGRAFIA`.
Priorytet: **WYSOKI** — błąd normy lub zmieniający sens; **ŚREDNI** — zauważalny dla czytelnika (styl, rejestr, powtórzenia);
**NISKI** — preferencja redakcyjna, typografia.

## Podsumowanie (w odpowiedzi)
```
## Analiza językowa — <dokument>
Ocena poprawności: X/10 · uwag: N (wysoki A | średni B | niski C)
| Kategoria | Liczba | Przykład |
Najczęstsze wzorce (do poprawy w całym tekście): 1. … 2. … 3. …
Ocena stylu i spójności: X/10 — jedno zdanie
```
Pełny raport jako plik: `docs/project/07-review/<data>-jezyk-<dokument>.md` (nagłówek core-project-record, `artifact: review`)
albo `.docx` na życzenie (skill docx; skrypt zapisuj narzędziem Write w UTF-8 i sprawdź `file -i` — raport o polszczyźnie
bez polskich znaków sam jest błędny).

## Poprawione fragmenty (na życzenie)
ORYGINAŁ → POPRAWKA, zmiany wypunktowane z wyjaśnieniem; przy pierwszym wystąpieniu wzorca `[ZMIANA: …]`.
Minimalna ingerencja — bez zmian merytorycznych, bez „upiększania”, terminy i kod bez zmian.
