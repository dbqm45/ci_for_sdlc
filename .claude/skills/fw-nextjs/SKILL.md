---
name: fw-nextjs
description: Użyj przy kodzie Next.js 14–16.3 (App Router) — Server Components, Server Actions i autoryzacja, cache, proxy.ts, migracja.
metadata:
  katalog: "Użyj przy kodzie Next.js (14–16.3, App Router) — podział Server/Client Components, pobieranie danych na serwerze, Server Actions (autoryzacja w każdej akcji, odświeżanie przez updateTag/revalidatePath/refresh), cache i Cache Components ('use cache', cacheLife, cacheTag), proxy.ts (dawniej middleware), Route Handlers, zmienne środowiskowe, strumieniowanie i obsługa błędów, testy, migracja 15→16 i łatki bezpieczeństwa — oraz przy decyzji, gdzie w aplikacji Next.js umieścić pojęcia domenowe. Nie do samego Reacta bez frameworka (fw-react), projektu API HTTP (be-api-design) ani uwierzytelniania w ogóle (be-auth-security)."
  slowa: "Next.js, Next, App Router, Server Action, server action, use server, use client, use cache, cacheComponents, revalidatePath, revalidateTag, updateTag, middleware.ts, proxy.ts, route.ts, page.tsx, layout.tsx, next.config"
---

# Next.js (App Router)

**Najpierw sprawdź wersję** (`detect_stack.py` / `package.json`) i to, czy projekt ma `cacheComponents: true`
w `next.config`. Reguły Reacta (czystość, stan, efekty) są w fw-react; tu tylko to, co dokłada Next.js.

## Zasady
1. **Server Components domyślnie.** `'use client'` stawiasz tak nisko w drzewie, jak się da (liść z interakcją).
   - Props z serwera do klienta muszą być serializowalne: dane, JSX, promisy, Server Functions — nie klasy ani zwykłe funkcje.
   - Kod tylko serwerowy (klucze, dostęp do bazy) oznacz `import 'server-only'`.
2. **Dane pobierasz na serwerze**, w komponencie lub warstwie dostępu do danych (DAL):
   - DAL sprawdza uprawnienia i zwraca minimalne DTO, nie rekordy z bazy;
   - wolne części owijasz w `<Suspense>` albo `loading.tsx`, żeby strona strumieniowała;
   - niezależne zapytania uruchamiasz równolegle (`Promise.all`), bez kaskady `await`.
3. **Server Action to publiczny endpoint POST.** Każdy może ją wywołać bezpośrednio, z pominięciem strony i layoutu.
   - **W każdej akcji** sprawdzasz sesję, uprawnienie do konkretnego zasobu (właściciel — inaczej IDOR) i waliduje
     wejście (np. Zod). Sprawdzenie w `layout.tsx` lub na stronie nie chroni akcji.
   - Akcje służą do mutacji, nie do odczytu danych.
   - Odrzucenie biznesowe zwracasz jako stan dla `useActionState`; wyjątek tylko dla błędów nieoczekiwanych.
   - Po mutacji odświeżasz dane:
     - `updateTag(tag)` — natychmiast, z odczytem własnego zapisu (16+, tylko w akcji);
     - `revalidateTag(tag, 'max')` — w tle, stale-while-revalidate;
     - `revalidatePath(path)`;
     - `refresh()` — dane niecache'owane i router klienta (16+);
     - potem ewentualnie `redirect()`.
4. **Wywołania wymagające żądania są asynchroniczne** (15+, w 16 bez wersji synchronicznej): `await params`,
   `await searchParams`, `await cookies()`, `await headers()`, `await draftMode()`. Typy stron generuje `next typegen`
   (`PageProps<'/products/[id]'>`).
5. **Cache:**
   - od 15 `fetch`, Route Handlers GET i nawigacje klienta **nie** są cache'owane domyślnie;
   - z **Cache Components** (16, `cacheComponents: true`) cache włączasz jawnie dyrektywą **`'use cache'`** (plik,
     komponent lub funkcja) z `cacheLife('hours')` i **`cacheTag('products')`**; dane zależne od żądania czytasz poza
     funkcją cache'owaną albo w `<Suspense>` (`'use cache: private'` dla danych użytkownika);
   - częściowy prerender jest wtedy domyślny: statyczna powłoka plus strumieniowane części dynamiczne;
   - bez Cache Components obowiązuje stary model (`fetch` z `next: { revalidate, tags }`, `export const revalidate`).
