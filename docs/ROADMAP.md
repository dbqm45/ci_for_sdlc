# Roadmap — co dalej po MVP

> **Wizja:** *AI continuously understands the product through all available sources of truth.*
> Continuous Intelligence layer that creates a living, connected understanding of the product and continuously checks whether new decisions fit that understanding.
>
> **MVP pozostaje wąskie:** Jira + Confluence + Figma.

## Dwa pytania, dwa poziomy analizy

1. **Czy wiemy, co chcemy zbudować?** Do tego wystarczą Jira, Confluence i Figma (to robi MVP).
2. **Czy to, co chcemy zbudować, jest zgodne z istniejącym produktem i systemem?** Do tego potrzebne są kolejne źródła.

Nie dodajemy integracji tylko dlatego, że istnieje. Każde nowe źródło musi odpowiadać na konkretne pytanie, którego obecne źródła nie potrafią rozstrzygnąć.

## Źródła i priorytety

| Integracja | Co daje | Priorytet |
|---|---|---|
| Jira | wymagania, Epics, Stories, Bugs, Tasks, zależności | **Must — MVP (zrobione)** |
| Confluence | business rules, decyzje, dokumentacja, kontekst | **Must — MVP (zrobione)** |
| Figma | UX, flows, states, design coverage | **Must — MVP (zrobione)** |
| API specs (OpenAPI / Swagger) | kontrakty API i ich spójność z wymaganiami i designem | Faza 2 |
| GitHub / GitLab / Bitbucket | istniejący system: domeny, komponenty, API, zależności, historia zmian | Faza 2 |
| Product Analytics (Amplitude, Mixpanel, GA, Segment) | rzeczywiste user journeys i zachowania użytkowników | Faza 2/3 |
| Slack / Teams | decyzje i wiedza, które nigdy nie trafiły do Jira/Confluence | Faza 2/3 |
| Databases / schema | model danych i ograniczenia domeny | Później |
| Incident management (PagerDuty, Opsgenie) | historyczne problemy produkcyjne i ryzyka | Później |
| Test management | istniejące scenariusze i pokrycie wymagań | Później |
| Support / Customer feedback | realne problemy użytkowników | Później |

## Trzy poziomy produktu

### Level 1 — Definition Intelligence (MVP)

Źródła: **Jira, Confluence, Figma.**
Pytanie: *Czy dobrze zdefiniowaliśmy feature?*

### Level 2 — Product Context Intelligence

Źródła: Level 1 + **OpenAPI, GitHub/GitLab, Product Analytics.**
Pytanie: *Czy proponowana zmiana jest zgodna z istniejącym produktem i jego zachowaniem?*

### Level 3 — Organizational Intelligence

Źródła: Level 2 + **Slack/Teams, Incident Management, Support, Customer Feedback, Test Management, Data/DB.**
Pytanie: *Czy decyzja jest zgodna z tym, co organizacja wie o swoim produkcie, użytkownikach i problemach?*

```
                        PRODUCT
                            │
             ┌──────────────┼──────────────┐
             ↓              ↓              ↓
           JIRA        CONFLUENCE        FIGMA          ← Level 1 (MVP)
             │              │              │
             └──────────────┼──────────────┘
                            ↓
                      CONTEXT GRAPH
                            │
       ┌────────────────────┼────────────────────┐
       ↓                    ↓                    ↓
    GITHUB               OPENAPI             ANALYTICS     ← Level 2
       │                    │                    │
       └────────────────────┼────────────────────┘
                            ↓
                   PRODUCT INTELLIGENCE
                            │
             ┌──────────────┼──────────────┐
             ↓              ↓              ↓
         Conflicts        Gaps          Coverage
             └──────────────┼──────────────┘
                            ↓
                QUESTIONS → HUMAN DECISIONS → FEATURE READINESS
```

## Kolejność rozszerzania

