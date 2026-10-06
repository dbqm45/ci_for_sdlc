# Środowisko lokalne (za darmo, tylko na Twoim komputerze)

Cel: uruchomić aplikację na własnym komputerze z prawdziwymi danymi z Jira, Confluence i Figmy, bez płatnych licencji
i bez serwera. To ten sam obraz Dockera, który CI buduje i testuje przy każdym merge'u do `main`, więc później na
produkcję trafi dokładnie to, co sprawdziłeś lokalnie.

> Pierwszy raz z Dockerem lub Jira? Zacznij od [`ONBOARDING.md`](../ONBOARDING.md) — ta sama konfiguracja krok po kroku,
> z przykładową historyjką i opisem tego, co zobaczysz na dashboardzie.

| Element | Za darmo? | Uwagi |
|---|---|---|
| Docker Desktop | tak (użytek prywatny) | Mac, Windows, Linux |
| GitHub Actions + GHCR | tak | repozytorium prywatne: 2000 min/mies. i 500 MB na obrazy (CI trzyma tylko kilka ostatnich) |
| Jira + Confluence Cloud (plan Free) | tak | do 10 użytkowników |
| Figma (plan Starter) | tak | token osobisty działa na planie darmowym |
| Model AI | tak, lokalnie (Ollama) | albo bez AI — same reguły deterministyczne |

## 1. Przygotowanie

