# Katalog zespołu (generowany przez factory/build.py — nie edytuj)

Do doboru skilli i person do problemu (skill core-problem-routing). Skill wczytujesz narzędziem Skill po nazwie.

## metoda i domena (`ddd-`) — CO modelujemy i jakimi pojęciami — niezależnie od technologii

- `ddd-algorithm-recognition` — Użyj, by znaleźć w domenie ukryty problem algorytmiczny (przydział, kolejność, pakowanie, trasy, kolizje w czasie). Nie do klasy problemu (ddd-deep-modeling) ani doboru bibliotek (arch-tech-selection)
- `ddd-archetypes` — Użyj przy archetypach biznesowych — strony, dostępność i rezerwacje, ilości i pieniądze, produkt, księgowanie, cennik, kolejka. Nie do domen czysto technicznych ani nowatorskich bez wzorca
- `ddd-connascence-analysis` — Użyj przy pomiarze sprzężenia dwóch modułów lub kontekstów — umowy, dowody w kodzie, stopień connascence, koszt. Nie do projektowania modelu wewnątrz kontekstu (ddd-tactical-design) ani wyboru wzorca relacji (ddd-context-mapping)
- `ddd-context-mapping` — Użyj przy relacjach i integracji kontekstów — mapa kontekstów (OHS, ACL, Conformist), serwisy krawędziowe, zdarzenia. Nie do wyznaczania samych granic (ddd-strategic-analysis) ani modelu wewnątrz kontekstu (ddd-tactical-design)
- `ddd-deep-modeling` — Użyj przy odkrywaniu i doprecyzowaniu pojęć modelu — Being/Behaving/Becoming, 5 why, klasyfikacja, przykłady. Nie do granic kontekstów (ddd-strategic-analysis) ani wzorców implementacyjnych (ddd-tactical-design)
- `ddd-discovery-intake` — Użyj przy surowych materiałach (wywiady, notatki, tablice ES) — obszary biznesowe z dowodami, cytaty, sprzeczności. Nie do prowadzenia warsztatu (ddd-event-storming) ani granic kontekstów (ddd-strategic-analysis)
- `ddd-es-simulation` — Użyj tylko na wyraźne żądanie — symulowany warsztat Event Storming z uczestnikami AI i coachem (trening facylitacji). Nie do prawdziwej analizy domeny (ddd-event-storming, ddd-discovery-intake)
- `ddd-event-storming` — Użyj przy Event Stormingu (Big Picture, Process, Design Level) — przygotowanie, prowadzenie, zapis, przejście do architektury. Nie do technik pracy z ludźmi i językiem (ddd-facilitation) ani szczegółów implementacji agregatów…
- `ddd-facilitation` — Użyj przy rozmowie lub warsztacie z ekspertami domeny — techniki facylitacji, język wszechobecny, słowa-sygnały. Nie do przebiegu i notacji Event Stormingu (ddd-event-storming) ani projektowania modelu (ddd-deep-modeling)
- `ddd-model-stress-test` — Użyj przy teście rozszerzalności modelu wzdłuż metryki biznesowej — wymagania na ślepo, wpływ na moduły. Nie do zbierania wymagań od klienta ani pomiaru sprzężeń w kodzie (ddd-connascence-analysis)
- `ddd-strategic-analysis` — Użyj przy podziale domeny na subdomeny (core, supporting, generic) i granicach kontekstów; strategia (Cynefin). Nie do relacji między kontekstami (ddd-context-mapping) ani prowadzenia warsztatu (ddd-event-storming)
- `ddd-tactical-design` — Użyj przy modelu wewnątrz kontekstu — agregaty, encje, obiekty wartości, zdarzenia, polityki, saga, CQRS. Nie do granic i relacji kontekstów (ddd-strategic-analysis, ddd-context-mapping)

## architektura (`arch-`) — jakie czynniki kształtują system i jaki stack/styl najlepiej je spełnia

