---
name: core-delivery-lifecycle
description: Użyj, gdy projekt idzie od pomysłu przez wdrożenie do utrzymania — fazy, persony, bramki, pętla z agentami AI, gotowość.
metadata:
  katalog: "Użyj, gdy projekt ma przejść całą drogę od pomysłu do oprogramowania gotowego do wdrożenia — kolejność faz, persony i skille w każdej fazie, kryteria wejścia i wyjścia, bramki zatwierdzane przez człowieka, definicja „gotowe do produkcji”, utrzymanie po wydaniu (łatki, aktualizacje, wygaszanie funkcji, pasma kontrolne metryk), proces wytwarzania z agentami AI (pętla artefaktów, plan przed kodem, ewaluacje konfiguracji agenta, przegląd PR przez AI, miary etapów), ścieżka skrócona dla małych projektów i przebieg próbny. Nie do treści pojedynczej fazy (skille ddd-*, arch-*, qa-*, ops-*)."
  slowa: "cykl życia oprogramowania, SDLC, AI-native, proces z agentami AI, przebudować proces wytwarzania, przeglądy nie nadążają, pętla, metryki procesu, pasma kontrolne, Western Electric, AI-DLC, od pomysłu do produkcji, utrzymanie po wydaniu"
---

# Cykl dostarczenia — od pomysłu do produkcji

Model pracy: **agenci prowadzą i wykonują, człowiek zatwierdza i odpowiada.** Fabryka przeprowadza projekt przez
wszystkie fazy, ale na bramkach (B1–B6) zatrzymuje się na decyzję człowieka. Bramki są obowiązkowe, nie
grzecznościowe. Agent nie ustawia `accepted` i nie wdraża na produkcję sam (core-project-record, ops-release-engineering).

Każda faza kończy się artefaktem w `docs/project/` (core-project-record), a nie tylko odpowiedzią w rozmowie. Każda
faza może być osobną sesją innej persony. Następna sesja zaczyna od `python3 .claude/hooks/project_record.py status`,
TL;DR i sekcji Przekazanie.

## Kto prowadzi
- **Start**: `claude --agent maja`. Maja przepytuje (core-plan-interview), ocenia skalę i ryzyko, wybiera ścieżkę
  (pełną albo skróconą) i zapisuje plan faz z personami w `01-discovery/brief.md` (sekcja „Plan faz”).
- **Fazy**: człowiek uruchamia personę wskazaną w Przekazaniu poprzedniej fazy. Persona deleguje do swoich wykonawców.
- **Człowiek**: właściciel produktu i zatwierdzający. Odpowiada na otwarte pytania, akceptuje na bramkach,
  dostarcza konta, sekrety i dostępy, uruchamia wdrożenie produkcyjne.

