# Szacowanie kosztu i terminu — przykład

Liczby w przykładzie policzone skryptem (2026-10-03). Projekt: system rezerwacji sal, szacunek w osobodniach.

## 1. Widok z zewnątrz (klasa referencyjna)
1. Zbierz co najmniej kilka zakończonych projektów podobnej klasy (ten sam typ systemu, podobny zespół i stack):
   plan i rzeczywistość (koszt, czas).
2. Policz rozkład stosunku rzeczywistość / plan, np. mediana 1,3, 80. percentyl 1,8.
3. Twój szacunek „od środka” mnożysz przez percentyl odpowiadający akceptowanemu ryzyku (P50 dla portfela
   wielu projektów, P80 dla pojedynczego ważnego projektu).

Bez własnych danych historycznych: powiedz to wprost, podaj szeroki przedział i zaplanuj etap odkrywania, który
dostarczy danych (pierwszy kamień milowy jako pomiar).

## 2. Widok od środka (szacunek trzypunktowy)
| Część | O | M | P | E = (O+4M+P)/6 | σ = (P−O)/6 |
|---|---|---|---|---|---|
| Szkielet end-to-end i CI | 5 | 8 | 15 | 8,7 | 1,7 |
| Rezerwacje sal | 10 | 15 | 30 | 16,7 | 3,3 |
| Powiadomienia | 4 | 6 | 12 | 6,7 | 1,3 |
| Panel administratora | 6 | 10 | 20 | 11,0 | 2,3 |
| Integracja z kalendarzem | 5 | 10 | 30 | 12,5 | 4,2 |
| **Suma** | 30 | **49** | 107 | **55,5** | √Σσ² = **6,2** |

Wnioski:
- suma „najbardziej prawdopodobnych” (49) jest niższa niż suma wartości oczekiwanych (55,5) — kto podaje sumę M,
  zaniża szacunek;
- przedział z niezależnych części (P80 ≈ 55,5 + 0,84 × 6,2 ≈ 60,7) jest za wąski, bo części nie są niezależne
  (wspólne przyczyny: niejasne wymagania, nowa technologia, dostępność ludzi), a przekroczenia w IT mają gruby ogon;
- dlatego końcowy przedział bierzesz z klasy referencyjnej: np. przy percentylach 1,3 (P50) i 1,5 (P80) —
  P50 ≈ 72 osobodni, P80 ≈ 83 osobodni;
- najszerszy przedział ma integracja z kalendarzem (P − O = 25) — to kandydat na spike w pierwszym kamieniu milowym.

## 3. Od osobodni do terminu i kosztu
- Termin: osobodni ÷ (liczba osób × realna dostępność) + zależności zewnętrzne (zgody, dostawcy, testy z użytkownikami).
  Dostępność ustalasz z ludźmi, nie przyjmujesz 100%.
- Koszt: osobodni × stawka + środowiska + licencje + modele AI + utrzymanie. Podaj źródło stawki.
- Rezerwy: na ryzyka zidentyfikowane (Σ prawdopodobieństwo × koszt skutku z rejestru) i kierownicza na nieznane.

## 4. Aktualizacja
Po każdym kamieniu milowym porównaj rzeczywistość z planem dla zakończonych części i przelicz prognozę. Gdy zespół
ma historię przepustowości, prognozę terminu daje symulacja Monte Carlo (proc-agile).