- `arch-architect-practice` — Użyj przy pracy architekta poza techniką — decyzje i ich komunikacja, szacowanie, ATAM, arc42/C4/ADR, TOGAF, ITIL. Nie do atrybutów jakości (arch-quality-attributes) ani wyboru stacku (arch-tech-selection)
- `arch-privacy-compliance` — Użyj, gdy system przetwarza dane osobowe (RODO) — podstawy, minimalizacja, retencja, DPIA, prawa osób, procesory, naruszenia. Nie do uwierzytelniania i haseł (be-auth-security), modelu zagrożeń (arch-threat-modeling), reagowania na incydent…
- `arch-quality-attributes` — Użyj przy atrybutach jakości — scenariusze, kompromisy, fitness functions, dobór stylu (monolit modularny, mikroserwisy, zdarzenia). Nie do wyboru konkretnych technologii (arch-tech-selection)
- `arch-system-design` — Użyj przy projekcie systemu od wymagań do skali — szacunki, API i dane, wąskie gardła, wysoka dostępność, wzorcowe rozwiązania. Nie do wyboru stacku (arch-tech-selection) ani katalogu stylów (arch-quality-attributes)
- `arch-tech-selection` — Użyj przy wyborze lub ocenie stacku (języki, frameworki, baza, hosting) — kryteria, 2–3 kandydaci, fakty, macierz, ryzyka. Nie do ustalania atrybutów jakości (arch-quality-attributes)
- `arch-threat-modeling` — Użyj przy modelu zagrożeń funkcji lub integracji — DFD z granicami zaufania, STRIDE, PASTA, ocena ryzyka, OWASP Top 10. Nie do przeglądu konkretnego diffu (security-reviewer) ani reagowania na incydent (ops-security-operations)

## warstwa UI (`fe-`) — jakie zasady obowiązują w interfejsie użytkownika — w każdym frameworku

- `fe-architecture` — Użyj przy strukturze frontendu w dowolnym frameworku — stan i dane, granice komponentów, SSR/RSC, wydajność, odporność. Nie do stylów (fe-css), API przeglądarki i a11y (fe-web-platform) ani składni (lang-*, fw-*)
- `fe-css` — Użyj przy stylowaniu — layout flex/grid, responsywność, design tokens, motywy, animacje, izolacja (CSS Modules, @scope, @layer). Nie do logiki JavaScript (fe-web-platform) ani struktury komponentów (fe-architecture)
- `fe-engineering-levels` — Użyj przy ocenie poziomu rozwiązania frontendu (Senior, Staff, Principal) — standardy wielu zespołów, DevEx, ROI. Nie do wiedzy o kodzie (fe-architecture, fe-web-platform, fe-css) ani metryk DORA (eng-continuous-delivery)
- `fe-ux-design` — Użyj przy UX funkcji przed kodem — zadania, przepływy ze stanami, architektura informacji, makiety, heurystyki, teksty UI. Nie do decyzji co budować (proc-product-discovery) ani CSS (fe-css)
- `fe-web-platform` — Użyj przy API przeglądarki i dostępności — fetch, DOM, event loop, Core Web Vitals, storage, service workers, XSS, WCAG. Nie do składni (lang-*), konwencji frameworka (fw-*), stylów (fe-css) ani struktury aplikacji (fe-architecture)

## warstwa serwera (`be-`) — jakie zasady obowiązują po stronie serwera — w każdym języku

- `be-api-design` — Użyj przy projekcie i kodzie API HTTP — zasoby, kody, błędy, paginacja, wersje, idempotencja, OpenAPI, cache, limity, webhooki. Nie do schematu bazy (be-database) ani mechanizmów logowania (be-auth-security)
- `be-auth-security` — Użyj przy uwierzytelnianiu i autoryzacji — sesje, tokeny, OAuth/OIDC, hasła, walidacja wejścia, przegląd backendu wg OWASP. Nie do konfiguracji sieci i chmury (ops-iac-terraform) ani zależności (ops-supply-chain-security)
- `be-database` — Użyj przy relacyjnej bazie — schemat, migracje, indeksy, zapytania SQL/ORM, transakcje, N+1, wydajność i skalowanie. Nie do projektowania endpointów (be-api-design) ani infrastruktury bazy (ops-iac-terraform)
- `be-messaging-outbox` — Użyj przy komunikacji asynchronicznej modułów — komenda czy zdarzenie, outbox/inbox, kolejność, idempotencja odbiorcy, kontrakty. Nie do wyboru relacji kontekstów (ddd-context-mapping) ani schematu bazy ogólnie (be-database)

## operacje (`ops-`) — jak budujemy, wdrażamy i obserwujemy

