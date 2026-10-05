---
name: core-problem-routing
description: Użyj, gdy problem opisano zwykłym tekstem — rozpoznanie wymiarów, dobór skilli i person, doraźny zespół, forma wyniku.
metadata:
  katalog: "Użyj, gdy dostajesz problem opisany zwykłym tekstem i nie wiadomo, kto i jak ma się nim zająć — rozpoznanie wymiarów, dobór skilli i person z katalogu, zestawienie doraźnego zespołu, wybór formy wyniku (rekomendacja, plan, rozwiązanie krok po kroku). Nie do samej wiedzy merytorycznej (skille wymiarów) ani łączenia skilli w jednej odpowiedzi (core-skill-composition)."
  slowa: "od czego zacząć, kogo zaangażować, dobierz zespół, skład zespołu, podejście do problemu, nie wiem jak się do tego zabrać"
argument-hint: "[opis problemu]"
---

# Dobór zespołu i podejścia do problemu

Źródło prawdy o tym, co zespół potrafi: **`.claude/catalog.md`** (generowany — skille wg wymiarów, persony z wykonawcami,
agenci wspólni). Czytasz go zamiast wszystkich skilli; skill wczytujesz dopiero wtedy, gdy go wybrałeś.

## 1. Zrozum problem (2–5 zdań, zanim cokolwiek dobierzesz)
- **Co jest problemem, a co objawem?** Parafraza z celem i kryterium sukcesu („kiedy uznamy, że jest rozwiązany?”).
- **Ograniczenia:** czas, ludzie/zespoły, ryzyko, czego nie wolno (np. „bez zamrażania kodu”), wersje, budżet.
- **Rodzaj pytania:** decyzja (co wybrać) · plan (jak przejść z A do B) · diagnoza (dlaczego nie działa) · wykonanie (zrób).
- Luki, które zmieniają odpowiedź → **1–3 pytania** z wartością domyślną (bramka — ddd-facilitation). Człowiek niedostępny →
  przyjmij domyślne i wypisz je jako założenia. Stan repo sprawdzaj sam (`detect_stack.py`, `scout`), nie pytaj o to człowieka.

## 2. Rozłóż na wymiary (katalog)
Dla każdego wymiaru z katalogu zadaj pytanie: *czy problem ma tę składową?* Typowe:
| Sygnał w opisie | Wymiar → przykładowe skille |
|---|---|
| wersje, migracja, aktualizacja bibliotek | `tool-*`, `fw-*`, `lang-*` (sekcje „Zależne od wersji”), core-stack-sync |
| wiele zespołów, własność, koordynacja, priorytety | proc-team-topologies, proc-agile/proc-lean, proc-safe |
| podział na domeny/moduły, zależności między nimi | ddd-strategic-analysis, ddd-context-mapping, tool-nx (granice), ddd-connascence-analysis |
| „bez przestojów / bez freeze”, wydania, gałęzie | eng-continuous-delivery, core-git-workflow, ops-ci-cd |
| ryzyko regresji, testy | qa-regression, eng-testing, eng-behavior-preserving-refactoring |
| UI, design system, dostępność | fe-architecture, fe-css, fe-web-platform, fe-engineering-levels |
| reguły biznesowe, pojęcia domeny | ddd-*, dom-* |
| decyzja technologiczna, architektura | arch-quality-attributes, arch-tech-selection |
| bezpieczeństwo, podejrzana paczka, incydent, tokeny/sesje | be-auth-security, ops-supply-chain-security, ops-secrets-identities, core-agent-security |
| model zagrożeń, ryzyko bezpieczeństwa nowej funkcji | arch-threat-modeling |
| co budować, priorytety, metryki sukcesu, eksperyment A/B, gotowość do wydania | proc-product-discovery (persona Natalia) |
| przepływ użytkownika, stany ekranów, makieta, prototyp, test użyteczności, teksty interfejsu | fe-ux-design (persona Natalia) |
| potok danych, ETL/ELT, CDC, Airflow, dbt, jakość danych, pochodzenie, kontrakt danych | data-engineering (persona Zofia) |
| pytanie do danych, raport, dashboard, statystyka, testy hipotez, segmentacja, prognoza | data-analysis (persona Zofia) |
| wolny kod, złożoność, dobór struktury danych, algorytm (sortowanie, grafy, DP) | eng-algorithms-data-structures |
| cały projekt od pomysłu do oprogramowania gotowego do wdrożenia; czy to jest gotowe do produkcji | core-delivery-lifecycle |
| zaprojektuj system od wymagań (szacunki, API, dane, skalowanie, wysoka dostępność) | arch-system-design |
| podobny system był już projektowany (skracacz linków, oś czasu, robot sieciowy, ranking, cache zapytań) | arch-system-design, `przyklady-projektow.md` |
| praca architekta: poziomy, decyzje, szacowanie, przegląd architektury, arc42/C4, TOGAF/ITIL | arch-architect-practice |
| serwer nie działa, sieć, DNS, TLS, SSH, nginx/proxy, poczta nie dochodzi (SPF/DKIM/DMARC) | ops-linux-networking |
| test wydajnościowy, obciążenia, przeciążenia, k6, Gatling | qa-performance-testing |
| wykrywanie ataków, SIEM, podatności i łatki, incydent bezpieczeństwa, zgodność (SOC 2, ISO 27001) | ops-security-operations |
| wdrożenia, Kubernetes, SLO, awarie, dyżury, koszty chmury | ops-release-engineering, ops-kubernetes, ops-sre-incidents, ops-finops (persona Piotr) |
| własne modele AI, GPU, serwowanie LLM | ops-ai-inference, ops-kubernetes, ops-sre-incidents |
| „co nowego / co się dzieje”, stan projektu, opinie społeczności | core-source-research (+ `researcher` do faktów) |
| nieznany kod, onboarding, wpływ zmiany, dług techniczny | eng-codebase-mapping, eng-tech-debt-audit |
| diagramy, strona z wyjaśnieniem, prezentacja, przegląd UI, SEO | core-tech-docs (references), fe-css (przegląd UI), fe-web-platform (SEO) |
| płytkie moduły, kształt interfejsu, gdzie postawić spoinę, „jak ułatwić tę zmianę” | eng-module-depth |
| plan lub pomysł do przepytania przed startem | core-plan-interview |
| zgłoszenia i PR z zewnątrz, backlog do przejrzenia | proc-issue-triage |
| ręczna konfiguracja usług, klucze, sekrety CI, migracja krok po kroku dla człowieka | ops-setup-wizard |
| nauka tematu przez wiele sesji, wdrożenie w nowy stack | core-teaching-workspace (tylko na polecenie `/core-teaching-workspace`) |
Wybierz **najmniejszy zestaw**: zwykle 3–6 skilli, po jednym na wymiar.
**Skille spoza katalogu:** przejrzyj też listę dostępnych skilli, którą pokazuje Claude Code (projekt, `~/.claude/skills`,
wtyczki). Skill z ustaleniami tego projektu lub firmy (np. `architecture`, `documentation`) dołącz do zestawu i oznacz
„(spoza fabryki)” — w briefie dla wykonawcy też. Pierwszeństwo przy sprzecznościach: core-skill-composition.
Wymiar bez żadnego skilla → „luka” (fakty dobierze `researcher`; na stałe — propozycja nowego skilla).

