---
name: arch-quality-attributes
description: Użyj przy atrybutach jakości — scenariusze, kompromisy, fitness functions, dobór stylu (monolit modularny, mikroserwisy, zdarzenia).
metadata:
  katalog: "Użyj przy ustalaniu czynników architektonicznych — scenariusze atrybutów jakości (wydajność, dostępność, bezpieczeństwo, modyfikowalność…), ograniczenia, priorytetyzacja (drzewo użyteczności), kompromisy, fitness functions i dobór stylu architektury (modularny monolit, mikroserwisy, zdarzenia). Nie do wyboru konkretnych technologii (arch-tech-selection)."
---

# Atrybuty jakości i style architektury

Architekturę wyznaczają **czynniki (drivers)**: najważniejsze atrybuty jakości, ograniczenia i kluczowe funkcje.
Bez nich wybór technologii to gust.

## Scenariusz atrybutu jakości (zapis w requirements.md)
`źródło → bodziec → (środowisko) → artefakt → odpowiedź → miara`, np.
„100 użytkowników jednocześnie rezerwuje salę w szczycie → system przyjmuje żądania → p95 < 300 ms, 0 podwójnych rezerwacji”.
Scenariusz bez miary nie jest scenariuszem („system ma być szybki”).

Atrybuty do przejrzenia (ISO 25010, skrót): wydajność, dostępność/niezawodność, bezpieczeństwo, modyfikowalność,
testowalność, skalowalność, użyteczność i dostępność (a11y), interoperacyjność, przenośność, koszt utrzymania, zgodność z przepisami.
Scenariusz dostępności lub wydajności zapisuj od razu jako SLI i SLO (stosunek dobrych zdarzeń, próg, okno czasu), a zobowiązania
wobec klientów jako SLA luźniejsze od SLO — ops-sre-incidents, `.claude/skills/ops-sre-incidents/references/sli-slo-sla.md`.

## Priorytety — drzewo użyteczności
Każdy scenariusz: **(ważność dla biznesu, trudność techniczna)** w skali H/M/L. Architekturę kształtują scenariusze **(H,H)** —
3–5 sztuk. Reszta to wymagania do spełnienia „zwykłymi” środkami.

## Kompromisy
Nazwij je jawnie w ADR: np. spójność natychmiastowa ↔ dostępność, wydajność ↔ modyfikowalność (cache, denormalizacja),
bezpieczeństwo ↔ użyteczność. **Punkt wrażliwości** = decyzja, od której zależy atrybut; **punkt kompromisu** = decyzja
wpływająca na kilka atrybutów w przeciwnych kierunkach.

## Style architektury — domyślnie najprostszy
| Styl | Kiedy | Koszt |
|---|---|---|
| **Modularny monolit** (domyślny) | jeden zespół lub kilka, konteksty jako moduły z granicami (ddd-context-mapping, tool-nx) | niski; granice pilnowane testami architektury |
| Mikroserwisy | niezależne wdrażanie/skalowanie kontekstów, wiele autonomicznych zespołów (proc-team-topologies), różne wymagania niezawodności | wysoki: sieć, spójność ostateczna, obserwowalność, platforma |
| Architektura zdarzeniowa | integracja wielu kontekstów, reakcje asynchroniczne, audyt | złożoność śledzenia przepływów |
| Serverless / BaaS | nieregularny ruch, mały zespół, generyczne subdomeny | uzależnienie od dostawcy, limity |
Pełniejszy katalog (warstwy, klient–serwer, SOA, peer-to-peer, mikrojądro, tablica, publish–subscribe, potoki
i filtry, MVC/MVVM) z sygnałami złego wyboru: `references/katalog-stylow.md`.
Architektura danych (ACID, CAP i PACELC, spójność ostateczna, rodzaje baz NoSQL, OLTP vs OLAP, hurtownie, ETL/ELT,
CDC, przetwarzanie wsadowe i strumieniowe): `references/architektura-danych.md`.
Słownik wzorców chmurowych (44 wzorce z mapą na skille fabryki) i wybór platformy uruchomieniowej (PaaS, funkcje,
kontenery, Kubernetes, maszyny): `references/wzorce-chmurowe.md`.
Przejście monolit → usługi rób dopiero, gdy konkretny scenariusz (H,H) tego wymaga — wydzielaj po granicach kontekstów.

## Fitness functions
Zamień kluczowe atrybuty na automatyczne testy w CI: lint granic modułów, budżet wydajności (p95 w teście obciążeniowym),
budżet rozmiaru paczki frontu, skan zależności, test odtworzenia po awarii. Architektura, której nikt nie sprawdza, dryfuje.
Modyfikowalność da się zmierzyć: raport wpływu zmian dla metryki biznesowej (ddd-model-stress-test — ile wymagań zmienia 0–1 moduł)
oraz profil sprzężeń krytycznych granic (ddd-connascence-analysis — pasmo dynamiczne nie rośnie między wydaniami).

## Wynik
Sekcja „Atrybuty jakości” w `03-requirements/requirements.md`, „Czynniki decyzyjne” w `04-architecture/stack-decision.md`,
styl i kompromisy w ADR (core-project-record).

## Przykład
**Sytuacja:** „System rezerwacji sal ma być szybki i niezawodny — spisz wymagania jakościowe.”
**Wynik** (scenariusze z miarą i priorytetem):

| ID | Scenariusz | Priorytet |
|---|---|---|
| QA-1 | 100 pracowników rezerwuje w szczycie 8:45–9:15 → API przyjmuje żądania → p95 < 300 ms | (H,H) |
| QA-2 | 2 osoby rezerwują ten sam slot w tej samej sekundzie → 0 podwójnych rezerwacji | (H,H) |
| QA-3 | użytkownik otwiera kalendarz → SLO 99,5% udanych żądań w oknie 30 dni | (H,M) |

Styl: modularny monolit. Fitness functions: test obciążeniowy z progiem p95 dla QA-1, test współbieżny (50 prób → 1 sukces) dla QA-2.
Więcej przykładów: `references/przyklady.md`.
