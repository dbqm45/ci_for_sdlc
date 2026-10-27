# K1b — token odczytu

Stan: 2026-10-27. Pozycja K1b z `docs/BACKLOG-DEFERRED.md`, odłożona przy K-1 (`docs/MCP-K1-PLAN.md`): odczyty
`GET /api/*` nie wymagają tokenu, więc w instalacji sieciowej każdy, kto dosięgnie usługi, czyta analizę, decyzje,
dryf i graf — przez UI, `curl` albo serwer MCP. `CI_ADMIN_TOKEN` chroni tylko zmiany.

## Zachowanie
- **`CI_READ_TOKEN`** (nowa zmienna serwera). Gdy ustawiona, każde `GET`/`HEAD` na `/api/*` wymaga
  `Authorization: Bearer <token>`. Przyjmowany jest token odczytu albo `CI_ADMIN_TOKEN` (administrator czyta też).
  Brak albo zły token → `401` z `WWW-Authenticate: Bearer` i treścią mówiącą, czego brakuje.
- **Bez `CI_READ_TOKEN` nic się nie zmienia** (zgodność wstecz: lokalne uruchomienie, testy e2e, demo).
- **Wyjątki** (bez tokenu także przy `CI_READ_TOKEN`):
  - `/api/health` — healthcheck obrazu Dockera i monitory dostępności; mówi tylko, czy usługa żyje;
  - powrót OAuth Atlassiana (`/api/connections/atlassian/callback`) — przekierowanie przeglądarki nie niesie
    nagłówka; chroni go parametr `state` z ciasteczka;
  - webhooki (`/api/webhooks/*`) — jak dziś, mają własne sekrety.
- Sprawdzenie nagłówka `Host`: dziś dowolny host jest dozwolony, gdy ustawiono `CI_ADMIN_TOKEN` bez
  `CI_ALLOWED_HOSTS`; to samo dotyczy `CI_READ_TOKEN` (oba tokeny chronią przed DNS rebinding tak samo).
- Porównanie w stałym czasie, jak dla tokenu administratora. Token nigdy nie trafia do logów ani odpowiedzi.
- Ostrzeżenie przy starcie: serwer słucha poza loopbackiem bez `CI_READ_TOKEN` → „odczyty są otwarte”.
- OpenAPI: schemat bezpieczeństwa `readToken` i opis zasad (kontrakt aktualizowany `test:contract:update`).

## UI
- Ten sam mechanizm co dla zmian: przy `401` z `WWW-Authenticate` UI pyta raz o token (odczytu albo administratora)
  i trzyma go w `sessionStorage` do zamknięcia karty. Kilka równoległych odczytów przy starcie pyta **raz**: żądanie,
  które dostało `401`, a token zmienił się w międzyczasie, ponawia się bez pytania.
- Token odczytu nie wystarcza do zmiany: wtedy serwer odpowie `401` przy zmianie i UI zapyta o token administratora
  (zastępuje zapisany, bo administrator czyta też).
- **Zdarzenia na żywo (`/api/events`).** `EventSource` nie wysyła nagłówków, a token w adresie trafiłby do logów,
  więc UI czyta strumień przez `fetch` z nagłówkiem i mały parser SSE (`sse.ts`), z ponowieniem po zerwaniu.

## Serwer MCP (`packages/mcp`)
- **`CI_SDLC_TOKEN`** (opcjonalna): wysyłana jako `Authorization: Bearer`, gdy ustawiona. Ma to być token odczytu;
  README mówi, żeby nie wpisywać tam tokenu administratora (narzędzie tylko do odczytu nie powinno trzymać
  poświadczenia, które zmienia stan).
- `401` → błąd narzędzia z podpowiedzią: ustaw `CI_SDLC_TOKEN` na `CI_READ_TOKEN` usługi. Token nigdy w komunikacie.

## Kolejność
1. Ten plan.
2. Czerwone testy: `packages/server/test/security.test.ts` (odczyty z tokenem i bez, wyjątki, oba tokeny, Host),
   `packages/mcp/test/client.test.ts` (nagłówek, 401 z podpowiedzią, brak tokenu w komunikatach),
   `packages/web/test/sse.test.ts` (parser zdarzeń w kawałkach).
3. Serwer (`http.ts`, `app.ts`, `index.ts`), MCP (`lib.js`), UI (`api.ts`, `sse.ts`, `App.tsx`).
4. Dokumentacja: `README.md` (konfiguracja), `FAQ.md` §12, `docs/ARCHITECTURE.md`, `packages/mcp/README.md`,
   usunięcie K1b z `docs/BACKLOG-DEFERRED.md`, kontrakt OpenAPI.

## Testy i bramki
`npm test`, `npm run typecheck`, `npm run test:contract`, e2e ustawień i nawigacji (bez tokenu — zgodność wstecz),
`npm run lint:commit`. GitHub Actions na tym koncie nie działają — bramki lokalnie.

## Poza zakresem
Konta użytkowników i role (SSO, P8b), osobne tokeny per osoba, token w trybie SaaS (`docs/SAAS.md`).
