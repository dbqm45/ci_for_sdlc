# Ramy architektury korporacyjnej i zarządzania — przegląd

Ramy dają wspólny słownik i proces w dużych organizacjach. Agent nie wdraża ram — pomaga przełożyć pracę zespołu
na język, którego oczekuje organizacja (np. artefakty TOGAF, procesy ITIL), i odwrotnie.

## Architektura przedsiębiorstwa
| Rama | Czym jest | Kiedy się przydaje |
|---|---|---|
| **TOGAF** (The Open Group; wydanie 10. z 2022, modułowe) | metoda rozwoju architektury (ADM): faza wstępna i wizja → architektura biznesowa, systemów informacyjnych (dane i aplikacje) i technologiczna → możliwości i rozwiązania → planowanie migracji → nadzór nad wdrożeniem → zarządzanie zmianą; w centrum zarządzanie wymaganiami | organizacja prowadzi EA według TOGAF; trzeba umieścić projekt w portfelu i przejść nadzór architektoniczny |
| **ArchiMate** (The Open Group) | język modelowania architektury przedsiębiorstwa: warstwy biznesowa, aplikacyjna i technologiczna, motywacja i strategia, relacje między nimi | modele dla EA i ładu architektonicznego; dla zespołów deweloperskich zwykle wystarczy C4 |
| **Zachman** | taksonomia (macierz pytań co/jak/gdzie/kto/kiedy/dlaczego × perspektywy), nie metoda | porządkowanie istniejącej dokumentacji |
| **IAF** (Capgemini) | rama obejmująca domeny biznesu, informacji, systemów informacyjnych i infrastruktury, w kilku poziomach abstrakcji | organizacje pracujące w tej metodyce |
Wspólne artefakty, które warto znać: mapa zdolności biznesowych (co organizacja potrafi, niezależnie od systemów),
mapa aplikacji z cyklem życia (inwestuj / utrzymuj / wygaszaj), zasady architektoniczne, mapa drogowa i architektury
przejściowe. Zdolności biznesowe dobrze mapują się na poddomeny DDD (ddd-strategic-analysis).

## Analiza biznesowa
**BABOK** (IIBA) — wiedza analityka biznesowego: planowanie analizy, pozyskiwanie i współpraca z interesariuszami,
zarządzanie cyklem życia wymagań, analiza strategii, analiza i definiowanie wymagań, ocena rozwiązania. Odpowiedniki
w fabryce: ddd-discovery-intake, ddd-facilitation, proc-product-discovery, qa-test-design (kryteria akceptacji).

## Zarządzanie usługami i projektami
| Rama | Czym jest | Styk z fabryką |
|---|---|---|
| **ITIL 4** | praktyki zarządzania usługami IT: m.in. zarządzanie incydentami, problemami, zmianami (w ITIL 4: „enablement” zmian), poziomem usług, wydaniami | incydenty i postmortem (ops-sre-incidents) = incydent i problem; SLA i SLO; zmiana standardowa = zautomatyzowane wdrożenie z bramkami (ops-release-engineering) |
| **PRINCE2** | metodyka zarządzania projektem: uzasadnienie biznesowe, etapy, role, zarządzanie przez wyjątki | dziennik projektu i akceptacje (core-project-record) jako dowody etapów |
| **PMI / PMBOK** | standard wiedzy o zarządzaniu projektami (zasady, domeny wyników, podejścia predykcyjne, zwinne i hybrydowe) | plan, ryzyka i interesariusze; sprawdź wydanie używane w organizacji |
| **RUP** | iteracyjny proces (rozpoczęcie, opracowanie, konstrukcja, przejście) z naciskiem na architekturę wcześnie | historyczny; idea „ryzyka architektoniczne najpierw” żyje w spike'ach i szkieletach |
| **Scrum, Kanban, XP, SAFe, LeSS** | zwinne ramy pracy i ich skalowanie | proc-agile, proc-safe, proc-lean; XP — praktyki inżynierskie (TDD, ciągła integracja, programowanie w parach) |

## Jak z tym pracować
- Dowiedz się, której ramy i w jakim zakresie organizacja naprawdę używa (często „TOGAF” oznacza tylko szablon
  dokumentu i komisję architektoniczną).
- Mapuj istniejące artefakty fabryki na wymagane (ADR → rejestr decyzji, threat model → ocena ryzyka, postmortem →
  rekord problemu), zamiast tworzyć równoległe dokumenty.
- Ramy są środkiem: gdy proces zaczyna wymagać dokumentów, których nikt nie czyta, zaproponuj lżejszą formę z tym
  samym celem.

## Źródła
- The Open Group: TOGAF Standard 10th Edition, ArchiMate Specification; IIBA: BABOK Guide; AXELOS/PeopleCert: ITIL 4,
  PRINCE2; PMI: PMBOK Guide
- [roadmap.sh — Software Architect](https://roadmap.sh/software-architect) (enterprise architecture, TOGAF, BABOK, IAF,
  ITIL, PMI, PRINCE2, RUP, SAFe, LeSS, XP)
Opisane własnymi słowami.