- `ops-ai-inference` — Użyj przy własnym hostowaniu modeli językowych — pamięć GPU i KV cache, vLLM, continuous batching, metryki, skalowanie. Nie do SLO funkcji AI (ops-sre-incidents) ani ogólnych operacji Kubernetes (ops-kubernetes)
- `ops-ci-cd` — Użyj przy pipeline'ach CI/CD (GitHub Actions i inne) — tworzenie, naprawa, cache buildów, wdrożenia, bezpieczeństwo. Nie do pisania Dockerfile (ops-docker) ani commitów (core-git-workflow)
- `ops-dependency-upgrades` — Użyj, gdy człowiek prosi o podniesienie zależności — inwentarz, kolejność, codemody, testy, Renovate/Dependabot. Nie do bezpieczeństwa łańcucha dostaw — karencja, skompromitowane paczki, provenance (ops-supply-chain-security) —…
- `ops-docker` — Użyj przy Dockerfile, docker-compose i obrazach — tworzenie, rozmiar i czas budowy, bezpieczeństwo obrazów. Nie do pipeline'ów CI (ops-ci-cd) ani infrastruktury chmurowej (ops-iac-terraform)
- `ops-finops` — Użyj przy kosztach chmury — tagi, koszt w PR (Infracost), budżety i alerty, sprzątanie, rozmiar, koszt jednostkowy. Nie do samego pisania Terraform (ops-iac-terraform) ani kosztu telemetrii (ops-observability)
- `ops-iac-terraform` — Użyj przy infrastrukturze jako kod (Terraform/OpenTofu) — moduły, stan, zmienne, sieć, IAM, bazy, storage. Nie do pipeline'ów (ops-ci-cd) ani kontenerów (ops-docker)
- `ops-kubernetes` — Użyj przy manifestach i operacjach Kubernetes — zasoby, sondy, repliki i PDB, autoskalowanie, RBAC, NetworkPolicy. Nie do obrazów (ops-docker), wydań i GitOps (ops-release-engineering) ani chmury (ops-iac-terraform)
- `ops-linux-networking` — Użyj przy diagnozie serwera Linux i sieci od objawu — procesy, systemd, ss, dig, curl, openssl, DNS, TLS, SSH. Nie do manifestów Kubernetes (ops-kubernetes) ani IaC (ops-iac-terraform)
- `ops-observability` — Użyj przy logach, metrykach, tracingu, healthcheckach, alertach i dashboardach (OpenTelemetry, Prometheus, Grafana). Nie do debugowania logiki biznesowej ani pipeline'ów CI
- `ops-release-engineering` — Użyj przy sposobie wydania — rolling, blue/green, canary z wycofaniem, feature flagi, GitOps, migracje bazy w CD. Nie do samej budowy pipeline'u (ops-ci-cd) ani zasad trunk-based i DORA (eng-continuous-delivery)
- `ops-secrets-identities` — Użyj przy sekretach i tożsamościach maszynowych — inwentarz, skanowanie, rotacja, OIDC zamiast kluczy, PKI. Nie do auth użytkowników aplikacji (be-auth-security) ani zależności (ops-supply-chain-security)
- `ops-security-operations` — Użyj przy wykrywaniu i obsłudze incydentu bezpieczeństwa — SIEM, EDR, podatności i łatki, NIST 800-61, forensyka. Nie do awarii bez ataku (ops-sre-incidents) ani projektu zabezpieczeń (arch-threat-modeling)
- `ops-setup-wizard` — Użyj, gdy człowiek musi ręcznie skonfigurować klucze w panelach lub sekrety CI — interaktywny skrypt bash. Nie do kroków, które agent zrobi sam, ani decyzji architektonicznych
- `ops-sre-incidents` — Użyj przy niezawodności i incydentach — SLI/SLO/SLA, budżet błędów, burn rate, dyżury, postmortem, kopie zapasowe. Nie do instrumentacji i dashboardów (ops-observability) ani strategii wydań (ops-release-engineering)
- `ops-supply-chain-security` — Użyj przy zależnościach i łańcuchu dostaw — lockfile, karencja wersji, skrypty instalacyjne, SBOM, przejęte paczki. Nie do samego pipeline'u (ops-ci-cd) ani auth aplikacji (be-auth-security)

## framework (`fw-`) — GDZIE i czym to umieścić w konkretnym frameworku

- `fw-angular` — Użyj przy kodzie Angulara 17–22 — standalone, signals i resources, zoneless, Signal Forms, DI, HttpClient, routing, testy. Nie do składni TypeScript (lang-typescript) ani modelowania (ddd-*)
- `fw-nextjs` — Użyj przy kodzie Next.js 14–16.3 (App Router) — Server Components, Server Actions i autoryzacja, cache, proxy.ts, migracja. Nie do samego Reacta bez frameworka (fw-react), projektu API HTTP (be-api-design) ani uwierzytelniania w ogóle…
- `fw-react` — Użyj przy kodzie Reacta 18–19.3 — czyste komponenty, stan, kiedy nie efekt, Actions i formularze, React Compiler, testy. Nie do routingu, cache i Server Actions Next.js (fw-nextjs), składni TypeScript (lang-typescript) ani ogólnej…

