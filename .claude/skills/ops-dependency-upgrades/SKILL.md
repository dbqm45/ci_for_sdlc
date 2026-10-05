---
name: ops-dependency-upgrades
description: Użyj, gdy człowiek prosi o podniesienie zależności — inwentarz, kolejność, codemody, testy, Renovate/Dependabot.
metadata:
  katalog: "Użyj, gdy człowiek prosi o podniesienie zależności, frameworka lub środowiska uruchomieniowego albo o ustawienie regularnych aktualizacji — inwentarz nieaktualnych wersji i końca wsparcia, priorytety, aktualizacje drobne zbiorczo i główne pojedynczo, jeden major naraz z przewodnikiem migracji, codemody (ng update, @next/codemod, React codemod, OpenRewrite, ruff UP), testy jako siatka bezpieczeństwa, konfiguracja Renovate i Dependabot (grupy, harmonogram, automerge, limit PR) i wycofanie. Nie do bezpieczeństwa łańcucha dostaw — karencja, skompromitowane paczki, provenance (ops-supply-chain-security) — ani dopasowania skilli do wersji projektu bez zmiany zależności (core-stack-sync)."
  slowa: "aktualizacja zależności, podnieść zależności, upgrade zależności, Renovate, Dependabot, ncu, uv lock --upgrade, OpenRewrite, codemod, koniec wsparcia, EOL, nieaktualne zależności"
---

# Planowe aktualizacje zależności

**Zależności podnosisz tylko na prośbę człowieka** (zasada fabryki). Agent przygotowuje plan, wykonuje go w gałęzi
i pokazuje dowody; scalenie i wdrożenie zatwierdza człowiek. Bezpieczeństwo paczek (karencja nowych wersji,
przejęte paczki, provenance) jest w ops-supply-chain-security i obowiązuje także tutaj.

## Procedura
1. **Inwentarz:**
   - co jest nieaktualne (polecenia niżej);
   - co **kończy wsparcie** — środowisko uruchomieniowe, framework, baza; sprawdzasz w oficjalnym harmonogramie
     wydań, z datą;
   - które wersje mają znane podatności (ops-supply-chain-security).
2. **Priorytety:**
   1. łatka krytycznej podatności w komponencie wystawionym na zewnątrz — szybka ścieżka;
   2. koniec wsparcia w najbliższych miesiącach;
   3. aktualizacja blokująca inną pracę;
   4. reszta regularnie, małymi porcjami.
   Dług aktualizacji rośnie nieliniowo: skok o trzy wersje główne kosztuje więcej niż trzy osobne skoki.
3. **Siatka bezpieczeństwa przed zmianą:**
   - zielony zestaw testów, build, lint i sprawdzanie typów na obecnych wersjach — zapisz wynik i liczbę ostrzeżeń
     o przestarzałych API;
   - słabe pokrycie krytycznych ścieżek → najpierw testy charakteryzujące (eng-behavior-preserving-refactoring).
4. **Drobne (patch, minor):**
   - zbiorczo i regularnie, np. raz w tygodniu jedna grupa;
   - po aktualizacji pełny zestaw testów;
   - automatyczne scalanie tylko przy zielonym CI, z karencją i za zgodą człowieka na tę regułę.
5. **Główne (major) — pojedynczo, jedna wersja główna naraz:**
   - najpierw najnowsza wersja **bieżącej** linii, która często ostrzega o tym, co zniknie (np. React 18.3 przed 19);
   - przeczytaj informacje o wydaniu i przewodnik migracji **każdej** wersji po drodze;
   - wymagania wstępne sprawdzasz osobno: Spring Boot 3 wymaga Javy 17+ i przestrzeni nazw `jakarta.*`,
     Next.js 16 — Node ≥20.9 i Reacta 19;
   - kolejność: środowisko (Node, JDK, Python) → framework → biblioteki zależne od frameworka → reszta;
   - Angular aktualizujesz `ng update` po jednej wersji głównej.
6. **Codemody zamiast ręcznych zmian**, potem przegląd diffu:

   | Technologia | Narzędzie |
   |---|---|
   | Angular | `ng update @angular/core@<N> @angular/cli@<N>` (angular.dev/update-guide); w Nx `nx migrate` |
   | Next.js | `npx @next/codemod upgrade major` (lub `minor`, `patch`, wersja); pojedyncze transformacje, np. `next-async-request-api` |
   | React | `npx codemod@latest react/19/migration-recipe`, typy: `npx types-react-codemod@latest preset-19 ./src` |
   | Java, Spring | OpenRewrite: `rewrite-maven-plugin` z przepisami `org.openrewrite.java.migrate.UpgradeToJava21`, `org.openrewrite.java.spring.boot3.UpgradeSpringBoot_3_5` (najpierw `rewrite:dryRun`) |
   | Python | `ruff check --select UP --fix` (składnia zgodna z `requires-python`) |

