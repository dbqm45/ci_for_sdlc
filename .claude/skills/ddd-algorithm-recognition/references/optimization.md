# Optymalizacja i ograniczenia

| id | Pytanie dopasowania | Sygnały | To nie to, jeśli… | Pułapki |
|---|---|---|---|---|
| **knapsack** | wybrać podzbiór o największej wartości w jednym limicie? | budżet, pojemność, „co się opłaca wziąć” | limitów jest kilka → `knapsack-multidim` | pseudo-wielomianowy; duże wartości → aproksymacja |
| **knapsack-multidim** | jak wyżej, ale limity w wielu wymiarach (ludzie × kompetencje × czas × budżet)? | „dobierz projekty do zasobów”, wiele ograniczeń naraz | elementy przypisujemy do wielu „plecaków” → GAP / `linear-programming` | szybko rośnie; solver MIP; archetyp General assignment |
| **bin-packing** | zmieścić wszystko w jak najmniejszej liczbie pojemników? | kontenery, pojazdy, sloty, „ile aut potrzeba” | liczba pojemników stała, liczy się wartość → `knapsack` | NP-trudne; heurystyki FFD dają dobre wyniki |
| **set-cover** | najmniejszy zestaw pokrywający wszystkie wymagania? | „żeby każda kompetencja była obsadzona”, minimalny zespół | — | aproksymacja zachłanna; wagi kosztów |
| **interval-scheduling** | najwięcej niekolidujących zadań w czasie / przydział sal? | sale, sloty, „ile spotkań się zmieści” | przedziały mają wartości → wersja ważona (DP) | zachłanny po końcu przedziału działa tylko dla wersji bez wag |
| **linear-programming / MIP** | maksymalizuj/minimalizuj przy liniowych ograniczeniach (całkowitych)? | „optymalny miks”, grafik, alokacja budżetu | ograniczenia logiczne, nie liczbowe → `csp` / `sat` | używaj solvera; model ≠ implementacja |
| **csp** | przypisać wartości zmiennym przy regułach typu „jeśli… to nie…”? | konfiguracja produktu, grafik z regułami, kompatybilność | — | solver CP; archetyp Configurator |
| **sat / maxsat** | spełnić reguły logiczne (twarde) / jak najwięcej miękkich z wagami? | uprawnienia, wykluczenia, „reguły miękkie z priorytetem” | — | wagi reguł miękkich to decyzja biznesowa (sprawiedliwość) |

Zasada: dla problemów NP-trudnych **nie pisz własnego algorytmu** — solver za interfejsem domenowym + spike z kryterium porzucenia
(arch-tech-selection). Model domeny opisuje ograniczenia, solver je rozwiązuje.
