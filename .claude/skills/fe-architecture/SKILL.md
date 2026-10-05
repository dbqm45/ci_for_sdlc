---
name: fe-architecture
description: Użyj przy strukturze frontendu w dowolnym frameworku — stan i dane, granice komponentów, SSR/RSC, wydajność, odporność.
metadata:
  katalog: "Użyj przy decyzjach o strukturze frontendu (każdy framework) — styl architektury, FSD/feature folders, stan i warstwa danych, granice komponentów, renderowanie (SSR/RSC), wydajność, odporność (błędy, ładowanie, retry), routing, bezpieczeństwo klienta (CSP, CSRF, tokeny), testy komponentów, UI czatu AI. Nie do stylów (fe-css), API przeglądarki i a11y (fe-web-platform) ani składni (lang-*, fw-*)."
  slowa: "architektura frontendu, SPA, ponawianie żądań, retry w przeglądarce, odporność frontendu, stan aplikacji, zarządzanie stanem, warstwa danych frontu, podatność we frameworku frontendowym, czy to problem tylko frontendu, Server Components, mikrofrontendy, routing"
---

# Architektura frontendu

Zasady są niezależne od frameworka; przykłady w references są często w React („przykład w React”) — idiomy
Angulara bierz z fw-angular, języka z lang-*. Najpierw nazwij problem (skala zespołu, wydajność, odporność,
bezpieczeństwo), potem dobierz wzorzec — nie odwrotnie.

## Struktura (feature-first)
```
src/
  app/            # bootstrap, routing, providery
  features/<x>/   # wszystko dla jednej funkcji: ui, model/stan, api, testy
  shared/         # UI kit, utils, klient API — bez wiedzy o domenie
```
- Funkcja nie importuje z innej bezpośrednio — tylko przez jej publiczne API (`index.ts`); `shared/` nie importuje z `features/`.
- Nazwy folderów z języka domeny (Screaming Architecture). Przy wielu zespołach/granicach → pełne FSD
  (`app/pages/widgets/features/entities/shared`, importy tylko w dół) wymuszane lintem.

## Stan — najniższy wystarczający poziom
1. Lokalny stan komponentu (React `useState`, Vue `ref`, Angular `signal`).
2. Stan w URL (filtry, paginacja, zakładki) — linkowalny, odporny na odświeżenie.
3. Stan serwera → warstwa z cache (TanStack Query, loadery routera, Angular `httpResource`). Nie kopiuj danych z API do globalnego store'a.
4. Globalny store — tylko prawdziwie globalny stan klienta (sesja UI, preferencje).

## Komponenty i dane
- Prezentacja (wejścia → UI) oddzielona od pobierania danych (kontener / hook / composable / serwis).
- > ~200 linii albo > 5–6 boolowskich wejść → podziel lub użyj kompozycji (children/sloty, compound components).
- Wszystkie wywołania API przez jeden klient (`shared/api`) z auth, błędami, anulowaniem; mapowanie DTO → model na granicy, nie w komponentach.
- Render czysty (bez efektów ubocznych); każdy otwarty zasób (subskrypcja, timer, listener) ma symetryczne sprzątanie.

## Odporność
- Każdy widok danych ma 4 stany: ładowanie, błąd (z „spróbuj ponownie”), pusto, dane — jako unia, nie flagi.
- Error boundary na trasę + wokół niezależnych widgetów; błędy async przekazuj do granicy jawnie.
- Retry z backoffem i jitterem tylko dla operacji idempotentnych; 409/422 to wynik biznesowy, nie awaria.
- Formularze: walidacja schematem współdzielonym z backendem, gdy się da; błędy serwera mapowane na pola; blokada podwójnej wysyłki.
- Optymistyczne aktualizacje tylko dla operacji prawie zawsze udanych — zawsze z rollbackiem.
- Feature flags sprawdzane w jednym miejscu; po pełnym wdrożeniu usuwane (dodaj zadanie sprzątające).

## Wydajność
- Code splitting per trasa; ciężkie biblioteki (wykresy, edytory) leniwie (`import()`, Angular `@defer`). Obrazu LCP nie ładuj leniwie.
- Model renderowania (CSR/SSR/SSG/ISR/RSC) wybierany per trasa.
- Mierz przed optymalizacją (LCP/INP/CLS, profiler, bundle analyzer); memoizacja tylko przy zmierzonym problemie.

