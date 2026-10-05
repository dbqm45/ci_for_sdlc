# Grafy: sieci, trasy, grupy

| id | Pytanie dopasowania | Sygnały | To nie to, jeśli… | Pułapki |
|---|---|---|---|---|
| **shortest-path** | najtańsza/najkrótsza droga między punktami? | trasa, dojazd, koszt przejścia, „najszybciej dotrzeć” | trzeba odwiedzić wiele punktów → `tsp-vrp` | ujemne wagi psują Dijkstrę (Bellman-Ford) |
| **minimum-spanning-tree** | połączyć wszystko najmniejszym kosztem? | sieć, okablowanie, „połącz wszystkie lokalizacje” | liczy się droga z A do B → `shortest-path` | MST nie minimalizuje odległości między parami |
| **tsp-vrp** | objazd wielu punktów (jeden/wiele pojazdów, okna czasowe)? | kurier, serwisant, trasa dnia, flota | kolejność wynika z zależności → `graph-order` | NP-trudne; solver/heurystyki (2-opt, OR-Tools) |
| **union-find** | czy rzeczy łączą się w rozłączne grupy (przechodnio)? | „powiązane”, duplikaty klientów, wyspy, klastry | grupy mają być zbalansowane → `graph-partition` | tylko łączenie; rozłączanie wymaga przeliczenia |
| **graph-partition** | podział na części o podobnej wielkości z minimum powiązań między nimi? | podział zespołów, shardowanie, podział modułów | — | NP-trudne; heurystyki (METIS); to też heurystyka granic modułów |
| **graph-coloring** | przypisać sloty/kolory tak, by sąsiedzi (konflikty) się różnili? | plan zajęć, egzaminy, „nie w tym samym czasie” | konflikty są przedziałami czasu → `interval-scheduling` | NP-trudne; heurystyki (DSATUR) |
| **vertex-cover / clique** | najmniejszy zbiór pilnujący wszystkich powiązań / grupa wzajemnie powiązanych? | kontrola, audyt każdej relacji, „wszyscy się znają” | — | NP-trudne; zwykle aproksymacja |
