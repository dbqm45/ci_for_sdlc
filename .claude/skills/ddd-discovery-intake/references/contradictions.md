# Wykrywanie sprzeczności

**Wykrycie ≠ rozstrzygnięcie.** Krytyk (osobny agent w świeżym kontekście) tylko znajduje i opisuje sprzeczności;
rozstrzyga człowiek, a decyzja trafia do `decisions.md`.

## Rodzaje sprzeczności
1. Ta sama reguła opisana na dwa niezgodne sposoby.
2. Różne liczby, progi lub terminy dla tego samego.
3. Decyzja lub oczekiwanie łamiące podane ograniczenie.
4. Wymagania wzajemnie się wykluczające.
5. Cicha zmiana zdania (ktoś twierdzi inaczej niż wcześniej, bez zaznaczenia zmiany).

## To NIE są sprzeczności
- podobne słowa o **różnych podmiotach** (dwa różne procesy, dwa działy),
- jawna zmiana decyzji („kiedyś X, od stycznia Y”),
- różne preferencje osób (to temat do rozmowy, nie konflikt faktów),
- ogólnik obok konkretu, który go doprecyzowuje.

## Test tego samego podmiotu
Zanim zgłosisz: przeczytaj po 2–3 linie przed i po obu cytatach — wyjątek lub zawężenie często stoi w następnym zdaniu.
Zgłoś tylko, gdy oba cytaty dotyczą tego samego podmiotu, w tym samym czasie i warunkach.

## Format (`docs/project/02-domain/contradictions.md`)
| # | Konflikt (waga: wysoka/średnia/niska) | Cytaty (id, źródło, miejsce) | Dlaczego się wykluczają | Pytanie diagnostyczne | Status |
|---|---|---|---|---|---|
| C1 | Czy system sam dodaje zasoby? (wysoka) | E3 S1 L20 · E41 S2 tor: Planista/7 | wywiad: „tylko sugeruje”; tablica: polityka dodaje automatycznie | „Gdy brakuje osoby, system ma **zaproponować** kandydata, czy **sam** go przypisać?” | otwarta |

Pytanie diagnostyczne: konkretne, rozstrzygalne jednym zdaniem, bez oskarżania („kto ma rację?” — źle).
Statusy: `otwarta` → `rozstrzygnięta → D-xxx` | `odroczona` (trafia do Otwartych pytań) | `odrzucona` (z powodem).
Wynik krytyka cache'uj po skrócie treści banku — ponowne uruchomienie na tym samym banku nie zmienia listy.
