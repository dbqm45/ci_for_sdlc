# Staff / Senior Staff Frontend Engineer

> **Spis treści:** Architektura na skalę wielu zespołów · Developer Experience (DevEx) · Standardy obowiązujące całą organizację · Komunikacja biznesowa i ROI · Podsumowanie — czym różni się Staff od Principal

Poziom: odpowiedzialność wykracza poza jedno repo/jeden zespół — decyzje wpływają na **wiele zespołów albo
całą domenę frontendową firmy**. Soczewka: **wiele zespołów, jedna organizacja**.

## Architektura na skalę wielu zespołów

**Micro-frontends** — definicja, warianty integracji i kompromisy: fe-architecture
(`.claude/skills/fe-architecture/references/architecture-styles.md`); granice zespołów: proc-team-topologies. Na poziomie Staff istotne jest dodatkowo:
- **Kontraktowanie granic między zespołami** — micro-frontends rozwiązują problem organizacyjny
  (niezależne wdrożenia wielu zespołów) kosztem problemu technicznego (współdzielony runtime, duplikacja
  zależności, konsystencja UX) — decyzja o wdrożeniu tego stylu jest w praktyce decyzją **organizacyjną**
  (Conwayowskie odwzorowanie struktury zespołów na strukturę systemu), nie czysto techniczną; Staff musi
  umieć tę decyzję uzasadnić biznesowo, nie tylko technicznie (patrz „Komunikacja biznesowa” niżej).
- **Koszt utrzymania** — każda dodatkowa granica (repo, deployment, wersja frameworka) to koszt na zawsze,
  nie jednorazowy — decyzja o rozbiciu monolitu na micro-frontends powinna mieć jasno nazwany próg bólu
  (np. „czas wdrożenia jednego zespołu blokowany przez inny”), którego rozwiązanie uzasadnia ten koszt.

### Design Systems

Współdzielona biblioteka komponentów UI, tokenów projektowych (kolory, spacing, typografia) i wzorców
interakcji, używana przez wiele zespołów/aplikacji w organizacji — techniczna realizacja konsystencji
marki i UX na skalę firmy.

- **Design tokens** — najniższy poziom abstrakcji: wartości (`color.primary.500`, `spacing.md`) oddzielone
  od tego, **gdzie** są używane, zwykle jako źródło prawdy generujące CSS custom properties / zmienne
  Sass / obiekty JS dla wielu platform (web, mobile) z jednego miejsca — zmiana marki (rebranding) staje
  się zmianą wartości tokenów, nie przeszukiwaniem kodu każdej aplikacji.
- **Poziomy komponentów** (terminologia zbliżona do Atomic Design, używana pragmatycznie, nie dogmatycznie):
  prymitywy (Button, Input) → komponenty złożone (Card, Modal, złożone Form) → wzorce/szablony stron.
  Design System zwykle odpowiada tylko za dwa pierwsze poziomy — szablony stron zostają odpowiedzialnością
  zespołu produktowego (patrz Feature-Sliced Design — fe-architecture `.claude/skills/fe-architecture/references/fsd-screaming-architecture.md`).
- **Governance** — kto może dodać/zmienić komponent w Design Systemie i jak zespoły produktowe zgłaszają
  potrzebę nowego komponentu/wariantu, to w praktyce ten sam model **tight-loose** opisany w `devex.md` —
  API i wygląd komponentu bazowego to zwykle „tight” (wspólny standard), sposób jego użycia w konkretnym
  widoku zostaje „loose” (decyzja zespołu produktowego).
- **Ryzyko: Design System jako wąskie gardło** — jeśli jedyny zespół mogący zmieniać komponent staje się
  centralnym punktem kolejki dla wszystkich innych zespołów, System zaczyna szkodzić tempu, które miał
  poprawić — częste rozwiązania: model współwłasności (kontrybucje zespołów produktowych z review
  centralnego zespołu), jasny SLA na review kontrybucji, albo rozbicie na warstwy (core niezmieniany
  szeroko + warstwa kompozycyjna, którą zespoły produktowe mogą swobodnie rozszerzać).
- **Techniczna strona tokenów i stylów** (warstwy `@layer`, motywy, izolacja) — fe-css; dostępność komponentów
  (WCAG AA jako „definition of done”) — fe-web-platform.
