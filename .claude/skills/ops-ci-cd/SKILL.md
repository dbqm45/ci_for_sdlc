---
name: ops-ci-cd
description: Użyj przy pipeline'ach CI/CD (GitHub Actions i inne) — tworzenie, naprawa, cache buildów, wdrożenia, bezpieczeństwo.
metadata:
  katalog: "Użyj przy tworzeniu i naprawie pipeline'ów CI/CD (GitHub Actions i podobne), strategii wdrożeń, cache'owaniu buildów i bezpieczeństwie pipeline'u. Nie do pisania Dockerfile (ops-docker) ani commitów (core-git-workflow)."
---

# CI/CD

## Struktura pipeline'u
`lint → typecheck → test → build → (skan bezpieczeństwa) → deploy staging → testy dymne → deploy produkcja (z akceptacją)`
- Szybkie kroki najpierw (fail fast). Niezależne joby równolegle.
- Ten sam artefakt (obraz z digestem) przechodzi przez wszystkie środowiska — nie budujesz ponownie dla produkcji.

## GitHub Actions — bezpieczeństwo
1. `permissions:` na poziomie workflow ustaw minimalnie (`contents: read`), rozszerzaj per job.
2. Akcje zewnętrzne przypinaj do pełnego SHA commita, nie do tagu.
3. Chmura przez OIDC (`id-token: write`) zamiast długotrwałych kluczy w sekretach.
4. `pull_request_target` i `workflow_run` z kodem z forka = ryzyko — nie uruchamiaj w nich niezaufanego kodu.
5. Nie interpoluj `${{ github.event.* }}` (tytuły PR, gałęzie) bezpośrednio w `run:` — przekaż przez `env:`.
6. Sekrety tylko w jobach, które ich potrzebują; środowisko `production` z wymaganą akceptacją.
7. Instalacja zależności `npm ci --ignore-scripts` (lub allowlista skryptów) w jobie **bez** sekretów publikacji
   i wdrożenia. Token publikacji paczek nie istnieje w CI — publikacja przez trusted publishing (OIDC) z `--provenance`.
8. Ruch wychodzący z runnerów ograniczony do rejestrów i usług, których pipeline potrzebuje (np. harden-runner na
   GitHub Actions, reguły sieci na runnerach własnych). Złośliwy skrypt instalacyjny nie wyśle wtedy sekretów.
9. Skanery i lintery to też kod z zewnątrz: przypinaj je do SHA i digestu obrazu (w 2026 podmieniono Trivy przez akcje).
10. Agent AI w CI nie działa z prawem zapisu ani z sekretami na niezaufanym wejściu (PR z forka, treść issue) —
    core-agent-security. Zależności i incydenty z paczkami — ops-supply-chain-security.

## Wydajność
- Cache zależności (`actions/setup-node` z `cache: npm`, cache warstw Dockera).
- `concurrency:` z `cancel-in-progress: true` dla PR.
- Uruchamiaj tylko to, co się zmieniło (`paths:` filtry) w monorepo.

## Wdrożenia
- Strategia z szybkim rollbackiem: blue/green, canary lub rolling z healthcheckami; wybór, bramki canary, GitOps
  i migracje expand–contract — ops-release-engineering.
- Build i wdrożenie na osobnych tożsamościach; skan sekretów jako ostatnie zabezpieczenie po hookach lokalnych —
  ops-secrets-identities. Manifesty Kubernetes walidowane w CI — ops-kubernetes.
- Każde wdrożenie produkcyjne: kto, co (SHA), kiedy — widoczne w historii.

## Weryfikacja
`actionlint` (jeśli dostępny); sprawdź składnię YAML; w PR opisz, jak pipeline przetestowano.

## Przykład
**Sytuacja:** „Dodaj CI na każdy PR w repo Node.” **Wynik** (`.github/workflows/ci.yml`, skrót; do tego
`concurrency` z `cancel-in-progress: true`):
```yaml
on: pull_request
permissions: { contents: read }
jobs:
  checks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<pełny-SHA> # v4
      - run: npm ci --ignore-scripts && npm run lint && npm run typecheck && npm test && npm run build
```
Więcej przykładów: `references/przyklady.md`.