## język (`lang-`) — JAK wyrazić pojęcia w konkretnym języku

- `lang-java` — Użyj przy kodzie Java 17/21+ — konwencje, niezmienność, błędy, pojęcia domenowe (obiekt wartości, warianty, agregat). Nie do konfiguracji frameworków (Spring, Jakarta — osobne fw-*) ani modelowania domeny (ddd-*)
- `lang-javascript` — Użyj przy czystym JavaScripcie ES2022+ — koercja, domknięcia, this, async i event loop, tablice, ESM vs CommonJS. Nie do API przeglądarki (fe-web-platform), typowania TS (lang-typescript) ani modelowania (ddd-*)
- `lang-python` — Użyj przy kodzie Python 3.11–3.15 — typy i mypy, pyproject i uv, ruff, dataclass i Decimal, wyjątki czy wynik. Nie do testów w pytest (tool-pytest), analizy danych i statystyki (data-analysis) ani potoków danych…
- `lang-typescript` — Użyj przy kodzie TypeScript 5.x–7.x — typy, zawężanie, generyki, tsconfig, walidacja na granicach, pojęcia domenowe. Nie do mechaniki runtime JS (lang-javascript), frameworka (fw-*), ogólnych zasad auth (be-auth-security) ani…

## narzędzia (`tool-`) — czym budujemy i jak organizujemy repozytorium (monorepo, build)

- `tool-jest` — Użyj przy testach w Jest — struktura, test.each, dublery i fake timers, ESM, konfiguracja, migracja do Jest 30 i na Vitest. Nie do zasad wyroczni (qa-spec-first-testing) ani Vitest (tool-vitest)
- `tool-nx` — Użyj przy monorepo Nx — projekty i biblioteki, tagi i granice modułów, generatory, cache, affected, release, migrate. Nie do konwencji frameworka (fw-*) ani języka (lang-*)
- `tool-playwright` — Użyj przy testach e2e i API w Playwright — lokatory wg ról, asercje z oczekiwaniem, fixtures, trace, flaky w CI. Nie do wyboru przypadków (qa-test-design) ani zasad wyroczni (qa-spec-first-testing)
- `tool-pytest` — Użyj przy testach w pytest 8–9 — fixtures, parametrize, tmp_path, monkeypatch, konfiguracja TOML, asyncio, Hypothesis. Nie do strategii testów niezależnej od narzędzia (eng-testing), projektu przypadków (qa-test-design) ani testów w…
- `tool-vitest` — Użyj przy testach w Vitest — struktura, tabele przykładów, dublery, kontrolowany czas, tryb przeglądarki, Stryker. Nie do zasad wyroczni (qa-spec-first-testing) ani Jest (tool-jest)

## zasady inżynierskie (`eng-`) — jak pisać prosto i dobrze (KISS, YAGNI, SOLID, testy, CD) — ograniczenia i rozstrzyganie sporów

- `eng-algorithms-data-structures` — Użyj, gdy liczy się wydajność kodu — złożoność, dobór struktur danych (TS, Java), techniki algorytmów, grafy, LRU. Nie do rozpoznawania problemu w domenie (ddd-algorithm-recognition)
- `eng-behavior-preserving-refactoring` — Użyj, gdy kod zmienia kształt bez zmiany zachowania (legacy, zmiana paradygmatu) — zamrożony kontrakt, dowód. Nie do drobnych refaktoryzacji (eng-clean-code) ani projektowania przypadków (qa-test-design)
- `eng-clean-code` — Użyj przy czytelności kodu w dowolnym języku — nazwy, funkcje, komentarze, obsługa błędów, zapachy, małe refaktoryzacje. Nie do zasad architektonicznych (eng-design-principles) ani idiomów konkretnego języka (lang-*)
- `eng-codebase-mapping` — Użyj przy nieznanym kodzie i ocenie wpływu zmiany — punkty wejścia, warstwy z importów, węzły centralne, cykle. Nie do oceny długu (eng-tech-debt-audit) ani projektowania granic (ddd-strategic-analysis)
- `eng-continuous-delivery` — Użyj przy sposobie dostarczania — trunk-based, małe partie, feature flags, CI/CD, metryki DORA, Twelve-Factor. Nie do konfiguracji konkretnych narzędzi CI (ops-ci-cd) ani gita na co dzień (core-git-workflow)
- `eng-debugging` — Użyj, gdy coś działa źle, a przyczyna nie jest oczywista — odtworzenie, hipotezy, zawężanie, git bisect, debugger. Nie do prowadzenia incydentu produkcyjnego (ops-sre-incidents), diagnozy serwera i sieci (ops-linux-networking),…
- `eng-design-patterns` — Użyj przy projekcie i review, gdy kusi wzorzec GoF — diagnoza symptom → wzorzec, kiedy nie, lżejsze formy w TS. Nie do zasad SOLID/KISS (eng-design-principles) ani building blocks DDD (ddd-tactical-design)
- `eng-design-principles` — Użyj przy decyzjach i review — KISS, YAGNI, DRY, SOLID, Demeter, kompozycja, zasady komponentów, konflikty zasad. Nie do stylu nazw i funkcji (eng-clean-code)
- `eng-module-depth` — Użyj przy projekcie interfejsu modułu — głębokie moduły, test usunięcia, spoiny i adaptery, płytkie moduły. Nie do mapy całego repo (eng-codebase-mapping) ani audytu długu (eng-tech-debt-audit)
- `eng-tech-debt-audit` — Użyj przy audycie długu technicznego repo lub modułu — wymiary, ustalenia z plik:linia, waga, wysiłek, priorytety. Nie do pojedynczej refaktoryzacji (eng-behavior-preserving-refactoring) ani przeglądu jednego PR…
- `eng-testing` — Użyj przy strategii testów w dowolnym języku — TDD, BDD, piramida testów, dublery, kontraktowe, mutacyjne. Nie do narzędzi konkretnego frameworka testowego (tool-*) ani pracy testera (qa-*)