- **Dokumentacja i „living style guide”** — Design System bez żywej, zawsze aktualnej dokumentacji
  (Storybook lub odpowiednik) w praktyce nie jest używany — zespoły produktowe kopiują kod ze starszych
  miejsc w kodzie zamiast sięgać po System, bo nie wiedzą, co jest dostępne.

### Wewnętrzne frameworki i toolingi

Na poziomie Staff decyzja o standaryzacji toolingu (bundler, framework testowy, monorepo tooling) dla wielu
zespołów naraz ma inny profil ryzyka niż wybór w jednym repo — błąd jest **mnożony** przez liczbę zespołów,
które muszą go później migrować.

- **Vite** — dev server na natywnych modułach ESM (bez bundlowania całej aplikacji na starcie — szybki start
  niezależnie od rozmiaru projektu); od Vite 8 do budowania produkcyjnego używa **Rolldown** (Rust) zamiast
  Rollup + esbuild. Domyślny wybór dla nowych projektów (także Angular CLI buduje przez esbuild/Vite), głównie dzięki
  szybkości pętli deweloperskiej (koszt DevEx — `devex.md`, „flow efficiency”).
- **Nx** — monorepo z grafem zależności, granicami modułów (lint), generatorami, cache i remote cache — tool-nx.
- **Turborepo** — narzędzie do zarządzania monorepo z **cache'owaniem zadań** (build/test/lint) — zadanie
  ponownie uruchamiane tylko, gdy zmieniły się jego realne wejścia (kod, zależności), z możliwością
  cache'u współdzielonego przez zespół/CI (remote cache), nie tylko lokalnie. Kluczowe dla monorepo z wielu
  zespołów, bo bez tego czas CI rośnie liniowo z liczbą pakietów, nawet gdy zmienił się tylko jeden.
- **Rspack** — bundler kompatybilny z ekosystemem/API Webpacka, ale napisany w Rust — pozycjonowany jako
  droga migracji dla dużych, istniejących projektów na Webpacku, które chcą zysku prędkości bez przepisania
  konfiguracji od zera (w przeciwieństwie do przejścia na Vite, które zwykle wymaga innego modelu
  konfiguracji).
- **Reguła wyboru na poziomie Staff:** koszt migracji istniejących zespołów na nowy tooling musi być
  jawnie policzony i skomunikowany **przed** decyzją, nie odkryty po fakcie — to jest bezpośrednie
  zastosowanie zasady DevEx „zdiagnozuj tarcie przed wyborem narzędzia” (`devex.md`) na poziomie
  infrastruktury, nie procesu.

### Redukcja długu technicznego na skalę wielu zespołów

Dług techniczny na poziomie Staff to zwykle nie „ten jeden plik trzeba zrefaktoryzować”, a **systemowy
wzorzec** powtarzający się w wielu repo (przestarzała wersja frameworka używana przez 10 zespołów, brak
wspólnego standardu testowania). Podejścia praktyczne:
- **Strangler fig** (wzorzec migracyjny; bezpieczny refaktor — eng-behavior-preserving-refactoring) — stopniowe zastępowanie starego
  systemu nowym przy zachowaniu działania całości, zamiast big-bang rewrite.
- **Budżet na dług techniczny** jako jawna, negocjowana część capacity zespołu (np. 20% sprintu), nie
  zadanie robione „gdy jest czas” (które w praktyce nigdy nie nadchodzi).
- **Automatyzacja migracji** (codemody, skrypty transformujące AST) dla zmian powtarzalnych w wielu repo —
  na skalę wielu zespołów ręczna migracja repo-po-repo nie skaluje się czasowo.

## Developer Experience (DevEx)

Pełna treść w `devex.md` (tego skilla) — definicja, metryki FLOW/DORA, antywzorce, 9 praktyk poprawy, model
AI-readiness, plan wdrożenia. Na poziomie Staff to zwykle pierwszy poziom z realnym mandatem do
**wdrażania** zmian DevEx dla wielu zespołów (nie tylko zgłaszania bólu we własnym).

## Standardy obowiązujące całą organizację

### Dostępność (WCAG)

Poziomy A/AA/AAA, WCAG 2.2 i wymogi prawne (European Accessibility Act od 06.2025, ADA) — fe-web-platform
(`.claude/skills/fe-web-platform/references/accessibility/wcag-levels.md`); wzorce — tamże, `accessibility/`. Na poziomie Staff chodzi o
**standard organizacji**: **AA jako domyślny wymóg** każdego nowego komponentu design systemu i „definition of
done” funkcji (nie cel aspiracyjny), lint a11y i testy automatyczne w CI każdego repo, okresowe testy manualne z
czytnikiem ekranu, AAA selektywnie na krytycznych ścieżkach (płatność, bezpieczeństwo).