1. Zainstaluj [Docker Desktop](https://www.docker.com/products/docker-desktop/) i uruchom go.
2. Sklonuj repozytorium i wejdź do katalogu:

   ```bash
   git clone git@github.com:dbqm45/ci_for_sdlc.git
   cd ci_for_sdlc
   ```

3. Wygeneruj dwa klucze (raz) i zapisz je **w menedżerze haseł**, nie w pliku:

   ```bash
   openssl rand -hex 32
   openssl rand -hex 32
   ```

   - pierwszy to `CI_ADMIN_TOKEN` — UI poprosi o niego przy pierwszej zmianie (zapamiętuje go do zamknięcia karty),
   - drugi to `CI_ENCRYPTION_KEY` — szyfruje zapisany stan na dysku, gdy w *Settings → Security & privacy* włączysz
     *Encrypt stored context*. Zgubienie klucza = utrata zaszyfrowanych danych, więc trzymaj go w menedżerze haseł.

## 2. Sekrety: z menedżera haseł, nie z pliku

`docker compose` czyta sekrety ze zmiennych środowiskowych powłoki, z której go uruchamiasz. Najwygodniej wstrzyknąć je
z menedżera haseł tylko na czas uruchomienia polecenia.

**1Password CLI (`op`)** — utwórz plik z odwołaniami (bez wartości, można go bezpiecznie trzymać lokalnie), np.
`~/.config/ci-sdlc.env`:

```
CI_ADMIN_TOKEN=op://Private/ci-sdlc/admin-token
CI_ENCRYPTION_KEY=op://Private/ci-sdlc/encryption-key
JIRA_API_TOKEN=op://Private/atlassian/api-token
FIGMA_TOKEN=op://Private/figma/token
```

i uruchamiaj:

```bash
op run --env-file ~/.config/ci-sdlc.env -- docker compose up -d
```

**Bitwarden Secrets Manager (`bws`)** — `bws run -- docker compose up -d`.

**Bez menedżera haseł** — `export` w bieżącej sesji terminala (znika po jej zamknięciu). Plik `.env` w katalogu
repozytorium też zadziała (jest w `.gitignore`), ale to klucze w pliku na dysku — tylko na chwilę.

Zmienne, których nie ustawisz, są puste; bez `CI_ADMIN_TOKEN` compose odmówi startu.

## 3. Uruchomienie

Z bieżącego kodu (budowa obrazu na Twoim komputerze, ok. 1–2 min za pierwszym razem):

```bash
docker compose up -d --build
```

Albo gotowy obraz zbudowany przez CI (wymaga jednorazowego logowania do GHCR tokenem GitHub z uprawnieniem
`read:packages`):

```bash
docker login ghcr.io -u dbqm45
docker compose pull
docker compose up -d
```

Otwórz http://localhost:4317. Port jest wystawiony tylko na `127.0.0.1` — z innych komputerów w sieci aplikacja nie
jest dostępna. Inny port: `CI_PORT=8080 docker compose up -d`.

Przydatne polecenia:

```bash
docker compose ps
docker compose logs -f app
docker compose down
```

`docker compose down` zatrzymuje aplikację, ale **zachowuje dane** (wolumen `ci-data`). `docker compose down -v` je usuwa.

## 4. Jira i Confluence (Atlassian Cloud Free)

1. Załóż darmową witrynę: https://www.atlassian.com/software/jira/free — dostaniesz adres
   `https://<nazwa>.atlassian.net`. Confluence dodasz w tej samej witrynie (*Apps → Confluence*, plan Free).
2. Utwórz projekt w Jira (np. klucz `PAY`) i kilka epików i historyjek z kryteriami akceptacji; w Confluence przestrzeń
   (np. `PAY`) z regułami biznesowymi.
3. Token API: https://id.atlassian.com/manage-profile/security/api-tokens → *Create API token* → zapisz w menedżerze
   haseł jako `JIRA_API_TOKEN`. Ten sam token działa dla Confluence (osobny `CONFLUENCE_API_TOKEN` tylko gdy chcesz).
4. W aplikacji: *Settings → Workspace → Mode: Live*, potem *Integrations*:
   - Jira: *Site URL* `https://<nazwa>.atlassian.net`, *Account e-mail* (ten od konta Atlassian), *Project key* `PAY`,
   - Confluence: ten sam *Site URL* i e-mail, *Space keys* `PAY`.
5. *Test connections*, potem *Save & re-analyze*.

## 5. Figma (plan Starter)

1. Figma → *Settings → Security → Personal access tokens* → *Generate new token*; zakres wystarczy *File content: Read*.
   Zapisz jako `FIGMA_TOKEN`.
2. Klucz pliku jest w adresie: `figma.com/design/<FILE_KEY>/…`. Wpisz go w *Settings → Integrations → Figma → File keys*.

## 6. Model AI za darmo

Aplikacja działa też bez AI (*Deterministic rules only*) — reguły wykrywają luki i konflikty, AI dodaje przegląd
semantyczny. Darmowe opcje:

**Ollama w compose** (najprościej, działa na CPU; na Macu wolniej niż natywnie, bo Docker nie ma dostępu do GPU):

```bash
docker compose --profile ollama up -d
docker compose exec ollama ollama pull llama3.1:8b
```

W *Settings → AI provider*: *Custom endpoint*, *Endpoint base URL* `http://ollama:11434/v1`, *Model* `llama3.1:8b`.

**Ollama zainstalowana natywnie** (Mac z Apple Silicon — szybciej, korzysta z GPU): zainstaluj z https://ollama.com,
`ollama pull llama3.1:8b`, a w aplikacji *Endpoint base URL* `http://host.docker.internal:11434/v1`.

**Darmowe API w chmurze** (np. Google Gemini przez endpoint zgodny z OpenAI,
`https://generativelanguage.googleapis.com/v1beta/openai`, klucz jako `CUSTOM_AI_API_KEY`) — uwaga: w planach
darmowych dostawca może używać przesyłanych danych do trenowania modeli. Używaj tylko z danymi testowymi.

Mniejsze modele lokalne gorzej trzymają się formatu odpowiedzi; jeśli przegląd semantyczny zwraca błędy, spróbuj
większego modelu (np. `qwen2.5:14b`) albo zostań przy regułach.

## 7. Ponowna analiza bez webhooków

Webhooki z Jira/Confluence/Figmy nie dotrą do `localhost`. Zamiast nich: *Settings → Analysis schedule → Every N
minutes* (np. 15) albo przycisk *Analyze now*.

## 8. Kopia zapasowa i aktualizacja

Kopia danych (wolumen `ci-data`) do pliku w bieżącym katalogu:

```bash
docker run --rm -v ci_for_sdlc_ci-data:/data -v "$PWD":/backup alpine tar czf /backup/ci-data.tgz -C /data .
```

Odtworzenie:

```bash
docker run --rm -v ci_for_sdlc_ci-data:/data -v "$PWD":/backup alpine tar xzf /backup/ci-data.tgz -C /data
```

Aktualizacja do najnowszego obrazu z CI:

```bash
docker compose pull
docker compose up -d
```

Konkretna wersja (np. do porównania): `CI_IMAGE_TAG=0.1.0 docker compose up -d` albo `CI_IMAGE_TAG=sha-<commit> docker compose up -d`.

## 9. CI/CD w repozytorium

| Workflow | Kiedy | Co robi |
|---|---|---|
| `ci.yml` | każdy PR i push do `main` | typecheck, testy jednostkowe z pokryciem, testy skryptów wydania, build, e2e |
| `regression-nightly.yml` | poniedziałki, ręcznie | pełna regresja: trzy przeglądarki, testy wizualne, mutacyjne ([`TESTING-REGRESSION.md`](TESTING-REGRESSION.md)) |
| `release.yml` | push do `main`, ręcznie | buduje obraz, uruchamia go i sprawdza (`/api/health`, UI, 401 bez tokenu, 200 z tokenem), publikuje do `ghcr.io/dbqm45/ci_for_sdlc` (`latest`, `sha-<commit>`, a przy nowej wersji także `X.Y.Z`) i tworzy tag `vX.Y.Z` ([`RELEASING.md`](RELEASING.md)) |
| `pr-title.yml` | każdy PR, także po zmianie tytułu | tytuł PR zgodny z Conventional Commits |
| `security.yml` | PR zmieniający zależności, poniedziałki, ręcznie | `npm audit`: bramka na podatności high/critical we wszystkich zależnościach, moderate — tylko raport |
| Dependabot | co tydzień | PR-y z aktualizacjami npm, GitHub Actions i obrazu bazowego Node |

## 10. Później: produkcja (ograniczona)

Gdy uznasz, że MVP działa, ten sam obraz można uruchomić w chmurze dla wąskiej grupy osób, np. na AWS (App Runner
albo ECS Fargate) z modelem przez Amazon Bedrock. Wtedy:

- sekrety z AWS Secrets Manager, Bedrock przez rolę IAM (bez kluczy dostępowych),
- dostęp tylko dla wybranych osób (np. logowanie przez SSO przed aplikacją),
- dane na trwałym wolumenie (EFS) albo w bazie, kopie automatyczne,
- webhooki z Atlassian i Figmy zamiast harmonogramu.

To osobny krok, gdy będzie potrzebny — lokalnie nic z tego nie jest wymagane.
