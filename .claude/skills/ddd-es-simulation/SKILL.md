---
name: ddd-es-simulation
description: Użyj tylko na wyraźne żądanie — symulowany warsztat Event Storming z uczestnikami AI i coachem (trening facylitacji).
metadata:
  katalog: "Użyj WYŁĄCZNIE na wyraźne żądanie użytkownika („symulowany warsztat”, „trening facylitacji Event Stormingu”) — symulacja sesji Big Picture z uczestnikami odgrywanymi przez AI i coachem oceniającym prowadzenie; wersja pełna lub oszczędna, zawsze wybierana przez człowieka po ostrzeżeniu o kosztach. Nie do prawdziwej analizy domeny (ddd-event-storming, ddd-discovery-intake)."
disable-model-invocation: true
argument-hint: "[pelna|oszczedna] [scenariusz]"
---

# Symulowany warsztat Event Storming (trening facylitatora)

> **Tylko na polecenie człowieka** (`/ddd-es-simulation`). Jeśli czytasz ten plik z innego powodu (np. szukając informacji), nie wykonuj kroków — możesz zacytować, co skill robi, i zaproponować uruchomienie poleceniem.

Człowiek ćwiczy **prowadzenie** sesji Big Picture z symulowanymi uczestnikami; coach ocenia prowadzenie, nie merytorykę.
To trening — wyniki nigdy nie są wiedzą o prawdziwej domenie (nie trafiają do `docs/project/`, banku dowodów ani modelu).

## 0. Bramka kosztów — zawsze, zanim cokolwiek uruchomisz
Nie startuj bez **jawnego wyboru człowieka**, także gdy wersja padła w argumencie (wtedy tylko potwierdź z ostrzeżeniem).
Zadaj pytanie (`AskUserQuestion`, bez opcji domyślnej) z tą tabelą:

| | **Pełna** (jak w oryginale) | **Oszczędna** |
|---|---|---|
| Kto mówi w rundzie | cała sala: każdy uczestnik to osobny agent w osobnym kontekście, równolegle | 3–4 osoby wybrane przez skrypt (zaadresowane po imieniu, pasujące tematem, najdłużej milczące); „wszyscy” = cała sala |
| Model uczestników | `es-participant` — std (Sonnet), pełna karta osoby | `es-room` — fast (Haiku), jeden agent gra kilka osób z kart skróconych |
| Niezależność osób | pełna (osobne konteksty) | częściowa (jeden kontekst gra kilka ról) |
| Coach | pełny: 10 anty-wzorców | lekki: 3 kluczowe (dominacja, milczenie, język); pełny na życzenie |
| **Koszt w tej rozmowie** (gospodarz = bieżąca persona, Sonnet) | **ok. $0,30 za rundę → $3–4 za sesję 10–12 rund** | **ok. $0,20 za rundę → ok. $2–2,50 za sesję** |
| **Koszt w osobnej sesji `claude --agent es-host`** (gospodarz na Haiku) | szacunek ok. $0,12–0,18 za rundę | szacunek ok. $0,05–0,10 za rundę — najtańsza opcja |

Większość kosztu to **gospodarz**, nie uczestnicy: w bieżącej rozmowie każda runda przepisuje duży kontekst persony na Sonnecie.
Dlatego zawsze zaproponuj też osobną sesję `claude --agent es-host` (mały prompt, Haiku). Koszt rośnie z długością sesji.
Opcje odpowiedzi: „Pełna — akceptuję koszt” · „Oszczędna” · „Oszczędna w osobnej sesji es-host (najtaniej)” · „Rezygnuję”.
Brak odpowiedzi / praca bez człowieka → **nie startuj**.

## 1. Role
- **Człowiek = facylitator.** Pisze to, co powiedziałby na sali (pytania, prośby, parkowanie, oznaczanie zdarzeń przełomowych).
- **Ty = skryba i orkiestrator.** Nigdy nie grasz żadnej osoby i nie dopisujesz kartek za uczestników. Nie podpowiadasz facylitatorowi,
  chyba że poprosi o coacha.
- **Uczestnicy** — agenci `es-participant` / `es-room`; widzą tylko własne prompty rundy (hook `cleanroom_guard.py`, profil `es-sim`
  — nie przeczytają `brief.md`, kart innych osób ani plików projektu).
- **Coach** — agent `es-coach`, tylko na żądanie („coach”, „jak mi idzie?”, koniec sesji).

## 2. Przebieg (wszystko, co mechaniczne, robi skrypt — zero tokenów)
Skrypt: `python3 .claude/skills/ddd-es-simulation/scripts/es_sim.py` (katalog sesji `docs/training/es-sim/<id>/`).
1. **Start:** `es_sim.py init --variant pelna|oszczedna [--scenario weterynaria]` → id sesji, obecni, nieobecni (dołączają na zaproszenie).
   Skrypt wypisuje gotowe wprowadzenie (domena, obecni, polecenia) po znaczniku `=== POKAŻ DOSŁOWNIE ===` — pokaż je bez zmian.
   **Nie czytaj `brief.md` ani kart osób** — zawierają wiedzę ukrytą i celowe sprzeczności; czyta je tylko coach.
