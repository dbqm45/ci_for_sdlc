# SaaS — architektura, bezpieczeństwo i plan wdrożenia

> **Cel:** aplikacja działa jako usługa w chmurze. Zespoły płacą abonament i podłączają Jira, Confluence i Figmę kilkoma kliknięciami, bez kopiowania kluczy.
> **Zasada:** maksymalne bezpieczeństwo przy minimalnej konfiguracji po stronie klienta.

## 0. Dwa tryby uruchomienia

Obecny sposób działania zostaje. Aplikacja będzie miała dwa tryby, przełączane konfiguracją serwera (`CI_DEPLOYMENT=self-hosted | saas`):

| | **Self-hosted / dev** (obecny) | **SaaS** (docelowy) |
|---|---|---|
| Do czego | testy, demo, rozwój, instalacja u klienta | produkcyjna usługa z abonamentem |
| Użytkownicy | jeden zespół, bez logowania | organizacje, konta, role |
| Jira / Confluence / Figma | token API ze zmiennych środowiskowych (`JIRA_API_TOKEN`, `FIGMA_TOKEN`) | przycisk *Connect* (OAuth) |
| AI | klucz lub rola IAM ze zmiennych środowiskowych | nasze konto Bedrock/Anthropic, wliczone w abonament |
| Dane | pliki JSON w `.ci-data/` (opcjonalnie AES-256-GCM) | Postgres, szyfrowanie per organizacja (KMS) |
| Uruchomienie | `npm start` | kontenery w chmurze (AWS) |

Silnik analizy (`packages/core`) jest wspólny dla obu trybów. Różnią się tylko warstwy: tożsamość, przechowywanie danych, konektory (źródło poświadczeń) i rozliczenia.

Technicznie każda z tych warstw dostaje interfejs z dwiema implementacjami:

```
CredentialProvider   env (self-hosted)            | oauth-store (SaaS)
Storage              files (self-hosted)          | postgres (SaaS)
Identity             none / single user           | accounts + orgs + SSO
AiProvider           config + env                 | platform account (+ BYO Bedrock w Enterprise)
Billing              —                            | Stripe
```

Dzięki temu możesz testować na prawdziwych danych dokładnie tak jak teraz, a SaaS powstaje obok, bez psucia trybu lokalnego.

---

## 1. Doświadczenie klienta (SaaS)

1. **Rejestracja:** logowanie przez Google, Microsoft lub Atlassian. Powstaje organizacja z 14-dniowym okresem próbnym.
2. **Podłączenie źródeł:** *Connect Jira & Confluence* (jedno logowanie Atlassian), *Connect Figma*. Wybór projektu Jira, spaces i plików Figma.
3. **Pierwsza analiza:** uruchamia się automatycznie. Webhooki rejestrujemy sami, więc od tej chwili drift jest wykrywany ciągle.
4. **Zaproszenie zespołu:** PM, BA, Designer, Architect, QA, z rolami.

Klient nigdzie nie wkleja żadnego klucza.

---

## 2. Podłączanie integracji

### Jira i Confluence: Atlassian OAuth 2.0 (3LO)

- Jedna aplikacja OAuth zarejestrowana przez nas w Atlassian Developer Console obsługuje Jira i Confluence.
- Zakresy tylko do odczytu, np. `read:jira-work`, `read:jira-user`, `read:confluence-content.all`, `read:confluence-space.summary`, `offline_access`, plus zarządzanie webhookami.
- Token dostępu jest krótkotrwały, a token odświeżania przechowujemy zaszyfrowany (sekcja 4).
- Administrator klienta może w każdej chwili odebrać dostęp w ustawieniach Atlassiana.

### Figma: Figma OAuth 2.0

- Zakres tylko do odczytu plików (`file_content:read`) plus webhooki.
- Pobieramy wyłącznie strukturę ramek, nazwy, teksty i przejścia. Obrazów nie pobieramy.

### Druga faza: Atlassian Marketplace (Forge)

- Instalacja jak każdej aplikacji Atlassiana, bez tokenów, z rozliczeniem przez Marketplace i oznaczeniem zaufania dla działów bezpieczeństwa.
- Ciężka analiza nadal działa na naszym serwerze. Aplikacja Forge to cienka warstwa: panel w Jira („Feature Readiness” przy Story) i bezpieczny kanał danych.

