# Pierwsze kroki: uruchomienie na własnym komputerze, krok po kroku

Ten przewodnik prowadzi od zera do momentu, w którym dodajesz historyjkę (story) w Jira, a aplikacja pokazuje na
pulpicie jej podsumowanie: czy jest gotowa do realizacji, czego brakuje i co nie zgadza się między Jira, Confluence
i Figmą. Nie musisz być programistą. Wystarczy przepisywać polecenia i klikać zgodnie z opisem.

Całość jest darmowa i działa tylko na Twoim komputerze. Bardziej techniczny opis tego samego (kopie zapasowe,
aktualizacje, CI/CD) jest w [`docs/LOCAL-ENVIRONMENT.md`](docs/LOCAL-ENVIRONMENT.md).

**Spis treści**

1. [Co będzie potrzebne](#1-co-będzie-potrzebne)
2. [Instalacja Dockera](#2-instalacja-dockera)
3. [Pobranie aplikacji](#3-pobranie-aplikacji)
4. [Hasło administratora aplikacji](#4-hasło-administratora-aplikacji)
5. [Pierwsze uruchomienie (dane przykładowe)](#5-pierwsze-uruchomienie-dane-przykładowe)
6. [Konto Atlassian: Jira i Confluence](#6-konto-atlassian-jira-i-confluence)
7. [Klucz (token) do Jira i Confluence](#7-klucz-token-do-jira-i-confluence)
8. [Figma (opcjonalnie)](#8-figma-opcjonalnie)
9. [Uruchomienie z kluczami](#9-uruchomienie-z-kluczami)
10. [Połączenie aplikacji z Jira, Confluence i Figmą](#10-połączenie-aplikacji-z-jira-confluence-i-figmą)
11. [Dodanie historyjki, którą aplikacja zrozumie](#11-dodanie-historyjki-którą-aplikacja-zrozumie)
12. [Co zobaczysz w aplikacji](#12-co-zobaczysz-w-aplikacji)
13. [Codzienna praca](#13-codzienna-praca)
14. [Gdy coś nie działa](#14-gdy-coś-nie-działa)
15. [Ściąga poleceń](#15-ściąga-poleceń)

---

## 1. Co będzie potrzebne

| Co | Po co | Koszt |
|---|---|---|
| Komputer z Windows 10/11, macOS albo Linuxem, min. 8 GB RAM i ok. 5 GB wolnego miejsca | tu działa aplikacja | — |
| **Docker Desktop** | uruchamia aplikację w „pudełku” (kontenerze), bez instalowania Node.js i innych narzędzi | darmowy do użytku prywatnego |
| Dostęp do tego repozytorium na GitHubie (konto `dbqm45`) | pobranie kodu | — |
| **Menedżer haseł** (1Password, Bitwarden albo inny) | przechowywanie kluczy; **nie zapisuj ich w plikach** | darmowe plany wystarczą |
| Konto **Atlassian** (Jira + Confluence, plan Free) | źródło historyjek i dokumentacji | darmowe do 10 osób |
| Konto **Figma** (plan Starter) — opcjonalnie | źródło projektów ekranów | darmowe |
| Model AI — opcjonalnie | dodatkowy przegląd „semantyczny” | darmowy lokalnie (Ollama); aplikacja działa też bez AI |

Klucze, które zbierzesz po drodze (wszystkie trafią do menedżera haseł):

| Nazwa | Skąd | Wymagany? |
|---|---|---|
| `CI_ADMIN_TOKEN` | wygenerujesz sam (krok 4) | **tak** |
| `JIRA_API_TOKEN` | Atlassian (krok 7) | tak, żeby czytać Jira i Confluence |
| `FIGMA_TOKEN` | Figma (krok 8) | tylko dla Figmy |
| `CI_ENCRYPTION_KEY` | wygenerujesz sam | nie (szyfrowanie danych na dysku) |

> **Jak czytać polecenia w tym przewodniku.** Tekst w szarych ramkach wpisujesz (albo wklejasz) w **terminalu**:
> na Macu aplikacja *Terminal*, na Windows *PowerShell* (menu Start → wpisz „PowerShell”). Po wklejeniu naciśnij
> Enter. Tam, gdzie polecenia dla Windows się różnią, podane są osobno.

---

## 2. Instalacja Dockera

1. Wejdź na https://www.docker.com/products/docker-desktop/ i pobierz wersję dla swojego systemu.
   - **Mac:** wybierz *Apple Silicon* (procesory M1–M4) albo *Intel* — sprawdzisz w menu  → *Ten Mac*.
   - **Windows:** instalator sam zaproponuje włączenie *WSL 2* — zgódź się i uruchom komputer ponownie, jeśli poprosi.
2. Zainstaluj i uruchom **Docker Desktop**. Zaakceptuj warunki (użytek prywatny jest darmowy), logowanie do konta
   Docker możesz pominąć.
3. Poczekaj, aż ikona wieloryba (na pasku menu na Macu, w zasobniku na Windows) przestanie się animować — Docker jest
   gotowy.
4. Sprawdź w terminalu:

   ```bash
   docker --version
   docker compose version
   ```

   Oba polecenia powinny wypisać numer wersji. Jeśli pojawia się „command not found” albo „nie rozpoznano”, zamknij
   i otwórz terminal ponownie.

Docker Desktop musi być uruchomiony za każdym razem, gdy chcesz korzystać z aplikacji.

---

## 3. Pobranie aplikacji

**Sposób A — przez Git** (jeśli masz Git i dostęp SSH do GitHuba):

```bash
git clone git@github.com:dbqm45/ci_for_sdlc.git
cd ci_for_sdlc
```

**Sposób B — bez Gita:** na stronie https://github.com/dbqm45/ci_for_sdlc (zalogowany) kliknij zielony przycisk
*Code* → *Download ZIP*, rozpakuj archiwum (np. do folderu *Dokumenty*), a potem w terminalu przejdź do tego folderu:

```bash
cd ~/Documents/ci_for_sdlc-main
```

(na Windows np. `cd $HOME\Documents\ci_for_sdlc-main`). Wszystkie dalsze polecenia wpisujesz **w tym folderze**.

---

## 4. Hasło administratora aplikacji

Aplikacja chroni zmiany (ustawienia, decyzje, zatwierdzenia) hasłem administratora — `CI_ADMIN_TOKEN`. Bez niego się
nie uruchomi.

1. Wygeneruj losowy ciąg znaków:
   - **Mac / Linux:**

     ```bash
     openssl rand -hex 32
     ```

   - **Windows (PowerShell):**

     ```powershell
     -join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Maximum 256) })
     ```

   - albo użyj generatora haseł w menedżerze haseł (min. 32 znaki, same litery i cyfry).
2. Zapisz wynik w menedżerze haseł jako nowy wpis, np. **„ci-sdlc”**, pole **„admin-token”**.

Opcjonalnie powtórz to samo dla `CI_ENCRYPTION_KEY` (pole „encryption-key”). Uwaga: jeśli włączysz szyfrowanie
i zgubisz ten klucz, zapisanych danych nie da się odczytać.

---

## 5. Pierwsze uruchomienie (dane przykładowe)

Najpierw sprawdzimy, że wszystko działa — na wbudowanych danych przykładowych, jeszcze bez Jira.

1. Podaj hasło administratora w terminalu (wklej swój ciąg w miejsce `…`). Obowiązuje tylko w tym oknie terminala
   i znika po jego zamknięciu — nic nie trafia do pliku.
   - **Mac / Linux:**

     ```bash
     export CI_ADMIN_TOKEN='…'
     ```

   - **Windows (PowerShell):**

     ```powershell
     $env:CI_ADMIN_TOKEN = '…'
     ```

2. Zbuduj i uruchom aplikację (pierwszy raz trwa 1–3 minuty, kolejne — kilka sekund):

   ```bash
   docker compose up -d --build
   ```

3. Sprawdź stan:

   ```bash
   docker compose ps
   ```

   W kolumnie *STATUS* powinno być `Up … (healthy)`. Przez pierwsze ~20 sekund może być `(health: starting)`.
4. Otwórz w przeglądarce **http://localhost:4317**.

Zobaczysz pulpit *Overview* z przykładowym projektem „Checkout” (tryb **Demo**). Możesz się rozejrzeć: kliknij epik
albo historyjkę, zobacz zakładki. Na dole pulpitu są przyciski *Apply*, które symulują zmianę w Jira/Confluence/Figmie.

Przy pierwszej zmianie (np. kliknięciu *Apply* albo zapisie ustawień) przeglądarka zapyta o **Admin token** — wklej
hasło z kroku 4. Przeglądarka pamięta je do zamknięcia karty.

> Aplikacja jest dostępna tylko z Twojego komputera (adres `localhost`). Inne urządzenia w sieci jej nie widzą.

---

## 6. Konto Atlassian: Jira i Confluence

1. Wejdź na https://www.atlassian.com/software/jira/free i załóż darmowe konto. Wybierz nazwę witryny — dostaniesz
   adres w postaci **`https://<nazwa>.atlassian.net`**. Zapisz go.
2. **Projekt w Jira.** *Projects → Create project* → szablon *Scrum* albo *Kanban* → nazwa np. „Payments”.
   Jira nada **klucz projektu** (np. `PAY`) — widać go w numerach zadań (`PAY-1`, `PAY-2`…). Zapisz go.
3. **Confluence** (dokumentacja). W tej samej witrynie: menu aplikacji (kwadrat z kropkami w lewym górnym rogu) →
   *Confluence* → dodaj plan Free. Utwórz **przestrzeń** (*Spaces → Create space*), np. „Payments” z kluczem `PAY`.
   Klucz przestrzeni zobaczysz w adresie: `…/wiki/spaces/PAY/…`. Zapisz go.

Confluence jest opcjonalny, ale bez niego aplikacja zgłosi przy historyjkach brak dokumentacji.

---

## 7. Klucz (token) do Jira i Confluence

1. Wejdź na https://id.atlassian.com/manage-profile/security/api-tokens (zalogowany tym samym kontem).
2. *Create API token* → nazwa np. „ci-sdlc” → ustaw datę wygaśnięcia (np. za rok) → *Create*.
3. Skopiuj token **od razu** (później nie da się go podejrzeć) i zapisz w menedżerze haseł, np. we wpisie
   **„atlassian”**, pole **„api-token”**.

Ten sam token działa dla Jira i Confluence. Aplikacja tylko **czyta** dane — niczego w Jira ani Confluence nie zmienia.

---

## 8. Figma (opcjonalnie)

1. Na https://www.figma.com utwórz (albo otwórz) plik z projektem ekranów.
2. **Token:** w Figmie kliknij swój awatar → *Settings* → zakładka *Security* → *Personal access tokens* →
   *Generate new token*. Nazwa np. „ci-sdlc”, uprawnienie **File content: Read** (reszta może zostać „No access”).
   Skopiuj token i zapisz w menedżerze haseł jako **„figma” → „token”**.
3. **Klucz pliku** jest w adresie otwartego pliku: `https://www.figma.com/design/`**`AbC123xYz`**`/Nazwa-pliku`.
   Zapisz ten fragment (u Ciebie będzie inny).

Aplikacja bierze pod uwagę **ramki (frames) najwyższego poziomu** na stronach pliku — czyli pojedyncze ekrany.

---

## 9. Uruchomienie z kluczami

Klucze podajesz aplikacji przy uruchomieniu — wyłącznie w pamięci, nie w plikach.

**Sposób zalecany: 1Password CLI.** Zainstaluj `op` (https://developer.1password.com/docs/cli/get-started/),
włącz integrację z aplikacją 1Password, a potem utwórz plik `ci-sdlc.env` **poza folderem repozytorium**, np.
w `~/.config/` (Mac/Linux) lub w folderze domowym (Windows). Plik zawiera **tylko odwołania** do menedżera haseł, a nie
same klucze (nazwy dopasuj do swoich wpisów):

```
CI_ADMIN_TOKEN=op://Private/ci-sdlc/admin-token
JIRA_API_TOKEN=op://Private/atlassian/api-token
FIGMA_TOKEN=op://Private/figma/token
```

Uruchamiasz wtedy:

```bash
op run --env-file ~/.config/ci-sdlc.env -- docker compose up -d
```

`op` pobierze klucze z sejfu tylko na czas tego polecenia.

**Sposób prosty: wklejenie w terminalu.** Działa jak w kroku 5 — obowiązuje do zamknięcia okna terminala:

- **Mac / Linux:**

  ```bash
  export CI_ADMIN_TOKEN='…'
  export JIRA_API_TOKEN='…'
  export FIGMA_TOKEN='…'
  docker compose up -d
  ```

- **Windows (PowerShell):**

  ```powershell
  $env:CI_ADMIN_TOKEN = '…'
  $env:JIRA_API_TOKEN = '…'
  $env:FIGMA_TOKEN = '…'
  docker compose up -d
  ```

`docker compose up -d` sam zauważy nowe klucze i uruchomi aplikację ponownie. Dane zebrane wcześniej zostają.

Sprawdź w aplikacji: *Settings → Integrations* — przy Jira, Confluence i Figmie widać plakietki
`JIRA_API_TOKEN configured`, `FIGMA_TOKEN configured`. „missing” oznacza, że klucz nie dotarł (patrz
[rozdział 14](#14-gdy-coś-nie-działa)).

---

## 10. Połączenie aplikacji z Jira, Confluence i Figmą

Otwórz http://localhost:4317 → *Settings* (menu po lewej).

1. **Workspace**
   - *Mode*: **Live — Jira / Confluence / Figma**
   - *Project name*: dowolna nazwa, np. „Payments”
   - *Your name*: Twoje imię — zapisuje się przy podejmowanych decyzjach.
2. **Integrations → Jira** — zaznacz przełącznik włączenia i wypełnij:
   - *Site URL*: `https://<nazwa>.atlassian.net` (bez ukośnika na końcu)
   - *Account e-mail*: e-mail konta Atlassian
   - *Project key*: `PAY`
   - pozostałe pola zostaw puste.
3. **Integrations → Confluence** — włącz i wpisz ten sam *Site URL* i e-mail, *Space keys*: `PAY`.
4. **Integrations → Figma** — włącz i wpisz *File keys*: klucz pliku z kroku 8.
5. Kliknij **Test connections** (prawy górny róg karty *Integrations*). Przy każdej usłudze powinno pojawić się
   potwierdzenie połączenia. Błąd — patrz [rozdział 14](#14-gdy-coś-nie-działa).
6. **AI provider** — na początek zostaw **Deterministic rules only** (bez AI). Darmowy lokalny model możesz dodać później
   — opis w [`docs/LOCAL-ENVIRONMENT.md`, rozdział 6](docs/LOCAL-ENVIRONMENT.md#6-model-ai-za-darmo).
7. **Analysis schedule** — wybierz **Every N minutes** i np. `15`, żeby aplikacja sama co jakiś czas sprawdzała zmiany
   (webhooki z chmury nie dotrą do Twojego komputera).
8. Kliknij **Save & re-analyze** (prawy górny róg strony). Jeśli przeglądarka zapyta o *Admin token*, wklej hasło
   z kroku 4.

Po kilku sekundach pulpit pokaże dane z Twojej Jira. Pusty projekt = puste listy — czas dodać historyjkę.

---

## 11. Dodanie historyjki, którą aplikacja zrozumie

Aplikacja czyta z Jira: **typ** zgłoszenia, **tytuł**, **opis**, **rodzica** (epik), status, etykiety, komponenty,
powiązania między zgłoszeniami i **linki** do Confluence i Figmy.

> **Pisz po angielsku.** Reguły rozpoznają angielskie słowa kluczowe (np. *payment*, *submit*, *error*, *timeout*)
> i angielskie nagłówki sekcji. Tekst po polsku zostanie wczytany, ale analiza wykryje znacznie mniej.

### 11.1 Epik

W Jira: *Create* → *Work type / Issue type*: **Epic** → tytuł np. „Card payments”. Epik grupuje historyjki; na pulpicie
zobaczysz podsumowanie całego epiku.

### 11.2 Historyjka

*Create* → typ **Story** → tytuł np. „Pay for an order with a card” → w polu **Parent** (albo *Epic Link*) wybierz
epik z 11.1.

W **opisie** użyj nagłówków dokładnie takich jak poniżej (mogą być pogrubione, jako nagłówek Jira albo z dwukropkiem),
a pod nimi listy punktowanej:

```
As a customer I want to pay for my order with a card so that I can finish checkout.

Acceptance Criteria:
- The user enters card number, expiry date and CVV in a form.
- The Pay button is disabled while the payment is being processed.
- When the payment succeeds, the user sees a confirmation screen with the order number.
- When the card is declined, the user sees an error message and can try again.

Business Rules:
- Payment amount must be greater than 0.
- A maximum of 3 retries is allowed per order.
```

- **Acceptance Criteria** — kryteria akceptacji, każde jako osobny punkt.
- **Business Rules** — reguły biznesowe (limity, kwoty, uprawnienia).
- Dla typu **Bug** aplikacja rozpoznaje też *Steps to reproduce*, *Expected*, *Actual* i *Environment*.

Zapisz zgłoszenie.

### 11.3 Powiązanie z dokumentacją w Confluence

W przestrzeni `PAY` utwórz stronę, np. „Card payment rules”, z opisem zasad. Aplikacja połączy ją z historyjką, gdy:

- **wpiszesz klucz historyjki w treści strony**, np. „Related: PAY-2” — najprostszy sposób, albo
- dodasz link do strony w Jira: w historyjce *Link* (ikona łańcucha) → *Web link* lub *Confluence page* → wklej adres
  strony.

Bez żadnego z nich aplikacja próbuje dopasować stronę po treści — to działa, ale jest mniej pewne.

### 11.4 Powiązanie z ekranem w Figmie

W pliku Figmy narysuj ekran jako **ramkę** (*Frame*, skrót `F`) najwyższego poziomu, np. „Card payment – form”.
Połączenie z historyjką:

- **wpisz klucz historyjki w nazwie ramki albo w tekście na ekranie**, np. „Card payment – form (PAY-2)”, albo
- w Figmie kliknij ramkę prawym przyciskiem → *Copy/Paste as* → *Copy link to selection*, a w Jira dodaj ten adres
  jako *Web link* w historyjce.

Aplikacja sprawdza, czy w projekcie są wymagane **stany ekranu** (np. ładowanie, błąd, sukces). Nazywaj ramki
opisowo: „Card payment – loading”, „Card payment – error”, „Card payment – success”.

### 11.5 Odświeżenie analizy

Kliknij **↻ Analyze now** w górnym pasku aplikacji albo poczekaj na harmonogram z kroku 10.

---

## 12. Co zobaczysz w aplikacji

**Overview (pulpit)** — podsumowanie całego projektu:

- liczba epików, historyjek, ostrzeżeń i problemów krytycznych;
- **Backlog health** — pasek: zdrowe / wymagające uwagi / krytyczne;
- **Feature readiness** — jaki procent historyjek jest gotowy do realizacji, **Design coverage** — ile wymaganych stanów
  ekranów jest w Figmie, **Documentation consistency** — ile pozycji nie ma konfliktów z dokumentacją;
- **Where is the biggest risk?** — lista historyjek z największymi problemami (kliknij, żeby przejść do szczegółów);
- **Epics** — każdy epik z oceną i pokryciem wymagań, projektu i dokumentacji;
- **Recent drift** — co zmieniło się od poprzedniej analizy.

**Backlog** — wszystkie pozycje z oceną i statusem.

**Strona historyjki** (kliknij klucz, np. `PAY-2`):

- plakietka gotowości: 🟢 **READY FOR IMPLEMENTATION**, 🟡 **NEEDS ATTENTION** albo 🔴 **NOT READY**;
- **Specification (Jira)** — opis, kryteria akceptacji i reguły tak, jak aplikacja je odczytała. Jeśli kryteriów tu
  nie ma, nagłówek w opisie ma inną nazwę niż w 11.2;
- **Findings** — wykryte problemy, każdy z wyjaśnieniem i źródłem;
- **Challenge this feature** — pytania o przypadki brzegowe („co, jeśli serwer zwróci błąd?”). Odpowiedź zapisuje się
  jako decyzja i zamyka pytanie;
- **States & journeys** — wymagane stany ekranu i ścieżki użytkownika: co jest w wymaganiach, a co w Figmie;
- **Context** — powiązane strony Confluence i ramki Figmy (z informacją, skąd wiadomo, że są powiązane);
- **Approve for implementation** — zatwierdzenie. Od tej chwili aplikacja pilnuje, czy ktoś nie zmieni znaczenia
  historyjki, dokumentacji albo projektu (zakładka *Drift*).

Spróbuj: popraw opis historyjki w Jira (np. dopisz kryterium o błędzie serwera), kliknij *Analyze now* i zobacz, jak
zmienia się ocena.

---

## 13. Codzienna praca

- **Start:** uruchom Docker Desktop, otwórz terminal w folderze aplikacji i wykonaj polecenie z kroku 9
  (`op run … docker compose up -d` albo `export …` + `docker compose up -d`). Aplikacja uruchamia się też sama po
  restarcie Dockera, ale bez kluczy z menedżera haseł połączenia z Jira i Figmą nie zadziałają, dopóki nie uruchomisz
  jej z nimi ponownie.
- **Stop:** `docker compose down` — dane zostają.
- **Nowa wersja aplikacji:** pobierz najnowszy kod (`git pull` albo nowy ZIP) i uruchom
  `docker compose up -d --build` z kluczami.
- **Kopia zapasowa danych:** [`docs/LOCAL-ENVIRONMENT.md`, rozdział 8](docs/LOCAL-ENVIRONMENT.md#8-kopia-zapasowa-i-aktualizacja).

---

## 14. Gdy coś nie działa

| Objaw | Przyczyna i rozwiązanie |
|---|---|
| `Cannot connect to the Docker daemon` / `error during connect` | Docker Desktop nie jest uruchomiony. Uruchom go i poczekaj, aż ikona przestanie się animować. |
| `Set CI_ADMIN_TOKEN, e.g. …` | Nie podano hasła administratora w tym oknie terminala (krok 5, punkt 1). |
| `port is already allocated` | Port 4317 jest zajęty. Uruchom z innym: `CI_PORT=8080 docker compose up -d` (Windows: `$env:CI_PORT = '8080'`, potem `docker compose up -d`) i otwórz http://localhost:8080. |
| Strona http://localhost:4317 się nie otwiera | Sprawdź `docker compose ps` (czy jest `healthy`) i `docker compose logs app`. |
| Przeglądarka pyta o *Admin token* | To normalne przy pierwszej zmianie w karcie. Wklej hasło z kroku 4. Jeśli pytanie wraca po wklejeniu, hasło jest inne niż to, z którym uruchomiono aplikację. |
| Plakietka `JIRA_API_TOKEN missing` | Klucz nie dotarł do aplikacji. Ustaw go w **tym samym** oknie terminala i ponownie wykonaj `docker compose up -d`. |
| *Test connections*: 401 / Unauthorized | Zły e-mail albo token (np. wygasł). Sprawdź e-mail konta Atlassian i wygeneruj nowy token (krok 7). |
| *Test connections*: 404 / nie znaleziono | Zły *Site URL* albo klucz projektu/przestrzeni. Adres ma postać `https://<nazwa>.atlassian.net`, klucze wielkimi literami. |
| Figma: 403 | Token nie ma uprawnienia *File content: Read* albo Twoje konto nie ma dostępu do pliku. |
| Historyjka nie pojawia się w aplikacji | Jest w innym projekcie niż *Project key*, albo nie kliknięto *Analyze now*. |
| Brak kryteriów akceptacji na stronie historyjki | Nagłówek w opisie musi brzmieć dokładnie `Acceptance Criteria` (po angielsku), a kryteria muszą być punktami listy. |
| Confluence lub Figma nie są powiązane z historyjką | Wpisz klucz historyjki (np. `PAY-2`) w treści strony lub nazwie ramki albo dodaj link w Jira (11.3, 11.4). |
| Chcę zacząć od nowa | `docker compose down -v` usuwa **wszystkie** dane aplikacji (ustawienia, decyzje, historię). Jira, Confluence i Figma pozostają nietknięte. |

Logi aplikacji (przydatne przy zgłaszaniu problemu): `docker compose logs --tail 100 app`.

---

## 15. Ściąga poleceń

Wszystkie w folderze aplikacji, z ustawionym `CI_ADMIN_TOKEN` (krok 5 lub 9):

| Polecenie | Co robi |
|---|---|
| `docker compose up -d --build` | buduje i uruchamia aplikację z bieżącego kodu |
| `docker compose up -d` | uruchamia (albo uruchamia ponownie z nowymi kluczami) |
| `docker compose ps` | pokazuje, czy aplikacja działa |
| `docker compose logs -f app` | pokazuje logi na żywo (wyjście: Ctrl+C) |
| `docker compose down` | zatrzymuje, dane zostają |
| `docker compose down -v` | zatrzymuje i **usuwa dane** |