| Krok | Źródło | Pytanie |
|---|---|---|
| 1 | Jira + Confluence + Figma | Czy definicja feature'u jest kompletna? *(MVP)* |
| 2 | OpenAPI | Czy wymagania, UX i kontrakt API są spójne? |
| 3 | GitHub / GitLab | Czy feature pasuje do istniejącego produktu i architektury? |
| 4 | Product Analytics | Czy projekt odpowiada rzeczywistemu zachowaniu użytkowników? |
| 5 | Slack / Teams | Jakie decyzje istnieją poza oficjalną dokumentacją? |
| 6 | Incidents / Support / Feedback | Czego nauczyliśmy się z realnych problemów? |

---

## Szczegóły kolejnych integracji

Każda integracja wpina się w istniejący model w ten sam sposób (zob. [ARCHITECTURE.md](ARCHITECTURE.md)):

**connector → własny Context (normalizacja) → encje i relacje w Context Graph → claims → reguły + semantic AI → findings / questions.**

MCP może być warstwą transportu do systemów zewnętrznych, ale produkt zawsze normalizuje dane do własnego modelu kontekstu.

### 2. OpenAPI / API contracts

- **ApiContext:** endpointy, metody, kody odpowiedzi (`200` vs `202 Accepted`), schematy błędów, nagłówki (np. `Idempotency-Key`), limity, timeouty, wersje.
- **Nowe claims:** `processing_mode` z kodu odpowiedzi (`202` oznacza async), `idempotent` z nagłówków, `timeout`, `max_items`, kody błędów. Są w pełni deterministyczne, więc mają wysoką pewność.
- **Przykładowe reguły:**
  - Figma pokazuje natychmiastowy sukces, a API zwraca `202 Accepted`: *Potential mismatch between UX and API behavior* (CONFLICT).
  - Story definiuje błąd, którego API nie zwraca, albo API zwraca kod błędu bez stanu w Figmie (MISSING COVERAGE).
  - Retry płatności bez `Idempotency-Key` w kontrakcie (wzmacnia obecną regułę ARCH-001 twardym dowodem).
  - Wymaganie, UX i API są spójne: *Requirement, UX and API behavior are aligned* (pozytywny sygnał w readiness).
- **Dlaczego wcześnie:** kontrakt API jest ustrukturyzowany, tani w analizie i daje dowody wysokiej jakości. Nie wymaga analizy kodu.

### 3. GitHub / GitLab / Bitbucket — kontekst istniejącego systemu, nie analiza kodu

Cel: dowiedzieć się, **co już istnieje**, a nie oceniać jakość implementacji.

- **CodebaseContext z metadanych i struktury:** katalogi i moduły, nazwy komponentów i serwisów, `CODEOWNERS`, manifesty zależności, pliki OpenAPI w repo, README modułów, historia zmian (kto i kiedy zmieniał daną domenę), linki PR ↔ Jira.
- **Domain Detection 2.0:** domeny z rzeczywistej struktury systemu, np.
  ```
  Payments
   ├── SavedPaymentMethod
   ├── PaymentMethodService
   ├── PaymentProvider
   └── CustomerPaymentMethods
  ```
- **Przykładowe findings:**
  - *This feature appears to extend an existing Payments domain rather than introduce a new capability.*
  - Story wymaga komponentu, którego nie ma w systemie (scope risk).
  - Dokumentacja opisuje moduł, który zniknął z repo (OUTDATED, z twardym dowodem).
  - Ownership: kto powinien zatwierdzić zmianę (`CODEOWNERS`).
