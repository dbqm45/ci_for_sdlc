# Przegląd bezpieczeństwa przed betą (T9)

Stan: 2026-11-16. Przegląd kodu serwera w trybie, w jakim działa produkcja (`render.yaml`: `CI_AUTH_MODE=accounts`,
`CI_CONNECT_MODE=oauth`, Postgres z RLS, platformowe AI), plus test powierzchni publicznej i instrukcja skanu DAST.
Skan zależności działa już w CI (`npm-audit`). Przegląd powtarzamy przed każdym nowym zespołem i po zmianach w
logowaniu, rolach, webhookach lub trasach publicznych.

## 1. Metoda
1. **Mapa tras bez logowania** — `packages/server/test/public-surface.test.ts` (SEC-PUB-01…03): każda trasa, którą
   serwer rejestruje, jest wołana bez sesji i tokenu na właściwym hoście i z właściwym `Origin`; odpowiadać mogą tylko
   trasy z listy `PUBLIC` (z przypiętym statusem i uzasadnieniem). Nowa trasa otwarta dla wszystkich przewraca test.
2. **Przegląd kodu** przez osobnego agenta (bez dostępu do moich założeń), potem każde ustalenie sprawdzone na
   działającym serwerze i zapisane testem regresji.
3. **DAST** (OWASP ZAP) — na wdrożonym środowisku, przez właściciela (§4).

## 2. Ustalenia

| # | Waga | Co | Stan |
|---|---|---|---|
| F0 | wysoka | **Webhooki bez sekretu otwarte dla każdego**: bez `CI_WEBHOOK_SECRET` (nie było go w `render.yaml`) każdy z internetu uruchamiał analizy dowolnej przestrzeni (`POST /api/w/<id>/webhooks/jira` → 202), także spoza `CI_ALLOWED_HOSTS` — CPU i budżet AI zespołu | **poprawione**: `render.yaml` losuje `CI_WEBHOOK_SECRET`; na produkcji bez niego 503; każda przestrzeń ma własny sekret wyliczony z globalnego (zespół nie uruchomi cudzej), widoczny dla jej Adminów w Ustawieniach; sekret z adresu nie trafia do logów (SEC-WH-01…03) |
| F1 | wysoka | **Admin przestrzeni czytał i listował dysk serwera**: ścieżki OpenAPI / raportów testów / rekonstrukcji kodu w ustawieniach (`/etc`) → „Test connections” zwracał listę plików serwera; pliki w poprawnym formacie trafiały do analizy i do AI; przejście `/` mogło zablokować instancję | **poprawione**: w trybie kont te źródła są wyłączone (422 przy zapisie, pomijane przy analizie, ukryte w Ustawieniach) (SEC-F1) |
| F2 | średnia | **Obejście ról zakodowanym adresem**: Viewer pod `/api/member%73` dostawał listę członków z e-mailami (router dekoduje ścieżkę, sprawdzenie roli patrzyło na surowy adres); tak samo `/api/invitation%73` | **poprawione**: role i listy dozwolonych tras sprawdzane na ścieżce zdekodowanej jak w routerze; błędne kodowanie = 400 (SEC-F2) |
| F3 | średnia | **Limit AI obchodzony mnożeniem przestrzeni**: Admin zespołu mógł założyć N przestrzeni × $50 | **złagodzone**: najwyżej 3 przestrzenie na organizację poza pierwszą (`CI_MAX_WORKSPACES_PER_ORG`) (SEC-F3); limit na organizację — do decyzji po becie |
| F4 | niska | Id przestrzeni są globalne: po skasowaniu archiwum organizacji A kasowany był wydatek AI i limit nowej przestrzeni organizacji B o tym samym id | **poprawione**: dane platformy kasowane tylko, gdy żadna żywa przestrzeń nie ma tego id. Zostaje: 409 przy zakładaniu zdradza, że id jest zajęte |
| F5 | niska–średnia | **Formularz bety** wysyła mail na dowolny adres z tekstem zgłaszającego (ryzyko phishingu/reputacji domeny); 200 miejsc w kolejce da się zapchać z wielu adresów IP | **otwarte**: limit 5 zgłoszeń/h na IP i 200 oczekujących działa; do zrobienia: potwierdzenie adresu przed zapisaniem zgłoszenia, bez wolnego tekstu w mailu do niepotwierdzonego adresu. Do tego czasu: `CI_BETA_APPLICATIONS=closed`, gdy nie zbierasz zgłoszeń |
| F6 | niska (nie potwierdzone) | Operator i pierwszy Owner rozpoznawani po e-mailu Atlassian, który przy zmianie konta może przejść na kogoś innego | **otwarte**: przywiązać operatora do `account_id` po pierwszym logowaniu. W becie: operatorem jest tylko Twój adres; nie dodawaj adresów z domen, których nie kontrolujesz |
| F7 | niska (tylko gdy ustawione) | `CI_READ_TOKEN` w trybie kont czytał przestrzenie wszystkich organizacji | **poprawione**: token tylko do odczytu widzi tylko pierwszą organizację (SEC-F7). `FIGMA_TOKEN`/`JIRA_API_TOKEN` na serwerze byłyby wspólne dla wszystkich zespołów — **nie ustawiaj ich na produkcji** |

