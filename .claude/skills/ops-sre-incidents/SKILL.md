---
name: ops-sre-incidents
description: Użyj przy niezawodności i incydentach — SLI/SLO/SLA, budżet błędów, burn rate, dyżury, postmortem, kopie zapasowe.
metadata:
  katalog: "Użyj przy niezawodności usług i incydentach — SLI, SLO i SLA, budżet błędów i jego polityka, alerty burn rate, dyżury, poziomy ważności, dowodzenie incydentem, postmortem bez winnych, toil, projektowanie na awarię, chaos engineering, poziomy autonomii agentów AI w operacjach. Nie do instrumentacji i dashboardów (ops-observability) ani strategii wydań (ops-release-engineering)."
---

# SRE i obsługa incydentów

## 1. SLI → SLO → SLA
Trzy poziomy, każdy odpowiada na inne pytanie:

| Poziom | Pytanie | Czym jest | Przykład |
|---|---|---|---|
| **SLI** (wskaźnik) | co mierzymy? | metryka: stosunek dobrych zdarzeń do wszystkich ważnych | odsetek żądań `GET /orders` bez błędu 5xx i szybszych niż 300 ms |
| **SLO** (cel) | jaka wartość wskaźnika nam wystarcza? | SLI + próg + okno czasu | 99,9% takich żądań w oknie 30 dni |
| **SLA** (umowa) | co się stanie, gdy celu nie dotrzymamy? | SLO + konsekwencje (np. zwrot części opłaty w kredytach) | 99,5% miesięcznie, poniżej — kredyt 10% |
- SLA zawierasz zwykle z klientem zewnętrznym i odpowiada za nie biznes z działem prawnym; wewnątrz firmy wystarczą SLO.
  **SLO jest ostrzejsze niż SLA** — różnica to bufor, w którym zespół reaguje, zanim zapłaci firma.
- Nigdy 100%: każda zależność (sieć, chmura, przeglądarka użytkownika) ma własną zawodność, a ostatnie „dziewiątki” są
  drogie i spowalniają zmiany.
- „Dostępność” wymaga definicji awarii (np. odsetek błędów ≥ 10% w minucie = usługa niedostępna). Latencję opisuj
  percentylami (p95, p99), nie średnią.
- Jak wybrać SLI, zapisać specyfikację, policzyć budżet i dostępność złożoną z zależności: `references/sli-slo-sla.md`.

## 2. SLO od użytkownika
- SLO definiujesz per **ścieżka użytkownika**, nie per usługa: np. płatność i rejestracja 99,95–99,99%,
  logowanie p99 < 200 ms, funkcje pomocnicze 95–99%. Wskaźnik (SLI) mierzy to, co widzi użytkownik (odsetek udanych
  żądań, latencja), a nie zużycie CPU.
- Funkcje oparte na AI mają trzy warstwy SLO z osobnymi budżetami: infrastruktura (dostępność, latencja), inferencja
  (czas do pierwszego tokenu, odsetek odpowiedzi awaryjnych) i zachowanie (stabilność i poprawność wyników). Progi dla
  zachowania ustalasz z danych produkcyjnych w oknie kroczącym — standardu branżowego jeszcze nie ma.

## 3. Budżet błędów i alerty
- Budżet = 100% − SLO (dla 99,9% w 30 dniach to ok. 43 minuty). **Polityka budżetu** spisana z góry: co robimy, gdy
  budżet się kończy (np. wstrzymanie wydań funkcji na rzecz prac nad niezawodnością, obowiązkowy przegląd zmian).
- Alerty z tempa spalania budżetu (burn rate) w dwóch oknach naraz, np. według Google SRE Workbook: strona do
  dyżurnego przy tempie 14,4 w oknie 1 h i 5 min (2% budżetu w godzinę) oraz 6 w oknie 6 h i 30 min; zgłoszenie bez
  budzenia przy tempie 1 w oknie 3 dni i 6 h.
- Alert, który przez 90 dni nie wymagał żadnego działania, usuwasz lub przenosisz na kanał bez powiadomień.

## 4. Dyżury
- Rotacja tygodniowa: dyżurny główny i zastępczy; przekazanie dyżuru 30 minut z notatką w kanale zespołu.
- Cel: najwyżej 2–3 incydenty wymagające działania na zmianę. Mierz liczbę alertów na zmianę, rozkład obciążenia
  między osoby i powtarzalność incydentów. Dyżur jest płatny lub oddawany czasem wolnym.
- Przy zespołach w kilku strefach czasowych: follow-the-sun zamiast nocnych pobudek.

