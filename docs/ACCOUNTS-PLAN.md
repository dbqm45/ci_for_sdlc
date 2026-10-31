# Konta, organizacje i role (krok 3 `docs/SAAS.md`)

Stan: 2026-10-31, plan. Decyzje właściciela z 31.10: zaczynamy SaaS od kont i organizacji, a w pierwszej wersji
logowanie odbywa się **kontem Atlassian**. Google i Microsoft dołożymy później tym samym mechanizmem.

Dziś aplikacja nie zna ludzi. Zmiany chroni jeden `CI_ADMIN_TOKEN` (albo loopback), a odczyty opcjonalnie
`CI_READ_TOKEN`. Imię w audycie pochodzi z nagłówka `X-CI-Actor`, który wpisuje klient, więc nie jest tożsamością
(`server/src/http.ts`, `actorOf`). Ten plan dodaje konta osób, organizację nad przestrzeniami roboczymi i role.

## Przełącznik

| `CI_AUTH_MODE` | Kto może czytać i zmieniać |
|---|---|
| `token` (domyślnie) | bez zmian: `CI_ADMIN_TOKEN`, `CI_READ_TOKEN`, loopback |
| `accounts` | osoby zalogowane kontem Atlassian, według roli w organizacji. Tokeny działają dalej dla maszyn (MCP, CLI, pdi) |

Lokalne uruchomienie, testy e2e i demo zostają bez logowania. Tryb `accounts` działa na plikach i na Postgresie.

## Model

- **Osoba** (`user`): `id` (losowe), `provider: 'atlassian'`, `subject` (Atlassian `account_id`), `name`, `email`
  (może być pusty, gdy konto Atlassian go ukrywa), `createdAt`, `lastLoginAt`.
- **Organizacja** (`org`): `id`, `name`, `createdAt`. W pierwszej wersji instalacja ma **jedną** organizację, która
  obejmuje wszystkie przestrzenie robocze. Wiele organizacji na jednym serwerze (rejestracja z okresem próbnym)
  przyjdzie z rozliczeniami (krok 7) i z `org_id` w RLS.
- **Członkostwo**: `userId`, `orgId`, `role`.
- **Role** (od najmocniejszej):

  | Rola | Może |
  |---|---|
  | **Owner** | wszystko, co Admin, oraz zmiana i odebranie roli Owner. Organizacja ma zawsze co najmniej jednego Ownera |
  | **Admin** | ustawienia, połączenia (*Connect Atlassian*), przestrzenie robocze, zapraszanie i role (oprócz Owner) |
  | **Member** | analiza, decyzje, zatwierdzenia, komentarze, zamykanie dryfu |
  | **Viewer** | tylko odczyt |

  Każda trasa, która dziś wymaga tokenu administratora, dostaje w kodzie minimalną rolę (tabela w
  `server/src/roles.ts`). Test sprawdza, że żadna trasa zmieniająca stan nie została bez przypisanej roli.
- Dane kont leżą w zarezerwowanej przestrzeni `_platform`: dokumenty `users`, `orgs`, `memberships`,
  `invitations`, `sessions` oraz log `audit`, przez ten sam `Backend` (pliki albo jsonb w Postgresie z RLS).
  Nazwa `_platform` nie jest poprawnym `id` przestrzeni, więc nie da się jej utworzyć ani usunąć przez API.

## Logowanie kontem Atlassian

1. Niezalogowany użytkownik widzi ekran logowania z przyciskiem **Log in with Atlassian**.
2. Serwer losuje `state`, zapisuje go w ciasteczku na 10 minut i przekierowuje do `auth.atlassian.com/authorize`
   z zakresem **`read:me`**, czyli bez dostępu do Jiry i Confluence. To osobna zgoda od *Connect Atlassian*.
3. Powrót z Atlassiana idzie na **ten sam adres** co dziś (`/api/connections/atlassian/callback`). Serwer rozpoznaje po
   `state`, że to logowanie, a nie połączenie przestrzeni, tak jak dziś rozpoznaje przestrzeń
   (`docs/WORKSPACES-F5-PLAN.md`). Dzięki temu w konsoli Atlassiana nie trzeba dopisywać drugiego *Callback URL*.
4. Serwer wymienia kod na token, pobiera `GET https://api.atlassian.com/me` (`account_id`, `name`, `email`)
   i **od razu zapomina token**. Do logowania żaden token nie jest przechowywany.
5. Osoba bez konta:
   - **Pierwsza osoba** w ogóle zostaje Ownerem organizacji, a organizacja przejmuje istniejące przestrzenie.
     Żeby nikt obcy nie zdążył przed właścicielem, pierwsze logowanie wymaga **`CI_BOOTSTRAP_EMAIL`**
     (e-mail konta Atlassian właściciela) albo jednorazowego linku, który serwer wypisuje w logu przy starcie.
   - Każda kolejna osoba potrzebuje zaproszenia. Bez niego widzi komunikat „Poproś administratora o zaproszenie”.
6. Serwer tworzy sesję i przekierowuje do aplikacji.

