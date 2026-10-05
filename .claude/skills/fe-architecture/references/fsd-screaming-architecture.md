# Feature-Sliced Design, Screaming Architecture, stan i tooling

> **Spis treści:** Feature-Sliced Design (FSD) · Screaming Architecture · Komponenty w praktyce · Zarządzanie stanem — trzy rodzaje, trzy narzędzia · Tooling wspierający tę architekturę (stan 2026) · CMS w architekturze frontendu (headless CMS, np. Contentful) · Rekomendacje

Źródło: Mykhailo Hrynkevych, „Frontend Architecture” (syntetyzuje dokumentację Feature-Sliced Design, Khalila
Stemmlera, Ivana Ojiego Garcię, Contentful, roadmap.sh) — uzupełnione o stan FSD 2.x i ekosystemu 2026.
Modele renderowania (SPA/SSR/SSG/ISR/RSC) są w `rendering-models.md`.

## Feature-Sliced Design (FSD)

Metodologia organizująca kod po **biznesowych funkcjach**, nie po typach technicznych („wszystko o koszyku w
jednym miejscu”, a nie „wszystkie hooki w jednym folderze”). Niezależna od frameworka — działa w React, Vue,
Angular, Svelte.

**Warstwy (od góry; FSD 2.x):**
```
app/       → powłoka: bootstrap, providery, routing, globalne style
pages/     → widoki tras (kompozycja widgetów/funkcji dla jednego URL)
widgets/   → duże, samodzielne bloki UI (nagłówek, panel boczny) składane z features/entities
features/  → akcje użytkownika dające wartość (login, dodaj-do-koszyka)
entities/  → pojęcia biznesowe (User, Product) — model + UI encji
shared/    → kod bez wiedzy o domenie: UI kit, api client, lib, config
```
Warstwa `processes/` z FSD 1.x jest przestarzała (przepływy międzystronicowe → `app/` lub `features/`).
Źródło pomijało `widgets/` — to pełny zestaw.

**Reguły importów (sedno FSD):**
- Warstwa importuje **tylko z warstw niższych** (`features` → `entities`, `shared`; nigdy odwrotnie).
- Slice'y tej samej warstwy **nie importują siebie nawzajem** (`features/cart` ↛ `features/auth`); wspólne
  rzeczy schodzą niżej albo są składane wyżej (widget/strona).
- Każdy slice wystawia **publiczne API** (`index.ts`) — reszta to szczegół implementacji
  (fundamentals/barrel-export.md). Wymuszaj lintem (`eslint-plugin-boundaries`, Steiger — linter FSD, Nx
  `enforce-module-boundaries` — tool-nx).
- Segmenty wewnątrz slice'a nazwane po celu: `ui/`, `model/`, `api/`, `lib/`, `config/`.

**Korzyści:** wyraźna ścieżka skalowania dla rosnących zespołów; jawne granice (wiadomo, gdzie szukać i co
dodać); mniej konfliktów przy scalaniu i mniejsze obciążenie poznawcze przy dużym kodzie.

**Kiedy nie:** mała aplikacja z kilkoma ekranami — wystarczy prostszy podział feature-first
(`app/`, `features/<x>/`, `shared/` — hub SKILL.md). FSD wprowadzaj, gdy granice zaczynają się rozmywać.

## Screaming Architecture

Koncepcja Roberta C. Martina: struktura folderów ma „krzyczeć” o domenie biznesowej, nie o stosie technicznym.

**Źle (struktura mówi „to projekt React”, nie mówi nic o produkcie):**
```
/components
/pages
/hooks
```

**Dobrze (struktura mówi, co produkt robi):**
```
/billing
/checkout
/auth
```

**Korzyści:** lepsza odkrywalność (nowa osoba widzi domenę, nie technologię), szybszy onboarding, zgodność
struktury kodu z celami produktowymi zamiast z wyborem biblioteki.

**Związek z FSD:** Screaming Architecture to zasada („nazywaj po domenie”), FSD — rozpisana struktura warstw, która
ją realizuje (`features/`, `entities/` to domena). Nazwy slice'ów bierz z języka wszechobecnego (ddd-tactical-design).

## Komponenty w praktyce

