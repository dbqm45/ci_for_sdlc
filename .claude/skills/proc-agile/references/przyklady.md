# Przykłady: Scrum i Kanban w praktyce

## 1. Prognoza Monte Carlo zamiast obietnicy z estymat
**Sytuacja:** Zespół pracuje w Kanbanie. Właścicielka produktu pyta: „Ile elementów z backlogu wydania zrobicie
w 6 tygodni? I kiedy skończycie 30 elementów, które są na liście?”.

**Jak:**
1. Zbierasz przepustowość z ostatnich 10 tygodni (ukończone elementy na tydzień): 4, 6, 3, 5, 7, 2, 5, 6, 4, 5.
2. Nie mnożysz średniej (4,7 × 6) — to daje prognozę z ok. 50% szans, czyli rzut monetą.
3. Symulujesz 10 000 przyszłości: każdy tydzień losowany z historii (skrypt niżej).
4. Podajesz prognozę z prawdopodobieństwem, nie datę-obietnicę; estymaty punktowe nie są potrzebne.

**Wynik:**

| Pewność | Elementów w 6 tygodni (co najmniej) | 30 elementów gotowych w ciągu |
|---|---|---|
| 50% | 28 | 7 tygodni |
| 70% | 26 | 7 tygodni |
| 85% | 25 | 8 tygodni |
| 95% | 22 | 8 tygodni |

Odpowiedź: „Z 85% szans zrobimy co najmniej 25 elementów w 6 tygodni. Wszystkie 30 — z 85% szans w ciągu
8 tygodni. Prognozę odświeżamy co tydzień o nowe dane”.

Skrypt (sprawdzony, `python3 mc.py`, wynik jak w tabeli):
```python
import random
random.seed(42)
tp = [4, 6, 3, 5, 7, 2, 5, 6, 4, 5]  # ukończone elementy w ostatnich 10 tygodniach
N = 10000
sums = sorted(sum(random.choice(tp) for _ in range(6)) for _ in range(N))
for p in (50, 70, 85, 95):
    print(f"{p}%: >= {sums[int(N * (100 - p) / 100)]}")

def weeks(target):
    done = w = 0
    while done < target:
        done += random.choice(tp)
        w += 1
    return w

ws = sorted(weeks(30) for _ in range(N))
for p in (50, 70, 85, 95):
    print(f"{p}%: <= {ws[int(N * p / 100) - 1]} tyg.")
```

## 2. Cięcie pionowe historyjki
**Sytuacja:** W backlogu leży element „Moduł płatności: tabele w bazie, API, ekran — 3 sprinty”. Zespół chce go
podzielić na „backend” i „frontend”.

**Jak:**
1. Podział warstwami łamie INVEST: żadna część nie jest wartościowa ani testowalna dla użytkownika osobno.
2. Tniesz pionowo po ścieżkach procesu i wariantach danych — każdy kawałek przechodzi przez UI, logikę i dane.
3. Każda historyjka dostaje kryteria akceptacji w Given/When/Then.

**Wynik:**

| Historyjka | Wartość dla użytkownika |
|---|---|
| Jako klient chcę zapłacić kartą za zamówienie w PLN, aby je sfinalizować | szczęśliwa ścieżka, jedna waluta |
| Jako klient chcę zobaczyć powód odrzucenia płatności, aby spróbować ponownie | ścieżka błędu |
| Jako klient chcę zapłacić BLIK-iem, aby nie wpisywać danych karty | drugi wariant metody |
| Jako księgowa chcę widzieć zwroty przy zamówieniu, aby uzgodnić wyciąg | reguła biznesowa |

Kryteria dla pierwszej: *Given* zamówienie na 120 zł, *When* klient płaci poprawną kartą, *Then* zamówienie ma
status „opłacone” i klient dostaje potwierdzenie. Pierwsza historyjka mieści się w jednym sprincie i daje działający
przyrost.

## 3. Wiek elementu pracy jako wczesny sygnał
**Sytuacja:** Na tablicy Kanban w kolumnie „W toku” jest 9 elementów przy limicie WIP 6. Zespół mówi, że „wszystko
idzie”, ale nic nie trafia do „Gotowe” od tygodnia.

**Jak:**
1. Patrzysz na wiek elementów, a nie tylko na ich liczbę.
2. Porównujesz wiek z typowym czasem cyklu zespołu (tu: 85% elementów kończy się w 5 dni).
3. Stosujesz „kończ, zanim zaczniesz nowe”: nowa praca wstrzymana, dopóki WIP nie wróci do limitu.

**Wynik:**

| Element | Wiek (dni) | Ocena |
|---|---|---|
| Import faktur | 11 | ponad 2× typowy czas cyklu — rozbić albo wyjaśnić blokadę na Daily |
| Raport VAT | 8 | czeka na review — para do review dziś |
| Filtr klientów | 6 | na granicy — sprawdzić jutro |
| pozostałe 6 | 1–4 | w normie |

Decyzja: do czasu zejścia do 6 elementów nikt nie bierze nowej pracy; Daily zaczyna się od najstarszego elementu,
a nie od rundy „co robiłem wczoraj”.