### Bezpieczeństwo na poziomie organizacji: XSS, CSRF, CSP

Definicje i wzorce implementacyjne — fe-architecture (`references/security/`), strona serwerowa — be-auth-security.
Na poziomie Staff kluczowe jest **wymuszenie praktyk jako standardu wielu zespołów**, nie tylko ich znajomość:

- **XSS** (reflected, stored, DOM-based): zakaz `innerHTML`/`dangerouslySetInnerHTML`/`bypassSecurityTrust*` z
  niesanityzowanymi danymi wymuszony **regułą lint w każdym repo** (i Trusted Types, gdzie to możliwe), jeden
  zatwierdzony sanitizer dla całej organizacji. Treść od modeli AI traktowana jak dane od użytkownika.
- **CSRF**: wspólny klient HTTP dodający token, `SameSite` + prefiks `__Host-` na ciasteczkach sesji, sprawdzanie
  Fetch Metadata po stronie serwera — jeden standard zamiast rozwiązań per zespół.
- **CSP**: wdrażana etapami — najpierw `Content-Security-Policy-Report-Only` ze zbieraniem raportów, potem
  wymuszanie; docelowo strict CSP (nonce + `strict-dynamic`). Bez etapu report-only ryzykujesz zepsucie produkcji
  przez nieprzewidziane, legalne źródło.
- Zależności: SCA/aktualizacje (Renovate/Dependabot) i SRI dla zasobów z obcych CDN jako polityka, nie inicjatywa.

### i18n (internacjonalizacja)

Techniczne zasady (ICU, liczba mnoga, `Intl`, RTL) — fe-web-platform (`.claude/skills/fe-web-platform/references/i18n.md`). Decyzja Staff:
**jedna biblioteka i format komunikatów dla wszystkich aplikacji**, wspólny proces tłumaczeń (TMS, klucze z
kontekstem dla tłumacza), pseudolokalizacja w CI; i18n planowana jako praca architektoniczna od początku, bo
retrofit w wielu repo kosztuje wielokrotnie więcej.

## Komunikacja biznesowa i ROI

Na poziomie Staff decyzje techniczne (przebudowa architektury, migracja frameworka, inwestycja w Design
System) muszą być **uzasadnione komuś, kto nie czyta kodu** — zwykle produktowo/biznesowo. Praktyczne
zasady:

- **Tłumacz koszt techniczny na metrykę, którą biznes już śledzi** — nie „ten kod jest brzydki”, ale „ten
  dług techniczny wydłuża lead time nowych funkcji o X dni/sprint” (patrz metryki DORA/FLOW w `devex.md`) —
  to jest wspólny język, w którym decyzja staje się policzalna, nie subiektywna.
- **ROI inwestycji technicznej** — dla dużej inwestycji (migracja, nowy Design System, refaktor) podaj:
  koszt (osobo-czas, ryzyko przerwy w delivery w trakcie), oczekiwaną korzyść (mierzalna — szybszy
  deployment, mniej incydentów, krótszy onboarding), i **horyzont czasowy zwrotu** — decyzja bez tych
  trzech elementów jest trudna do porównania z alternatywnym użyciem tego samego budżetu czasu zespołu.
- **Nie każda decyzja techniczna wymaga uzasadnienia biznesowego** — rozróżnienie z modelu tight-loose
  (`devex.md`): decyzje w ramach „loose” (styl kodu, wybór biblioteki lokalnej dla jednego zespołu) nie
  wymagają eskalacji biznesowej; decyzje „tight” (wpływające na wiele zespołów/budżet/harmonogram) wymagają
  — umiejętność rozpoznania, która decyzja jest którą, jest sama częścią kompetencji Staff.

## Podsumowanie — czym różni się Staff od Principal

Staff działa **w granicach jednej organizacji/firmy**, choć wpływa na wiele zespołów. Gdy horyzont decyzji
wykracza poza jedną firmę (wpływ na standardy branżowe, platformy na skalę milionów zewnętrznych
użytkowników, pozycjonowanie technologiczne firmy na rynku) — to już soczewka Principal, patrz
`principal.md`.
