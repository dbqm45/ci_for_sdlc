# Wdrożenie na Render (T1) — instrukcja i mapa

Stan: 2026-11-09. Decyzja właściciela: **Render, region UE (Frankfurt)**. Ten dokument ma dwie części: instrukcję
pierwszego uruchomienia (§2) i **mapę wdrożenia** (§4) — jedno miejsce, w którym zapisane jest, gdzie co stoi, kto
ma dostęp i jak to jest zabezpieczone. Zmienne aplikacji i sprawdzenie samej bety: [`SETUP-BETA.md`](SETUP-BETA.md).

## 1. Co stoi gdzie i kto co robi

- **Aplikacja:** usługa *Web Service* `quorum` na Render, z obrazu `Dockerfile` z tego repo, region Frankfurt,
  jedna instancja (kolejka zapisów i zadanie bety działają w procesie).
- **Baza:** *Render Postgres* `quorum-db`, region Frankfurt, **bez adresu w internecie** (`ipAllowList: []`) —
  łączy się z nią tylko aplikacja przez sieć prywatną Render.
- **Konfiguracja:** [`render.yaml`](../render.yaml) w repo (Render Blueprint). Sekrety nie mają w nim wartości:
  Render pyta o nie przy zakładaniu (`sync: false`) albo sam je losuje (`generateValue: true`).
- **Wdrożenia:** Render buduje i wdraża każdy commit `main`, ale dopiero gdy przejdą testy GitHuba
  (`autoDeployTrigger: checksPass`). Migracje bazy robią się przy starcie aplikacji.
- **Właściciel kont:** konta Render, domeny, Atlassian i Resend należą do Ciebie (właściciela produktu) — Claude
  przygotowuje pliki i instrukcje, ale nie ma i nie powinien mieć dostępu do paneli ani sekretów.

> **Do potwierdzenia przy zakładaniu:** pola `render.yaml` są zgodne ze specyfikacją Blueprint Render
> (render.com/docs/blueprint-spec), ale w chwili pisania nie dało się jej otworzyć z sesji Claude (sieć). Plan `starter`
> to ten, na którym działa ShipScope. Jeśli Render zgłosi błąd pola albo planu przy tworzeniu Blueprintu, popraw
> nazwę według komunikatu panelu (albo `render blueprints validate` w CLI Render) i daj znać — poprawię plik.

## 2. Pierwsze uruchomienie — krok po kroku

### Krok 0. Przed Render (raz)
1. **Domena:** wybierz adres aplikacji, np. `quorum.twojafirma.pl` (subdomena wystarczy). Dalej: `<domena>`.
2. **Menedżer haseł:** przygotuj w nim wpis „Quorum produkcja” — trafią tam klucze z kroków 3–6.

### Krok 1. Konto Render
1. Załóż konto na render.com (najlepiej logując się kontem GitHub właściciela repo).
2. **Włącz 2FA** (Account Settings → Security). Dodaj kartę płatniczą (plany płatne — darmowa baza wygasa po 30 dniach).
3. Przy łączeniu z GitHubem daj aplikacji Render dostęp **tylko do repozytorium `ci_for_sdlc`**, nie do wszystkich.

### Krok 2. Utworzenie z Blueprintu
1. Panel Render → **New → Blueprint** → wybierz repo `ci_for_sdlc`, gałąź `main`. Render znajdzie `render.yaml`.
2. Sprawdź podsumowanie: **usługa `quorum` i baza `quorum-db`, obie w regionie *Frankfurt (EU Central)***, plany
   płatne. Jeśli region jest inny — zatrzymaj się (dane mają zostać w UE).
3. Render poprosi o wartości zmiennych `sync: false`:

   | Zmienna | Wartość |
   |---|---|
   | `CI_PUBLIC_URL` | `https://<domena>` (bez ukośnika na końcu) |
   | `CI_ALLOWED_HOSTS` | `<domena>` |
   | `ATLASSIAN_CLIENT_ID`, `ATLASSIAN_CLIENT_SECRET` | z aplikacji Atlassian (krok 4); jeśli jej jeszcze nie ma, wpisz tymczasowo `todo` i zmień później |
   | `CI_BOOTSTRAP_EMAIL`, `CI_OPERATOR_EMAILS` | e-mail Twojego konta Atlassian |
   | `RESEND_API_KEY`, `CI_MAIL_FROM` | z kroku 5; do tego czasu mogą być puste (maile tylko w logu) |
   | `POSTHOG_API_KEY` | opcjonalnie; puste = pomiar tylko we własnym logu |

4. **Apply.** Pierwsze wdrożenie trwa kilka minut. Gotowe, gdy usługa ma status *Live*, a
   `https://quorum-….onrender.com/api/health` (adres z panelu) zwraca `"ok":true` i `"storage":"postgres"`.
5. **Skopiuj `CI_ENCRYPTION_KEY`** (usługa → Environment → pokaż wartość) do menedżera haseł. Bez niego zapisane
   połączenia z Atlassianem są nie do odczytania. Tak samo `CI_ADMIN_TOKEN` (dostęp maszyn: CLI, MCP).

### Krok 3. Domena i HTTPS
1. Usługa `quorum` → **Settings → Custom Domains → Add** → `<domena>`.
2. U rejestratora domeny dodaj rekord DNS, który pokaże Render — dla subdomeny zwykle **CNAME** `quorum` →
   `quorum-….onrender.com`.
3. Poczekaj na weryfikację w panelu (minuty do kilku godzin — DNS). Certyfikat HTTPS Render wystawia i odnawia sam.
4. Sprawdź: `https://<domena>/api/health` odpowiada, a `http://<domena>` przekierowuje na `https://`.