## jakość i testy (`qa-`) — jak projektować, prowadzić i utrzymywać testy tak, by sprawdzały wymagania — niezależnie od narzędzia

- `qa-exploratory-manual` — Użyj przy testach ręcznych i eksploracyjnych — sesje z kartą, heurystyki, UAT, ręczna dostępność, zgłoszenia defektów. Nie do automatyzacji (tool-*, qa-regression)
- `qa-performance-testing` — Użyj przy testach wydajnościowych — rodzaje, model obciążenia, progi z SLO, k6 i Gatling, środowisko, analiza, raport. Nie do wydajności frontendu w przeglądarce (fe-web-platform) ani SLO i alertów (ops-sre-incidents)
- `qa-regression` — Użyj przy regresji — zestawy (smoke, PR, nocne), testy dotknięte zmianą, flaky i kwarantanna, dane testowe, metryki. Nie do projektowania pojedynczych przypadków (qa-test-design)
- `qa-spec-first-testing` — Użyj, gdy testy mają sprawdzać wymaganie, nie implementację — niezależna wyrocznia, clean-room, ATDD, mutacje. Nie do technik wyboru przypadków (qa-test-design) ani składni narzędzi (tool-*)
- `qa-test-design` — Użyj przy projekcie przypadków i planu testów — klasy równoważności, brzegi, tablice decyzyjne, stany, ryzyko. Nie do pisania kodu testów (tool-*)

## analiza danych (`data-`) — jak odpowiadać na pytania danymi — pozyskanie, czyszczenie, statystyka, wizualizacja, raport

- `data-analysis` — Użyj, gdy na pytanie trzeba odpowiedzieć danymi — czyszczenie, statystyka i testy hipotez, wizualizacja, raport (pandas, SQL). Nie do potoków danych (data-engineering) ani eksperymentów A/B produktu (proc-product-discovery)
- `data-engineering` — Użyj przy potokach danych — pozyskiwanie (wsad, CDC, strumień), idempotencja, backfill, kontrakty, orkiestracja, dbt, testy. Nie do analizy (data-analysis) ani wyboru architektury danych (arch-quality-attributes)

## wiedza branżowa (`dom-`) — jak działa konkretna branża — pojęcia, standardy, protokoły, regulacje

- `dom-ev-charging` — Użyj przy ładowaniu pojazdów elektrycznych — CPO/eMSP/CSMS, sesja i rozliczenie, OCPP, OCPI, ISO 15118, Plug & Charge. Nie do ogólnego modelowania archetypów (ddd-archetypes) ani projektu API i kolejek (be-*)

## język i redakcja (`txt-`) — jak pisać poprawnie i zrozumiale — pisownia, interpunkcja, styl, redakcja

- `txt-polish-correctness` — Użyj przy poprawności tekstu po polsku (dokumentacja, UI, PR) — pisownia, interpunkcja wg RJP PAN, gramatyka, kalki. Nie do redakcji stylu i skracania (txt-polish-style) ani struktury dokumentu (core-tech-docs)
- `txt-polish-style` — Użyj przy redakcji tekstu po polsku do gotowej wersji — skracanie, strona czynna, konkret, jeden ton, typografia. Nie do raportu błędów (txt-polish-correctness) ani zmian merytorycznych