6. **`proxy.ts` (16)** zastępuje `middleware.ts`; działa na Node.js. Używasz go do przekierowań i nagłówków, nie jako
   jedynej autoryzacji: luka CVE-2025-29927 pozwalała go ominąć. Uprawnienia sprawdzasz też w DAL i w akcjach.
7. **Zmienne środowiskowe:** tylko `NEXT_PUBLIC_*` trafiają do przeglądarki i są wpisywane przy `next build`
   (zmiana wymaga przebudowy). Sekretów nie prefiksujesz.
8. **Pliki trasy:**
   - `page`, `layout`, `loading`, `error` (komponent kliencki z `reset`), `not-found`;
   - `route.ts` nie może leżeć obok `page` w tym samym segmencie;
   - równoległe trasy (`@slot`) wymagają `default.tsx` (16);
   - metadane przez `generateMetadata`, ścieżki statyczne przez `generateStaticParams`.
9. **Testy:**
   - logika domeny i komponenty synchroniczne — Vitest lub Jest z Testing Library (tool-vitest, tool-jest);
   - **asynchroniczne Server Components** — testy e2e (tool-playwright), bo Vitest ich nie renderuje;
   - Server Actions testujesz jako funkcje: brak sesji, cudzy zasób i złe wejście dają odrzucenie.
10. **Aktualizacje i bezpieczeństwo:**
    - aktualizujesz codemodami: `npx @next/codemod@canary upgrade latest` (od 16.1 także `next upgrade`);
    - w 2025–2026 było kilka krytycznych łatek, m.in. RCE w protokole RSC (CVE-2025-66478 / React CVE-2025-55182);
    - projekt powinien mieć najnowszą łatkę swojej linii (16.3.x; 15.5.x to linia utrzymaniowa);
    - starszą wersję zgłaszasz człowiekowi i sam jej nie podnosisz (core-stack-sync).

Przykłady (DAL z `server-only`, Server Action z autoryzacją i `updateTag`, `'use cache'` z `cacheTag`, `proxy.ts`,
strona z `await params`) i odpowiedniki dla 14/15: `references/wzorce.md`.

## Pojęcia domenowe w Next.js — gdzie co mieszka
| Pojęcie (słownik) | Miejsce w aplikacji Next.js |
|---|---|
| **obiekt wartości** | czysty TS w `domain/` (lang-typescript), używany po obu stronach; przez granicę serwer→klient przechodzi jako zwykłe dane i jest odtwarzany fabryką |
| **encja** | typ domenowy w `domain/`; Server Component dostaje ją z DAL i przekazuje dalej jako DTO |
| **warianty** | unia dyskryminowana; `switch` po `kind` w komponencie albo osobne komponenty wariantów |
| **wynik operacji** | wartość zwracana przez Server Action (`{ ok: true } \| { ok: false, reason }`) i czytana przez `useActionState` |
| **agregat** | na serwerze: moduł w `domain/` ładowany i zapisywany przez repozytorium w akcji lub Route Handlerze, w jednej transakcji; nigdy w komponencie klienckim |
| **maszyna stanów** | metody agregatu po stronie serwera; w UI `useReducer` tylko dla stanu interakcji |
| **zdarzenie** | zdarzenie domenowe z agregatu publikowane po zapisie (outbox — be-messaging-outbox); w UI unieważnienie cache przez `updateTag`/`revalidateTag` |
| **polityka** | czysta funkcja w `domain/`, wywoływana w akcji; konfiguracja z serwerowych zmiennych środowiskowych |
| **specyfikacja / reguły** | czyste funkcje w `domain/`: te same w walidacji formularza na kliencie i w akcji na serwerze (serwer decyduje) |
| **repozytorium / port** | interfejs w `domain/`, implementacja w `lib/db` z `import 'server-only'`; DAL nad nim sprawdza uprawnienia |
| **read model** | funkcja odczytu w DAL, cache'owana `'use cache'` + `cacheTag`; strony tylko czytają |
| **moduł** | katalog funkcji (`features/<nazwa>/` z `domain/`, `server/`, `ui/`) i grupa tras `app/(nazwa)/`; `domain/` bez importów z `next/*` i `react` |