### Krok 4. Aplikacja Atlassian (T2)
Według [`CONNECT-ATLASSIAN.md`](CONNECT-ATLASSIAN.md), z adresem produkcyjnym:
- *Callback URL*: `https://<domena>/api/connections/atlassian/callback` (jeden dla logowania i połączeń);
- zakresy: `read:me` (logowanie) oraz Jira i Confluence tylko do odczytu;
- `ATLASSIAN_CLIENT_ID` i `ATLASSIAN_CLIENT_SECRET` wpisz w Render (Environment) — zapis restartuje usługę.

### Krok 5. Maile (Resend)
1. W Resend dodaj domenę nadawcy (np. `<domena>` albo `mail.twojafirma.pl`) i dodaj u rejestratora rekordy DNS,
   które pokaże (SPF/DKIM). Poczekaj na *Verified*.
2. Utwórz klucz API z uprawnieniem tylko do wysyłki (*Sending access*), ograniczony do tej domeny.
3. W Render: `RESEND_API_KEY` = klucz, `CI_MAIL_FROM` = np. `Quorum <beta@<domena>>`.

### Krok 6. Pierwsze logowanie i beta
1. Otwórz `https://<domena>`, zaloguj się kontem Atlassian z `CI_BOOTSTRAP_EMAIL` — zostajesz Ownerem.
2. W menu jest *Beta operator*. Wykonaj sprawdzenie z [`SETUP-BETA.md`](SETUP-BETA.md) §3 (testowe zgłoszenie,
   mail, odrzucenie).

## 3. Sprawdzenie bezpieczeństwa po wdrożeniu

Do odhaczenia przy pierwszym wdrożeniu (i w przeglądzie T9):

| # | Co | Jak sprawdzić |
|---|---|---|
| 1 | Region UE | panel Render: usługa i baza — *Frankfurt* |
| 2 | Baza bez dostępu z internetu | baza → *Access Control*: brak wpisów (puste `ipAllowList`) |
| 3 | Rola bazy bez SUPERUSER i BYPASSRLS | aplikacja sama to sprawdza przy starcie i **nie wystartuje** na produkcji z taką rolą (`production.ts`, `checkRlsRole`) |
| 4 | HTTPS i HSTS | `curl -sI https://<domena>/api/health` → `strict-transport-security`; `curl -sI http://<domena>` → przekierowanie |
| 5 | Nagłówki bezpieczeństwa | ta sama odpowiedź ma `content-security-policy`, `x-frame-options: DENY`, `x-content-type-options: nosniff` |
| 6 | Tryb lokalny wyłączony | `curl -s https://<domena>/api/dev/beta` → 401 (trasy `/api/dev/*` nie istnieją na produkcji) |
| 7 | Adres klienta za proxy | wyślij zgłoszenie z formularza bety; w logu Render `remoteAddress` żądania to Twój adres, nie adres Render (gdyby był adresem Render, zmień `CI_TRUST_PROXY`) |
| 8 | Sekrety | tylko w Render i w menedżerze haseł; `render.yaml` ich nie ma (test `RB-04`) |
| 9 | 2FA | włączone na Render, u rejestratora domeny, w Atlassian i Resend |
| 10 | Kopie bazy | baza → *Recovery*: odtwarzanie do punktu w czasie dostępne dla planu (zakres dni zależy od planu — zapisz w mapie); dodatkowa kopia poza Render to T5 |
| 11 | Dostęp do konta | Render → Workspace → Members: tylko osoby, które mają tam być |

## 4. Mapa wdrożenia (uzupełnić po założeniu)

| Co | Wartość |
|---|---|
| Dostawca | Render (render.com) |
| Konto Render (właściciel, e-mail) | _do uzupełnienia_ |
| Usługa | `quorum`, Web Service, Docker, plan `starter`, region Frankfurt |
| Adres techniczny | `https://quorum-….onrender.com` _do uzupełnienia_ |
| Domena | `<domena>` _do uzupełnienia_; rejestrator: _do uzupełnienia_; rekord: CNAME → adres techniczny |
| Baza | `quorum-db`, Render Postgres 17, plan `starter`, Frankfurt, bez dostępu z internetu |
| Kopie bazy | odtwarzanie do punktu w czasie: _zakres z panelu_; kopia poza Render: T5 |
| Sekrety (tylko nazwy) | `CI_ENCRYPTION_KEY`, `CI_ADMIN_TOKEN`, `CI_USAGE_SECRET` (wygenerowane przez Render, kopie w menedżerze haseł), `ATLASSIAN_CLIENT_SECRET`, `RESEND_API_KEY`, `POSTHOG_API_KEY` |
| Osoby z dostępem do Render | _do uzupełnienia_ |
| Aplikacja Atlassian (konsola, właściciel) | _do uzupełnienia_ |
| Resend (domena nadawcy) | _do uzupełnienia_ |
| Wdrożenia | z `main` po zielonych testach (`autoDeployTrigger: checksPass`); cofnięcie: Render → Deploys → *Rollback* |

## 5. Codzienna obsługa
- **Nowa wersja:** merge do `main` → testy → Render wdraża sam. Status: panel Render → *Deploys*.
- **Cofnięcie wersji:** Render → *Deploys* → poprzednie wdrożenie → *Rollback*. Migracje bazy są tylko dodające,
  więc poprzednia wersja działa na nowszym schemacie.
- **Logi:** panel Render → *Logs* (linie JSON). W logach nigdy nie ma treści historyjek ani linków zaproszeń.
- **Zmiana sekretu:** Render → Environment → zmiana zapisuje się i restartuje usługę.
- **Nie skaluj do 2+ instancji** — kolejka zapisów i zadanie bety są w procesie (`numInstances: 1`).
