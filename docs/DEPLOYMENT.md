# Uruchomienie Quorum na Render — od zera do działającej aplikacji

Stan: 2026-11-09. **Jedna instrukcja, krok po kroku**: od kont u dostawców, przez konfigurację Render, po aplikację,
w której zespół z bety loguje się, analizuje historyjki z AI, dostaje maile, a baza ma codzienną kopię poza Render.
Wszystko, co trzeba zrobić, jest w tym pliku; dokumenty podlinkowane w §6 tylko tłumaczą, *jak* coś działa.

Decyzje właściciela: Render w UE (Frankfurt), Claude przez Amazon Bedrock w UE z limitem $50 na przestrzeń i miesiąc,
kopie w Backblaze B2 (UE), maile przez Resend.

**Zasady przez całą instrukcję**
- Każdy sekret (klucz, hasło, token) zapisujesz **najpierw w menedżerze haseł**, we wpisie „Quorum produkcja”, a
  potem wklejasz w panel. Nigdy do repozytorium, czatu ani maila.
- **2FA** włączasz na każdym koncie, które zakładasz (Render, rejestrator domeny, Atlassian, Resend, AWS, Backblaze).
- Wszystko w **UE**: gdy panel pyta o region, wybierasz ten podany w kroku. Inny region = zatrzymaj się.
- Konta należą do Ciebie. Claude przygotowuje pliki i instrukcje, ale nie ma dostępu do paneli ani sekretów.

**Czas:** ok. 2–3 godziny pracy, plus czekanie na DNS (minuty do kilku godzin) i na dostęp do modelu w Bedrocku.

## 1. Co powstanie i ile kosztuje

| Element | Gdzie | Po co |
|---|---|---|
| Aplikacja `quorum` | Render, *Web Service* z `Dockerfile`, Frankfurt, 1 instancja | serwer i interfejs |
| Baza `quorum-db` | Render Postgres 17, Frankfurt, **bez adresu w internecie** | stan przestrzeni, organizacji, bety |
| Kopia `quorum-backup` | Render *Cron Job*, codziennie 02:17 UTC → Backblaze B2 (Amsterdam) | kopia poza Render, zaszyfrowana, zablokowana przed usunięciem |
| Domena | Twój rejestrator, CNAME na Render | adres `https://<domena>` z HTTPS |
| Logowanie i Jira/Confluence | aplikacja OAuth w Atlassian Developer Console | logowanie kontem Atlassian, połączenie stron zespołów |
| Maile | Resend | zgłoszenia, zaproszenia, przypomnienia o ankietach |
| AI | Amazon Bedrock, eu-central-1 | przegląd historyjek modelem Claude |

Konfiguracja Render jest w repo: [`render.yaml`](../render.yaml) (Blueprint). Sekrety nie mają w nim wartości —
Render pyta o nie przy zakładaniu (`sync: false`) albo sam je losuje (`generateValue: true`). Render wdraża każdy commit
`main`, ale dopiero gdy przejdą testy GitHuba (`autoDeployTrigger: checksPass`); migracje bazy robią się przy starcie.

**Koszt miesięczny** (cenniki z 2026-11-09, netto, PLN po ok. 3,70 zł/USD):

| Pozycja | Plan | Miesięcznie |
|---|---|---|
| Render workspace | **Hobby** (1 osoba w panelu, odtwarzanie bazy z 3 dni) | $0 |
| Aplikacja | `0.5c-512mb` (0,5 CPU, 512 MB) | $7 |
| Baza | `0.1c-256mb` + dysk 5 GB ($0,30/GB) | $6 + $1,50 |
| Kopia | cron `0.5c-512mb`, kilka sekund dziennie | grosze |
| Backblaze B2 | do 10 GB bez opłat | $0 |
| Resend | darmowy plan wystarcza na betę (sprawdź limity w cenniku) | $0 |
| AI (Bedrock) | według zużycia; limit w aplikacji $50 na przestrzeń | do ~$50 na zespół |
| **Razem bez AI** | | **ok. $14,50 (ok. 54 zł, z VAT ok. 66 zł)** |

Darmowe plany Render odpadają: darmowa aplikacja usypia się (zadanie bety co godzinę staje), darmowa baza wygasa po 30
dniach i nie ma odtwarzania. **Kiedy podnieść:** aplikacja → `1c-2g` ($25), gdy pamięć w *Metrics* trzyma się powyżej
ok. 400 MB (pomiar lokalny po starcie: ok. 160 MB); dysk → więcej GB (da się powiększyć, nie zmniejszyć); workspace
→ **Pro** ($25), gdy w panelu ma być druga osoba albo potrzeba 7 dni odtwarzania zamiast 3.