## 5. Incydent
| Poziom | Przykład | Reakcja |
|---|---|---|
| SEV1 | usługa krytyczna niedostępna, utrata danych, incydent bezpieczeństwa | dowodzący incydentem (IC), kanał incydentu, komunikaty co 30 min, eskalacja do kierownictwa |
| SEV2 | istotna degradacja, część użytkowników | IC, komunikaty co godzinę |
| SEV3 | drobny problem, obejście istnieje | zgłoszenie w backlogu zespołu |
- IC koordynuje i decyduje, nie naprawia sam; osobne role: komunikacja, operator zmian, notujący oś czasu.
- Najpierw ograniczenie skutków (wycofanie, przełączenie, wyłączenie flagi), dopiero potem przyczyna.
- Incydent bezpieczeństwa, poświadczeń lub danych osobowych: od razu zespół bezpieczeństwa i zasady z core-agent-security
  (bez „sprzątania” przed zabezpieczeniem dowodów); wcześniej ustalone warunki powiadomienia działu prawnego.
- Czas przywrócenia (MTTR) raportujesz w fazach: wykrycie, potwierdzenie, diagnoza, decyzja, naprawa, weryfikacja —
  widać wtedy, gdzie tracimy czas.

Incydent bezpieczeństwa (atak, wyciek, przejęte konto) ma dodatkowe kroki — zabezpieczenie dowodów przed
zmianami, ograniczanie skutków bez zdradzania wykrycia, zgłoszenia RODO/NIS2: ops-security-operations.

## 6. Po incydencie
- Postmortem bez szukania winnych: pytanie „jak proces na to pozwolił?”, nie „kto przeoczył?”. Szkic z osią czasu,
  wpływem na klientów i linkami do logów, metryk i śladów przygotowany przed spotkaniem.
- Działania naprawcze konkretne, z właścicielem i terminem, śledzone w backlogu do zamknięcia.
- Każdy incydent spowodowany błędem w kodzie zostawia **test regresyjny** (czerwony przed poprawką — eng-debugging),
  a gdy kod piszą agenci, także **stały scenariusz ewaluacji agenta**: zadanie, które doprowadziło do błędu,
  z oczekiwanym zachowaniem. Zestaw scenariuszy uruchamiasz przy zmianach `CLAUDE.md`, skilli, hooków i modelu
  (`.claude/skills/core-delivery-lifecycle/references/ai-native-sdlc.md`).
- Metryki, które incydent pokazał (np. odsetek 5xx, czas cyklu PR), trafiają pod pasma kontrolne z poziomami reakcji
  (`core-delivery-lifecycle/scripts/control_band.py`); alerty na SLO zostają przy burn rate (sekcja 3).
- Przeglądaj też „prawie incydenty” i awarie, które same minęły: krótki opis (wyzwalacz, pierwszy sygnał, najmniejsza
  zmiana, która by zapobiegła).
- Szablon i zapis: core-tech-docs (runbook, postmortem), decyzje w dzienniku projektu.

## 7. Toil i runbooki
- Praca operacyjna najwyżej ok. 50% czasu zespołu; krok runbooka wykonywany ręcznie kilka razy trafia do backlogu
  automatyzacji.
- Runbook aktualny i wykonywalny (polecenia, nie proza); nieaktualne runbooki blokują każdą automatyzację, także AI.

## 8. Projektowanie na awarię
- Zdefiniuj z góry **tryb zdegradowany**: co wyłączamy, opóźniamy lub upraszczamy przy awarii zależności; pokaż go
  w UI i na dashboardzie.
- Izolacja awarii: grodzie (osobne pule połączeń i wątków per zależność lub klient), ograniczanie napływu
  (backpressure) zamiast lawiny ponowień, bezpieczniki (circuit breaker), limity czasu na każdym wywołaniu.
- Chaos engineering stopniowo: najpierw stan ustalony (metryki), potem wstrzykiwanie awarii w CI (opóźnienia, 429,
  5xx — np. WireMock), potem canary, na końcu produkcja.

- **Kopie zapasowe liczą się dopiero po odtworzeniu.** Dla każdego magazynu danych: RPO (ile danych wolno stracić)
  i RTO (jak długo wolno odtwarzać), kopia poza kontem i regionem produkcji, co najmniej jedna niezmienialna (ochrona
  przed ransomware i pomyłką), **regularny test odtworzenia** z pomiarem czasu i alert, gdy kopia się nie wykonała.
- **Pojedyncze punkty awarii**: raz na kwartał lista komponentów, których awaria zatrzymuje całą usługę (jedna baza bez
  repliki, jeden NAT, jeden dostawca DNS, jeden klucz podpisujący, jedna osoba z dostępem); dla każdego decyzja —
  redundancja, tryb zdegradowany albo świadomie przyjęte ryzyko.
