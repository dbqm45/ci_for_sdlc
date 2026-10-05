# Bisekcja i narzędzia — przykłady

Sprawdzone 2026-10-03 na git 2.43 i CPython 3.11: repozytorium z 20 commitami, błąd wprowadzony w c13, a c12 nie
daje się zaimportować (błąd składni).

## 1. `git bisect run`
Skrypt sprawdzający zwraca kod wyjścia, który git rozumie:

| Kod | Znaczenie |
|---|---|
| 0 | commit dobry |
| 1–127 (poza 125) | commit zły |
| 125 | nie da się sprawdzić — pomiń (`skip`) |
| inny (np. > 127) | przerwij bisekcję |

```sh
#!/bin/sh
# check.sh — uruchamiany przez git bisect run w katalogu repozytorium
export PYTHONDONTWRITEBYTECODE=1                 # bez cache bajtkodu między krokami (patrz punkt 2)
python3 -c "import calc" 2>/dev/null || exit 125 # nie buduje się → pomiń ten commit
python3 -c "import calc, sys; sys.exit(0 if calc.add(2, 2) == 4 else 1)"
```

```sh
git bisect start <zły> <dobry>      # np. git bisect start HEAD v1.4.0
git bisect run ./check.sh
git bisect log > bisect.log         # zapis przebiegu do raportu
git bisect reset                    # powrót na gałąź
```

Wynik przykładu: git sprawdził c15, c12 (pominięty, kod 125), c13 i c11, po czym podał dwóch kandydatów: c12 i c13
(„The first bad commit could be any of”). Pominięty commit sąsiadujący z pierwszym złym zostaje w wyniku — to uczciwa
odpowiedź, a nie błąd. Rozstrzygasz ręcznie, czytając diff obu commitów.

Wskazówki:
- skrypt w pliku poza repozytorium (np. w `/tmp`) albo nieśledzony — inaczej zniknie przy przełączaniu commitów;
- test z bisekcji staje się testem regresyjnym w poprawce;
- historia ze scaleniami: `git bisect start --first-parent` sprawdza tylko commity głównej linii;
- w monorepo zawęź ścieżką: `git bisect start <zły> <dobry> -- packages/billing`.

## 2. Pułapka: nieaktualne artefakty
Pierwsze podejście bez `PYTHONDONTWRITEBYTECODE` wskazało **zły commit**. Pliki z `return a + b` i `return a - b`
mają ten sam rozmiar, a git ustawił im czas modyfikacji w tej samej sekundzie, więc Python użył starego bajtkodu
z `__pycache__`. To samo grozi przy każdym cache (build przyrostowy, `node_modules/.cache`, `dist/`). W skrypcie
bisekcji: czysty build albo wyłączony cache, a między przebiegami `git clean -fdx` (ostrożnie: usuwa nieśledzone pliki).

## 3. Debugger
Python:
```python
def total(lines):
    breakpoint()          # zatrzymanie; PYTHONBREAKPOINT=0 wyłącza wszystkie
    return sum(l.price * l.qty for l in lines)
```
Polecenia `pdb`: `n` (następna linia), `s` (wejdź do funkcji), `c` (kontynuuj), `p wyrażenie`, `pp`, `w` (stos),
`u`/`d` (ramka w górę/w dół), `b plik:linia` (punkt zatrzymania), `q`. Uruchomienie całego programu pod debuggerem:
`python -m pdb skrypt.py`; w pytest: `pytest --pdb` (debugger przy porażce).

Node.js: `node --inspect-brk app.js` i Chrome DevTools (`chrome://inspect`) albo debugger IDE; w kodzie instrukcja
`debugger;`. Vitest/Jest: uruchom pojedynczy test z `--inspect-brk` i jednym wątkiem.

## 4. Zawężanie danych (delta debugging)
1. Weź wejście, które wywołuje błąd (plik, żądanie, zbiór rekordów).
2. Usuń połowę. Błąd nadal jest → pracuj na tej połowie. Zniknął → wróć i usuń drugą połowę.
3. Gdy żadna połowa osobno nie wywołuje błędu, dziel na mniejsze kawałki.
4. Koniec: najmniejsze wejście z błędem — trafia do testu regresyjnego (bez danych osobowych; arch-privacy-compliance).
