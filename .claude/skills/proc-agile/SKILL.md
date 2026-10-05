---
name: proc-agile
description: Użyj przy organizacji pracy zespołu — Scrum, Kanban i metryki przepływu, historyjki (INVEST), Definition of Done.
metadata:
  katalog: "Użyj przy planowaniu i organizacji pracy zespołu — wartości i zasady Manifestu Agile, Scrum (Scrum Guide 2020 + Expansion Pack 2025), Kanban i metryki przepływu, historyjki użytkownika (INVEST, cięcie pionowe), Definition of Done, prognozowanie. Nie do skalowania na wiele zespołów (proc-safe) ani ekonomii przepływu (proc-lean)."
  slowa: "jeden zespół, Scrum czy Kanban, sprint, retrospektywa, daily, planowanie sprintu, tablica Kanban, limit WIP"
---

# Agile: Scrum i Kanban w praktyce

## Manifest — sedno
Ludzie i interakcje, działające oprogramowanie, współpraca z klientem, reagowanie na zmiany — **ponad** procesy i narzędzia,
dokumentację, negocjacje kontraktu i trzymanie się planu (prawe strony też mają wartość). Kluczowe zasady: częste
dostarczanie działającego oprogramowania, zmiana wymagań jest mile widziana, codzienna współpraca biznesu i zespołu,
zrównoważone tempo, prostota — sztuka maksymalizacji pracy **niewykonanej**, regularna refleksja i dostosowanie.

## Scrum (Scrum Guide 2020)
- **Filary empiryzmu**: przejrzystość, inspekcja, adaptacja. **Wartości**: zaangażowanie, skupienie, otwartość, szacunek, odwaga.
- **Odpowiedzialności**: Developers (jak), Product Owner (co i w jakiej kolejności, maksymalizacja wartości), Scrum Master (skuteczność zespołu i Scruma).
- **Wydarzenia**: Sprint (≤ 1 miesiąc), Sprint Planning (dlaczego/co/jak), Daily Scrum (15 min, postęp ku celowi Sprintu),
  Sprint Review (inspekcja wyniku z interesariuszami), Sprint Retrospective (jak pracujemy).
- **Artefakty i zobowiązania**: Product Backlog → **Product Goal**; Sprint Backlog → **Sprint Goal**; Increment → **Definition of Done**.
- **Expansion Pack (2025)** — opcjonalny *dodatek*, nie zastępstwo: nacisk na wyniki (outcomes) zamiast samych funkcji,
  praca w niepewności, zespoły korzystające z AI.

## Kanban
- Wizualizuj przepływ, **ograniczaj pracę w toku (WIP)**, aktywnie zarządzaj przepływem, jawne zasady (np. definicja „gotowe” dla kolumn), doskonal.
- **Metryki przepływu**: WIP, przepustowość (throughput), czas cyklu (cycle time), **wiek elementu pracy** (work item age — najlepszy wczesny sygnał problemu).
- Zasada: kończ, zanim zaczniesz nowe („stop starting, start finishing”).

## Historyjki i backlog
- Historyjka = potrzeba użytkownika i wartość, nie zadanie techniczne: „Jako … chcę … aby …” + **kryteria akceptacji** (Given/When/Then — eng-testing).
- **INVEST**: niezależna, negocjowalna, wartościowa, szacowalna, mała, testowalna.
- **Cięcie pionowe** (przez UI → logikę → dane), nie warstwami. Techniki: po ścieżkach procesu, regułach biznesowych, wariantach danych, interfejsach; z wyników Event Stormingu — po zdarzeniach (ddd-event-storming).
- **Definition of Done** wspólna i sprawdzalna (testy, review, dokumentacja, wdrożone na środowisko…).

## Prognozowanie
Zamiast obietnic z estymat — prognozy z danych: przepustowość historyczna + symulacja Monte Carlo („85% szans na X elementów do daty Y”).
Estymaty (np. punkty) traktuj jako narzędzie rozmowy o zrozumieniu, nie miarę wydajności.

## Anty-wzorce
„Scrum-ceremonie bez empiryzmu”, sprint jako mini-waterfall, Daily jako raport dla przełożonego, velocity jako cel,
backlog jako lista życzeń bez kolejności, brak działającego przyrostu na koniec sprintu.

## Przykład
**Sytuacja:** „Ile elementów zrobicie w 6 tygodni?” Przepustowość z 10 tygodni: 4, 6, 3, 5, 7, 2, 5, 6, 4, 5.
**Wynik:** zamiast średniej × 6 (≈ 28, czyli ok. 50% szans) — Monte Carlo, 10 000 symulacji z losowaniem tygodni
z historii:

| Pewność | 50% | 70% | 85% | 95% |
|---|---|---|---|---|
| Elementów w 6 tygodni (co najmniej) | 28 | 26 | 25 | 22 |

Odpowiedź: „85% szans na co najmniej 25 elementów w 6 tygodni”; prognozę odświeżasz co tydzień.

Więcej przykładów: `references/przyklady.md`.