## Fazy
| # | Faza | Katalog | Persona (domyślnie) | Skille wiodące | Wyjście (kryterium „gotowe”) |
|---|---|---|---|---|---|
| 0 | Przyjęcie i plan faz | `01-discovery/` | Maja | core-problem-routing, core-plan-interview, proc-project-planning | brief z problemem, celem, użytkownikami, zakresem i „poza zakresem”, ograniczeniami (budżet, termin, regulacje), ścieżką i planem faz; przy projekcie z budżetem i terminem plan projektu (`project-plan.md`: koszt i termin jako przedziały P50/P80, kamienie milowe, rejestr ryzyk) |
| 1 | Odkrywanie produktu | `01-discovery/` | Natalia | proc-product-discovery, fe-ux-design | hipotezy i metryki sukcesu, przepływy i stany, makiety kluczowych ekranów, ryzyka produktu; co sprawdzić z prawdziwymi użytkownikami |
| 2 | Domena | `02-domain/` | Ewa | ddd-discovery-intake, ddd-event-storming, ddd-strategic-analysis, ddd-context-mapping | słownik, zdarzenia i procesy, konteksty i mapa kontekstów, sprzeczności i pytania do eksperta |
| 3 | Wymagania | `03-requirements/` | Ewa (+ Natalia) | ddd-tactical-design, qa-spec-first-testing | wymagania z kryteriami akceptacji (przykłady), wymagania jakości jako scenariusze (arch-quality-attributes), priorytety; dane osobowe wypisane przy wymaganiach, które ich dotyczą |
| 4 | Architektura | `04-architecture/` | Tomasz | arch-system-design, arch-tech-selection, arch-quality-attributes, arch-threat-modeling, arch-privacy-compliance, arch-architect-practice | decyzja o stacku, dokument architektury (C4), ADR, model zagrożeń, szacunki, strategia danych, wdrożenia i obserwowalności; przy danych osobowych `privacy.md` (inwentarz, podstawy, retencja, decyzja o DPIA) |
| 5 | Plan | `05-plan/` | Tomasz + Kasia | eng-continuous-delivery, qa-test-design | cięcia pionowe w kolejności (szkielet end-to-end jako pierwszy krok), plan testów z ryzykami, wykonawcy |
| 6 | Realizacja | `06-delivery/` | Ola / Jan / Filip / Ada / Marek (wg stacku) + Kasia | lang-*, fw-*, be-*, fe-*, eng-testing, core-git-workflow | dla każdego kroku: kod, testy, przegląd, raport kroku; pipeline CI zielony od pierwszego kroku |
| 7 | Przygotowanie do wydania | `06-delivery/`, `07-review/` | Piotr + security-reviewer + Kasia | ops-ci-cd, ops-docker, ops-iac-terraform, ops-kubernetes, ops-release-engineering, ops-observability, ops-sre-incidents, ops-supply-chain-security, ops-secrets-identities | środowiska jako kod, wdrożenie na środowisko testowe, przegląd bezpieczeństwa, testy regresji i wydajności, runbook, przegląd gotowości (`references/gotowosc-produkcyjna.md`) |
| 8 | Wydanie i obserwacja | `07-review/` | **człowiek** wdraża; Piotr przygotowuje i obserwuje | ops-release-engineering, core-semver, ops-sre-incidents | wdrożenie stopniowe z bramkami SLO, obserwacja po wydaniu, retrospektywa i lekcje |
| 9 | Utrzymanie | `08-operations/` | Piotr (niezawodność, łatki, aktualizacje) + persona realizująca (poprawki) + Kasia (regresja) | ops-sre-incidents, proc-issue-triage, eng-debugging, ops-dependency-upgrades, ops-supply-chain-security, qa-regression, ops-finops | cykliczny przegląd utrzymania (`operations-review.md`), poprawki błędów z testem regresyjnym, łatki bezpieczeństwa w terminie, aktualizacje przed końcem wsparcia, wycofywanie funkcji, koszty |

Dokumentacja (core-tech-docs) powstaje w trakcie, nie na końcu: README i instrukcja uruchomienia od fazy 6, runbook
w fazie 7. Korekta języka (Stefan) przed oddaniem dokumentów ludziom.

## Praca z agentami — pętla, nie linia
Gdy agenci piszą kod w godziny, wolne stają się planowanie, przegląd, wdrożenie i utrzymanie — tam usprawniasz proces
(`references/ai-native-sdlc.md`, na podstawie playbooka Anthropic i AI-DLC AWS):
- **Każdy etap kończy się artefaktem w repozytorium**, a następny zaczyna od jego przeczytania. Łańcuch: brief
  (zamiar) → wymagania i architektura (specyfikacja) → plan → diff z testami → PR z ustaleniami przeglądu → zapis
  z utrzymania, który wraca jako nowy brief zmiany. Ciąg commitów to ślad audytowy.
- **Nic bez zaakceptowanego planu:** krok realizacji zaczyna się od planu w trybie planowania (pliki, kolejność,
  testy), zapisanego w raporcie kroku przed kodem; odstępstwo = aktualizacja planu w tym samym commicie.
- **Agent sam sprawdza swoją pracę** jednym poleceniem weryfikacji, zanim zobaczy ją człowiek; poprawka błędu zaczyna
  się od czerwonego testu, którego agent nie osłabia (`tdd_guard`, reguły A–C).
- **Ewaluacje konfiguracji agenta** (prawdziwe zadania z oczekiwanym wynikiem) przy każdej zmianie `CLAUDE.md`,
  skilli, hooków i modelu; każdy incydent dodaje scenariusz.
- **Agent robi wszystko do bramki produkcyjnej i nic za nią:** przegląd PR przez AI wg `REVIEW.md`, scalenie
  i wdrożenie zatwierdza człowiek, agent nie zatwierdza własnego kodu.