## 2. Krok po kroku

### Krok 0. Przygotowanie (15 min)
1. **Domena:** wybierz adres, np. `quorum.twojafirma.pl` (subdomena wystarczy). Dalej w instrukcji: `<domena>`.
   Musisz mieć dostęp do jej DNS u rejestratora (dodasz tam rekordy dla Render i Resend).
2. **Menedżer haseł:** utwórz wpis „Quorum produkcja”.
3. **Klucz kopii:** w terminalu `openssl rand -hex 32` → zapisz jako `BACKUP_ENCRYPTION_KEY`. Bez niego żadnej kopii
   nie da się otworzyć — nie ma obejścia.
4. **Twój e-mail Atlassian:** ten, którym logujesz się do Atlassiana — będzie `CI_BOOTSTRAP_EMAIL` (pierwszy Owner)
   i `CI_OPERATOR_EMAILS` (panel operatora bety).

### Krok 1. Aplikacja Atlassian — logowanie i Jira/Confluence (20 min)
1. <https://developer.atlassian.com/console/myapps/> → **Create → OAuth 2.0 integration**, nazwa „Quorum”, zaakceptuj
   warunki.
2. **Permissions:**
   - *User identity API → Add*: `read:me` (logowanie: imię, e-mail, identyfikator konta);
   - *Jira API → Add → Configure*: `read:jira-work`;
   - *Confluence API → Add → Configure → Granular scopes*: `read:space:confluence`, `read:page:confluence`,
     `read:label:confluence`.
3. **Authorization → OAuth 2.0 (3LO) → Configure**, *Callback URL*:
   `https://<domena>/api/connections/atlassian/callback` — co do znaku (https, bez ukośnika na końcu).
4. **Distribution → Sharing**: włącz, żeby logować się mogli też ludzie z zespołów bety (Atlassian pokaże im
   ostrzeżenie, że aplikacji nie sprawdził — to normalne dla prywatnej aplikacji).
5. **Settings**: *Client ID* → `ATLASSIAN_CLIENT_ID`, *Secret* → `ATLASSIAN_CLIENT_SECRET` (menedżer haseł).

### Krok 2. Resend — maile (20 min + DNS)
1. Załóż konto na resend.com, włącz 2FA.
2. **Domains → Add domain**: domena nadawcy, np. `<domena>` albo `mail.twojafirma.pl`; region **EU (Ireland)**, jeśli
   panel pyta. Dodaj u rejestratora rekordy DNS, które pokaże (SPF, DKIM). Poczekaj na *Verified*.
3. **API Keys → Create**: uprawnienie *Sending access*, ograniczony do tej domeny → `RESEND_API_KEY`.
4. Ustal nadawcę, np. `Quorum <beta@<domena>>` → `CI_MAIL_FROM`.

### Krok 3. Amazon Bedrock — AI (30 min + czekanie na dostęp do modelu)
1. Załóż konto AWS, włącz **2FA na koncie root**. Do pracy w konsoli używaj osobnego użytkownika, nie roota.
2. Konsola → **Amazon Bedrock**, region **eu-central-1 (Frankfurt)** → *Model access* → poproś o dostęp do modelu
   Claude (np. Claude Sonnet — na betę wystarczy; Opus jest ok. 2× droższy na token). Anthropic może poprosić o krótki
   opis zastosowania.
3. *Inference profiles*: znajdź **profil UE** wybranego modelu (zwykle z przedrostkiem `eu.`) i zapisz jego id →
   `CI_AI_MODEL`. Profil `eu.` kieruje ruch tylko do regionów UE.
