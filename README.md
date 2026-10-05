# Continuous Intelligence for Product & Software Definition

> **„Czy naprawdę wiemy, co budujemy — i czy wszystkie źródła wiedzy mówią to samo?”**

Warstwa AI, która łączy **Jira** (wymagania), **Confluence** (wiedza, reguły biznesowe, decyzje) i **Figma** (design), wykrywa **luki, konflikty, niejednoznaczności, nieaktualne informacje i brakujące scenariusze**, zadaje pytania, których zespół nie zadał, pokazuje **dowody** dla każdego wniosku i określa, czy feature jest **gotowy do implementacji**. Po zatwierdzeniu pilnuje, żeby nic się nie „rozjechało” (**continuous drift detection**).

Produkt **nie analizuje kodu** — to świadoma decyzja zakresu MVP: najpierw „czy wiemy, co budujemy?”, dopiero później „jak to zbudować?”.

![status](https://img.shields.io/badge/status-MVP-4f46e5)

---

## Szybki start

Wymagania: Node.js ≥ 20.

```bash
npm install
npm run build      # buduje UI
npm start          # http://127.0.0.1:4317 — demo workspace „Checkout”
```

Tryb deweloperski (hot reload UI + API):

```bash
npm run dev        # UI: http://localhost:5173, API: http://127.0.0.1:4317
```

Testy i typecheck:

```bash
npm test
npm run typecheck
```

### Co zobaczysz w demo

Workspace „Checkout” odtwarza przykłady z koncepcji produktu:

| Element | Co wykrywa system |
|---|---|
| **PAY-125 Retry payment** | 🔴 NOT READY — brak strategii idempotencji (API przyjmuje powtórzone żądania), niezdefiniowane zachowanie po nieudanym retry, brak stanu „loading” w Figmie; konflikt timeoutu 30 s vs 60 s; nieaktualna „Retry Policy (2025)” |
| **PAY-127 (bug)** Duplicate charge | Bug Intelligence: potencjalna przyczyna = brak idempotencji w PAY-125; brak testu regresyjnego |
| **CHK-201 Place order** | CONFLICT: Jira mówi 45 s, Confluence 30 s |
| **CHK-202 Order status** | Wymaganie „immediate confirmation” vs asynchroniczne API (UC-04) |
| **PAY-124 Delete saved card** | Brak potwierdzenia akcji destrukcyjnej, Figma bez stanu błędu, wymaganie bez taska (Story ↔ Tasks) |
| **PAY-123, CHK-203** | 🟢 READY FOR IMPLEMENTATION |

**Scenariusz drift:** otwórz PAY-123 → *Approve for implementation* → na stronie *Project health* kliknij *Apply* przy „Confluence: payment timeout 30 s → 60 s” → system pokaże `🔴 DRIFT DETECTED`, konflikt Jira ↔ Confluence i „Impact detected” na zatwierdzonej story.

---

## Funkcje (MVP)

- **Context Discovery & Context Graph** — encje (Epic, Story, Task, Bug, dokument, ramka Figma, domena, decyzja) i relacje (`belongs_to`, `implements`, `documented_by`, `designed_by`, `depends_on`, `references`, `supersedes`, …). Każda krawędź ma typ, pewność i powód (link jawny vs dopasowanie semantyczne).
- **Claims** — normalizacja faktów (timeout, limit retry, idempotencja, tryb sync/async, limity, czas sesji, rozmiar pliku) i wykrywanie konfliktów semantycznych między źródłami.
- **Silnik reguł (Hybrid Intelligence)** — deterministyczne, audytowalne reguły: GAP / CONFLICT / AMBIGUITY / OUTDATED / MISSING COVERAGE / DRIFT. Lista reguł i ich wyłączanie w *Settings → Policy*.
- **Semantic AI (opcjonalnie)** — recenzent specyfikacji + adversarial review; **każde finding AI musi cytować źródło**, inaczej jest odrzucane.
- **State machine & User Journey Coverage** — wymagane stany UI (z AC i wykrytych cech feature'u) vs wymagania vs Figma; pokrycie ścieżek użytkownika.
- **Adversarial review („Challenge this feature”)** — pytania o scenariusze, których specyfikacja nie obejmuje (lost response, double click, session expiry, HTTP 500, …). Pytania już rozwiązane przez Jira/Confluence/decyzję są oznaczane jako odpowiedziane, ze wskazaniem źródła.
- **Questions → Human Decisions** — każde pytanie ma opcje + „Other”; decyzja (lub „accept risk” / „not applicable”) zamyka finding, trafia do logu decyzji i sama staje się źródłem claims (np. decyzja „idempotency key” ujawni, że dokumentacja API jej przeczy).
- **Feature Readiness** — wymiary (Requirements, Design, Documentation, Architecture, User Journeys, Error Handling, Dependencies), status 🟢/🟡/🔴; finding krytyczny zmienia status niezależnie od średniej.
- **Epic / Story / Task / Bug** — osobne modele analizy (rollup epiku, pokrycie AC przez taski, kompletność bug reportu, root cause).
- **Continuous Drift Detection** — snapshoty, porównanie z poprzednią analizą i z zatwierdzonymi baseline'ami, webhooki, harmonogram, live update (SSE).
- **Impact Analysis** — „co jeszcze dotknie ta zmiana?” (tekst lub id encji).
- **Decision Debt, Project Health, Domain Detection, metryki** (Specification Health, Design Coverage, Journey Coverage, Documentation Consistency, Readiness, Drift).
- **Enterprise security** — sekrety tylko w zmiennych środowiskowych, redakcja danych osobowych przed wysłaniem do AI, limit znaków na źródło, szyfrowanie stanu at-rest (AES-256-GCM), audit log z listą źródeł wysłanych do modelu, możliwość pracy bez AI.
- **CLI / quality gate** — `npm run analyze -- --fail-on critical` zwraca kod 1, gdy coś jest NOT READY (do pipeline'ów CI).

---

## Konfiguracja

Wszystko poza sekretami ustawiasz w UI (*Settings*). Sekrety — zmienne środowiskowe serwera (patrz [`.env.example`](.env.example)):

| Zmienna | Do czego |
|---|---|
| `JIRA_API_TOKEN` | Jira Cloud API token (+ e-mail w Settings) |
| `CONFLUENCE_API_TOKEN` | opcjonalnie; domyślnie używany `JIRA_API_TOKEN` |
| `FIGMA_TOKEN` | Figma personal access token |
| `ANTHROPIC_API_KEY` | dostawca *Anthropic* (domyślny model `claude-opus-5-5`) |
| AWS credential chain (`AWS_PROFILE`, `AWS_ACCESS_KEY_ID`, …) | dostawca *Amazon Bedrock* (Claude w Twoim koncie AWS) |
| `OPENAI_API_KEY`, `AZURE_OPENAI_API_KEY`, `CUSTOM_AI_API_KEY` | pozostali dostawcy (OpenAI-compatible) |
| `CI_ENCRYPTION_KEY` | szyfrowanie stanu at-rest |
| `CI_WEBHOOK_SECRET` | zabezpieczenie `/api/webhooks/{jira,confluence,figma}` (nagłówek `x-ci-webhook-secret`) |
| `CI_DATA_DIR`, `PORT`, `HOST` | katalog danych (domyślnie `.ci-data/`), port (4317), host (127.0.0.1) |

Tryb live: *Settings → Workspace → Mode: Live*, włącz integracje, podaj URL-e / klucze projektu / spaces / file keys, *Test connections*, *Save & re-analyze*.

Webhooki: skonfiguruj w Jira/Confluence/Figma wywołanie `POST https://<host>/api/webhooks/<source>` — każda zmiana uruchamia ponowną analizę i detekcję driftu.

---

## Architektura

```
packages/
  core/     silnik: connectors → normalizer → context graph → claims → rules / semantic AI / state analysis
            → findings & questions → decisions → readiness → snapshots & drift → impact
  server/   Fastify API, persystencja (pliki JSON, opcjonalnie szyfrowane), harmonogram, webhooki, SSE, audit, CLI
  web/      React UI (Project health, Backlog, Story/Epic detail, Decisions, Drift, Impact, Settings, Audit)
```

Szczegóły i mapowanie koncepcji produktu na kod: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## API (skrót)

| Metoda | Ścieżka | Opis |
|---|---|---|
| GET | `/api/analysis` | pełny wynik analizy projektu |
| POST | `/api/analyze` | uruchom analizę |
| GET | `/api/items/:key` · `/api/items/:key/graph` | szczegóły elementu · sąsiedztwo w grafie |
| POST | `/api/items/:key/ai-review` | semantyczna recenzja AI jednego elementu |
| POST / DELETE | `/api/items/:key/approve` | zatwierdzenie (baseline dla driftu) / wycofanie |
| GET / POST / DELETE | `/api/decisions[/:id]` | log decyzji / nowa decyzja / ponowne otwarcie |
| GET | `/api/impact?q=` | analiza wpływu |
| GET | `/api/drift` · `/api/history` · `/api/audit` · `/api/rules` | drift log · trend · audyt · reguły |
| GET / PUT | `/api/settings` | ustawienia |
| POST | `/api/webhooks/:source` | powiadomienie o zmianie (jira / confluence / figma) |
| GET | `/api/events` | Server-Sent Events (`analysis`, `status`) |

## Roadmap

- Desktop shell (Tauri/Electron) wokół istniejącego UI — serwer już działa lokalnie i jest platform-agnostic.
- Embeddingi (zamiast TF-IDF) do context discovery przy dużych organizacjach.
- Zapisywanie decyzji z powrotem do Jira/Confluence (komentarz / sekcja „Decisions”).
- Faza 2 — *Implementation Intelligence*: GitHub, Code ↔ Specification validation, plan implementacji.