- **Utrzymanie przez pasma kontrolne** (`scripts/control_band.py`): wykrywanie deterministyczne, reakcja stopniowana
  (zapis → diagnoza tylko do odczytu → PR lub zatwierdzony runbook).
- **Błąd agenta powtórzony drugi raz** → poprawka trafia do `CLAUDE.md` (za zgodą człowieka).

## Bramki człowieka
| Bramka | Po fazie | Człowiek zatwierdza | Bez zatwierdzenia |
|---|---|---|---|
| **B1** Zakres | 0–1 | problem, cel, metryki sukcesu, zakres i „poza zakresem”, budżet | dalsza praca tylko jako `draft` |
| **B2** Wymagania | 3 | wymagania i kryteria akceptacji, wymagania jakości, priorytety | architektura oznaczona „oparta na propozycji” |
| **B3** Architektura | 4–5 | stack, kluczowe ADR, model zagrożeń, koszt utrzymania, plan | realizacja nie startuje (poza szkieletem do weryfikacji ryzyka, za zgodą) |
| **B4** Gotowość | 7 | wynik przeglądu gotowości, ryzyka zaakceptowane świadomie, decyzja „wydajemy / nie wydajemy” | brak wydania |
| **B5** Wydanie | 8 | uruchomienie wdrożenia produkcyjnego i ewentualnego wycofania | agent tylko przygotowuje |
| **B6** Utrzymanie | 9 (cyklicznie) | priorytety poprawek, terminy łatek, aktualizacje do wykonania, funkcje do wycofania, budżet utrzymania | propozycje czekają; łatki krytyczne wg ustaleń z człowiekiem |

Między bramkami człowiek odpowiada na otwarte pytania. Agent nie zgaduje decyzji biznesowych ani prawnych, tylko
zapisuje je jako pytanie z adresatem. Każda zmiana zaakceptowanego artefaktu to nowa wersja i ponowna akceptacja.

## Faza 9 — utrzymanie
Wydanie nie kończy projektu. Utrzymanie to stały rytm, a nie reakcja na awarie:
- **Cykl:** przegląd utrzymania co tydzień lub co sprint (`08-operations/<data>-przeglad.md`, szablon
  `operations-review`) — SLO i incydenty, zgłoszenia według wagi, łatki, aktualizacje, koszty, funkcje do wycofania.
  Metryki (odsetek 5xx, porażki testów, czas cyklu PR) sprawdzasz pasmami kontrolnymi:
  `python3 .claude/skills/core-delivery-lifecycle/scripts/control_band.py metryka.csv --baseline 30 --side upper`.
  Decyzje z przeglądu zatwierdza człowiek (**B6**).
- **Zgłoszenia:** przegląd i kategorie (proc-issue-triage); błąd → przyczyna (eng-debugging) → test regresyjny
  czerwony → poprawka → wydanie jak w fazach 7–8, w skali poprawki (ścieżka skrócona, B4 i B5 zostają).
- **Łatki bezpieczeństwa:** krytyczna podatność w komponencie wystawionym na zewnątrz ma szybką ścieżkę z wyjątkiem
  od karencji (ops-supply-chain-security). Termin ustala człowiek.
- **Aktualizacje:** drobne regularnie, główne przed końcem wsparcia, pojedynczo i z planem (ops-dependency-upgrades).
  Agent nie podnosi zależności bez prośby — przegląd utrzymania zawiera propozycje do zatwierdzenia.
- **Wycofywanie funkcji:** decyzja człowieka na podstawie danych użycia; ogłoszenie z datą, okres przejściowy,
  wersja zgodna z SemVer (core-semver: oznaczenie jako przestarzałe w MINOR, usunięcie w MAJOR), usunięcie kodu
  i danych zgodnie z retencją (arch-privacy-compliance).
- **Koniec życia systemu:** plan wygaszenia (dane: eksport, archiwum lub usunięcie; użytkownicy: komunikat i termin;
  infrastruktura: likwidacja zasobów i kosztów — ops-finops) jako osobny mini-projekt z bramkami B1 i B5.