4. **IAM → Users → Create user** `quorum-bedrock`, bez dostępu do konsoli, z polityką (podmień `<konto>`, id profilu i
   modelu):

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [{
       "Effect": "Allow",
       "Action": ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
       "Resource": [
         "arn:aws:bedrock:eu-central-1:<konto>:inference-profile/<id profilu>",
         "arn:aws:bedrock:*::foundation-model/<id modelu>"
       ]
     }]
   }
   ```

   Profil UE wywołuje model w kilku regionach UE, dlatego `foundation-model` ma `*` w miejscu regionu. Tej polityki nie
   sprawdzałem na koncie — przy `AccessDenied` komunikat poda brakującą akcję albo zasób.
5. Użytkownik → *Security credentials → Create access key* („Application running outside AWS”) →
   `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`.
6. **Billing → Budgets → Create budget**: miesięczny, np. $60 przy jednym zespole, alert e-mail przy 80%. To druga linia
   obrony obok limitu w aplikacji.

### Krok 4. Backblaze B2 — kopie (15 min)
1. Załóż konto na backblaze.com i **przy zakładaniu wybierz region EU Central**. Regionu nie da się potem zmienić.
   Włącz 2FA (*My Settings → Security*).
2. **Buckets → Create a Bucket**: nazwa np. `quorum-backups-<coś-losowego>` (nazwy są globalne), **Private**,
   szyfrowanie po stronie B2 włączone, **Object Lock: Enable** (bez tego B2 odrzuci zapis kopii z blokadą).
3. Zapisz **Endpoint** bucketa (np. `s3.eu-central-003.backblazeb2.com`) → `B2_ENDPOINT` (z `https://` na początku)
   i nazwę → `B2_BUCKET`.
4. Bucket → **Lifecycle Settings → Use custom lifecycle rules**: prefiks `daily/` — ukryj po 36 dniach; prefiks
   `monthly/` — ukryj po 101 dniach; ukryte usuń po 1 dniu. Bez tego pliki zostają na zawsze.
5. **Application Keys → Add a New Application Key**: dostęp tylko do tego bucketa, *Read and Write* →
   `B2_KEY_ID` (keyID) i `B2_APPLICATION_KEY` (applicationKey, pokazuje się raz).

### Krok 5. Konto Render (10 min)
1. Załóż konto na render.com — najlepiej logując się kontem GitHub właściciela repo. Włącz **2FA**
   (*Account Settings → Security*).
2. Dodaj kartę płatniczą (workspace Hobby jest bezpłatny, ale aplikacja i baza są na planach płatnych).
3. Przy łączeniu z GitHubem daj aplikacji Render dostęp **tylko do repozytorium `ci_for_sdlc`**.

### Krok 6. Blueprint — aplikacja, baza i kopia (15 min + budowa)
1. Panel Render → **New → Blueprint** → repo `ci_for_sdlc`, gałąź `main`. Render znajdzie `render.yaml`.
2. Sprawdź podsumowanie: **`quorum` (Web Service), `quorum-backup` (Cron Job) i `quorum-db` (Postgres), wszystkie w
   regionie Frankfurt**, plany `0.5c-512mb` i `0.1c-256mb`. Inny region — zatrzymaj się.
3. Wpisz wartości, o które pyta (z menedżera haseł):

   | Usługa | Zmienna | Wartość |
   |---|---|---|
   | `quorum` | `CI_PUBLIC_URL` | `https://<domena>` (bez ukośnika na końcu) |
   | `quorum` | `CI_ALLOWED_HOSTS` | `<domena>` |
   | `quorum` | `ATLASSIAN_CLIENT_ID`, `ATLASSIAN_CLIENT_SECRET` | krok 1.5 |
   | `quorum` | `CI_BOOTSTRAP_EMAIL`, `CI_OPERATOR_EMAILS` | krok 0.4 |
   | `quorum` | `RESEND_API_KEY`, `CI_MAIL_FROM` | krok 2.3–2.4 |
   | `quorum` | `CI_AI_MODEL`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | krok 3.3, 3.5 |
   | `quorum` | `POSTHOG_API_KEY` | opcjonalnie (pomiar użycia także w PostHog UE); puste = tylko własny log |
   | `quorum-backup` | `BACKUP_ENCRYPTION_KEY` | krok 0.3 |
   | `quorum-backup` | `B2_ENDPOINT`, `B2_BUCKET`, `B2_KEY_ID`, `B2_APPLICATION_KEY` | krok 4.3, 4.5 |

   Pozostałe zmienne są już w `render.yaml`: `NODE_ENV=production`, `CI_AUTH_MODE=accounts`, `CI_CONNECT_MODE=oauth`,
   `CI_TRUST_PROXY=1`, `CI_AI_PROVIDER=bedrock`, `CI_AI_REGION=eu-central-1`, `CI_AI_MONTHLY_LIMIT_USD=50`, adres bazy
   oraz losowane `CI_ENCRYPTION_KEY`, `CI_ADMIN_TOKEN`, `CI_USAGE_SECRET`.

   Brakuje jeszcze jakiegoś konta? Wpisz tymczasowo `todo` (nie zostawiaj pustego `CI_AI_MODEL` — wtedy serwer nie
   wystartuje). Skutki do czasu poprawki: bez Atlassiana nie da się zalogować, bez Resend maile trafiają tylko do logu,
   bez AWS przegląd AI zgłasza błąd, bez B2 kopia się nie uda (Render to zgłosi).
