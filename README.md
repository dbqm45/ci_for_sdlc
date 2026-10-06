# Continuous Intelligence for Product & Software Definition

> **„Czy naprawdę wiemy, co budujemy — i czy wszystkie źródła wiedzy mówią to samo?”**

Warstwa AI, która łączy **Jira** (wymagania), **Confluence** (wiedza, reguły biznesowe, decyzje) i **Figma** (design), wykrywa **luki, konflikty, niejednoznaczności, nieaktualne informacje i brakujące scenariusze**, zadaje pytania, których zespół nie zadał, pokazuje **dowody** dla każdego wniosku i określa, czy feature jest **gotowy do implementacji**. Po zatwierdzeniu pilnuje, żeby nic się nie „rozjechało” (**continuous drift detection**).

Produkt **nie analizuje kodu** — to świadoma decyzja zakresu MVP: najpierw „czy wiemy, co budujemy?”, dopiero później „jak to zbudować?”.

![status](https://img.shields.io/badge/status-MVP-4f46e5)

---

## Szybki start

> Pierwszy raz? Instrukcja krok po kroku dla osób nietechnicznych (Docker, klucze Jira/Confluence/Figma, pierwsza
> historyjka i podsumowanie na dashboardzie): [`ONBOARDING.md`](ONBOARDING.md).

Wymagania: Node.js ≥ 22.12.

```bash
npm install
npm start
```

Następnie otwórz http://127.0.0.1:4317 (demo workspace „Checkout”). Przy pierwszym `npm start` interfejs buduje się automatycznie; po zmianach w UI uruchom `npm run build`.

Tryb deweloperski (hot reload UI + API):

```bash
npm run dev
```

UI: http://localhost:5173, API: http://127.0.0.1:4317. W bloki poleceń w tym README nie są wpisane komentarze — wklejaj je w całości (zsh na macOS nie traktuje `#` jako komentarza).

Testy i typecheck:

```bash
npm test
npm run typecheck
```

Pokrycie testów jednostkowych (raport w `packages/*/coverage/`):

```bash
npm run test:coverage
```

Testy e2e (Playwright, Chromium) budują UI i uruchamiają serwer w trybie demo na porcie 4399 (zmiana przez `E2E_PORT`) z pustym katalogiem danych w katalogu tymczasowym — nie dotykają `.ci-data`. Przeglądarkę instaluje się raz:

```bash
npx playwright install chromium
npm run test:e2e
```

Gdy Chromium jest już zainstalowany poza Playwrightem, wskaż go zmienną `PW_CHROMIUM_PATH`.

Każdy obszar aplikacji ma własny plik w `e2e/` (ścieżki podobne są zgrupowane razem), a ID przypadku jest w nazwie testu:

| Plik | ID | Ścieżki użytkownika |
|---|---|---|
| `navigation.spec.ts` | NAV | menu boczne, głębokie linki, nieznany element i adres, okruszki |
| `overview.spec.ts` | OVR | stan projektu, „Analyze now”, ryzyka i epiki, reset demo |
| `backlog.spec.ts` | BKL | wyszukiwanie, filtr typu i stanu, rozwinięcie wymiarów |
| `item.spec.ts` | ITM | zatwierdzenie i wycofanie, zatwierdzenie wymuszone, epik, zakładki, „WHY?”, AI review, ponowne zatwierdzenie po driftcie |
| `decisions.spec.ts` | DEC | odpowiedź (opcja, „Other”, akceptacja ryzyka, „Not applicable”), ponowne otwarcie, filtr tematów, „Challenge this feature” |
| `drift.spec.ts` | DRF | wpływ zmiany na zatwierdzone elementy, filtr zdarzeń informacyjnych, regresja „DRIFT DETECTED” |
| `impact.spec.ts` | IMP | analiza wpływu z przykładu i z identyfikatora |
| `settings.spec.ts` | SET | test połączeń, reguły polityki, nazwa decydenta, równoczesna edycja |
| `audit.spec.ts` | AUD | wpis zatwierdzenia, filtr rodzaju, szczegóły zmiany ustawień |
| `accessibility.spec.ts` | A11Y | axe (WCAG 2 A/AA) na każdej stronie, migawki drzewa dostępności |
| `visual.spec.ts` | VIS | zrzuty ekranu kluczowych stron (tylko w nocnym przebiegu, patrz niżej) |

Testy dzielą jeden serwer, więc biegną po kolei; `e2e/support/helpers.ts` przed każdym testem przywraca czysty stan przez API.

### Testy regresji

Jedna kopia testów, zestawy wybierane tagami. Pełny opis, procedura wzorców wizualnych i polityka kwarantanny: [`docs/TESTING-REGRESSION.md`](docs/TESTING-REGRESSION.md).

| Zestaw | Kiedy | Polecenie |
|---|---|---|
| smoke (`@smoke`) | każdy push i PR (`ci.yml`) | `npm run test:e2e:smoke` |
| PR | każdy push i PR (`ci.yml`) | typecheck, `npm run test:coverage` (z testem kontraktu API), `npm run test:e2e` (z `@a11y`) |
| nocny | w poniedziałki 02:17 UTC i ręcznie (`regression-nightly.yml`) | e2e na Chromium, Firefox i WebKit ×2 bez tolerancji dla flaky, `npm run test:visual`, `npm run test:mutation` |

Pozostałe polecenia: `npm run test:a11y`, `npm run test:contract` (`test:contract:update` akceptuje zmianę API).

### Docker (środowisko lokalne z prawdziwymi integracjami)

Ten sam obraz, który CI testuje i publikuje do GHCR przy każdym merge'u do `main`. Dane w wolumenie `ci-data`, port tylko
na `127.0.0.1`, sekrety ze zmiennych środowiskowych (najlepiej wstrzykiwanych z menedżera haseł, np. `op run -- …`):

```bash
export CI_ADMIN_TOKEN=$(openssl rand -hex 32)
docker compose up -d --build
```

Dla początkujących: [`ONBOARDING.md`](ONBOARDING.md). Szczegóły techniczne (darmowe konta Jira, Confluence i Figma, tokeny, lokalny model AI przez Ollamę, kopie zapasowe):
[`docs/LOCAL-ENVIRONMENT.md`](docs/LOCAL-ENVIRONMENT.md).

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

- **Context Discovery & Context Graph** — encje (Epic, Story, Task, Bug, dokument, ramka Figma, domena, decyzja) i relacje (`belongs_to`, `implements`, `documented_by`, `designed_by`, `depends_on`, `references`, `supersedes`, …). Każda krawędź ma typ, pewność i powód (link jawny vs dopasowanie semantyczne). W zakładce *Context* elementu graf sąsiedztwa jest pogrupowany według źródła (Jira, Confluence, Figma) w dwóch kolumnach; można go przybliżać (+/−, Ctrl + kółko), przesuwać, otworzyć powiększony (*Enlarge*, Esc zamyka), filtrować legendą, a kliknięcie węzła Jira otwiera ten element.
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
| AWS credential chain (`AWS_PROFILE`, `AWS_ACCESS_KEY_ID`, `AWS_BEARER_TOKEN_BEDROCK` albo rola IAM w ECS/Fargate, App Runner lub EKS) | dostawca *Amazon Bedrock* (Claude w Twoim koncie AWS); profil instancji EC2 działa, ale Settings pokaże go jako *missing* |
| `OPENAI_API_KEY`, `AZURE_OPENAI_API_KEY`, `CUSTOM_AI_API_KEY` | pozostali dostawcy (OpenAI-compatible) |
| `CI_ENCRYPTION_KEY` | szyfrowanie stanu at-rest |
| `CI_WEBHOOK_SECRET` | zabezpieczenie `/api/webhooks/{jira,confluence,figma}` (nagłówek `x-ci-webhook-secret`) |
| `CI_ADMIN_TOKEN` | token administratora; gdy ustawiony, każda zmiana przez API wymaga `Authorization: Bearer <token>` (UI zapyta o niego raz na sesję). Bez tokenu zmiany przyjmowane są tylko z tej samej maszyny (loopback) |
| `CI_ALLOWED_HOSTS` | dodatkowe wartości nagłówka `Host` (po przecinku, np. `ci.firma.local:4317`), gdy serwer jest dostępny pod inną nazwą niż `localhost` — ochrona przed DNS rebinding |
| `CI_ALLOWED_ORIGINS` | dodatkowe originy przeglądarki, które mogą zmieniać dane (po przecinku, np. `https://ci.firma.pl`) — ochrona przed CSRF |
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
| GET | `/api/openapi.json` | kontrakt API (OpenAPI 3) |

Zasady kontraktu:

- **Błędy** zwracane są jako `application/problem+json` (RFC 9457): `{type, title, status, detail, instance}`; błędy walidacji to `422` z listą `errors: [{field, message}]`. Odpowiedzi `5xx` nie ujawniają szczegółów — przyczyna jest w logu serwera.
- **Walidacja**: ciała żądań mają schematy JSON i odrzucają nieznane pola.
- **Ustawienia**: `GET /api/settings` zwraca `ETag`; `PUT` wymaga nagłówka `If-Match` (`428` bez niego, `412` gdy ktoś zmienił ustawienia w międzyczasie).
- **Kto działa**: nagłówek `X-CI-Actor` (nazwa wyświetlana, URL-encoded) trafia do audytu razem ze sposobem autoryzacji (`via`: `admin_token` albo `loopback`).

## Wersjonowanie i wydania

Wersje według [SemVer](https://semver.org/lang/pl/) (teraz faza `0.y.z`), historia zmian w [`CHANGELOG.md`](CHANGELOG.md).
Commity i tytuły PR w formacie [Conventional Commits](https://www.conventionalcommits.org/pl/v1.0.0/)
(`feat(web): …`, `fix(server): …`). Nową wersję przygotowuje `npm run release`, a tag `vX.Y.Z` tworzy CI po merge'u.
Szczegóły: [`docs/RELEASING.md`](docs/RELEASING.md).

## Roadmap

MVP celowo obejmuje tylko **Level 1 — Definition Intelligence** (Jira + Confluence + Figma). Kolejne poziomy (Product Context Intelligence z OpenAPI, GitHub i Product Analytics oraz Organizational Intelligence ze Slack/Teams, incydentami, supportem i testami), kolejność integracji i przykłady findings opisuje [`docs/ROADMAP.md`](docs/ROADMAP.md).

Docelowy model dystrybucji to **SaaS z abonamentem**: OAuth zamiast tokenów, AI wliczone w usługę, szyfrowanie per organizacja, multi-tenancy, billing. Obecny tryb self-hosted (tokeny w zmiennych środowiskowych) zostaje do testów i instalacji u klienta. Szczegóły: [`docs/SAAS.md`](docs/SAAS.md).