## proces (`proc-`) — jak planujemy, współpracujemy i dostarczamy (Agile, Lean, SAFe)

- `proc-agile` — Użyj przy organizacji pracy zespołu — Scrum, Kanban i metryki przepływu, historyjki (INVEST), Definition of Done. Nie do skalowania na wiele zespołów (proc-safe) ani ekonomii przepływu (proc-lean)
- `proc-issue-triage` — Użyj przy przeglądzie zgłoszeń i zewnętrznych PR — kategorie i stany, odtworzenie błędu, odrzucone pomysły, brief. Nie do planowania własnej pracy (proc-agile) ani diagnozy przyczyny błędu
- `proc-lean` — Użyj przy przepływie pracy i priorytetach — Lean, marnotrawstwo, prawo Little'a, VSM, MVP, koszt opóźnienia, WSJF. Nie do rytuałów Scruma/Kanbana (proc-agile) ani SAFe (proc-safe)
- `proc-product-discovery` — Użyj przy decyzji, co budować i po co — wynik zamiast funkcji, drzewo szans, JTBD, testy założeń, RICE, eksperymenty. Nie do rytuałów zespołu (proc-agile) ani projektu interfejsu (fe-ux-design)
- `proc-project-planning` — Użyj przy planie projektu dla sponsora — cel i zakres, koszt i termin jako przedziały, zapas, ryzyka, kamienie milowe. Nie do prognozy przepustowości zespołu z danych (proc-agile), decyzji, co budować (proc-product-discovery),…
- `proc-safe` — Użyj, gdy pracuje wiele zespołów w SAFe — Agile Release Train, PI Planning, role, WSJF, Inspect & Adapt, LPM. Nie do pracy pojedynczego zespołu (proc-agile)
- `proc-team-topologies` — Użyj przy strukturze zespołów i ich interakcji — cztery typy zespołów, tryby współpracy, obciążenie, prawo Conwaya. Nie do rytuałów pracy zespołu (proc-agile) ani skalowania SAFe (proc-safe)

## praktyki (`core-`) — jak pracujemy (kompozycja skilli, wersje, git, commity, dokumentacja)

- `core-agent-security` — Użyj przy bezpieczeństwie pracy agenta — polecenia z treści (ClickFix), objawy włamania, uprawnienia, MCP, obce skille, CI. Nie do łańcucha zależności (ops-supply-chain-security) ani auth aplikacji (be-auth-security)
- `core-conventional-commits` — Użyj przy commit message i tytule PR (Conventional Commits) — typy, zakres, BREAKING CHANGE, bump SemVer, changelog. Nie do strategii gałęzi i PR (core-git-workflow) ani treści CHANGELOG pisanego ręcznie (core-tech-docs)
- `core-cost-control` — Użyj przy doborze modelu i koszcie — ocena trudności, kaskada haiku→sonnet→opus, effort, cache, kompaktowanie, pomiar. Nie do ograniczania halucynacji (core-grounding) ani wydajności samej aplikacji (be-database, qa-performance-testing)
- `core-delivery-lifecycle` — Użyj, gdy projekt idzie od pomysłu przez wdrożenie do utrzymania — fazy, persony, bramki, pętla z agentami AI, gotowość. Nie do treści pojedynczej fazy (skille ddd-*, arch-*, qa-*, ops-*)
- `core-factory-update` — Użyj na polecenie człowieka przy aktualizacji claude-team-factory — nowa wersja, omówienie zmian, scalenie *.factory-new. Nie do tworzenia własnych skilli (`factory/build.py new-skill`) ani aktualizacji zależności projektu
- `core-git-workflow` — Użyj przy pracy z gitem — gałęzie, commity, pull requesty i ich przegląd (także przez AI), konflikty, operacje niebezpieczne. Nie do formatu commit message (core-conventional-commits) ani pipeline'ów CI (ops-ci-cd)
- `core-grounding` — Użyj przy każdym twierdzeniu o faktach — sprawdzenie (plik, polecenie, źródło z datą), „nie wiem”, samosprawdzenie. Nie do procedury badania źródeł zewnętrznych (core-source-research) ani testów kodu (qa-spec-first-testing)
- `core-plan-interview` — Użyj przed działaniem, by przepytać plan, decyzję lub pomysł — drzewo decyzji, rundy pytań z rekomendacją. Nie do warsztatu z ekspertami domeny (ddd-facilitation) ani doboru zespołu (core-problem-routing)
- `core-problem-routing` — Użyj, gdy problem opisano zwykłym tekstem — rozpoznanie wymiarów, dobór skilli i person, doraźny zespół, forma wyniku. Nie do samej wiedzy merytorycznej (skille wymiarów) ani łączenia skilli w jednej odpowiedzi (core-skill-composition)
- `core-project-record` — Użyj przy dzienniku projektu w docs/project/ — artefakty faz z TL;DR i Przekazaniem, decyzje, punkt kontrolny pracy. Nie do treści merytorycznej faz (skille ddd-*, arch-*, proc-*)
- `core-semver` — Użyj przy numerze wersji (SemVer 2.0.0) — publiczne API, podbicie major/minor/patch, 0.y.z, wersje przedpremierowe, tag. Nie do formatu commit message (core-conventional-commits) ani strategii wdrożenia (ops-release-engineering)
- `core-skill-authoring` — Użyj przy dodaniu lub zmianie skilla — najpierw scenariusze ewaluacji, potem zwięzła treść z przykładami, bramka, audyt. Nie do łączenia istniejących skilli w jednym zadaniu (core-skill-composition) ani testów kodu aplikacji (eng-testing)
- `core-skill-composition` — zadanie dotyka kilku obszarów naraz (np. DDD + Angular) — łączenie skilli w jedno rozwiązanie
- `core-source-research` — Użyj przy badaniu aktualnych faktów z zewnątrz — wersje, zmiany, zgłoszenia, opinie; ranga źródeł, cytowanie z datą. Nie do wiedzy stałej (skille wymiarów) ani oceny opcji (arch-tech-selection)
- `core-stack-sync` — Użyj na starcie pracy i przy niezgodności wersji — odczyt stacku projektu i dopasowanie skilli, bez podnoszenia zależności. Nie do podnoszenia zależności projektu (to osobne zadanie na prośbę użytkownika)
- `core-teaching-workspace` — Użyj na polecenie człowieka do nauki tematu przez wiele sesji w katalogu-warsztacie — lekcje, ściągi, postępy. Nie do jednorazowego wyjaśnienia ani badania źródeł bez nauki (core-source-research)
- `core-tech-docs` — Użyj przy dokumentacji technicznej w repo — README, API, ADR, CHANGELOG, runbook, podręcznik; struktura, styl, recenzja. Nie do artefaktów dziennika docs/project/ (core-project-record), commit message (core-conventional-commits) ani…