**Sprawdzone i w porządku:** ciasteczko sesji `HttpOnly; SameSite=Lax; Secure`, w bazie tylko SHA-256, sesje wygasają;
OAuth (`state` losowy, po stronie serwera i w ciasteczku, 10 minut, przekierowania na stałe ścieżki); CSRF (zmiany z
sesją wymagają zgodnego `Origin`); tokeny porównywane w stałym czasie; podpis HMAC webhooka pdi; SSRF (platformowe AI
pomija adres przestrzeni, Atlassian przez stały `api.atlassian.com`); `/api/dev/*` nie istnieje na produkcji;
`CI_TRUST_PROXY` liczy przeskoki; odpowiedzi 5xx ogólne; start odmawia roli bazy z SUPERUSER/BYPASSRLS; izolacja
organizacji na trasach przestrzeni, członków, zaproszeń; trasy operatora wymagają operatora.

**Nie przejrzane:** interfejs React (wyświetlanie `login_error`/`connect_error`), wysyłka `usage.ts`/`pdi.ts`.

## 3. Powierzchnia publiczna (bez logowania)

| Trasa | Po co | Ochrona |
|---|---|---|
| `GET /api/health` | monitor dostępności, health check Render | tylko wersja i wartości logiczne, bez tekstu błędów; odpowiada pod każdym hostem |
| `GET /api/auth/me`, `GET /api/auth/login`, `GET /api/connections/atlassian/callback` | logowanie | bez danych bez sesji; `state` OAuth |
| `GET /api/beta`, `POST /api/beta/apply` | formularz bety | walidacja, limit na IP, kolejka dla operatora (F5) |
| `POST /api/webhooks/:source`, `POST /api/w/:ws/webhooks/:source` | powiadomienia o zmianach | sekret przestrzeni (F0) |
| `POST /api/webhooks/pdi` | zdarzenia pdi | podpis HMAC; bez połączenia z pdi trasa nie istnieje |

## 4. Skan DAST (OWASP ZAP) — robi właściciel

Wymaga Dockera na Twoim komputerze. **Skan pasywny** (`baseline`) tylko czyta odpowiedzi i jest bezpieczny dla
produkcji; **skan aktywny API** wysyła ataki — tylko na osobną, testową instancję (np. lokalnie `npm run local`, albo
druga usługa Render na kopii bez danych zespołów).

```bash
mkdir -p zap && cd zap
# 1. Pasywny, na produkcji (kilka minut):
docker run --rm -v "$(pwd)":/zap/wrk:rw -t ghcr.io/zaproxy/zaproxy:stable \
  zap-baseline.py -t https://<domena> -r baseline.html
# 2. Aktywny, tylko na instancji testowej, z kontraktem API:
docker run --rm -v "$(pwd)":/zap/wrk:rw -t ghcr.io/zaproxy/zaproxy:stable \
  zap-api-scan.py -t https://<instancja-testowa>/api/openapi.json -f openapi -r api.html
```

Oczekiwane: brak alertów **High**; **Medium** przejrzyj (część to znane kompromisy, np. `style-src 'unsafe-inline'`
w CSP). Raporty (`baseline.html`, `api.html`) zachowaj poza repo; ustalenia wpisz w tabelę §2 i daj znać — poprawię.

| Data | Skan | Cel | Wynik | Kto |
|---|---|---|---|---|
| _do uzupełnienia przed pierwszym zespołem_ | baseline | produkcja | | |
| | api-scan | instancja testowa | | |