- **Komponent „inteligentny” vs prezentacyjny** — inteligentny zna dane/logikę i przekazuje je w dół; prezentacyjny
  tylko renderuje wejścia (components/presentational-vs-container.md). Dziś rolę kontenera często pełni hook /
  composable / serwis (Angular) albo loader trasy.
- **Kolokacja** — logika, style i testy obok komponentu, który z nich korzysta, a nie w globalnych `/hooks`,
  `/styles` (to samo uzasadnienie co Screaming Architecture).
- **Organizacja modułowa** po domenie (`/auth`, `/cart`, `/product`), nie po typie technicznym (`/components`,
  `/reducers`, `/services`).

## Zarządzanie stanem — trzy rodzaje, trzy narzędzia

Stan to zachowanie aplikacji — projektuj go równie świadomie jak strukturę folderów.

| Rodzaj | Opis | React | Vue | Angular (fw-angular) |
|---|---|---|---|---|
| Lokalny UI | żyje w jednym komponencie | `useState`, `useReducer` | `ref`, `reactive` | `signal`, `computed` |
| Stan serwera (async) | dane z API z cyklem loading/error/stale | TanStack Query, SWR, loadery routera, RSC | TanStack Query (Vue), Pinia Colada | `httpResource`/`resource`, TanStack Query (Angular) |
| Globalny klienta | współdzielony między niezwiązanymi częściami | Zustand, Redux Toolkit, Jotai | Pinia | serwis z signals, NgRx Signal Store |

Do tego **stan w URL** (filtry, paginacja, zakładki) — linkowalny i odporny na odświeżenie.

**Częsty błąd:** trzymanie danych z API w globalnym store razem ze stanem UI — miesza dwa cykle życia
(cache/odświeżanie/retry vs proste flagi) i kończy się ręcznym reimplementowaniem biblioteki stanu serwera.

## Tooling wspierający tę architekturę (stan 2026)

- **Meta-frameworki**: Next.js (App Router, RSC, Server Actions), React Router 7 (tryb frameworka, dawny Remix),
  Nuxt (Vue), SvelteKit, Angular SSR (`@angular/ssr`, hybrydowe renderowanie per trasa) — routing plikowy lub
  deklaratywny, kolokacja ładowania danych, SSR/SSG per trasa.
- **Monorepo**: Nx (granice modułów, graf zależności, zadania z cache — tool-nx), Turborepo (cache zadań, remote
  cache) — przydatne szczególnie dla wielu aplikacji i micro-frontendów (architecture-styles.md).
- **Stan serwera**: TanStack Query (React/Vue/Solid/Angular) — zastępuje ręczne `fetch` + efekt + własny cache.
- **Stan globalny**: Zustand, Jotai, Redux Toolkit (React); Pinia (Vue); NgRx Signal Store (Angular).
  Recoil jest zarchiwizowany (2025) — nie wybieraj go do nowych projektów.
- **UI**: Tailwind CSS (v4, konfiguracja w CSS) + biblioteki komponentów headless/kopiowanych (shadcn/ui, Radix,
  Angular CDK/Aria) — spójność UI bez pisania design systemu od zera (fe-css).

## CMS w architekturze frontendu (headless CMS, np. Contentful)

**Korzyści:** oddzielenie treści od kodu (redakcja zmienia treść bez wdrożenia); modele treści dające strukturę
dynamicznym widokom; integracja przez GraphQL lub REST.

**Wpływ na architekturę:** zespół treści pracuje niezależnie od inżynierów; treść zmienia się rzadziej niż kod,
więc pasuje do SSG/ISR i cache na CDN (rendering-models.md) zamiast renderowania przy każdym żądaniu.

## Rekomendacje

1. **„Think in features, not files”** — myśl funkcjami biznesowymi, nie typami plików.
2. **FSD i Screaming Architecture** jako konkretne realizacje powyższego — w skali proporcjonalnej do projektu.
3. **Tooling wspiera, nie zastępuje struktury** — dobre narzędzie na złej architekturze jej nie naprawi.
4. **Architektura służy dwóm stronom** — deweloperom (utrzymywalność, onboarding) i użytkownikom (wydajność,
   dostępność, odporność).