4. **Apply.** Pierwsza budowa trwa kilka minut. Gotowe, gdy `quorum` ma status *Live*, a adres techniczny z panelu
   `https://quorum-….onrender.com/api/health` zwraca `"ok":true` i `"storage":"postgres"`.
5. **Skopiuj do menedżera haseł** wartości wylosowane przez Render (usługa `quorum` → *Environment* → pokaż):
   `CI_ENCRYPTION_KEY` (bez niego zaszyfrowane dane i połączenia są nie do odczytania, także z kopii),
   `CI_ADMIN_TOKEN` (dostęp maszyn: CLI, MCP, API operatora), `CI_USAGE_SECRET`.
6. Panel Render → *Account Settings → Notifications*: powiadomienia o nieudanych wdrożeniach i przebiegach cron na
   Twój e-mail.

### Krok 7. Domena i HTTPS (10 min + DNS)
1. Usługa `quorum` → **Settings → Custom Domains → Add** → `<domena>`.
2. U rejestratora dodaj rekord, który pokaże Render — dla subdomeny zwykle **CNAME** `quorum` →
   `quorum-….onrender.com`.
3. Poczekaj na weryfikację w panelu. Certyfikat HTTPS Render wystawia i odnawia sam.
4. Sprawdź: `https://<domena>/api/health` odpowiada, a `http://<domena>` przekierowuje na `https://`.

### Krok 8. Pierwsze logowanie i beta (15 min)
1. Otwórz `https://<domena>` → zaloguj się kontem Atlassian z `CI_BOOTSTRAP_EMAIL`. Zostajesz Ownerem pierwszej
   organizacji (przestrzeń `default`), a w menu pojawia się **Beta operator**.
2. `https://<domena>/api/beta` (bez logowania) zwraca `{"open":true,"weeks":8}`.
3. Test formularza: z innego adresu e-mail wyślij zgłoszenie na `https://<domena>/#/beta`. Mają przyjść dwa maile
   („we have your application” do zgłaszającego i powiadomienie do operatora), a zgłoszenie ma być na `#/operator`.
   Odrzuć je potem (*Reject*).
4. W logu Render (*Logs*) nie ma `mail not sent: RESEND_API_KEY is not set` ani `beta mail failed`, a `remoteAddress`
   żądania zgłoszenia to Twój adres, nie adres Render.

### Krok 9. AI (10 min)
1. Ustawienia przestrzeni → *AI provider*: „Provided by the platform: bedrock · <model>” i linia z wydatkiem.
2. Połącz Atlassiana w przestrzeni (*Settings → Integrations → Connect Atlassian*), włącz Jirę, podaj klucz projektu,
   *Save & re-analyze*. Na historyjce **AI review** → wynik bez błędu; w audycie wpis `ai_call` z kosztem.
3. `#/operator` → **AI limits**: przestrzeń ma wydatek > $0 i wywołania, bez „without a known price”. Tu też zmieniasz
   limit przestrzeni w trakcie bety (nowa kwota, *No limit*, *Default*), bez wdrożenia.
4. Koszt w aplikacji liczony jest po cenniku Anthropic (szacunek). Sprawdź cennik Bedrocka dla eu-central-1 i
   profilu `eu.`; jeśli jest inny, ustaw w `quorum` zmienną `CI_AI_PRICES`, np.
   `{"bedrock/<id profilu>": {"input": 2.2, "output": 11, "cacheRead": 0.22, "cacheWrite": 2.75}}` (USD za milion
   tokenów).

### Krok 10. Kopia i próba odtworzenia (20 min)
1. Render → `quorum-backup` → **Trigger Run**. W logu ma być `"msg":"backup uploaded"`, a w B2 (*Browse Files*) plik
   `daily/<dzisiaj>.qbk` z *Object Lock: Compliance, retain until …*. Gdyby B2 odrzucił zapis (`AccessDenied` albo
   `InvalidRequest`), sprawdź, czy bucket ma włączony Object Lock i czy klucz ma dostęp do zapisu w tym buckecie.