## Persony (`claude --agent <nazwa>`) i ich wykonawcy

| Persona | Kim jest | Wykonawcy (`persona-rola`) | Skille wiodące |
|---|---|---|---|
| `ada` | Ada — Frontend Angular z DDD | `ada-frontend`, `ada-ddd-analyst` | ddd-archetypes, ddd-tactical-design, ddd-deep-modeling, fw-angular, lang-typescript, eng-testing, eng-clean-code, core-conventional-commits |
| `ewa` | Ewa — Analityczka domeny (DDD) | `ewa-ddd-analyst`, `ewa-tech-writer` | proc-agile, proc-lean, proc-safe, proc-team-topologies |
| `filip` | Filip — Frontend Architect (Angular + Nx) | `filip-frontend` | fe-architecture, fe-engineering-levels, lang-typescript, fe-css |
| `jan` | Jan — Backend Java z DDD | `jan-backend`, `jan-ddd-analyst` | ddd-tactical-design, ddd-archetypes, ddd-context-mapping, ddd-deep-modeling, lang-java, eng-testing, eng-clean-code, eng-behavior-preserving-refactoring |
| `kasia` | Kasia — QA Engineer (projekt testów, automatyzacja, regresja) | `kasia-qa-analyst`, `kasia-qa-automation` | lang-typescript, lang-javascript, tool-playwright, tool-vitest, tool-jest, tool-pytest |
| `kuba` | Kuba — Product Engineer | `kuba-frontend`, `kuba-backend`, `kuba-tech-writer` | ddd-archetypes, ddd-tactical-design, lang-typescript, lang-javascript, eng-testing, eng-continuous-delivery, proc-agile, eng-behavior-preserving-refactoring |
| `maja` | Maja — dyspozytorka (dobiera zespół i podejście do problemu) | — | core-problem-routing, core-source-research, core-plan-interview, core-delivery-lifecycle |
| `marek` | Marek — Platform Engineer | `marek-backend`, `marek-devops` | ddd-tactical-design, ddd-context-mapping, lang-java, eng-continuous-delivery, proc-lean, proc-team-topologies |
| `natalia` | Natalia — Product Designer | `natalia-product-designer` | proc-lean, proc-agile |
| `nina` | Nina — Fullstack React/Next.js + Python | `nina-frontend`, `nina-backend` | ddd-tactical-design, fw-nextjs, fw-react, lang-typescript, lang-python, tool-vitest, tool-playwright, tool-pytest, eng-testing, be-api-design, be-auth-security |
| `ola` | Ola — Fullstack z zacięciem DevOps | `ola-frontend`, `ola-backend`, `ola-devops` | ddd-archetypes, ddd-tactical-design, lang-typescript, lang-javascript, eng-testing, eng-continuous-delivery, proc-agile, eng-behavior-preserving-refactoring |
| `piotr` | Piotr — DevOps / SRE Engineer | `piotr-devops`, `piotr-sre` | eng-continuous-delivery, proc-team-topologies |
| `stefan` | Stefan — redaktor języka polskiego | `stefan-editor` | core-tech-docs |
| `tomasz` | Tomasz — Solution Architect | `tomasz-solution-architect`, `tomasz-tech-writer` | ddd-strategic-analysis, ddd-archetypes, ddd-deep-modeling, ddd-context-mapping, ddd-algorithm-recognition, ddd-model-stress-test, eng-continuous-delivery, proc-team-topologies, proc-lean, proc-project-planning |
| `zofia` | Zofia — Data Analyst / Data Engineer | `zofia-data-analyst`, `zofia-data-engineer` | lang-python, tool-pytest, proc-product-discovery |