7. **Małe kroki w gałęzi:**
   - osobne commity: podbicie wersji i lockfile → wynik codemodu → poprawki ręczne;
   - po każdym kroku build i testy;
   - PR wymienia zmiany łamiące, wynik testów przed i po oraz to, czego nie sprawdzono.
8. **Wycofanie:**
   - przed scaleniem znany sposób powrotu: revert PR, poprzedni lockfile, poprzedni obraz;
   - przy dużym skoku (framework, środowisko, baza) wydanie stopniowe z obserwacją (ops-release-engineering);
   - migracja danych nieodwracalna → osobna decyzja człowieka.
9. **Po aktualizacji:**
   - `detect_stack.py` pokaże, czy skille fabryki opisują nową wersję (`SKILL_OUTDATED` → core-stack-sync);
   - biblioteka publikowana dalej, której podniesiono minimalną wersję środowiska → podbicie MAJOR (core-semver).

## Polecenia — co jest nieaktualne i jak podnieść
| Ekosystem | Lista nieaktualnych | Aktualizacja |
|---|---|---|
| npm | `npm outdated` | `npm update` (w ramach zakresów z `package.json`); poza zakres: `npx npm-check-updates -u --target minor` lub `latest`, potem `npm install` |
| pnpm | `pnpm outdated -r` | `pnpm up -r`, poza zakres: `pnpm up --latest --interactive` |
| uv | `uv tree --outdated` | jedna paczka: `uv lock --upgrade-package <nazwa>`, wszystko: `uv lock --upgrade`; potem `uv sync` |
| pip | `pip list --outdated` | zmiana w pliku wymagań i ponowna instalacja w czystym środowisku |
| Maven | `mvn versions:display-dependency-updates`, `…:display-plugin-updates` | zmiana wersji w `pom.xml` (lub `versions:use-latest-releases` z przeglądem diffu) |
| Gradle | wtyczka `com.github.ben-manes.versions`: `./gradlew dependencyUpdates` | zmiana w katalogu wersji (`libs.versions.toml`) |

## Automatyzacja: Renovate i Dependabot
- **Grupy:** drobne aktualizacje razem (np. wszystkie patch i minor deweloperskie w jednym PR), główne osobno.
- **Harmonogram:** okno raz w tygodniu, a nie strumień PR przez cały dzień.
- **Limit otwartych PR:** zespół nadąża z przeglądem.
- **Karencja nowych wersji:** Renovate `minimumReleaseAge`, Dependabot `cooldown` (na github.com Dependabot ma
  domyślnie 3 dni karencji dla aktualizacji wersji); łatki bezpieczeństwa idą bez karencji, ścieżką wyjątków.
- **Automatyczne scalanie:** tylko patch/minor, tylko przy zielonym CI, nigdy dla major.
- **Utrzymanie lockfile** (Renovate `lockFileMaintenance`): okresowe odświeżenie zależności przechodnich.
- Przykładowe, sprawdzone konfiguracje: `references/konfiguracje.md`.

## Checklista
- [ ] prośba człowieka o aktualizację; inwentarz z datami końca wsparcia ze źródła
- [ ] stan „przed”: testy, build, typy, liczba ostrzeżeń o przestarzałych API
- [ ] jedna wersja główna naraz; przewodnik migracji każdej wersji przeczytany; codemody przed ręcznymi zmianami
- [ ] osobne commity: wersje → codemod → poprawki; testy po każdym kroku
- [ ] PR ze zmianami łamiącymi, wynikiem przed i po oraz planem wycofania
- [ ] karencja i ścieżka wyjątków dla łatek bezpieczeństwa (ops-supply-chain-security)

## Źródła
- docs.renovatebot.com (configuration-options, presets) — Renovate 44, konfiguracja sprawdzona `renovate-config-validator`
- docs.github.com: Dependabot options reference (`groups`, `cooldown`, `schedule`, ekosystem `uv`)
- docs.npmjs.com (`npm update`, `npm outdated`), pnpm.io (`pnpm update`, `pnpm outdated`), uv CLI 0.12 (`uv lock --upgrade-package`, `uv tree --outdated`)
- angular.dev/update-guide i /reference/releases; nextjs.org/docs (codemods); react.dev (React 19 Upgrade Guide);
  docs.openrewrite.org (rewrite-migrate-java, rewrite-spring); nodejs.org — harmonogram wydań (github.com/nodejs/Release)
Dostęp 2026-10-03. Opisane własnymi słowami.