2. **Próba odtworzenia** na swoim komputerze (Docker i repo z `npm install`), do pustej bazy — produkcji nie dotyka:

   ```bash
   docker run --rm -d --name quorum-restore -p 54330:5432 -e POSTGRES_PASSWORD=restore-throwaway postgres:17
   # Wartości z menedżera haseł do zmiennych tej sesji terminala:
   export BACKUP_ENCRYPTION_KEY=…  B2_ENDPOINT=https://s3.eu-central-003.backblazeb2.com  B2_BUCKET=…
   export B2_KEY_ID=…  B2_APPLICATION_KEY=…
   export RESTORE_DATABASE_URL=postgres://postgres:restore-throwaway@localhost:54330/postgres
   npm run restore-check --prefix packages/server
   ```

   Wynik `OK: daily/<data>.qbk … all as in the backup.` = kopia się otwiera i odtwarza w całości. Potem
   `CI_DATABASE_URL=$RESTORE_DATABASE_URL CI_ENCRYPTION_KEY=… npm start` → `http://localhost:4317`: przestrzenie
   i ustawienia widoczne. `docker stop quorum-restore`, a datę próby wpisz w tabeli w [`BACKUPS.md`](BACKUPS.md) §3.
   Powtórz raz w trakcie bety.

### Krok 11. Sprawdzenie bezpieczeństwa (15 min)

| # | Co | Jak sprawdzić |
|---|---|---|
| 1 | Region UE | Render: `quorum`, `quorum-backup`, `quorum-db` — Frankfurt; B2 — EU Central; Bedrock — eu-central-1 i profil `eu.` |
| 2 | Baza bez dostępu z internetu | `quorum-db` → *Access Control*: brak wpisów |
| 3 | Rola bazy bez SUPERUSER i BYPASSRLS | aplikacja sprawdza to sama i na produkcji **nie wystartuje** z taką rolą |
| 4 | HTTPS i HSTS | `curl -sI https://<domena>/api/health` → `strict-transport-security`; `curl -sI http://<domena>` → przekierowanie |
| 5 | Nagłówki | ta sama odpowiedź ma `content-security-policy`, `x-frame-options: DENY`, `x-content-type-options: nosniff` |
| 6 | Tryb lokalny wyłączony | `curl -s -o /dev/null -w '%{http_code}' https://<domena>/api/dev/beta` → 401 |
| 7 | Adres klienta za proxy | krok 8.4 (`remoteAddress` = Twój adres; inaczej zmień `CI_TRUST_PROXY`) |
| 8 | Sekrety | tylko w Render i w menedżerze haseł; `render.yaml` ich nie ma (test `RB-04`) |
| 9 | 2FA | Render, rejestrator, Atlassian, Resend, AWS (root i użytkownik), Backblaze |
| 10 | Kopie | Render *Recovery* (odtwarzanie z 3 dni) + udany `quorum-backup` + próba odtworzenia z kroku 10 |
| 11 | Dostępy | Render → *Members*, AWS → IAM, Backblaze → klucze: tylko to, co ma tam być |
| 12 | Limity kosztów | limit AI w aplikacji (krok 9.3) i budżet AWS (krok 3.6) |

### Krok 12. Zanim wpuścisz pierwszy zespół
1. Dokumenty z [`BETA-PLAN.md`](BETA-PLAN.md) §5: regulamin bety, polityka prywatności, **DPA** z listą
   podprzetwarzających i regionem: Render (hosting, baza), Backblaze B2 (kopie), AWS Bedrock (AI), Resend (poczta),
   PostHog (jeśli włączony).
2. Sprawdź w aktualnych warunkach AWS, że dane wejściowe do Bedrocka nie są używane do trenowania modeli, i napisz to
   zespołom.
3. Uzupełnij mapę wdrożenia (§3).
4. Wyślij zespołowi adres `https://<domena>/#/beta`; zgłoszenie zatwierdzasz na `#/operator` (*Approve* zakłada
   organizację, przestrzeń i wysyła zaproszenie Ownera).

## 3. Mapa wdrożenia (uzupełnić po założeniu)