2. **Runda** (każda wypowiedź facylitatora):
   - `es_sim.py round-begin --id <id> --text "<wypowiedź>"` → JSON z listą wywołań (`agent`, `prompt_file`).
   - **Pełna:** wywołaj `es-participant` dla KAŻDEJ pozycji **równolegle, w jednej wiadomości**; prompt agenta = tylko
     „Wykonaj instrukcje z pliku <prompt_file>.” (nie wklejaj treści — oszczędność tokenów).
   - **Oszczędna:** jedno wywołanie `es-room` z tym samym krótkim poleceniem.
   - `es_sim.py round-end --id <id>` → wypowiedzi, nowe kartki i linia meta (dodane / odrzucone / milczący).
     **Twoja odpowiedź = dokładnie tekst po `=== POKAŻ DOSŁOWNIE ===`**, nic więcej: bez streszczeń, bez „Twój ruch”, bez wskazówek,
     bez odniesień do scenariusza. Podpowiedzi psują trening (facylitator ma sam zauważyć sprzeczność i milczącego uczestnika)
     i kosztują tokeny. Wskazówki daje wyłącznie coach — na żądanie.
3. `zaproś <imię>` → `es_sim.py invite --id <id> --persona <id>`. `przełomowe ev_012` → `es_sim.py pivotal …`. `tablica` → `es_sim.py board`.
4. **Coach:** `es_sim.py stats --id <id> --json` → wywołaj `es-coach` z: ścieżką transkrypcji, wynikiem stats, ścieżką `brief.md`,
   trybem (`light` domyślnie w oszczędnej, `full` w pełnej lub na życzenie; `midsession` = 5–7 zdań w trakcie).
   Debrief zapisuje coach do `docs/training/es-sim/<id>/debrief.md`.
5. **Koniec:** coach (tryb końcowy) + podsumowanie: liczba rund, tablica, koszt (`python3 factory/cost_report.py --days 1`, jeśli jest).

## 3. Mechanika symulacji (skrypt + karty osób)
- **Karta osoby** (`scenarios/<s>/personas/<id>.md`): charakter · wiedza (wie dobrze / pobieżnie / **nie wie**) · bóle · kotwice
  zdarzeń · zachowania „bodziec → reakcja” · metaprogramy · 8 wariantów dnia · anegdoty (każda raz) · brzmienie (nie do cytowania) ·
  karta skrócona (≤ 500 znaków, wersja oszczędna). Każda osoba **trenuje jeden anty-wzorzec** facylitacji.
- **Wariant dnia** — deterministyczny z id sesji: zmienia temperament, nie wiedzę; każda sesja jest trochę inna.
- **Pamięć** — 5 ostatnich jednozdaniowych skrótów **własnymi słowami** osoby (nie dosłowne cytaty, żeby ich nie powtarzała).
- **Echo sali** — 3 wypowiedzi innych z poprzedniej rundy (reakcja z opóźnieniem jednej rundy — coach to uwzględnia).
- **Kartki:** tylko `event` i `hot_spot`; inny typ skrypt odrzuca i liczy (sygnał mieszania poziomów dla coacha).
  Brak poprawnego JSON = milczenie tej osoby (nic nie dopisujemy za nią).
- **Celowe sprzeczności** w scenariuszu: kilka osób pamięta to samo zdarzenie inaczej — hot spot powstaje tylko, gdy facylitator je zderzy.
- **Router wersji oszczędnej** (skrypt): osoby zaadresowane (imię w dowolnej formie) → dopasowane słowami kluczowymi → najdłużej milczące.
- Kolejność w promptach: część stała (zasady, karta) przed zmienną (tablica, echo) — działa cache promptów.

## 4. Własny scenariusz
Skopiuj `scenarios/weterynaria/` i zmień: `brief.md` (domena, wiedza ukryta, celowe sprzeczności, czego nie zdradzać,
oczekiwane zdarzenia przełomowe, tabela „kto trenuje co”) oraz karty osób (ten sam układ sekcji; `obecna_od_startu: nie` = dołącza
na zaproszenie; `formy_imienia` = odmiany imienia dla routera). Scenariusz fikcyjny — nie opisuj realnych osób ani firm.

## Koszty zmierzone
| Wersja | Rundy | Koszt | Uwagi |
|---|---|---|---|
| pełna, gospodarz Ewa (Sonnet) | start + 3 rundy + coach | $1,30 (start $0,13; rundy $0,29 / $0,31 / $0,33; coach $0,24) | 6 osób na rundę, każda osobny agent; uczestnicy to tylko ~25% kosztu |
| oszczędna, gospodarz Ewa (Sonnet) | start + 3 rundy | $0,76 (start $0,14; rundy $0,17 / $0,19 / $0,25) | pokój (Haiku) to ~10% kosztu rundy — resztę zjada gospodarz |
| obie, gospodarz `es-host` (Haiku) | — | nie zmierzono (limit wydatków organizacji w dniu testu) | szacunek z proporcji wyżej; zmierz: `python3 factory/cost_report.py --days 1` |
Pomiar przed poprawką „pokazuj dosłownie” (gospodarz dopisywał komentarze) — obecnie każda runda ma mniej tokenów wyjściowych.
