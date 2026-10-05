---
name: arch-tech-selection
description: Użyj przy wyborze lub ocenie stacku (języki, frameworki, baza, hosting) — kryteria, 2–3 kandydaci, fakty, macierz, ryzyka.
metadata:
  katalog: "Użyj, gdy trzeba zarekomendować stack (języki, frameworki, bazę, hosting, narzędzia) dla nowego projektu albo ocenić i ewoluować stack istniejącego — czynniki, filtry obowiązkowe, 2–3 kandydaci, weryfikacja faktów ze źródeł, macierz ocen, ryzyka i spike'i, mapowanie na skille i persony. Nie do ustalania atrybutów jakości (arch-quality-attributes)."
  slowa: "przepisać od zera, co zostawić a co wymienić, wybrać framework, który framework wybrać, czy wybrać, porównanie frameworków, modernizacja starego systemu, legacy, migracja stacku, nowy stack, wybór technologii"
---

# Dobór stacku technologicznego

Rekomendacja to **decyzja z uzasadnieniem i sprawdzonymi faktami**, zapisana w `docs/project/04-architecture/stack-decision.md`
(szablon: core-project-record). Nie lista ulubionych technologii.

## Wejście (czytaj TL;DR + wskazane sekcje)
brief (cele, ograniczenia, zespół), wymagania (scenariusze atrybutów jakości), domena (subdomeny, archetypy, klasy problemów).
Brak kluczowego wejścia (np. kompetencji zespołu, miejsca hostingu) → pytanie do użytkownika, nie założenie.
**Projekt istniejący:** najpierw `python3 .claude/hooks/detect_stack.py` — rekomendacja to *zachowaj / usprawnij / zastąp* per obszar,
z kosztem migracji (strangler fig, po granicach kontekstów), a nie nowy stack od zera.

Wejście uzupełniające (jeśli istnieje): `02-domain/algorithms.md`, `02-domain/stress/*.md`.

## Procedura
1. **Czynniki** — 3–5 scenariuszy (H,H) + ograniczenia (arch-quality-attributes), z wagami 1–5.
2. **Filtry obowiązkowe** (odrzucają opcję bez punktacji): licencja, hosting i zgodność (np. dane w UE), wsparcie w horyzoncie
   projektu (LTS / koniec wsparcia), bezpieczeństwo (aktywne łatki), możliwość startu przez zespół (lub realny plan zatrudnienia).
3. **Kandydaci** — 2–3 na obszar, zawsze z opcją **„nudną”**: to, co zespół zna, albo najpowszechniejszy wybór w ekosystemie.
   Mniej technologii = taniej: każdy dodatkowy język/framework to koszt utrzymania, rekrutacji i skilli.
4. **Weryfikacja faktów** — aktualne wersje, daty wsparcia, zgodność między elementami (np. Angular 22 wymaga TS 6.0.x),
   licencje: tylko ze **źródeł pierwotnych** (strony wydań, rejestr pakietów: `npm view <pakiet> version`), z datą sprawdzenia.
   Tanio: deleguj do agenta `researcher` (zwraca fakty ze źródłami). **Nigdy z pamięci.**
5. **Ocena** — macierz ważona:
   | Kryterium | Pytanie |
   |---|---|
   | dopasowanie do czynników | czy spełnia scenariusze (H,H) bez nadzwyczajnych zabiegów? |
   | kompetencje zespołu | ile nauki przed pierwszym wydaniem? |
   | dojrzałość ekosystemu | stabilne wydania, biblioteki, społeczność, dokumentacja |
   | koszt operacyjny i złożoność | ile elementów do utrzymania i monitorowania? |
   | **przyjazność dla agentów AI** | typy statyczne, szybkie testy, jednoznaczne konwencje, deterministyczne narzędzia, dobra dokumentacja, **istniejące skille `lang-*`/`fw-*`/`tool-*`** (tańsza i bezpieczniejsza praca zespołu agentów) |
   | uzależnienie i koszt wyjścia | co, jeśli trzeba będzie zmienić dostawcę/framework? |
   | bezpieczeństwo | historia podatności, szybkość łatek, bezpieczne ustawienia domyślne |
6. **Wnioski z domeny** (ddd-deep-modeling, ddd-archetypes):
   - subdomena generyczna → kup / SaaS / gotowy komponent (przez ACL);
   - CRUD i supporting → najprostszy framework, generatory, nawet BaaS;
   - core ze złożonymi regułami → język z silnym systemem typów (typy sum, niezmienność), łatwe testy domeny;
   - konkurencja o zasoby → baza z mocną spójnością i ograniczeniami (np. PostgreSQL z wykluczaniem nakładających się przedziałów);
   - integracja między kontekstami → komunikaty + outbox (be-messaging-outbox); odczyty dominujące → read modele / cache;
   - **jądro algorytmiczne** (`02-domain/algorithms.md`, ddd-algorithm-recognition): problem NP-trudny → solver/biblioteka
     optymalizacyjna za interfejsem domenowym + spike z kryterium porzucenia, nie własny algorytm; problem przestrzenny →
     rozszerzenie geo w bazie; podobieństwo → indeks pełnotekstowy/wektorowy. Konkretne biblioteki i wersje sprawdza `researcher`.
7. **Styl architektury** — domyślnie modularny monolit (arch-quality-attributes); inny tylko z uzasadnieniem w czynnikach.
8. **Ryzyka i spike'i** — dla każdej niepewności: eksperyment ograniczony czasem i **kryterium porzucenia** wyboru.
9. **Mapowanie na zespół agentów** — potrzebne skille: dostępne / do utworzenia (`python3 factory/build.py new-skill …`),
   sugerowany `stack` person realizujących (np. `[fw-angular, lang-typescript, tool-nx]`).
10. **Zapis** — stack-decision.md (`proposed`), ADR dla decyzji kluczowych, wiersze w decisions.md, wpis w dzienniku; akceptuje człowiek.

Gdy problemem jest tarcie zespołów (wolny build, długi feedback, standardy dla wielu zespołów), a nie sam wybór
technologii — najpierw diagnoza DevEx i koszt migracji w fe-engineering-levels; zakup lub zmiana narzędzia to wynik
tej diagnozy.

## Anty-wzorce
Wybór pod CV lub modę; benchmarki bez związku z czynnikami; mikroserwisy „na zapas”; wersje spoza zakresu zgodności;
rekomendacja bez kompetencji i ograniczeń zespołu; fakty (wersje, licencje, EOL) z pamięci.

## Przykład
**Sytuacja:** „Backend aplikacji usterkowej; 4 osoby piszą w TypeScripcie, front w Angularze, dane w UE.”
**Wynik** (wszyscy kandydaci przeszli filtry obowiązkowe; fakty od `researcher` ze źródłem i datą):

| Kryterium (waga) | A: TypeScript + Node.js („nudna”) | B: Java + Spring | C: Go |
|---|---|---|---|
| kompetencje zespołu (5) | 5 | 2 | 2 |
| przyjazność dla agentów AI (4) | 5 | 4 | 2 (brak skilla `lang-go`) |
| **Suma ważona (7 kryteriów)** | **106** | 95 | 82 |

Decyzja `proposed`: A + PostgreSQL (konkurencja o przydział zgłoszeń), modularny monolit; ADR, akceptuje człowiek.
Więcej przykładów: `references/przyklady.md`.
