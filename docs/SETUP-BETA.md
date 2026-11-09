# Uruchomienie zamkniętej bety na serwerze

Stan: 2026-11-09. Co ustawić, żeby zapisy, ankiety, wstrzymanie i maile bety działały na serwerze produkcyjnym.
Jak beta działa: [`BETA-ENROLLMENT-PLAN.md`](BETA-ENROLLMENT-PLAN.md) (T10) i [`ORGANIZATIONS-PLAN.md`](ORGANIZATIONS-PLAN.md);
po co jest i co mierzymy: [`BETA-PLAN.md`](BETA-PLAN.md); pytania ankiet: [`BETA-SURVEYS.md`](BETA-SURVEYS.md).
Pozostałe prace przed pierwszym zespołem (hosting, kopie, monitoring…) to T1–T9 w `BETA-PLAN.md` §4.

## 1. Zmienne środowiskowe

Sekrety (oznaczone 🔒) trzymaj tylko w zmiennych środowiskowych platformy albo w menedżerze sekretów, nigdy w repo.

| Zmienna | Wartość | Po co |
|---|---|---|
| `CI_AUTH_MODE` | `accounts` | logowanie kontem Atlassian; bez tego beta jest wyłączona (trasy bety odpowiadają 404) |
| `CI_PUBLIC_URL` | `https://<domena>` | adres aplikacji: powrót z Atlassiana, linki w zaproszeniach i mailach |
| `ATLASSIAN_CLIENT_ID`, `ATLASSIAN_CLIENT_SECRET` 🔒 | z Atlassian Developer Console | logowanie (`read:me`); [`CONNECT-ATLASSIAN.md`](CONNECT-ATLASSIAN.md) |
| `CI_BOOTSTRAP_EMAIL` | e-mail Twojego konta Atlassian | pierwsze logowanie robi Cię Ownerem pierwszej organizacji |
| `CI_OPERATOR_EMAILS` | e-mail Twojego konta Atlassian (kilka po przecinku) | strona *Beta operator* (`#/operator`): zgłoszenia, zatwierdzanie, łaska, przedłużenie |
| `RESEND_API_KEY` 🔒 | klucz API z Resend | wysyłka maili bety |
| `CI_MAIL_FROM` | np. `Quorum <beta@twoja-domena>` | nadawca; domena musi być zweryfikowana w Resend (rekordy DNS) |
| `CI_DATABASE_URL` 🔒 | Postgres, rola bez superużytkownika i bez `BYPASSRLS` | stan wszystkich przestrzeni i organizacji (bez niej: pliki w `CI_DATA_DIR`) |
| `CI_ENCRYPTION_KEY` 🔒 | długi losowy ciąg, np. `openssl rand -hex 32` | szyfrowanie stanu i tokenów połączeń (wymagany przy połączeniu Atlassiana w trybie `oauth`) |
| `CI_ALLOWED_HOSTS` | `<domena>` | nagłówek `Host` spoza `localhost` (ochrona przed DNS rebinding) |
| `HOST` | `0.0.0.0` | nasłuch poza loopbackiem (w kontenerze) |
| `CI_ADMIN_TOKEN` 🔒 | długi losowy ciąg | maszyny (CLI, MCP, pdi); z tokenem administratora też widać panel operatora przez API |

Opcjonalne:

| Zmienna | Domyślnie | Po co |
|---|---|---|
| `CI_BETA_WEEKS` | `8` | długość bety od pierwszego logowania Ownera zespołu |
| `CI_BETA_PAUSE_AFTER_DAYS` | `7` | po ilu dniach zaległej ankiety analizy zespołu są wstrzymane |
| `CI_BETA_APPLICATIONS` | (otwarte) | `closed` zamyka formularz `#/beta` (410), gdy masz już 3–5 zespołów |
| `CI_BETA_JOB` | (włączone) | `off` wyłącza zadanie bety (przypomnienia, wstrzymanie, koniec) — tylko do diagnozy |
| `POSTHOG_API_KEY` 🔒 | (brak) | pomiar użycia (T8) wysyłany też do PostHog; bez klucza zdarzenia są tylko we własnym logu, a miary liczy panel operatora (*Usage*) |
| `POSTHOG_HOST` | `https://eu.i.posthog.com` | region PostHog (zostaw UE; PostHog dopisz do listy podprzetwarzających i DPA, `BETA-PLAN.md` §5) |
| `CI_USAGE_SECRET` 🔒 | losowy, zapisany raz w bazie | sekret pseudonimów osób, przestrzeni i organizacji; ustaw, jeśli pseudonimy mają przetrwać przeniesienie danych |
| `CI_USAGE` | (włączony) | `off` wyłącza cały pomiar użycia |

Bez `RESEND_API_KEY` i `CI_MAIL_FROM` serwer działa, ale maile trafiają tylko do logu (odbiorca i temat, nigdy treść
z linkiem) — wtedy link zaproszenia przekazujesz sam z panelu operatora.

## 2. Kolejność pierwszego uruchomienia

1. Aplikacja w Atlassian Developer Console z zakresem `read:me` i *Callback URL*
   `https://<domena>/api/connections/atlassian/callback` ([`CONNECT-ATLASSIAN.md`](CONNECT-ATLASSIAN.md), krok 1).
2. Domena nadawcy zweryfikowana w Resend, klucz API utworzony (uprawnienie *Sending access*).
3. Zmienne z §1 ustawione, serwer uruchomiony (`npm start` albo obraz z `Dockerfile`).
4. Zaloguj się kontem z `CI_BOOTSTRAP_EMAIL` — zostajesz Ownerem pierwszej organizacji (przestrzeń `default`).
5. W menu pojawia się *Beta operator* (Twój e-mail jest w `CI_OPERATOR_EMAILS`).
6. Wyślij zespołom adres formularza: `https://<domena>/#/beta`.
7. Zgłoszenia zatwierdzasz na `#/operator` (*Approve* zakłada organizację, przestrzeń i wysyła zaproszenie Ownera).

## 3. Sprawdzenie po wdrożeniu

- `GET /api/health` → `ok: true`, `storage: postgres`.
- `GET /api/beta` → `{ "open": true, "weeks": 8 }` (bez logowania).
- Testowe zgłoszenie z własnym drugim adresem → mail „we have your application” i mail do operatora; zgłoszenie na
  `#/operator`. Odrzuć je potem (*Reject*).
- W logu serwera brak wpisów `mail not sent: RESEND_API_KEY is not set` i `beta mail failed`.

## 4. Znane ograniczenia (do zrobienia)

- **Limit zgłoszeń za proxy:** limit 5 zgłoszeń na godzinę liczy się z `req.ip`. Fastify nie ma dziś włączonego
  `trustProxy`, więc za load balancerem wszystkie zgłoszenia mają adres proxy i limit działa na całą instalację.
  Do zrobienia przy hostingu (T1): zmienna `CI_TRUST_PROXY` przekazywana do Fastify (pozycja w `TODO.md`).
- **Jeden serwer na bazę:** kolejka zapisów i zadanie bety działają w procesie — nie uruchamiaj dwóch instancji
  na tej samej bazie (`WORKSPACES-F5-PLAN.md`, „Ograniczenie”).
- **pdi** należy do pierwszej organizacji; zespoły bety go nie widzą (`ORGANIZATIONS-PLAN.md`).