## 3. Dobierz wykonawców — od najtańszego
1. **Istniejąca persona pasuje w całości** (katalog: skille wiodące) → poleć ją człowiekowi (`claude --agent <persona>`) albo, jeśli
   masz jej wykonawcę w zespole, deleguj do `<persona>-<rola>`.
2. **Potrzebne połączenie wiedzy kilku person** → **doraźny zespół**: po jednym wykonawcy na perspektywę; gdy żadna persona nie ma
   właściwego zestawu, użyj `specialist` z listą skilli w briefie (wczyta je sam) — to persona „na chwilę”.
3. **Decyzja trudna do odwrócenia / sprzeczne kompromisy** → `specialist-deep` albo `architect` (Opus) tylko do oceny opcji.
4. **Fakty zewnętrzne** (wersje, zgodność, EOL, changelogi) → `researcher` (tani), nigdy z pamięci.
Równoległe perspektywy wywołuj w **jednej wiadomości** (osobne konteksty = niezależne spojrzenia). Brief dla każdego: problem,
ograniczenia, założenia, lista skilli do wczytania, pytanie, na które ma odpowiedzieć, format raportu (≤ 20 linii).

## 4. Wybierz formę wyniku
| Forma | Kiedy | Zawartość |
|---|---|---|
| **Rekomendacja** | decyzja, niepewność, kilka dróg | 2–3 opcje z kompromisami · rekomendacja z warunkami, kiedy zmienić zdanie · ryzyka |
| **Plan** | przejście z A do B, wiele osób | fazy z celem i kryterium wyjścia · kto (zespół/rola) · zależności i kolejność · kamienie milowe · ryzyka i plan B |
| **Rozwiązanie krok po kroku** | wykonanie jest jasne | kroki z poleceniami i weryfikacją po każdym · punkty kontrolne · wycofanie |
Nie wskazano → rekomendacja + plan (najczęściej to, czego człowiek potrzebuje). Zawsze: **założenia**, **co sprawdzić najpierw**
(tanie testy hipotez), **czego nie wiemy**.

## 5. Synteza i zapis
- Połącz raporty; sprzeczności między perspektywami pokaż wprost (to zwykle najcenniejsza część).
- **Kontrola spójności przed oddaniem:** czy rekomendacja nie łamie własnych założeń lub twierdzeń (np. „nie da się mieć dwóch
  wersji pakietu” obok „zainstaluj obie wersje przez alias”)? Czy fakty wersyjne pochodzą ze skilla, repo albo `researcher`?
- **Założenie-zawias:** nazwij jedno–dwa założenia, od których zależy cały plan, jak je tanio sprawdzić i **wariant B**, gdy okażą się fałszywe.
- Wynik do człowieka po polsku (txt-polish-correctness); dłuższy dokument → `docs/project/` (plan: `05-plan/`, decyzja: ADR)
  wg core-project-record, status `proposed`.
- Na końcu **skład zespołu**, który zadziałał: persony/skille. Jeśli połączenie było nowe i przyda się znowu → zaproponuj
  plik `factory/personas/<nazwa>.yaml` (zmiana w `factory/` wymaga zgody człowieka).

## Checklista
- [ ] problem sparafrazowany, kryterium sukcesu i ograniczenia nazwane; założenia wypisane
- [ ] wymiary z katalogu przejrzane; wybrane skille (3–6) i uzasadnienie; luki nazwane
- [ ] wykonawcy od najtańszego; fakty zewnętrzne przez `researcher`
- [ ] forma wyniku dobrana; opcje z kompromisami, ryzyka, co sprawdzić najpierw
- [ ] skład zespołu podany; ewentualna propozycja stałej persony