## Bezpieczeństwo klienta
- Treść od użytkownika i od modeli AI jest niezaufana: interpolacja frameworka zamiast `innerHTML`; escape hatch
  (`dangerouslySetInnerHTML`, `v-html`, `bypassSecurityTrust*`) tylko po sanitizerze.
- Sesja w ciasteczku `HttpOnly; Secure; SameSite` (najlepiej BFF), nie w `localStorage`; CSRF: token + Fetch Metadata.
- Strict CSP (nonce + `strict-dynamic`), SRI dla zasobów z obcych CDN, PII redagowane przed logami/telemetrią.
- SSR, React Server Components, Angular SSR i server actions to **kod serwera** wystawiony do internetu: wymagają
  łatek w ciągu doby przy krytycznych CVE (React2Shell, CVE-2025-55182: wykonanie kodu bez logowania jednym żądaniem)
  i uruchamiania jak backend (bez root, bez powłoki w obrazie — ops-docker).
- Strona serwerowa (auth, walidacja) — be-auth-security.

## Decyzje
Zmiana struktury (nowa biblioteka stanu, nowy wzorzec, micro-frontends) → ADR wg core-tech-docs; czynniki
jakości — arch-quality-attributes. Zasady ogólne (KISS/YAGNI/SOLID) — eng-design-principles; strategia testów — eng-testing.

## Indeks references
Czytaj tylko plik potrzebny do bieżącego pytania:
- `principles.md` — 6 fundamentów, zasady (spójność/powiązanie, enkapsulacja), model „navigation/content/affordances”, indeks przewodników frontendpatterns.dev.
- `architecture-styles.md` — monolit, modularna, component-based, micro-frontends, Flux, warstwowa, serverless — zalety/wady/kiedy.
- `fsd-screaming-architecture.md` — warstwy i reguły FSD, Screaming Architecture, rodzaje stanu per framework, tooling 2026.
- `rendering-models.md` — VDOM vs sygnały, CSR/SSR/SSG/ISR, hydratacja (mismatch, przyrostowa), RSC, wybór per trasa.
- `components/` — `component-lifecycle`, `presentational-vs-container`, `props-and-attributes`, `pure-component`, `compound-components` — gdy projektujesz API lub podział komponentu.
- `fundamentals/` — `barrel-export`, `separation-of-concerns`, `single-responsibility` — granice modułów i podział kodu.
- `performance/` — `code-splitting`, `lazy-loading`, `debounce` (i throttle), `memoization`.
- `resilience/` — `async-boundary`, `error-boundary`, `error-handling`, `loading-state`, `retry`.
- `routing/client-side-routing.md` — router klienta, Navigation API, scroll i fokus po nawigacji.
- `security/` — `content-security-policy`, `csrf-protection`, `samesite-cookie`, `secure-token-storage`, `input-sanitization`, `output-encoding`, `trusted-types`, `subresource-integrity`, `pii-redaction`.
- `testing/component-testing.md` — testy komponentów z perspektywy użytkownika (narzędzia: tool-vitest, tool-jest, tool-playwright).
- `ai-chat-ui/` — **interfejsy czatu z modelem AI**: model wątku jako lista wiadomości ze statusem (`message-thread`),
  pole promptu z IME i Send/Stop (`prompt-input`), strumieniowanie odpowiedzi i SSE (`streaming-response`),
  przerwanie z `AbortController` także na serwerze (`stop-generation`), wskaźnik „myśli” (`thinking-indicator`),
  regeneracja jako warianty (`response-regeneration`). Czytaj tylko przy budowie UI czatu/asystenta.

Pliki wzorców mają sekcję „Uwagi (stan 2026)” — poprawki względem źródła i odpowiedniki w innych frameworkach.

## Checklista
- [ ] Granice funkcji i publiczne API modułów zachowane; importy tylko w dozwolonym kierunku
- [ ] Stan na najniższym wystarczającym poziomie; dane serwera w warstwie z cache
- [ ] Każdy widok danych obsługuje ładowanie/błąd/pusto/dane; błędy nie kładą całej strony
- [ ] Brak `innerHTML` z niezaufanymi danymi; tokeny poza `localStorage`
- [ ] Podział kodu i model renderowania uzasadnione pomiarem
- [ ] Decyzja strukturalna opisana w ADR

Źródła: frontendpatterns.dev (Den Odell), M. Hrynkevych „Frontend Architecture”, „The Grand Unifying Architecture of
Frontend” (playfulprogramming), LogRocket „modern frontend architecture patterns” — opisane własnymi słowami, licencje źródeł nieokreślone.
