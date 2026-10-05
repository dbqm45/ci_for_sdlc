# Przykłady: łańcuch dostaw

> **Spis treści:** 1. „Czy dotknęło nas axios?” · 2. Karencja i allowlista skryptów w pnpm · 3. Publikacja własnej paczki przez OIDC

Nazwy repozytoriów, paczek wewnętrznych i liczby są ilustracyjne; dane o axios pochodzą z `przypadki.md`.

## 1. „Czy dotknęło nas axios?”
**Sytuacja:** „Słyszałem o przejętym axios. Mamy 12 repozytoriów z frontem i backendem w Node. Czy jesteśmy dotknięci?”

**Jak:**
1. Fakty z komunikatu (`incydent-zaleznosci.md`, krok 1): złośliwe wersje axios 1.14.1 i 0.30.4, dodatkowa paczka
   `plain-crypto-js`, okno ataku około 3 godzin.
2. Szukasz `grep`-em w lockfile'ach wszystkich repozytoriów i gałęzi wydań — nie czytasz całych plików.
3. Sprawdzasz `node_modules` na runnerach i laptopach: sam katalog `plain-crypto-js` znaczy, że `postinstall` się wykonał.
4. Dla trafień: lista maszyn, które instalowały w oknie ataku → przebudowa i rotacja sekretów (kroki 3–5 procedury).
5. Przypinasz bezpieczną wersję przez `overrides` i sprawdzasz, które zabezpieczenie zatrzymałoby atak.

**Wynik:** polecenia i oczekiwane wyniki.

```bash
#!/usr/bin/env bash
# Uruchom w katalogu z klonami repozytoriów (np. ~/src/acme).
set -euo pipefail

# 1. Dodatkowa paczka z ataku i złośliwe wersje axios w lockfile'ach
LOCKS=(--include=package-lock.json --include=pnpm-lock.yaml --include=yarn.lock)
grep -rn "${LOCKS[@]}" 'plain-crypto-js' . || echo "lockfile: brak plain-crypto-js"
grep -rn -A3 "${LOCKS[@]}" 'axios' . | grep -E '1\.14\.1|0\.30\.4' || echo "lockfile: brak złośliwych wersji axios"

# 2. Ślad wykonanego postinstall
find . -type d -name plain-crypto-js -path '*node_modules*' -print | grep . || echo "node_modules: brak trafień"

# 3. Gałęzie wydań bez checkoutu
for repo in */; do
  for ref in $(git -C "$repo" for-each-ref --format='%(refname:short)' 'refs/remotes/origin/release/*' 2>/dev/null); do
    git -C "$repo" grep -n 'plain-crypto-js' "$ref" -- '*lock*' || true
  done
done
```

| Wynik | Znaczenie | Dalej |
|---|---|---|
| same komunikaty „brak…” we wszystkich 12 repozytoriach | niedotknięci | wpis do dziennika projektu, wnioski (krok 7) |
| `./web-shop/package-lock.json:4182: "node_modules/plain-crypto-js": {` | wersja była w drzewie | maszyny z instalacją w oknie ataku = przejęte |
| `./web-shop/node_modules/plain-crypto-js` na runnerze `ci-runner-07` | skrypt się wykonał | zniszcz runner i obraz, zrotuj sekrety z runnera |

## 2. Karencja i allowlista skryptów w pnpm
**Sytuacja:** „Chcemy się zabezpieczyć przed następnym axios. Projekt na pnpm 10, Renovate otwiera PR-y codziennie”.
Dzień później ogłoszono krytyczną podatność w `react-dom`, a aplikacja jest wystawiona do internetu.

**Jak:**
1. Karencja 3 dni w menedżerze pakietów (sekcja 2) — i osobno w Renovate.
2. Skrypty instalacyjne tylko z allowlisty (`onlyBuiltDependencies`), w CI dodatkowo `--ignore-scripts` tam, gdzie
   build ich nie potrzebuje (sekcja 3).
3. Instalacja w CI wyłącznie z zamrożonego lockfile'a (sekcja 1).
4. Łatka w ciągu 24 godzin: pojedynczy wyjątek z przeglądem diffu paczki, a nie wyłączenie karencji (sekcja 2).
5. Wyjątek usuwasz, gdy łatka przekroczy 3 dni.

**Wynik:** konfiguracja.

```yaml
# pnpm-workspace.yaml
packages:
  - "apps/*"
  - "libs/*"
minimumReleaseAge: 4320          # minuty = 3 dni
minimumReleaseAgeExclude:
  - react-dom                    # łatka krytyczna, PR #812, przegląd diffu: @jkowalska; usunąć po 3 dniach
onlyBuiltDependencies:
  - esbuild
```

```bash
# CI
pnpm install --frozen-lockfile
```
W PR z łatką: „Wyjątek tylko dla `react-dom`; diff paczki przejrzany, brak nowych zależności przechodnich”.

## 3. Publikacja własnej paczki przez OIDC
**Sytuacja:** „Publikujemy `@acme/ui-kit` z laptopa lidera tokenem klasycznym. Przenieśmy to do CI”.

**Jak:**
1. Trusted publisher w npm przypięty do jednego pliku workflow i chronionego środowiska z akceptacją (sekcja 4).
2. Publikacja tylko z tagu w głównym repozytorium, nigdy z commitów z forków.
3. `--provenance` przy publikacji; odbiorcy sprawdzają `npm audit signatures`.
4. Klasyczne tokeny unieważnione — w axios działający stary token ominął skonfigurowane OIDC.
5. Akcje przypięte do SHA, skrypty instalacyjne wyłączone.

**Wynik:** `.github/workflows/publish.yml`.

```yaml
name: publish
on:
  push:
    tags: ["v*.*.*"]
permissions:
  contents: read
jobs:
  publish:
    if: github.repository == 'acme/ui-kit'
    runs-on: ubuntu-latest
    environment: npm-publish      # wymagana akceptacja człowieka
    permissions:
      contents: read
      id-token: write
    steps:
      - uses: actions/checkout@<SHA>
      - uses: actions/setup-node@<SHA>
        with:
          registry-url: https://registry.npmjs.org
      - run: npm ci --ignore-scripts
      - run: npm test
      - run: npm publish --provenance --access public
```
Po pierwszej publikacji: tokeny klasyczne lidera unieważnione, konto z kluczem sprzętowym, wpis w dzienniku decyzji.