Ta sama aplikacja OAuth w Atlassian Developer Console obsłuży logowanie i połączenie. Trzeba w niej tylko dodać
uprawnienie *User identity API* → `read:me` (instrukcja trafi do `docs/CONNECT-ATLASSIAN.md`).

## Sesje

- Losowy identyfikator (32 bajty) w ciasteczku `ci_session`: `HttpOnly`, `SameSite=Lax`, `Secure` przy `https`,
  `Path=/`. Na serwerze zapisany jest tylko **skrót SHA-256** identyfikatora, więc wyciek danych nie daje sesji.
- Wygasanie: po 12 h bez aktywności i najpóźniej po 7 dniach. *Log out* usuwa sesję na serwerze.
- Zmiana roli albo usunięcie z organizacji działa od następnego żądania, bo rola jest czytana przy każdym
  żądaniu, a nie zapisana w sesji.
- CSRF: istniejące sprawdzanie `Origin` plus `SameSite`. Przy sesji z ciasteczka zmiana stanu **wymaga** nagłówka
  `Origin` (dziś brak `Origin` jest dozwolony dla klientów bez przeglądarki).
- Audyt: `actor` to imię z konta, a `via: 'session'` obok dotychczasowych `admin_token`, `loopback`
  i `pdi_signature`. Nagłówek `X-CI-Actor` jest przy sesji ignorowany.

## Zaproszenia

- Admin w *Settings → Members* klika *Invite*, podaje rolę (Admin, Member albo Viewer) i opcjonalnie e-mail.
  Dostaje jednorazowy link ważny 7 dni i sam go przekazuje. Aplikacja na razie nie wysyła e-maili.
- Link zawiera losowy token, a serwer przechowuje tylko jego skrót. Po pierwszym użyciu link przestaje działać.
- Jeśli podano e-mail, a konto Atlassian go pokazuje, muszą się zgadzać. Gdy konto ukrywa e-mail, wystarczy link.
- *Settings → Members*: lista osób z rolą i ostatnim logowaniem, zmiana roli, usunięcie, cofnięcie zaproszenia.

## Maszyny (MCP, CLI, pdi)

W trybie `accounts` `CI_ADMIN_TOKEN` i `CI_READ_TOKEN` działają jak dotąd, ale wyłącznie z nagłówkiem
`Authorization` (nigdy z przeglądarki przez ciasteczko). Klucze API per organizacja zastąpią je w późniejszym kroku.

## UI

- Ekran logowania, a w panelu bocznym menu osoby: imię, rola, *Log out*.
- Przyciski, do których rola nie uprawnia, są wyłączone z podpowiedzią, jakiej roli trzeba. Serwer i tak sprawdza.
- W trybie `accounts` znika okienko z pytaniem o token administratora.

## Testy (najpierw czerwone)

- `packages/server/test/accounts.test.ts`: logowanie z atrapą Atlassiana (`state` i ciasteczko, zły `state` → błąd,
  token nie zostaje zapisany), pierwsze konto tylko z `CI_BOOTSTRAP_EMAIL`, obca osoba bez zaproszenia → odmowa,
  zaproszenie jednorazowe i wygasające, zgodność e-maila, sesja wygasa i ginie po *Log out*, w danych zapisany
  jest skrót, a nie identyfikator.
- `packages/server/test/roles.test.ts`: macierz rola × trasa (Viewer czyta, ale nie zmienia; Member decyduje, ale nie
  zmienia ustawień; Admin nie odbiera Ownera; ostatniego Ownera nie da się usunąć), każda trasa zmieniająca stan ma
  rolę, zmiana roli działa od razu, zmiana stanu bez `Origin` przy sesji → 403, tokeny maszyn działają.
- Tryb `token` bez zmian: istniejące testy przechodzą bez modyfikacji.
- `packages/web/test`: ekran logowania, menu osoby, wyłączone przyciski według roli.
- Postgres: dane `_platform` pod RLS jak każda przestrzeń (`postgres.test.ts`).

## Kolejność (osobne PR)

1. Ten plan.
2. Logowanie, sesje, pierwszy Owner, role na trasach, tryb `accounts` w serwerze.
3. Zaproszenia i *Settings → Members* w UI.
4. Instrukcja w `docs/CONNECT-ATLASSIAN.md` (uprawnienie `read:me`) i `npm run local -- --accounts`.
5. Próba na żywo: Ty logujesz się swoim kontem Atlassian i zapraszasz drugie konto.

## Poza zakresem

Google i Microsoft (OIDC), SAML i SCIM (Enterprise), wiele organizacji na serwerze z `org_id` w RLS, klucze API
per organizacja, wysyłanie e-maili, MFA (wymusza ją dostawca tożsamości).

## Do potwierdzenia u dostawcy przed kodem

- Zakres `read:me` i pola odpowiedzi `GET https://api.atlassian.com/me` (`account_id`, `name`, `email`).
- Czy prośba o sam `read:me` w aplikacji, która ma też zakresy Jiry i Confluence, pokazuje zgodę tylko na
  `read:me`.
