---
name: eng-behavior-preserving-refactoring
description: Użyj, gdy kod zmienia kształt bez zmiany zachowania (legacy, zmiana paradygmatu) — zamrożony kontrakt, dowód.
metadata:
  katalog: "Użyj przy refaktoryzacji zmieniającej kształt lub idiom kodu bez zmiany zachowania (legacy, wydzielenie rdzenia domeny, zmiana paradygmatu, np. bogaty agregat → decider) — zamrożony kontrakt, testy czterowarstwowe, przepięcie poziomu testów, rejestr asercji, dowód zachowania. Nie do drobnych refaktoryzacji (eng-clean-code) ani projektowania przypadków (qa-test-design)."
---

# Refaktoryzacja z dowodem zachowania

Cel: zmienić **jak** kod działa, nie zmieniając **co** robi. Dowód: **te same, niezmienione scenariusze** przechodzą przed i po
zmianie, uruchamiane na poziomie niezależnym od zmienianego idiomu.

## Warunek wstępny
Testy istnieją i są zielone (to jest punkt odniesienia). Czerwone → stop. Brak testów → najpierw testy charakteryzujące
(qa-spec-first-testing — oznaczone jako takie), dopiero potem refaktoryzacja.

## Co zamrażamy (kontrakt zachowania — `docs/project/06-delivery/<krok>-behavior-contract.md`)
1. **Scenariusze i asercje** w języku domeny.
2. **Publiczny kontrakt:** sygnatury operacji, zwracane zdarzenia i DTO, **rodzaj odrzucenia** — wyjątek, pusty wynik i wynik
   z błędem to RÓŻNE zachowania.
3. **Granica spójności:** co jest ładowane i zapisywane atomowo, gdzie są blokady/wersje.
Każda zmiana któregoś z tych trzech wymaga jawnej zgody człowieka i wpisu w `decisions.md` — to już nie jest refaktoryzacja.

## Testy w czterech warstwach
| Warstwa | Zmienia się przy refaktoryzacji? | Rola |
|---|---|---|
| **Scenariusz** (given/when/then) | nie | zachowanie w języku domeny |
| **DSL** (czasowniki domeny, obserwowalne fakty) | nie | słownik testu — bez typów implementacji |
| **Sterownik** (driver) | tak | tłumaczy DSL na wywołania systemu na wybranym poziomie |
| **System** (SUT) | tak | zmieniany kod |
Poziomy wiązania sterownika: **domena** (najszybszy, zależny od idiomu — nie dowodzi równoważności) · **aplikacja** (fasada /
przypadek użycia — kontraktowy, niezależny od idiomu; **tym poziomem dowodzisz**) · **system** (HTTP/kolejka — opcjonalny).
Reguły: sterownik bez asercji; wybór sterownika w jednym miejscu (bazowa klasa/fixture scenariusza); scenariusz nie tworzy
typów implementacji i nie zagląda do tabel bazy; sterownik wiąże się z **istniejącą** fasadą — nie wymyślaj nowej.

## Kroki (osobny commit na każdy krok zmieniający kod — core-git-workflow; nie squashuj)
1. **Podnieś** — przepisz istniejące testy na scenariusze + DSL i uruchom je przez sterownik aplikacyjny. Zmieniasz tylko testy
   (`test(scope): …`). Każde przepisanie asercji wpisz do **rejestru asercji**:
   | Asercja oryginalna | Asercja w DSL | Czego już nie rozróżnia | Dlaczego to akceptowalne |
   Zgodność sterownika domenowego i aplikacyjnego na tych samych scenariuszach sprawdza wierność przepisania.
2. **Zamień** — nowy idiom obok starego, przepięcie fasady na nowy kod. Czerwony test = siatka zadziałała: poprawiasz kod
   lub okablowanie, **nigdy test**. Nie da się zazielenić bez edycji testu → wróć do stanu po kroku 1 (git) i zgłoś.
3. **Obniż** — sterownik domenowy przepięty na nowy rdzeń (szybkie testy wracają), usuń stary kod.

## Pułapki
- **Niejawne utrwalanie** (ORM zapisujący zmienione encje sam): po przejściu na niezmienny stan zapis znika — powłoka musi
  zapisać jawnie. Sprawdź każdą ścieżkę zapisu.
- **Ukryty defekt:** jeśli nowa implementacja przy okazji naprawia błąd (np. dodany zapis) — nazwij to i zgłoś wg protokołu
  rozbieżności (qa-spec-first-testing); to zmiana zachowania.
- Zmiana rodzaju odrzucenia (wyjątek → pusty wynik) „bo ładniej” łamie kontrakt.
- Testy charakteryzujące utrwalają także błędy — nie traktuj ich jako specyfikacji.

## Tryby
- **Oszczędny** (domyślny): dowód tylko na pokrytych ścieżkach; luki pokrycia wypisane w podsumowaniu jako zastrzeżenie.
- **Ścisły** (logika krytyczna): dodatkowo próg testów mutacyjnych na zmienianym module i migawka charakteryzująca przed/po.

## Podsumowanie (w raporcie kroku)
co zamrożono · rejestr asercji · commity kroków · luki pokrycia · wykryte ukryte defekty · zgody na zmiany kontraktu.
Katalog idiomów i przepisy przejść: `references/idioms.md`.

## Przykład
**Sytuacja:** agregat `Reservation` (ORM zapisuje sam) ma się stać deciderem; 14 testów domenowych zielonych.
**Wynik:** kontrakt zamraża scenariusze, `confirm(id, at)`, zdarzenie `ReservationConfirmed` bez nowych pól
i wyjątek `ReservationExpired`. Commity: (1) `test:` scenariusze + DSL przez fasadę, rejestr asercji
(`getStatus() === CONFIRMED` → `thenReservationIsConfirmed()`, nie rozróżnia enuma — status widać w DTO);
(2) `refactor:` `decide(stan, komenda)` obok starego kodu, powłoka zapisuje jawnie; (3) sterownik domenowy na
`decide`, stary agregat usunięty. Luka: anulowanie bez testu (tryb oszczędny).
Więcej przykładów: `references/przyklady.md`.
