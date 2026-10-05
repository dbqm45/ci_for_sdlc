---
name: proc-lean
description: Użyj przy przepływie pracy i priorytetach — Lean, marnotrawstwo, prawo Little'a, VSM, MVP, koszt opóźnienia, WSJF.
metadata:
  katalog: "Użyj przy usprawnianiu przepływu pracy i decyzjach o priorytetach — zasady Lean Software Development, marnotrawstwo w IT, przepływ i prawo Little'a, mapowanie strumienia wartości, Lean Startup (buduj–mierz–ucz się, MVP), koszt opóźnienia i WSJF. Nie do rytuałów Scruma/Kanbana (proc-agile) ani SAFe (proc-safe)."
  slowa: "WIP, praca w toku, czas realizacji, przepływ, wąskie gardło w procesie, ile zadań naraz, koszt opóźnienia"
---

# Lean w wytwarzaniu oprogramowania

## Zasady (Lean Software Development)
1. **Eliminuj marnotrawstwo** — wszystko, co nie dodaje wartości w oczach klienta.
2. **Wzmacniaj uczenie się** — krótkie pętle informacji zwrotnej, eksperymenty, prototypy.
3. **Decyduj możliwie późno** — trzymaj opcje otwarte do ostatniego odpowiedzialnego momentu (decyzje odwracalne podejmuj szybko).
4. **Dostarczaj szybko** — małe partie, krótki czas realizacji.
5. **Wzmacniaj zespół** — decyzje blisko informacji.
6. **Wbudowuj jakość** — zapobiegaj defektom zamiast je wyłapywać (testy, automatyzacja, pair/mob).
7. **Patrz na całość** — optymalizuj strumień wartości, nie pojedyncze etapy.

## Marnotrawstwo w IT → przykład → przeciwdziałanie
| Marnotrawstwo | Przykład | Przeciwdziałanie |
|---|---|---|
| częściowo wykonana praca | długie gałęzie, niewdrożony kod | limity WIP, trunk-based |
| dodatkowe funkcje | „może się przyda” | YAGNI, eksperymenty z metrykami |
| ponowne uczenie się | wiedza w głowach, brak ADR | dokumentacja decyzji, pairing |
| przekazania | analityk → dev → QA → ops | zespoły międzyfunkcyjne |
| opóźnienia / czekanie | na review, środowisko, decyzję | SLA review, automatyzacja środowisk |
| przełączanie zadań | wiele równoległych tematów | WIP = 1–2 na osobę |
| defekty | błędy wykryte późno | testy, shift left |

## Przepływ
- **Prawo Little'a**: średni czas realizacji = średni WIP / średnia przepustowość → mniej pracy w toku to szybsza realizacja.
- **Pull zamiast push**: nowa praca wchodzi, gdy jest przepustowość.
- **Mapowanie strumienia wartości (VSM)**: narysuj kroki od pomysłu do produkcji z czasem pracy i czekania; efektywność
  przepływu = czas pracy / całkowity czas. Usprawniaj największe czekanie, nie najdroższy etap.

## Lean Startup
Buduj → mierz → ucz się. **MVP** = najtańszy eksperyment weryfikujący hipotezę (może nie być oprogramowaniem).
Hipoteza z miarą sukcesu i progiem decyzji ustalonym **przed** eksperymentem; decyzja: kontynuuj / zmień kierunek (pivot) / porzuć.

## Priorytety ekonomicznie
- **Koszt opóźnienia (Cost of Delay)** — ile tracimy za każdy tydzień zwłoki.
- **WSJF** = koszt opóźnienia / rozmiar (czas pracy): najpierw krótkie rzeczy o wysokim koszcie opóźnienia.
