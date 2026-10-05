# Przykłady CI/CD

> **Spis treści:** 1. Nowy workflow CI dla PR · 2. Naprawa wstrzyknięcia przez tytuł PR · 3. Jeden obraz od stagingu do produkcji

Przykłady stosują reguły z SKILL.md. `<pełny-SHA>` to miejsce na 40-znakowy SHA commita akcji — sprawdź go
w repozytorium akcji i zostaw tag w komentarzu, żeby aktualizacje były czytelne.

## 1. Nowy workflow CI dla PR
**Sytuacja:** „Dodaj CI do naszego repo w Node: lint, typy, testy i build na każdy PR. Teraz nic nie ma.”

**Jak:**
1. Kolejność fail fast: lint i typecheck (sekundy) przed testami i buildem.
2. `permissions: contents: read` na poziomie workflow; żaden job nie potrzebuje więcej.
3. Akcje przypięte do SHA; cache npm przez `setup-node`.
4. `npm ci --ignore-scripts` — job nie ma sekretów, ale skrypty instalacyjne i tak nie mają tu czego szukać.
5. `concurrency` z `cancel-in-progress: true`, żeby nowy push anulował stary przebieg.

**Wynik:** `.github/workflows/ci.yml`
```yaml
name: ci
on:
  pull_request:
    paths: ["src/**", "package.json", "package-lock.json", ".github/workflows/ci.yml"]

permissions:
  contents: read

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  checks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<pełny-SHA> # v4
      - uses: actions/setup-node@<pełny-SHA> # v4
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci --ignore-scripts
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
```
Weryfikacja: `actionlint` (jeśli jest) i parsowanie YAML; w opisie PR: „workflow uruchomiony na tym PR, przebieg zielony,
anulowanie sprawdzone drugim pushem”.

## 2. Naprawa wstrzyknięcia przez tytuł PR
**Sytuacja:** Przegląd bezpieczeństwa wskazał workflow etykietujący PR-y. Uruchamia się na `pull_request_target`
i wkleja tytuł PR prosto do `run:`.

**Jak:**
1. Znajdź interpolację `${{ github.event.* }}` w `run:` — tytuł `"; curl … #` wykona się w powłoce runnera.
2. Przenieś wartość do `env:` i używaj jej jako zmiennej powłoki w cudzysłowie.
3. Zostaw `pull_request_target` tylko dlatego, że job nie pobiera kodu z forka; uprawnienia zawęź do `pull-requests: write`.
4. Przypnij akcje do SHA.

**Wynik:** przed (podatne):
```yaml
on: pull_request_target
jobs:
  label:
    runs-on: ubuntu-latest
    steps:
      - run: |
          echo "Tytuł: ${{ github.event.pull_request.title }}" >> "$GITHUB_STEP_SUMMARY"
```
po:
```yaml
on: pull_request_target

permissions:
  contents: read

jobs:
  label:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
    steps:
      # bez actions/checkout: kod z forka nie trafia na runner z uprawnieniem zapisu
      - name: Podsumowanie
        env:
          PR_TITLE: ${{ github.event.pull_request.title }}
        run: |
          printf 'Tytuł: %s\n' "$PR_TITLE" >> "$GITHUB_STEP_SUMMARY"
```

## 3. Jeden obraz od stagingu do produkcji
**Sytuacja:** „Pipeline buduje obraz osobno dla stagingu i produkcji, a klucze chmury leżą w sekretach repo.
Chcemy bezpieczniej i bez ponownego budowania.”

**Jak:**
1. Build raz; digest obrazu jako wyjście joba przechodzi przez wszystkie środowiska.
2. Wdrożenia przez OIDC (`id-token: write` tylko w jobach wdrożenia), bez kluczy w sekretach.
3. Staging → testy dymne → produkcja w środowisku `production` z wymaganą akceptacją.
4. Każde wdrożenie zapisuje SHA i digest w podsumowaniu przebiegu — kto, co, kiedy.

**Wynik:** `.github/workflows/deploy.yml`
```yaml
name: deploy
on:
  push:
    branches: [main]

permissions:
  contents: read

concurrency:
  group: deploy
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    outputs:
      digest: ${{ steps.push.outputs.digest }}
    steps:
      - uses: actions/checkout@<pełny-SHA> # v4
      - id: push # skrypt zapisuje „digest=sha256:…” do $GITHUB_OUTPUT
        run: ./scripts/build-and-push.sh "ghcr.io/acme/orders-api" "$GITHUB_SHA"

  deploy-staging:
    needs: build
    runs-on: ubuntu-latest
    environment: staging
    permissions:
      contents: read
      id-token: write
    steps:
      - uses: actions/checkout@<pełny-SHA> # v4
      - uses: aws-actions/configure-aws-credentials@<pełny-SHA> # <tag>
        with:
          role-to-assume: arn:aws:iam::111111111111:role/deploy-staging
          aws-region: eu-central-1
      - env:
          DIGEST: ${{ needs.build.outputs.digest }}
        run: ./scripts/deploy.sh staging "ghcr.io/acme/orders-api@$DIGEST"
      - run: ./scripts/smoke-test.sh https://staging.acme.example

  deploy-production:
    needs: [build, deploy-staging]
    runs-on: ubuntu-latest
    environment: production
    permissions:
      contents: read
      id-token: write
    steps:
      - uses: actions/checkout@<pełny-SHA> # v4
      - uses: aws-actions/configure-aws-credentials@<pełny-SHA> # <tag>
        with:
          role-to-assume: arn:aws:iam::222222222222:role/deploy-production
          aws-region: eu-central-1
      - env:
          DIGEST: ${{ needs.build.outputs.digest }}
        run: |
          ./scripts/deploy.sh production "ghcr.io/acme/orders-api@$DIGEST"
          printf 'Wdrożono %s (%s) przez %s\n' "$DIGEST" "$GITHUB_SHA" "$GITHUB_ACTOR" >> "$GITHUB_STEP_SUMMARY"
```
Rola produkcyjna ufa tylko tokenom OIDC ze środowiska `production` tego repozytorium. Strategia rolloutu i wycofania
w `deploy.sh` — ops-release-engineering.