### Tryb self-hosted

Bez zmian: tokeny API i adresy w Settings oraz w zmiennych środowiskowych, jak obecnie.

---

## 3. AI w SaaS

- **Domyślnie:** nasze konto Amazon Bedrock (Claude) w regionie klienta (EU/US), z umową o braku przechowywania i trenowania na danych klientów. Koszt AI jest wliczony w abonament i ograniczony limitami planu.
- **Serwer bez kluczy:** do Bedrock uwierzytelnia się rolą IAM.
- **Plan Enterprise, własny Bedrock klienta:** klient tworzy w swoim AWS rolę z *trust policy* dla naszego konta i *External ID*. Wywołania AI idą przez konto klienta, w jego regionie i na jego zasadach, bez wymiany jakichkolwiek kluczy.
- **Bez zmian obowiązują:** redakcja danych osobowych, limit danych na źródło, wymóg dowodów dla findings AI, audyt każdego wywołania.

---

## 4. Model bezpieczeństwa

### Sekrety

| Sekret | Gdzie | Jak chroniony |
|---|---|---|
| Tokeny OAuth klientów | Postgres, kolumna zaszyfrowana | envelope encryption: klucz danych per organizacja, opakowany kluczem AWS KMS |
| Sekret aplikacji OAuth (nasz) | AWS Secrets Manager | dostęp tylko przez rolę IAM serwisu |
| Klucze AI | brak (rola IAM do Bedrock) | — |
| Sekrety webhooków | per organizacja, zaszyfrowane jak tokeny | weryfikacja podpisu każdego żądania |

Zasady:
- Sekrety nigdy nie trafiają do przeglądarki, logów ani komunikatów błędów.
- Wyciek samej bazy nie wystarcza: bez uprawnienia do KMS dane są nieczytelne.
- Każde użycie tokenu jest audytowane (kto, kiedy, do jakiej operacji), bez wartości.
- Rotacja: tokeny odświeżane automatycznie, klucze KMS rotowane automatycznie.

### Izolacja klientów (multi-tenancy)

- Każdy rekord ma `org_id`. Wymuszamy to w bazie przez Row-Level Security w Postgres, a nie tylko w kodzie.
- Osobny klucz szyfrujący per organizacja.
- Zadania analizy działają w kontekście jednej organizacji, a cache AI jest kluczowany per organizacja.

### Tożsamość i dostęp

- Logowanie przez OIDC (Google, Microsoft, Atlassian). W Enterprise SSO przez SAML/OIDC z IdP klienta oraz SCIM do automatycznego zarządzania kontami.
- Role: **Owner, Admin, Member, Viewer**. Decyzje i zatwierdzenia przypisane do osoby (*Human owns decisions*).
- Sesje: krótkie, httpOnly, SameSite, ochrona CSRF. Wymuszanie MFA przez IdP.

### Dane i prywatność

- Minimalizacja: pobieramy tylko to, czego wymaga analiza. Kod źródłowy nie jest pobierany.
- Retencja: konfigurowalna, a po rezygnacji dane są usuwane po N dniach. Eksport danych na żądanie.
- Region danych: EU (np. Frankfurt) i US. W Enterprise wybór regionu.
- RODO: umowa powierzenia (DPA), lista podprocesorów (AWS, dostawca AI, Stripe).
- Docelowo SOC 2 Type II lub ISO 27001. To warunek wejścia do większych firm.

### Plan Enterprise

- **BYOK:** nasze szyfrowanie używa klucza KMS klienta. Klient może go wyłączyć, a wtedy jego dane stają się dla nas nieczytelne.
- Własny Bedrock (sekcja 3), dedykowana instancja, region danych, retencja, eksport audytu do SIEM klienta.

---

## 5. Architektura SaaS

