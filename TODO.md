# TODO

## Następne kroki (stan 27.10.2026, po G4)

- [ ] **Wzorzec wizualny `e2e/__screenshots__/settings.png` (ręcznie, właściciel repo).** W *Settings → Integrations*
      doszedł blok *Tests (JUnit XML)* (#77), więc nocny test wizualny strony *Settings* jest czerwony do czasu nowego
      wzorca. *Actions → Regression (nightly) → Run workflow* z `update_snapshots`, obejrzeć artefakt
      `visual-baselines`, scommitować (procedura: `docs/TESTING-REGRESSION.md`).
- [ ] **G5 — dane o użyciu.** Konektor analityki produktu jako źródło metryki sukcesu MVP dla oceny skutku w pdi.
      Najpierw decyzja: które narzędzie (Amplitude, Mixpanel, GA, Segment).
- [ ] **G8 — incydenty.** Incydent jako nowe zgłoszenie PRB w pdi. Najpierw decyzja: które narzędzie (PagerDuty,
      Opsgenie, …).
- [ ] **G3 — kalibracja estymat.** Czas cyklu elementu z ShipScope (pierwszy commit → wydane) obok estymaty
      w sprintdecku. Część ShipScope jest mała; ma sens, gdy sprintdeck dostanie pokoje i import z Jiry.
- [ ] **G6, G7, P1, P2** (jedno wejście dla ludzi, miary przepływu, wspólna platforma, Jira czy repo) — decyzje
      architektoniczne do podjęcia, nie pojedyncze PR-y.
- [ ] **W tym repo:** OpenAPI jako źródło (Faza 2, `docs/ROADMAP.md`) i wiele repozytoriów / projektów w jednej
      przestrzeni roboczej (F5 planu jednego flow, `docs/SAAS.md`).

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