## Zależne od wersji
| Wersja | Zmiany istotne dla tego skilla |
|---|---|
| 14 | App Router stabilny, Server Actions stabilne (14.0); `fetch` cache'owany domyślnie; synchroniczne `params`/`cookies()` |
| 15 | React 19; **asynchroniczne** `params`, `searchParams`, `cookies()`, `headers()`, `draftMode()` (z ostrzeżeniem przy dostępie synchronicznym); `fetch`, GET Route Handlers i nawigacje klienta bez cache domyślnie; `next/form`; `instrumentation.js` stabilny; 15.5: middleware na Node.js stabilny, `typedRoutes`, `next typegen`, `next lint` wycofywany. Linia 15.5.x utrzymaniowa |
| 16.0 | **Turbopack domyślny** (dev i build; `--webpack` jako wyjście); **`proxy.ts` zamiast `middleware.ts`** (Node.js); **Cache Components** (`cacheComponents`, `'use cache'`, stabilne `cacheLife`/`cacheTag`); `revalidateTag(tag, profil)` wymaga drugiego argumentu; nowe `updateTag()` i `refresh()`; **usunięty dostęp synchroniczny** do `params`/`cookies()` itd.; usunięte `next lint`, `experimental.ppr`, AMP, `serverRuntimeConfig`/`publicRuntimeConfig`; `default.tsx` wymagany dla slotów; `reactCompiler` stabilny (wyłączony domyślnie); Node ≥20.9, TS ≥5.1 |
| 16.1 | cache Turbopacka na dysku w `next dev` domyślnie; `next upgrade` |
| 16.2 | adaptery wdrożeniowe stabilne; szybszy start dev |
| 16.3 | cache na dysku także dla `next build`; sprawdzanie typów z TypeScript 7; `catchError` z `next/error`; `next/root-params`; natychmiastowe nawigacje (`partialPrefetching` z Cache Components) |

Migracja 15 → 16: `npx @next/codemod@canary upgrade latest`, a w razie potrzeby osobno
`npx @next/codemod@canary next-async-request-api .`, `middleware-to-proxy` i `next-lint-to-eslint-cli .`. Potem
`next build`, testy i przegląd `revalidateTag` (drugi argument). Odpowiedniki dla 14/15 są w `references/wzorce.md`.

## Checklista
- [ ] wersja Next.js i `cacheComponents` sprawdzone; użyte API dostępne w tej wersji
- [ ] każda Server Action sprawdza sesję, właściciela zasobu i wejście; test na brak uprawnień
- [ ] kod serwerowy z `server-only`; brak sekretów w `NEXT_PUBLIC_*`
- [ ] `'use client'` tylko w liściach z interakcją; dane pobierane na serwerze
- [ ] po mutacji jawne odświeżenie (`updateTag` / `revalidatePath` / `refresh`)
- [ ] wersja z najnowszą łatką bezpieczeństwa swojej linii albo zgłoszenie dla człowieka

## Źródła
- nextjs.org/docs (App Router: getting-started, guides/data-security, guides/environment-variables, guides/testing,
  getting-started/caching, guides/upgrading/version-16) — dostęp 2026-10-03, dokumentacja w wersji 16.3.8
- nextjs.org/blog: Next.js 15 (2024-10-21), 15.5 (2025-08-18), 16 (2025-10-21), 16.1, 16.2, 16.3 (2026-08-03),
  CVE-2025-66478, aktualizacja bezpieczeństwa 2025-12-11, wydania bezpieczeństwa wrzesień 2026; nextjs.org/support-policy
- GitHub Security Advisory GHSA-f82v-jwr5-mffw (CVE-2025-29927); rejestr npm: `next` 16.3.8 (2026-09-30), engines `node >=20.9.0`
