---
name: ops-supply-chain-security
description: Użyj przy zależnościach i łańcuchu dostaw — lockfile, karencja wersji, skrypty instalacyjne, SBOM, przejęte paczki.
metadata:
  katalog: "Użyj przy dodawaniu i aktualizacji zależności, przeglądzie lockfile, konfiguracji menedżera pakietów, publikacji paczek i pytaniu „czy dotknęła nas skompromitowana paczka” — lockfile i npm ci, karencja nowych wersji, skrypty instalacyjne, provenance, tokeny publikacji, SBOM, szybka ścieżka łatek, procedura po incydencie. Nie do samego pipeline'u (ops-ci-cd) ani auth aplikacji (be-auth-security)."
---

# Bezpieczeństwo łańcucha dostaw oprogramowania

Zależność ma takie same uprawnienia jak Twój kod: w chwili instalacji uruchamia się na laptopie programisty i na
runnerze CI, gdzie leżą tokeny npm, klucze SSH, dane dostępowe do chmury i pliki `.env`. Przypadek axios (marzec 2026):
przejęte konto opiekuna, nowa zależność z hookiem `postinstall`, pierwsze zainfekowane maszyny po 89 sekundach, złośliwe
wersje dostępne około 3 godzin. Szczegóły i inne przypadki: `references/przypadki.md`.

## 1. Instalacja powtarzalna
- Lockfile w repozytorium; w CI wyłącznie `npm ci` / `pnpm install --frozen-lockfile` / `yarn install --immutable`.
- Diff lockfile w PR czyta człowiek. **Nowa zależność przechodnia**, której wcześniej nie było, to sygnał alarmowy
  (w axios była nią `plain-crypto-js`) — pipeline może ją wykrywać i wymagać akceptacji.
- Java: wersje przypięte (bez zakresów i `LATEST`), weryfikacja sum kontrolnych (Gradle `verification-metadata.xml`,
  Maven z `checksumPolicy=fail`); wtyczki builda to też kod uruchamiany u Ciebie.

## 2. Karencja nowych wersji
Złośliwe wersje zwykle znikają z rejestru w ciągu godzin, więc instaluj wersje starsze niż 1–3 dni.

| Menedżer | Ustawienie | Jednostka | Od wersji |
|---|---|---|---|
| npm | `min-release-age=3` w `.npmrc` | dni | npm 11.10 |
| pnpm | `minimumReleaseAge: 4320` w `pnpm-workspace.yaml`, wyjątki `minimumReleaseAgeExclude` | minuty | pnpm 10.16 (od 11 domyślnie 1440) |
| Yarn Berry | `npmMinimalAgeGate: 4320` w `.yarnrc.yml`, wyjątki `npmPreapprovedPackages` | minuty | Yarn 4.10 |

Renovate i Dependabot mają własne ustawienia opóźnienia — skonfiguruj je osobno.

**Wyjątek: łatki bezpieczeństwa.** Krytyczna podatność w komponencie wystawionym do internetu (React2Shell: ujawniona
3 grudnia 2025, ataki od 4 grudnia) wymaga wdrożenia w ciągu 24 godzin. Łatkę przepuszczasz świadomie przez listę wyjątków,
z przeglądem diffu paczki, a nie przez wyłączenie karencji dla wszystkich.

## 3. Skrypty instalacyjne
- W CI `--ignore-scripts` jako zasada. Paczki, które naprawdę potrzebują skryptu (natywne binaria, np. esbuild),
  dopuszczasz z allowlisty: pnpm `onlyBuiltDependencies` (pnpm 10) lub `allowBuilds` (pnpm 11), npm z `@lavamoat/allow-scripts`.
- Nigdy `curl … | sh` ani `iwr … | iex` jako kroku instalacji w repozytorium lub CI — pobierz, sprawdź sumę, dopiero uruchom. <!-- audit-ok: opis ataku, nie polecenie -->

## 4. Publikacja własnych paczek
- **Trusted publishing (OIDC) i usunięcie klasycznych tokenów npm.** W axios OIDC było skonfigurowane, ale długotrwały
  token nadal działał i to nim opublikowano złośliwe wersje.
- Publikuj z CI z `--provenance`; odbiorcy sprawdzają `npm audit signatures`.
- **Provenance mówi, gdzie zbudowano paczkę, a nie czy build był uprawniony.** W kampanii Mini Shai-Hulud (2026)
  napastnicy użyli własnych workflow ofiar i ich tokenów OIDC (osierocony commit przez fork ominął ochronę gałęzi),
  więc złośliwe wersje miały poprawne provenance. Dlatego: trusted publisher przypięty do konkretnego pliku workflow
  i chronionego środowiska z wymaganą akceptacją; publikacja nigdy z commitów z forków; alarm na zależności pobierane
  prosto z GitHuba (`github:…`, URL git), zwłaszcza opcjonalne.
