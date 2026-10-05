# Konfiguracje Renovate i Dependabot — przykłady

> **Spis treści:** Renovate (`renovate.json`) · Dependabot (`.github/dependabot.yml`) · Harmonogramy końca wsparcia (stan 2026-10-03)

Sprawdzone 2026-10-03:
- `renovate.json` przeszedł `renovate-config-validator --strict --no-global` z pakietu Renovate 44.132.4;
  ten sam walidator odrzuca literówkę w nazwie opcji;
- `dependabot.yml` sparsowany jako YAML, a każdy klucz występuje w oficjalnym opisie opcji Dependabota
  (github/docs, `dependabot-options-reference.md`).

Wybierz **jedno** narzędzie na repozytorium — dwa naraz tworzą zdublowane PR-y.

## Renovate (`renovate.json`)
```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["config:recommended", ":semanticCommits"],
  "timezone": "Europe/Warsaw",
  "schedule": ["before 6am on monday"],
  "prConcurrentLimit": 5,
  "minimumReleaseAge": "3 days",
  "lockFileMaintenance": { "enabled": true, "schedule": ["before 6am on the first day of the month"] },
  "packageRules": [
    {
      "description": "Drobne aktualizacje razem; automatyczne scalanie przy zielonym CI",
      "matchUpdateTypes": ["minor", "patch"],
      "matchCurrentVersion": "!/^0/",
      "groupName": "drobne aktualizacje",
      "automerge": true,
      "automergeType": "pr"
    },
    {
      "description": "Wersje główne: osobny PR na zależność, bez automatycznego scalania",
      "matchUpdateTypes": ["major"],
      "automerge": false,
      "addLabels": ["major-upgrade"]
    }
  ],
  "vulnerabilityAlerts": { "minimumReleaseAge": null, "schedule": ["at any time"] }
}
```
Co robi:
- `config:recommended` — zalecany zestaw (m.in. tablica zależności w issue, grupowanie monorepo);
- `schedule` + `timezone` — PR-y tylko w poniedziałek rano; `prConcurrentLimit` — najwyżej 5 otwartych naraz;
- `minimumReleaseAge` — karencja 3 dni dla nowych wersji (ops-supply-chain-security);
- pierwsza reguła: patch i minor (poza wersjami `0.x`, gdzie minor może łamać zgodność) w jednym PR ze scalaniem
  automatycznym, gdy CI jest zielone;
- druga reguła: major osobno, bez scalania automatycznego;
- `vulnerabilityAlerts` — łatki bezpieczeństwa: Renovate domyślnie pomija dla nich harmonogram i limity PR
  (wymaga włączonych alertów Dependabota w repozytorium), a tu jawnie także bez karencji;
- `lockFileMaintenance` — raz w miesiącu odświeżenie zależności przechodnich.

Sprawdzenie lokalne przed commitem: `npx --package renovate renovate-config-validator --strict --no-global renovate.json`.

## Dependabot (`.github/dependabot.yml`)
```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
      time: "05:00"
      timezone: "Europe/Warsaw"
    open-pull-requests-limit: 5
    cooldown:
      default-days: 3
      semver-major-days: 14
    groups:
      drobne:
        update-types: ["minor", "patch"]
    labels: ["dependencies"]
  - package-ecosystem: "uv"
    directory: "/"
    schedule:
      interval: "weekly"
    groups:
      drobne:
        update-types: ["minor", "patch"]
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "monthly"
```
Co robi:
- tygodniowy harmonogram dla npm i uv, miesięczny dla akcji GitHub;
- `groups` — patch i minor w jednym PR na ekosystem; major osobno (domyślnie);
- `cooldown` — 3 dni dla wszystkich, 14 dni dla wersji głównych; na github.com Dependabot i tak stosuje domyślnie
  3 dni dla aktualizacji wersji, a łatki bezpieczeństwa nie mają karencji;
- `open-pull-requests-limit` — najwyżej 5 otwartych PR na ekosystem (domyślnie 5 dla aktualizacji wersji).

Dependabot nie ma opcji automatycznego scalania w `dependabot.yml`. Jeśli człowiek chce scalać drobne aktualizacje
automatycznie, robi to osobny workflow z wymaganymi testami i ochroną gałęzi — agent nie włącza go sam.

## Harmonogramy końca wsparcia (stan 2026-10-03)
| Środowisko | Stan | Źródło |
|---|---|---|
| Node.js 20 | koniec wsparcia 2026-04-30 | github.com/nodejs/Release (`schedule.json`) |
| Node.js 22 | utrzymanie (maintenance LTS) do 2027-04-30 | jw. |
| Node.js 24 | aktywne LTS, utrzymanie od 2026-10-20, koniec 2028-04-30 | jw. |
| Node.js 26 | wydanie bieżące, LTS od 2026-10-28, koniec 2029-04-30 | jw. |
| Python 3.10 | koniec wsparcia 2026-10 | devguide.python.org/versions |
| Angular 20 | koniec LTS 2026-11-28; 22 aktywna, 21 LTS | angular.dev/reference/releases |
| Next.js | 16.x aktywne LTS, 15.x utrzymanie; 14 i starsze bez wsparcia | nextjs.org/support-policy |

Daty sprawdzaj w źródle przy każdym planie — tabela się starzeje.