```
                Przeglądarka (React UI)
                         │  HTTPS
                         ↓
          ┌─────────── API (Fastify) ───────────┐
          │  auth (OIDC/SAML) · RBAC · billing   │
          │  OAuth callbacks · webhooks ingress  │
          └───────┬───────────────┬──────────────┘
                  │               │
                  ↓               ↓
           Postgres (RLS)     Kolejka zadań (SQS / pg-boss)
           orgs, users,           │
           projects, decisions,   ↓
           findings, snapshots, Workers (analiza)
           audit, encrypted       │  packages/core — wspólny silnik
           tokens                 │
                  ↑               ├──→ Jira / Confluence / Figma (OAuth)
                  │               └──→ Amazon Bedrock (rola IAM)
            AWS KMS (klucze per org)
            AWS Secrets Manager (sekrety platformy)
```

- **Webhooki:** każda organizacja ma własny endpoint z podpisem. Zmiana w Jira, Confluence lub Figmie dodaje do kolejki analizę tylko dotkniętych elementów.
- **Skalowanie:** API i workery skalowane niezależnie. Długie analizy AI w workerach, nie w API.
- **Live update:** SSE lub WebSocket per organizacja, jak obecnie.

---

## 6. Abonament (propozycja do weryfikacji)

| Plan | Dla kogo | Zakres |
|---|---|---|
| **Trial** (14 dni) | ocena | pełne funkcje, 1 projekt |
| **Team** | jeden zespół produktowy | do 3 projektów, rozsądny limit analiz AI miesięcznie, drift, decyzje, impact analysis |
| **Business** | kilka zespołów | więcej projektów i AI, SSO (OIDC), audyt, eksport, priorytetowe wsparcie |
| **Enterprise** | duże organizacje | SAML + SCIM, BYOK, własny Bedrock, region danych, dedykowana instancja, SLA, DPA |

Rozliczenie per użytkownik (seat) z limitem analiz AI w planie. Koszt AI to główny koszt zmienny, więc limity muszą być widoczne w UI. Płatności, faktury i okresy próbne obsługuje Stripe.

---

## 7. Kolejność prac

Każdy krok zachowuje działanie trybu self-hosted.

1. **Warstwy wymienne:** interfejsy `Storage`, `CredentialProvider`, `Identity`, z obecnymi implementacjami jako *self-hosted*. Bez zmiany zachowania.
2. **Postgres + multi-tenancy:** schemat z `org_id` i RLS, migracje, implementacja `Storage` dla Postgresa.
   *Stan 2026-10-27:* zrobione dla przestrzeni roboczych (`CI_DATABASE_URL`, dokumenty jsonb z RLS po przestrzeni,
   `npm run db:import`; [`docs/WORKSPACES-F5-PLAN.md`](WORKSPACES-F5-PLAN.md)). Organizacja ponad przestrzeniami
   przyjdzie z kontami (krok 3).
3. **Konta i organizacje:** logowanie OIDC (Google/Microsoft/Atlassian), zaproszenia, role.
   *Stan 2026-10-31:* plan w [`docs/ACCOUNTS-PLAN.md`](ACCOUNTS-PLAN.md); pierwsza wersja loguje kontem Atlassian.
4. **OAuth Atlassian i Figma** z szyfrowaniem tokenów przez KMS. Automatyczna rejestracja webhooków.
5. **Kolejka i workery:** analizy w tle, analiza przyrostowa po webhookach.
6. **AI platformowe:** Bedrock przez rolę IAM, limity per plan, licznik zużycia.
7. **Billing (Stripe):** plany, trial, limity, portal klienta.
8. **Fundamenty zaufania:** polityka danych, DPA, strona bezpieczeństwa, monitoring, kopie zapasowe, testy penetracyjne, przygotowanie do SOC 2.
9. **Enterprise:** SAML/SCIM, BYOK, własny Bedrock, region danych.
10. **Atlassian Marketplace (Forge):** panel readiness w Jira i kanał sprzedaży.

Kroki 1–4 dają działający, bezpieczny SaaS do testów z pierwszymi klientami. Kroki 5–7 dają produkt, za który można pobierać opłaty.

---

## 8. Otwarte decyzje

- Chmura i region startowy (rekomendacja: AWS, region EU).
- Wycena i limity AI w planach.
- Czy Atlassian Marketplace ma być głównym kanałem sprzedaży (wpływa na priorytet kroku 10).
- Nazwa produktu i domena (potrzebne do rejestracji aplikacji OAuth).