## Ścieżka skrócona (mały projekt, niskie ryzyko)
Kryteria: jeden zespół, kilka ekranów lub endpointów, brak danych wrażliwych i regulacji, łatwe wycofanie.
Fazy 0–1 łącznie w jednym briefie, faza 2 pominięta (słownik w briefie), 3–5 w jednym dokumencie
(wymagania z przykładami + krótka architektura + plan), bramki B1+B2+B3 jako jedna akceptacja. **B4 i B5 zostają
zawsze**, a przegląd gotowości w wersji skróconej (sekcje oznaczone „minimum” w `gotowosc-produkcyjna.md`).

## Zasady przebiegu
- **Szkielet najpierw**: pierwszy krok realizacji przechodzi przez wszystkie warstwy i pipeline aż do środowiska
  testowego. Problemy z wdrożeniem wychodzą w pierwszym tygodniu, nie w ostatnim.
- **Ryzyko najpierw**: najmniej pewne elementy (integracja zewnętrzna, wydajność, nowa technologia) sprawdzasz
  prototypem przed B3 albo w pierwszych krokach.
- **Testy od wymagań**: przypadki testowe z kryteriów akceptacji powstają przed kodem lub równolegle (Kasia w
  clean-room), nie z kodu.
- **Mierzalny koniec kroku**: krok realizacji kończy się poleceniem, które daje wynik „przechodzi / nie przechodzi”
  (testy z kryteriów akceptacji, build, lint). Przy dłuższym kroku człowiek może ustawić `/goal` z takim warunkiem,
  np. `/goal testy kroku 3 przechodzą (npm test kończy się kodem 0), inne testy bez zmian, albo stop po 30 turach`.
  Model oceniający widzi tylko rozmowę, więc agent pokazuje wynik polecenia zamiast pisać „działa”. Po zaliczeniu
  następuje przegląd w świeżym kontekście (`/code-review` albo security-reviewer), bo autor nie ocenia własnej pracy.
- **Bez cichych zmian zakresu**: nowe wymaganie w trakcie realizacji wraca do fazy 3 jako nowa wersja.
- **Koszt**: tanie modele do wyszukiwania i zmian mechanicznych, drogie do architektury i przeglądu bezpieczeństwa.
  Raport kosztu i czasu w retrospektywie.
- **Stan zawsze w plikach**: przerwana sesja zostawia `draft` i Przekazanie. `project_record.py report` daje
  człowiekowi jeden plik ze stanem projektu.

## Czego fabryka nie zrobi sama
Decyzje biznesowe, prawne i dotyczące ryzyka; testy z prawdziwymi użytkownikami; zakładanie kont, domen, płatności
i umów; dostarczenie sekretów; testy penetracyjne bez pisemnej zgody na zakres; wdrożenie produkcyjne; podnoszenie
zależności bez prośby. To wszystko jest w planie faz jako zadania dla człowieka z terminem.

## Więcej
- Definicja „gotowe do produkcji” i przegląd gotowości: `references/gotowosc-produkcyjna.md`.
- Przebieg próbny na małym projekcie (jak sprawdzić, czy fabryka dowozi): `references/przebieg-probny.md`.
- Pętla AI-native: artefakty, miary każdego etapu, ewaluacje, przegląd PR, pasma kontrolne, źródło prawdy, ustawienia
  zarządzane, AI-DLC: `references/ai-native-sdlc.md`.

## Checklista
- [ ] ścieżka (pełna lub skrócona) i plan faz zapisane w briefie po fazie 0
- [ ] każda faza zakończona artefaktem z TL;DR, otwartymi pytaniami i Przekazaniem
- [ ] bramki B1–B6 zatwierdzone przez człowieka i zapisane w `decisions.md`
- [ ] szkielet end-to-end jako pierwszy krok realizacji
- [ ] przegląd gotowości przed wydaniem, ryzyka zaakceptowane jawnie
- [ ] retrospektywa i lekcje po wydaniu
- [ ] po wydaniu: cykliczny przegląd utrzymania z decyzjami człowieka (B6)

## Źródła
- Konwencje fabryki: core-project-record, eng-continuous-delivery, ops-release-engineering
- Google SRE — Production Readiness Review; J. Humble, D. Farley, *Continuous Delivery*; A. Cockburn — walking skeleton
- GOV.UK Service Manual — etapy live i retirement (wygaszanie usługi)
- Anthropic, „The AI-Native SDLC Playbook” (21.08.2026) i kurs Anthropic Academy; AWS, „AI-Driven Development Life Cycle” (31.07.2025)
Opisane własnymi słowami.