| Co | Wartość |
|---|---|
| Konto Render (właściciel, e-mail) | _do uzupełnienia_ |
| Usługi | `quorum` (Web Service, `0.5c-512mb`), `quorum-backup` (Cron Job), `quorum-db` (Postgres 17, `0.1c-256mb`, 5 GB) — Frankfurt; workspace Hobby |
| Adres techniczny | `https://quorum-….onrender.com` _do uzupełnienia_ |
| Domena | `<domena>` _do uzupełnienia_; rejestrator: _do uzupełnienia_; CNAME → adres techniczny |
| Kopie | Render: odtwarzanie z 3 dni; B2 EU Central, bucket _do uzupełnienia_, codziennie 02:17 UTC |
| AI | Bedrock eu-central-1, profil _do uzupełnienia_, użytkownik IAM `quorum-bedrock`, budżet AWS _do uzupełnienia_ |
| Atlassian (aplikacja w konsoli, właściciel) | _do uzupełnienia_ |
| Resend (domena nadawcy) | _do uzupełnienia_ |
| Sekrety (tylko nazwy) | `CI_ENCRYPTION_KEY`, `CI_ADMIN_TOKEN`, `CI_USAGE_SECRET` (Render), `ATLASSIAN_CLIENT_SECRET`, `RESEND_API_KEY`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `POSTHOG_API_KEY`, `BACKUP_ENCRYPTION_KEY`, `B2_KEY_ID`, `B2_APPLICATION_KEY` — wszystkie także w menedżerze haseł |
| Osoby z dostępem (Render, AWS, B2) | _do uzupełnienia_ |

## 4. Codzienna obsługa
- **Nowa wersja:** merge do `main` → testy → Render wdraża sam (*Deploys*).
- **Cofnięcie:** Render → *Deploys* → poprzednie wdrożenie → *Rollback*. Migracje są tylko dodające, więc poprzednia
  wersja działa na nowszym schemacie.
- **Logi:** Render → *Logs* (linie JSON; nigdy treść historyjek ani linki zaproszeń).
- **Zmiana sekretu:** Render → *Environment*; zapis restartuje usługę.
- **Limit AI zespołu:** `#/operator` → *AI limits*.
- **Nie skaluj do 2+ instancji** — kolejka zapisów, zadanie bety i licznik AI działają w procesie (`numInstances: 1`).
- **Odtworzenie po awarii:** [`BACKUPS.md`](BACKUPS.md) §4.

## 5. Gdy coś nie działa
| Objaw | Przyczyna i co zrobić |
|---|---|
| Usługa nie startuje, log: `Set CI_AI_MODEL` albo `CI_AI_… must be` | brak lub zła wartość zmiennej AI — popraw w *Environment* |
| Log: `CI_DATABASE_URL: … superuser` | rola bazy ma za duże uprawnienia — na Render nie powinno się zdarzyć; zgłoś |
| Logowanie wraca z błędem Atlassiana | *Callback URL* w konsoli ≠ `https://<domena>/api/connections/atlassian/callback` albo `CI_PUBLIC_URL` inny niż domena |
| `Host "…" is not allowed` | otwierasz aplikację pod adresem spoza `CI_ALLOWED_HOSTS` (np. technicznym) — używaj `<domena>` |
| Brak maili | domena w Resend nie jest *Verified* albo `CI_MAIL_FROM` ma inną domenę |
| AI review: `AccessDenied` | polityka IAM (krok 3.4) albo brak dostępu do modelu (krok 3.2) |
| „AI paused: … monthly AI limit” | przestrzeń wyczerpała limit — podnieś go na `#/operator` albo poczekaj do 1. dnia miesiąca |
| `quorum-backup` nieudany | log zadania podaje kod S3; najczęściej Object Lock wyłączony albo zły klucz/endpoint |

## 6. Jak to działa (tło)
- [`SETUP-BETA.md`](SETUP-BETA.md) — wszystkie zmienne aplikacji i bety, w tym opcjonalne.
- [`AI-PLATFORM.md`](AI-PLATFORM.md) — AI platformy, limit, stawki.
- [`BACKUPS.md`](BACKUPS.md) — kopie, próba odtworzenia, odtworzenie po awarii.
- [`CONNECT-ATLASSIAN.md`](CONNECT-ATLASSIAN.md) — OAuth Atlassiana.
- [`BETA-PLAN.md`](BETA-PLAN.md), [`BETA-ENROLLMENT-PLAN.md`](BETA-ENROLLMENT-PLAN.md) — po co beta i jak przebiega.