## Agenci wspólni

- `scout` (fast) — Szybkie, tanie przeszukiwanie kodu (tylko odczyt). Używaj zanim deleguje się implementację, gdy trzeba znaleźć pliki, wzorce lub miejsca użycia.
- `quick-fixer` (fast) — Drobne, mechaniczne zmiany w 1–2 plikach (literówki, rename, formatowanie, bump wersji, commit message).
- `researcher` (fast) — Weryfikuje aktualne fakty techniczne (wersje, daty wsparcia LTS/EOL, licencje, wymagania zgodności) w źródłach pierwotnych. Zwraca tabelę faktów ze źródłami i datą.
- `architect` (deep) — Decyzje architektoniczne, projekt modułów, trudne i niejasne błędy. Tylko analiza i plan, bez edycji kodu.
- `security-reviewer` (deep) — Przegląd bezpieczeństwa zmian (auth, sekrety, wejście użytkownika, IaC, CI). Używaj przed merge zmian wrażliwych.
- `polish-editor` (std) — Korekta i redakcja tekstu po polsku (dokumentacja, artefakty docs/project, README, opisy) — pisownia i interpunkcja wg RJP PAN, styl, terminologia; poprawia punktowo, bez zmian merytorycznych. Podaj pliki i tryb (korekta = raport, redakcja = poprawki).
- `specialist` (std) — Doraźny specjalista — analizuje fragment problemu z perspektywy skilli podanych w briefie (wczytuje je sam przez Skill). Zwraca raport z opcjami, ryzykami i krokami.
- `specialist-deep` (deep) — Specjalista do trudnych, kosztownych w odwróceniu decyzji — ocena opcji i kompromisów z perspektywy skilli podanych w briefie. Tylko analiza.
- `sources-critic` (std) — Wykrywa sprzeczności w banku dowodów (docs/project/02-domain/corpus.md) — typy, test tego samego podmiotu, pytania diagnostyczne. Nie rozstrzyga i nie edytuje.
- `blind-analyst` (std) — Generuje wymagania biznesowe do testu obciążeniowego modelu wyłącznie z briefu w docs/project/02-domain/_blind/ — bez wiedzy o architekturze. Podaj metrykę, ścieżki i liczbę wymagań; nie podawaj nazw modułów.
- `es-participant` (std) — Uczestnik symulowanego warsztatu Event Storming (wersja pełna) — gra jedną osobę z karty. Wywołuj tylko w ramach ddd-es-simulation, podając ścieżkę pliku promptu rundy.
- `es-room` (fast) — Kilku uczestników symulowanego warsztatu Event Storming w jednym wywołaniu (wersja oszczędna). Wywołuj tylko w ramach ddd-es-simulation, podając ścieżkę pliku promptu rundy.
- `es-host` (fast) — Gospodarz symulowanego warsztatu Event Storming (ddd-es-simulation) — uruchamiaj jako sesję `claude --agent es-host`; najtańszy sposób prowadzenia treningu.
- `es-coach` (std) — Coach facylitacji w symulowanym warsztacie (ddd-es-simulation) — ocenia prowadzenie sesji przez człowieka na podstawie transkrypcji i statystyk; tryby light/full/midsession.