- Konta opiekunów: klucze sprzętowe lub passkeys (WebAuthn) zamiast kodów TOTP; lokalne tokeny publikacji tylko
  granularne i krótkie (npm skraca ich domyślną ważność do 7 dni), klasyczne usunięte.
- Osoba z prawem publikacji to cel ataku socjotechnicznego: opiekuna axios przekonano podczas fałszywego spotkania
  (podrobiony Slack i Teams), żeby zainstalował „poprawkę”. Prawa publikacji tylko w CI, nie na laptopie; żadnej instalacji
  oprogramowania na prośbę rozmówcy.

## 5. Wiedza o tym, co masz
- SBOM (CycloneDX) generowany w CI dla każdego artefaktu — odpowiedź na „czy mamy wersję X?” w minutach, nie w dniach.
- Narzędzia bezpieczeństwa w CI (skanery, lintery) to też łańcuch dostaw: w kampanii TeamPCP podmieniono Trivy przez
  GitHub Actions. Przypinaj je jak każdą akcję (SHA, digest obrazu) — ops-ci-cd.
- Skan zależności z wykrywaniem złośliwego kodu (nie tylko znanych CVE) w pipeline.
- **Skanery bez sekretów:** job ze skanerem nie ma tokenów zapisu ani poświadczeń chmury — podmieniony Trivy czytał
  sekrety z pamięci procesu runnera, a potem wykonywał normalny skan, żeby nikt nic nie zauważył. Wersje narzędzi
  buildu przypinasz tak samo jak zależności aplikacji.
- **Priorytety podatności:** najpierw to, co jest osiągalne (paczka → artefakt → obraz → usługa wystawiona do internetu)
  i znane jako wykorzystywane w atakach (np. katalog CISA KEV); ustalenie osiągalności ma wskazaną ścieżkę dowodu.
  Model AI może wyjaśniać znalezisko, ale nie rozstrzyga, czy podatność jest wykorzystywalna.

## 6. Po zgłoszeniu kompromitacji paczki
Procedura krok po kroku: `references/incydent-zaleznosci.md`. W skrócie: znajdź wersję w lockfile'ach i w `node_modules`,
sprawdź ślady na maszynach, które instalowały w oknie ataku, **przebuduj** zainfekowane maszyny zamiast je „czyścić”,
zrotuj każdy sekret dostępny z tych maszyn i runnerów, przypnij bezpieczną wersję (`overrides` / `resolutions`).

## Agent a zależności
- Agent nie dodaje nowej zależności bez zgody człowieka (hook guard_bash pyta przy `npm install <paczka>`) i nie podnosi
  wersji w istniejącym projekcie z własnej inicjatywy.
- **Slopsquatting:** modele AI wymyślają nazwy paczek, które nie istnieją, i robią to powtarzalnie, więc napastnicy
  mogą rejestrować te nazwy. Paczkę zaproponowaną przez AI sprawdzasz w rejestrze i dokumentacji, zanim trafi do projektu;
  CI może blokować nowe zależności młodsze niż N dni lub z bardzo małą liczbą pobrań.
- Przed propozycją nowej paczki: nazwa dokładnie ta sama co w dokumentacji projektu (typosquatting), wydawca, data ostatniej
  wersji, provenance, liczba zależności przechodnich. Mniej zależności to mniejsza powierzchnia ataku.

## Przykład
**Sytuacja:** „Słyszałem o przejętym axios. Mamy 12 repozytoriów w Node — czy jesteśmy dotknięci?”
**Wynik:** odpowiedź oparta na `grep`, nie na czytaniu lockfile'ów:
- `grep -rn 'plain-crypto-js'` w `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock` wszystkich repozytoriów i gałęzi
  wydań, plus wersje axios 1.14.1 i 0.30.4.
- Katalog `node_modules/plain-crypto-js` na runnerze lub laptopie = `postinstall` się wykonał → maszyna przejęta.
- Trafienie: przebudowa maszyn z instalacją w oknie ataku, rotacja sekretów z nich, `overrides` z bezpieczną wersją.
- Brak trafień: wpis w dzienniku i wniosek, co by zatrzymało atak (karencja, blokada skryptów, alarm o nowej paczce).

Więcej przykładów: `references/przyklady.md`.

## Checklista
- [ ] lockfile w repo, w CI instalacja „frozen”, diff lockfile przejrzany (nowe paczki przechodnie?)
- [ ] karencja nowych wersji w menedżerze pakietów i w Renovate/Dependabot; ścieżka wyjątków dla łatek
- [ ] skrypty instalacyjne wyłączone w CI lub z allowlisty
- [ ] publikacja przez OIDC z provenance, klasyczne tokeny unieważnione
- [ ] SBOM w CI, skan złośliwego kodu, akcje i obrazy narzędzi przypięte
- [ ] procedura „czy nas dotknęło” znana zespołowi
