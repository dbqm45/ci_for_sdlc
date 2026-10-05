# Modele renderowania: CSR, SSR, SSG, ISR, hydratacja, RSC

Mechanizm (jak działa) i decyzja (kiedy który). Połączone z importu: frontend-developer `senior.md` (Virtual DOM,
SSR, hydratacja, RSC) i frontend-architect (modele renderowania per trasa). Fazy przeglądarki (CRP, event loop) i
metryki (LCP/INP/CLS) — fe-web-platform (`.claude/skills/fe-web-platform/references/rendering-pipeline.md`, `.claude/skills/fe-web-platform/references/core-web-vitals.md`).

## Reaktywność i aktualizacja DOM

Frameworki różnią się tym, **jak** ustalają, co zmienić w DOM:

| Model | Przykłady | Jak działa | Konsekwencje |
|---|---|---|---|
| Virtual DOM + reconciliation | React, Preact, Vue (z kompilatorem optymalizującym) | render do drzewa obiektów → diff z poprzednim → minimalne mutacje DOM | koszt renderu komponentu ≠ koszt zmiany DOM; ważne klucze list i czystość renderu |
| Sygnały / drobnoziarnista reaktywność | Angular (signals, zoneless), Solid, Svelte 5 (runes), Vue Vapor | zależności śledzone per wartość; zmiana aktualizuje tylko zależne węzły | brak diffu całego poddrzewa; pułapki: odczyt sygnału poza kontekstem reaktywnym |
| Kompilacja do imperatywnych aktualizacji | Svelte, Vue Vapor | kompilator generuje kod mutujący konkretne węzły | mały runtime; logika reaktywności widoczna w kompilatorze |

**Reconciliation (VDOM) — reguły wspólne:** inny typ elementu na tej samej pozycji → cała gałąź wymieniana; ten sam
typ → aktualizowane zmienione atrybuty/dzieci; listy porównywane po **kluczu**. Niestabilny klucz (np. indeks w
sortowanej/filtrowanej liście) powoduje zbędne odmontowania i utratę stanu (wartość inputu, fokus). Odróżniaj
„komponent się przerenderował” (praca JS, diff) od „DOM się zmienił” (commit) — to dwa różne koszty.
Odpowiednik w Angularze: `@for (…; track item.id)` — ta sama rola co `key`.

## Tryby renderowania

- **CSR (client-side)** — serwer wysyła prawie pusty HTML i bundle; UI powstaje w przeglądarce. Szybki TTFB,
  wolne pierwsze wyświetlenie treści (FCP/LCP czekają na pobranie i wykonanie JS); słabsze SEO.
- **SSR (server-side, na żądanie)** — serwer renderuje pełny HTML per żądanie; treść widać od razu, ale strona
  jest nieinteraktywna do końca hydratacji. Streaming SSR (wysyłanie HTML kawałkami przy granicach
  Suspense / `@defer`) skraca czas do pierwszej treści.
- **SSG (w czasie budowania)** — HTML generowany raz; najtańszy w serwowaniu (CDN). Dla treści rzadko zmiennej.
- **ISR / rewalidacja** — statyczne strony odświeżane w tle po czasie lub na żądanie (tag/ścieżka). Dla treści z CMS.
- **Hydratacja** — framework „podpina się” pod HTML z serwera: odtwarza stan i podłącza obsługę zdarzeń bez
  budowania DOM od zera. **Hydration mismatch** — HTML z serwera różni się od pierwszego renderu klienta
  (`Date.now()`, `Math.random()`, odczyt `window`/`localStorage`, locale/strefa czasowa) → ostrzeżenia, migotanie,
  a w najgorszym razie ponowny render klienta. Wartości zależne od klienta ustawiaj po hydratacji.
- **Warianty ograniczające koszt hydratacji:** częściowa/„wyspowa” (Astro islands — interaktywne tylko wyspy),
  **przyrostowa** (Angular `@defer` z `hydrate on …`, stabilna od v20 — fragment hydratuje się przy wejściu w
  viewport/interakcji), **resumability** (Qwik — bez ponownego wykonania na kliencie), selektywna (React —
  priorytet dla części, z którą użytkownik wchodzi w interakcję). Angular dodatkowo odtwarza zdarzenia
  kliknięte przed hydratacją (event replay).
- **Luka między „widzę” a „mogę kliknąć”** — w czystym SSR użytkownik może kliknąć przycisk, zanim ma podłączony
  handler. Dawniej mierzone jako TTI (metryka wycofana z Lighthouse); dziś objaw widać w INP i w długich zadaniach
  hydratacji. Progressive enhancement (formularze działające bez JS) zamyka tę lukę.

## React Server Components (RSC)

- Komponenty wykonywane **wyłącznie na serwerze** (lub w czasie budowania); ich kod i zależności **nie trafiają**
  do bundla klienta. W SSR te same komponenty renderują się na serwerze **i** są hydratowane na kliencie; w RSC —
  tylko na serwerze.
- Mogą bezpośrednio czytać bazę/sekrety (nie wyciekają do klienta — o ile nie przekażesz ich w propsach do
  komponentu klienckiego; props przechodzące granicę są serializowane i widoczne).
- `"use client"` oznacza **granicę**: od niej w dół zwykły model (hydratacja, stan, efekty). Trzymaj granice nisko
  (liście drzewa), żeby jak najwięcej zostało na serwerze.
- **Server Actions / Functions** (`"use server"`) to publiczne endpointy — waliduj wejście i autoryzuj każde
  wywołanie jak zwykłe API (be-auth-security).
- Ekosystem: Next.js App Router, React Router 7 (RSC eksperymentalnie). Model ten jest specyficzny dla Reacta;
  koncepcyjnie realizuje podział „navigation / content / affordances” z `principles.md`.

## Decyzja: który model per trasa

Wybór nie jest globalny — meta-frameworki (Next.js, Nuxt, SvelteKit, React Router 7, Angular SSR z trasami
serwerowymi `RenderMode.Server | Prerender | Client`) pozwalają dobrać model **per trasa**.

| Model | Kiedy powstaje HTML | Kiedy wybrać |
|---|---|---|
| CSR/SPA | w przeglądarce | aplikacje za logowaniem, gdzie SEO i pierwszy paint są drugorzędne |
| SSR | na serwerze, per żądanie | treść spersonalizowana, często zmienna, ważne SEO |
| SSG / prerender | w czasie budowania | marketing, dokumentacja, blog |
| ISR / rewalidacja | statycznie + odświeżanie w tle | katalog produktów, treść z CMS |
| RSC (+ streaming) | serwer, bez JS dla części nieinteraktywnych | duże drzewa głównie do czytania, ciężkie zależności (markdown, formatowanie) |

Przykład: strona produktowa z CMS — ISR; panel użytkownika — SSR lub CSR; strona główna/marketing — SSG.

**Alternatywa MPA 2026:** zwykła aplikacja wielostronicowa + cross-document View Transitions + Speculation Rules
(prefetch/prerender) daje płynne przejścia bez routera klienta — rozważ dla serwisów treściowych
(routing/client-side-routing.md).

## Checklista

- [ ] Model renderowania wybrany per trasa, z uzasadnieniem (SEO, personalizacja, częstotliwość zmian)
- [ ] Brak wartości niedeterministycznych w pierwszym renderze (brak hydration mismatch)
- [ ] Granice `"use client"` / `@defer` / wysp możliwie nisko w drzewie
- [ ] Server Actions/endpointy walidują i autoryzują wejście
- [ ] Wpływ zmierzony (LCP/INP, rozmiar JS) — fe-web-platform