- **Bezpieczeństwo:** domyślnie tylko metadane i struktura, bez wysyłania kodu do AI (zgodnie z ustawieniem *Don't send source code*).
- **Później (Implementation Intelligence):** Code ↔ Specification validation, plan implementacji, testy, PR. To osobna faza, poza Level 2.

### 4. Product Analytics (Amplitude, Mixpanel, Google Analytics, Segment)

Porównanie tego, **co projektujemy**, z tym, **jak użytkownicy faktycznie korzystają z produktu**. To jest już Product Intelligence, a nie linter dokumentacji.

- **BehaviorContext:** lejki, zdarzenia, ścieżki, drop-off, częstotliwość błędów i retry, czas trwania kroków. Tylko agregaty, bez danych osobowych.
- **Mapowanie:** zdarzenia analityczne ↔ stany i przejścia z Figmy ↔ user journeys ze Story.
- **Przykład:**
  - Story: *User can delete saved payment method.*
  - Figma: List → Delete → Confirmation → Success.
  - Analytics: użytkownicy często porzucają flow po otwarciu potwierdzenia usunięcia.
  - Finding: *Existing user behavior suggests a potential issue in the proposed flow.*
- **Dodatkowe zastosowania:**
  - Priorytet ryzyka: gap w ścieżce używanej przez 40% użytkowników jest ważniejszy niż w ścieżce dla 0,5%.
  - Brakujące zdarzenia analityczne dla nowego feature'u (gap pomiaru sukcesu z celu Epica).

### 5. Slack / Microsoft Teams

W wielu organizacjach prawdziwe decyzje powstają w rozmowach, a potem nikt nie aktualizuje Confluence.

- **ConversationContext:** wybrane kanały (np. `#payments-arch`), wątki powiązane z kluczami Jira lub linkami do Confluence/Figmy, decyzje wyrażone wprost.
- **Nowa kategoria findingu: UNDOCUMENTED DECISION.** Przykład: *„During the architecture discussion, the team decided to disable retry after three failures”*, a w Jira i Confluence tej informacji nie ma.
- **Decision conflict:** Jira mówi 30 s, Confluence 60 s, Slack 30 s. Wynik: *Potential decision conflict*, ze wskazaniem, która decyzja jest najnowsza i kto ją podjął.
- **Akcja:** jednym kliknięciem przenieś decyzję ze Slacka do decision logu, a następnie do Jira/Confluence.
- **Prywatność:** tylko kanały wskazane przez administratora, redakcja danych osobowych, pełny audyt.

### 6. Incidents / Support / Customer Feedback / Test Management / Data

- **Incident management (PagerDuty, Opsgenie):** nowa Story dotyka obszaru z historią incydentów, więc ryzyko rośnie i pojawiają się dodatkowe pytania adversarial (np. *„Incident INC-231 was caused by provider timeouts — is timeout behavior defined?”*).
- **Support / Feedback:** powtarzające się zgłoszenia użytkowników jako dowód potrzeby lub ryzyka (np. częste pytania o duplikaty płatności).
- **Test management:** pokrycie acceptance criteria istniejącymi scenariuszami testowymi. Rozszerza obecne Story ↔ Tasks coverage o Story ↔ Tests.
- **Databases / schema:** ograniczenia domeny (np. limit pól, unikalność, retencja danych) jako claims, które można porównać z wymaganiami.

---

## Pozostałe kierunki techniczne

- Embeddingi zamiast TF-IDF w context discovery dla dużych organizacji.
- Zapisywanie decyzji z powrotem do Jira i Confluence (komentarz, sekcja „Decisions”).
- Powłoka desktopowa (Tauri lub Electron) wokół istniejącego UI. Serwer już działa lokalnie i niezależnie od platformy.
- Model wieloprojektowy i uprawnienia (RBAC), SSO.

## Zasada nadrzędna

Każde nowe źródło nie zmienia filozofii produktu:

- **Context before code**
- **Evidence over intuition:** każdy finding ma źródło.
- **Questions over assumptions:** brak informacji oznacza pytanie, nie zgadywanie.
- **Human owns decisions**
- **Continuous, not one-off**

Dzięki temu produkt przestaje być tylko „AI linterem dla Jira” i staje się warstwą, która utrzymuje żywe, połączone rozumienie produktu.
