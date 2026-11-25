# Logowanie przez tożsamość suity (DI Identity)

Stan: 2026-11-25, zrobione (ten PR), sprawdzone na żywo na lokalnym Keycloak 26.4.7. Krok 2 przejścia aplikacji w ADR 17 §3 (`dbqm45/pdi`
`docs/17-tozsamosc-suity.md`): DI Definition loguje osoby przez wystawcę suity (`dbqm45/di-identity`, Keycloak, realm
`suite`, klient `di-definition`) obok logowania Atlassian. Dostęp do Jiry i Confluence dalej idzie przez połączenie
Atlassian przestrzeni — to nie logowanie. Pierwsza aplikacja, DI Release Control, przeszła 2026-11-25
(`dbqm45/evdt-shipscope-flags` 0.7.6).

## Co daje token suity

ID token klienta `di-definition` (sprawdzone na Keycloak 26.4.7 z realmem z `di-identity` 0.1.3): `sub` (osoba
w suicie), `name`, `preferred_username`, `organization` (lista aliasów organizacji suity), role aplikacji w
`resource_access.di-definition.roles` (`viewer`, `editor`, `admin`). **Bez e-maila**: suita daje go tylko aplikacjom,
które go potrzebują (DI3), a DI Definition do niego nie należy.

## Decyzje tego kroku

1. **Obok Atlassian, nie zamiast.** Tryb `accounts` bez zmian; gdy ustawione są `CI_SUITE_ISSUER`,
   `CI_SUITE_CLIENT_ID` i `CI_SUITE_CLIENT_SECRET`, ekran logowania ma też „Log in with the suite”. Przepływ: kod
   z PKCE (S256), `state` i `nonce` po stronie serwera, ciasteczko logowania jak przy Atlassian. ID token sprawdzany
   bez nowych zależności (`node:crypto`, RS256, klucze z JWKS wystawcy, `iss`, `aud`, `azp`, `exp`, `nonce`) — te same
   zasady co weryfikator w `dbqm45/di-service-template`.
2. **Organizacja z tokenu.** `CI_SUITE_ORGANIZATION` (alias, np. `acme`) wskazuje organizację suity pierwszej
   organizacji instalacji (`homeOrgId`). Osoba spoza niej nie wchodzi („not a member of the organization”). Więcej
   organizacji instalacji na suicie — gdy zespół spoza pierwszej organizacji będzie tego potrzebował (osobny krok, z
   polem organizacji suity przy organizacji i trasą operatora).
3. **Rola z tokenu przy każdym logowaniu.** `admin` → Admin, `editor` → Member, `viewer` → Viewer; brak roli → odmowa
   („no role in DI Definition”). Owner nie przychodzi z suity: Owner zostaje, dopóki token daje `admin`; token z niższą
   rolą obniża go. Zmiana roli w suicie działa od następnego logowania osoby; do tego czasu sesja (do 7 dni) ma rolę
   z poprzedniego logowania, jak w Release Control.
4. **Osoba suity to osobne konto** (`provider: suite`, `subject` = `sub`), także gdy ta sama osoba ma konto Atlassian.
   Bez e-maila nie da się ich bezpiecznie połączyć; połączenie kont — razem z Admin Console (AC1).
5. **Owner przez suitę.** Osoba z rolą `admin` zostaje Ownerem, gdy organizacja nie ma Ownera — także na pustej
   instalacji, gdzie pierwsza taka osoba zakłada pierwszą organizację (odpowiednik `CI_BOOTSTRAP_EMAIL`, bez e-maila).
   Dzięki temu lokalnie wystarczy suita, bez klienta OAuth Atlassian, a organizacja nie zostaje bez Ownera na stałe,
   gdy token obniży poprzedniego.
6. **Czego osoba suity nie dostaje:** operatora instalacji (to e-mail z `CI_OPERATOR_EMAILS`), zaproszeń (zaproszenie
   jest na e-mail; w suicie dostęp nadaje rola w produkcie — `di-identity`: `role grant di-definition:<rola>`).

## Konfiguracja

| Zmienna | Znaczenie |
|---|---|
| `CI_SUITE_ISSUER` | wystawca, np. `http://localhost:8180/realms/suite` (lokalnie) |
| `CI_SUITE_CLIENT_ID` | klient w realmie, domyślnie `di-definition` |
| `CI_SUITE_CLIENT_SECRET` | sekret klienta (`npm run identity -- secrets` w `di-identity`: `SUITE_CLIENT_SECRET_DI_DEFINITION`) |
| `CI_SUITE_ORGANIZATION` | alias organizacji suity dla pierwszej organizacji instalacji |

W `di-identity`: `REDIRECT_DI_DEFINITION=<CI_PUBLIC_URL>/*` przed `configure`. Powrót z suity:
`<CI_PUBLIC_URL>/api/auth/suite/callback`. Wystawca przez `http://` tylko na `localhost`/`127.0.0.1`.

## Kryteria akceptacji (testy `packages/server/test/suite-login.test.ts`)

- SL-01: bez konfiguracji suity trasa logowania suity odpowiada 404, a `/api/auth/me` nie oferuje przycisku.
- SL-02: logowanie przekierowuje do wystawcy z `code_challenge` (S256), `state`, `nonce`, zakresem `openid profile`
  i adresem powrotu; `state` w krótkim ciasteczku.
- SL-03: osoba z rolą `editor` w organizacji wchodzi jako Member; drugie logowanie to to samo konto.
- SL-04: osoba spoza `CI_SUITE_ORGANIZATION` i osoba bez roli są odrzucone z czytelnym powodem; sesji brak.
- SL-05: token podpisany obcym kluczem, z innym `aud`/`azp`, `nonce` albo przeterminowany — odrzucony.
- SL-06: pierwsza osoba z `admin` na pustej instalacji zostaje Ownerem; Owner zostaje przy `admin`, spada przy `viewer`.
- SL-07: osoba suity nie jest operatorem i nie ma e-maila w `/api/auth/me`.

Na żywo: lokalny Keycloak z realmem `suite`, organizacja i konto testowe jak przy Release Control
(`dbqm45/pdi` `docs/plan-budowy-suity.md`, stan 2026-11-25).

## Uruchomienie lokalne

1. `di-identity`: Keycloak na `localhost:8180`, `REDIRECT_DI_DEFINITION=http://localhost:4317/*`, `configure`,
   `secrets --env-file <plik>` (sekret `SUITE_CLIENT_SECRET_DI_DEFINITION`), organizacja i rola:
   `role grant di-definition:admin <osoba>` dla pierwszego Ownera, `di-definition:editor` dla Membera.
2. DI Definition: `CI_AUTH_MODE=accounts`, `CI_SUITE_ISSUER=http://localhost:8180/realms/suite`,
   `CI_SUITE_CLIENT_SECRET` z pliku, `CI_SUITE_ORGANIZATION=<alias>`, potem `npm start` i „Log in with the suite”.
   Keycloak pyta najpierw o nazwę użytkownika, hasło na drugim ekranie.

Sprawdzone 2026-11-25: Owner (`admin`), Member (`editor`), odmowa spoza organizacji i bez roli, bez e-maila w koncie.
