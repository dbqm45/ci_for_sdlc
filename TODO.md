# TODO

## Następne kroki (stan 28.10.2026)

- [ ] **Pierwszy płatny przebieg ewaluacji recenzenta AI (wstrzymany).** Telemetria i zestaw 14 przypadków są w
      `main` (#91, `docs/AI-QUALITY-PLAN.md`). Brakuje klucza `ANTHROPIC_API_KEY` w środowisku, w którym uruchamiamy
      przebieg. Po dodaniu klucza: `npm run eval:ai -- --paid --config anthropic:claude-haiku-5-5:low --config
      anthropic:claude-opus-5-5:high` (szacunek 0,1–0,2 USD), raport i surowe wyniki do `docs/evals/`. Z wyniku:
      wybór modelu i `effort` dla recenzenta oraz decyzja o embeddingach (czy TF-IDF gubi ustalenia).
- [ ] **Fragmenty źródeł dobrane do historyjki zamiast obcinania** (po pierwszym przebiegu ewaluacji; źródło: artykuł
      „Stop feeding your AI agent everything: The case for selective context”, M. K., 2026-10). Dziś `semanticPass`
      (`packages/core/src/project.ts`, `clean()`) obcina każde źródło do pierwszych `maxCharsPerSource` znaków
      (domyślnie 6000), więc w długiej stronie fragment o danej historyjce może zostać odcięty, a do modelu trafia
      wstęp. Zmiana: w tym samym limicie akapity i zdania najbardziej podobne do wymagania (TF-IDF z `text.ts`) oraz
      te ze wzmianką klucza; cytat nadal sprawdzany względem całego źródła. Przyjąć tylko, jeśli zestaw ewaluacyjny
      (`npm run eval:ai`) pokaże co najmniej tę samą czułość i poprawność cytatów przy niższej liczbie tokenów;
      w zestawie dopisać przypadek z długą stroną, w której istotny fragment jest za limitem.
- [ ] **Wzorzec wizualny `e2e/__screenshots__/settings.png` (ręcznie, właściciel repo).** W *Settings → Integrations*
      doszły bloki *Tests (JUnit XML)* (#77) i *API contract (OpenAPI)*, więc nocny test wizualny strony *Settings* jest
      czerwony do czasu nowego wzorca. *Actions → Regression (nightly) → Run workflow* z `update_snapshots`, obejrzeć artefakt
      `visual-baselines`, scommitować (procedura: `docs/TESTING-REGRESSION.md`).
- [ ] **G5 — dane o użyciu.** Konektor analityki produktu jako źródło metryki sukcesu MVP dla oceny skutku w pdi.
      Najpierw decyzja: które narzędzie (Amplitude, Mixpanel, GA, Segment).
- [ ] **G8 — incydenty.** Incydent jako nowe zgłoszenie PRB w pdi. Najpierw decyzja: które narzędzie (PagerDuty,
      Opsgenie, …).
- [ ] **G3 — kalibracja prognozy automatu** (od D-E1 prognozę liczy automat, sprintdeck głosuje nad ryzykiem):
      - [x] ShipScope: czas przepływu zmiany i cięcia (pierwszy commit → pierwsze wydanie na PROD) w API usług
            (dbqm45/evdt-service-shipscope#119);
      - [x] pdi: prognoza (cięcia × mediana dni na cięcie) i porównanie z wynikiem po wydaniu (dbqm45/pdi#37);
      - [ ] sprintdeck, po jego MVP (konta, import z Jiry): prognoza przy zadaniu w pokoju.
- [ ] **G6, G7, P1, P2** (jedno wejście dla ludzi, miary przepływu, wspólna platforma, Jira czy repo) — decyzje
      architektoniczne do podjęcia, nie pojedyncze PR-y.
- [ ] **Reguła: PR rusza obszar przyjętej decyzji** (źródło: artykuł „Teaching AI Agents to Remember: ADRs, Specs,
      Engineering Decisions”, A. Kokane, 2026-10-19 — dwa poprawne PR-y razem odwracają decyzję, bo drugi agent jej
      nie znał). Zależy od pola `applies_to` decyzji w kontrakcie pdi (pozycja w `pdi/TODO.md`).
      - Bramka na PR (`npm run analyze -- --repo …`) dostaje listę zmienionych plików (np. `--changed-files` z
        `git diff --name-only` w `docs/templates/change-check.yml`) i przyjęte decyzje z rejestru pdi.
      - Reguła (TDD, sprawdzenie na danych demo i w strażniku pokrycia reguł): zmieniony plik trafia w `applies_to`
        przyjętej decyzji → ustalenie z decyzją, jej `why` i założeniami jako dowodem i pytaniem „Czy ten PR zmienia
        decyzję X?” (opcje: nie / tak — nowa decyzja zastępująca / nie wiem). Nie blokuje sam z siebie; blokuje, gdy
        autor zaznaczy „tak” bez decyzji zastępującej.
      - Założenie z `invalidated_if` spełnione albo minął `review_by` → osobne ustalenie „rozważ decyzję ponownie”.
      - Szablon PR z sekcją „Wpływ na decyzje” (`.github/pull_request_template.md`), ten sam co w pdi i tf.
      - Bez osobnego `INDEX.md` decyzji w repo: katalogiem jest rejestr pdi.
- [ ] **W tym repo:** konta i role w przestrzeniach roboczych (krok 3 `docs/SAAS.md`); OpenAPI — dalsze kroki z
      „Poza zakresem” w `docs/OPENAPI-PLAN.md` (pozytywny sygnał spójności, pola formularza vs schemat, Swagger 2.0).
  - [x] Wiele przestrzeni roboczych w jednej instalacji (#86, #88), w Postgresie z `CI_DATABASE_URL` (#89).
  - [x] Ramki Figmy z tabeli `design.md` zmiany (kontrakt pdi 0.9.0, #87).
  - [x] Telemetria wywołań AI (tokeny, koszt, czas, `GET /api/ai/usage`) i zestaw ewaluacyjny recenzenta (#91).
  - [x] OpenAPI 3 jako źródło: konektor, twierdzenia z kontraktu, reguła API-001, `--openapi`, ustawienie w UI.

## Plan: przyciski „Connect” dla Figma/Jira/Confluence (OAuth zamiast/obok env-secret)

> Status: plan do dyskusji, nic jeszcze nie wdrożone.

### Stan obecny (ustalony przez przegląd kodu)

`Settings` nigdy nie przechowuje sekretów (`packages/core/src/settings.ts:4` — explicit komentarz
„Secrets are never part of it”). Tokeny (`FIGMA_TOKEN`, `JIRA_API_TOKEN`, `CONFLUENCE_API_TOKEN`) są
czytane wyłącznie ze zmiennych środowiskowych serwera (`packages/server/src/engine.ts:59-60`), a
`GET /api/settings` zwraca tylko booleany `secrets: { FIGMA_TOKEN: !!process.env.FIGMA_TOKEN, ... }`
(`packages/server/src/app.ts:233-243`), żeby UI wiedział „skonfigurowane / nie” bez widzenia wartości.
To jest dobry, bezpieczny wzorzec — plan go rozszerza, nie zastępuje.

### 0. Decyzja do podjęcia przed startem (go/no-go)

OAuth wymaga **publicznego URL przekierowania** (redirect URI), zarejestrowanego z góry u dostawcy
(Figma, Atlassian). To nie gryzie się z modelem self-hosted/loopback-first (admin token do zmian
zdalnych) **tylko jeśli** aplikacja jest już wystawiona na publiczny HTTPS. Jeśli to czysto lokalny
`docker compose` bez domeny — OAuth-callback od Figmy/Atlassiana nie dobije do `127.0.0.1`.

→ Pytanie: **czy ta instancja ma (lub będzie mieć) publiczny adres HTTPS?** Jeśli nie — tryb
`env_secret` zostaje jedyną opcją dla czysto lokalnego dev.

### 1. Odpowiedź na pytanie o „zmienną decydującą”

Dwa poziomy, nie jeden:

| Poziom | Co decyduje | Gdzie żyje |
|---|---|---|
| **A. Dostępność OAuth w ogóle** | Czy serwer ma zarejestrowaną aplikację OAuth (`CI_FIGMA_OAUTH_CLIENT_ID`/`_SECRET`, `CI_ATLASSIAN_OAUTH_CLIENT_ID`/`_SECRET` jako env vars) | Zmienne środowiskowe serwera — **nie** w `settings.json` (sekret aplikacji, nie użytkownika) |
| **B. Wybór trybu per integracja** | `authMode: 'env_secret' \| 'oauth'` | Nowe pole w `Settings.integrations.<provider>` |

Dlaczego dwa poziomy: jeśli admin nie skonfigurował OAuth-app na serwerze, przycisk „Connect” po
prostu się nie pojawia (fallback na dotychczasowe instrukcje env var) — zero regresji dla obecnych
wdrożeń. Jeśli OAuth *jest* skonfigurowane, `authMode` daje wybór, gdyby ktoś mimo to chciał użyć
starego tokenu (np. debug, serwis bez przeglądarki).

**Ważna nieoczywistość**: Jira i Confluence dziś współdzielą jeden token Atlassiana (Basic Auth:
email+apiToken, `engine.ts:59`). OAuth 2.0 (3LO) Atlassiana działa tak samo — **jedno** połączenie
OAuth obsługuje oba produkty. Czyli `authMode` sensowniej żyje na poziomie „Atlassian” (jedna
sekcja), nie osobno dla `jira` i `confluence` — inaczej dwa niezależne „Connect” zrobiłyby dwa
osobne granty do tego samego konta.

### 2. Nowe endpointy serwera

```
POST   /api/integrations/figma/connect       → generuje state+PKCE, zwraca authorizeUrl
GET    /api/integrations/figma/callback      → wymienia code→token, zapisuje, redirect do /settings
DELETE /api/integrations/figma/connect       → revoke + usunięcie zapisanych tokenów
POST   /api/integrations/atlassian/connect   → analogicznie, jeden flow dla Jira+Confluence
GET    /api/integrations/atlassian/callback
DELETE /api/integrations/atlassian/connect
```

**Problem do rozwiązania w `registerGuards` (`packages/server/src/http.ts`)**: `/callback` to
przekierowanie z przeglądarki przez Figma/Atlassiana — nie przyjdzie z naszym `Origin`/admin-tokenem.
Trzeba dodać wyjątek analogiczny do istniejącego `/api/webhooks/` (http.ts:51), ale z własną
ochroną: **`state`** generowany w `/connect` (losowy, jednorazowy, krótkoterminowy, zapisany
server-side w pamięci z TTL) jest tym, co udowadnia, że callback jest kontynuacją flow zaczętego
przez zalogowanego admina — nie samym faktem trafienia na URL.

### 3. Przechowywanie tokenów OAuth

Nowy plik stanu (np. `oauth-tokens.json`), **zawsze szyfrowany** AES-256-GCM — reużywam istniejącego
mechanizmu z `packages/server/src/store.ts` (`createCipheriv('aes-256-gcm', ...)`, już używanego dla
`encryptStoredContext`), ale w odróżnieniu od tamtego **nie opcjonalnie**: refresh token to
długożyjący sekret, więc `CI_ENCRYPTION_KEY` staje się wymagany, gdy jakikolwiek provider jest w
trybie `oauth` (analogicznie do istniejącego guard-a przy `encryptStoredContext` w `app.ts:269`).

Kształt: `{ figma: { accessToken, refreshToken, expiresAt, accountName }, atlassian: { ..., cloudId } }`.

### 4. Odświeżanie tokenu — bez zmian w connectorach

`figma.ts`/`atlassian.ts` dziś przyjmują gotowy `token: string` — to się nie zmienia (zero ryzyka dla
już przetestowanego kodu retry/429). Zmiana wchodzi wyłącznie w `engine.ts`, w miejscu gdzie dziś
robi `token('FIGMA_TOKEN')`: nowa funkcja `resolveFigmaToken()` sprawdza `authMode`, i w trybie
`oauth` zwraca `accessToken` (odświeżając przez `refreshToken`, jeśli `expiresAt` minął), zapisując
nowy token do store przed wywołaniem connectora.

### 5. Frontend (`Settings.tsx`)

Per integracja, branch na podstawie nowego pola w odpowiedzi `GET /api/settings` (np.
`oauth: { figma: { available: boolean, connected: boolean, accountName?: string } }`):
- `available === false` → bez zmian, dzisiejsze instrukcje „ustaw FIGMA_TOKEN”.
- `available === true, connected === false` → przycisk **„Connect to Figma”** (POST `/connect`,
  `window.location = authorizeUrl`).
- `connected === true` → status „Połączono jako X” + **„Disconnect”**.

### 6. Bezpieczeństwo (checklist przed implementacją)

- PKCE nawet dla confidential client (obrona w głąb) — Figma i Atlassian obie je wspierają.
- `state`: losowy, jednorazowy, TTL ~10 min, usuwany po użyciu.
- Zakres (`scope`) minimalny: tylko odczyt (`file_read` dla Figmy; `read:jira-work`,
  `read:confluence-content.all`, `offline_access` dla Atlassiana).
- **Nigdy nie logować** `access_token`/`refresh_token` — przy ostatniej zmianie dodaliśmy
  `req.log.warn` dla `FigmaRateLimitError`; trzeba pilnować, żeby podobny log przy OAuth-errorach nie
  wyciekł tokenu.
- Revoke przy „Disconnect” (oba dostawcy mają endpoint rewokacji).
- Redirect URI zarejestrowany dokładnie (bez wildcardów) u dostawcy — musi odpowiadać realnemu
  publicznemu hostowi.

### 7. Kolejność wdrożenia (małe, testowalne kroki — TDD jak dotychczas)

1. Schemat: `authMode` w `Settings` + walidacja + test migracji ustawień.
2. `GET /api/settings` rozszerzony o `oauth.*` status (bez realnego flow jeszcze) — test.
3. Magazyn tokenów w `store.ts` (szyfrowany, wymagany `CI_ENCRYPTION_KEY` w trybie oauth) — test.
4. `/connect` + `/callback` dla **jednego** dostawcy najpierw (sugeruję Figma — prostszy OAuth niż
   Atlassianowe 3LO z `cloudId`) — testy z mockowanym `fetch` do providera.
5. Wyjątek w `registerGuards` dla `/callback` + test na `state`.
6. Odświeżanie tokenu w `engine.ts` — test.
7. Frontend: przycisk Connect/Disconnect dla Figmy.
8. Powtórzyć 4-7 dla Atlassiana (Jira+Confluence razem).

### Otwarte pytania

1. Publiczny HTTPS już jest, czy to jeszcze do zrobienia (pkt 0)?
2. Jira+Confluence jako jedno połączenie Atlassian, czy dwa niezależne (naruszając wzorzec
   współdzielonego tokenu)?
3. Czy `authMode` ma być widoczny/zmieniany przez użytkownika w UI, czy wystarczy automatyczny
   fallback (poziom A z sekcji 1) bez ręcznego przełącznika?