- **Przegląd pojemności** przed spodziewanym wzrostem (kampania, nowy klient, sezon) i okresowo: test obciążenia
  na prognozowanym ruchu, nie na dzisiejszym; system dobry dla 1 000 użytkowników nie musi działać dla 100 000.

## 9. Agenci AI w operacjach
| Poziom | Kiedy | Zasady |
|---|---|---|
| 1. samodzielnie | alert pasuje do przetestowanego runbooka, zasób z allowlisty, działanie odwracalne i idempotentne, wynik da się sprawdzić metryką | limity (np. skalowanie w granicach min/max), odstęp między działaniami, automatyczna eskalacja, gdy weryfikacja zawiedzie |
| 2. za zgodą człowieka | kilka możliwych przyczyn, wpływ na użytkowników | zgoda jawna, na dokładnie to polecenie i cel, wygasa po kilku minutach; brak odpowiedzi ≠ zgoda |
| 3. prowadzi człowiek | awarie kaskadowe, bezpieczeństwo, poświadczenia, schemat bazy, pieniądze | IC decyduje; agent tylko czyta i zbiera dowody |
Decyzję o poziomie podejmuje polityka poza modelem językowym. Agent ma własną tożsamość z rozdzielonym odczytem i zapisem,
wyłącznik awaryjny, limit działań na godzinę, a każdy krok (wyzwalacz, decyzja, działanie, efekt) trafia do logu
audytowego. Najpierw tryb cienia (agent proponuje, człowiek wykonuje), potem stopniowe rozszerzanie. Warunki wstępne:
aktualne runbooki, dojrzałe SLO i właściciel incydentów spowodowanych przez samego agenta.

## Checklista
- [ ] SLI zdefiniowane jako stosunek dobrych zdarzeń; SLO per ścieżka użytkownika, ostrzejsze niż SLA
- [ ] spisana polityka budżetu błędów
- [ ] alerty burn rate w dwóch oknach; alerty bez działań usunięte
- [ ] poziomy ważności, rola IC i szablon komunikatów
- [ ] postmortem bez winnych z działaniami śledzonymi do zamknięcia
- [ ] tryb zdegradowany, limity czasu, bezpieczniki; chaos w CI
- [ ] agent AI w operacjach tylko na poziomie z polityki, z logiem audytowym i wyłącznikiem

## Źródła
devops.com: [Why Your SLO Dashboard is Lying](https://devops.com/why-your-slo-dashboard-is-lying-moving-beyond-vanity-metrics-in-production/),
[So Agentic Systems Are Messing Up Your SLO Framework](https://devops.com/so-agentic-systems-are-messing-up-your-slo-framework/),
[On-Call Rotation Best Practices](https://devops.com/on-call-rotation-best-practices-reducing-burnout-and-improving-response/),
[The Power of Blameless Postmortems](https://devops.com/from-incidents-to-insights-the-power-of-blameless-postmortems/),
[Designing for Failure: 4 Resilience Practices](https://devops.com/designing-for-failure-4-resilience-practices-that-make-outages-boring/),
[Chaos Engineering for APIs](https://devops.com/chaos-engineering-for-apis-integrate-failure-testing-into-your-ci-cd-pipeline/),
[The Three Tiers of Agentic Incident Response](https://devops.com/the-three-tiers-of-agentic-incident-response-when-to-trust-ai-autonomy/),
[Before You Go Agentic: Guardrails for AI Agents in Observability](https://devops.com/before-you-go-agentic-top-guardrails-to-safely-deploy-ai-agents-in-observability/),
[The AIRE Gap](https://devops.com/the-aire-gap-why-organizations-are-buying-ai-sre-tools-they-arent-ready-to-use/).
Progi burn rate: [Google SRE Workbook — Alerting on SLOs](https://sre.google/workbook/alerting-on-slos/).
SLI/SLO/SLA: [Service Level Objectives (SLI, SLO, SLA) Explained Simply](https://froehlich.medium.com/service-level-objectives-sli-slo-sla-explained-simply-fb4b91dd4a07) (Steve Froehlich),
[Google SRE Book — Service Level Objectives](https://sre.google/sre-book/service-level-objectives/).
Poziomy ważności i częstotliwość komunikatów to przykładowa konwencja — dopasuj do organizacji.
- [10 Minor DevOps Mistakes That Can Cause Major Production Issues](https://medium.com/coinmonks/10-minor-devops-mistakes-that-can-cause-major-production-issues-191d141e7686) — Pawan Natekar, 2026 (kopie i odtworzenie, pojedyncze punkty awarii, pojemność)
