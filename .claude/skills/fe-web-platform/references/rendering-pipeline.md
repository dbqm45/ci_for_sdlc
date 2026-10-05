# Event loop i Critical Rendering Path

Przeniesione z importu frontend-developer (`senior.md`: Event Loop — tam tylko odsyłacz, tu treść; Critical
Rendering Path — pełna). Diagnoza, **dlaczego** strona jest wolna, zanim sięgniesz po metryki (core-web-vitals.md).

## Event loop w przeglądarce

Główny wątek wykonuje naprzemiennie: **jedno zadanie** (macrotask: skrypt, zdarzenie, `setTimeout`, wiadomość) →
**wszystkie mikrozadania** (`Promise.then`, `await`, `queueMicrotask`, `MutationObserver`) → ewentualnie
**renderowanie** (`requestAnimationFrame` → style → layout → paint → composite), zwykle co ~16 ms przy 60 Hz.

Konsekwencje:
- Dopóki zadanie + jego mikrozadania trwają, przeglądarka **nie renderuje i nie obsługuje wejścia**. Zadanie
  > 50 ms to **long task** — główna przyczyna złego INP.
- Nieskończony łańcuch mikrozadań zagłodzi renderowanie tak samo jak pętla synchroniczna.
- `setTimeout(fn, 0)` ≠ natychmiast: to nowe zadanie po renderze/innych zadaniach; minimalne opóźnienie rośnie do
  4 ms po zagnieżdżeniu, a w tle kart timery są dławione.
- Dziel długą pracę: `await scheduler.yield()` (Chromium; fallback `setTimeout`/`MessageChannel`),
  `requestIdleCallback` dla pracy niepilnej, Web Worker dla obliczeń CPU (parsowanie, kompresja, filtrowanie
  dużych zbiorów). Aktualizacje wizualne — w `requestAnimationFrame`.
- Wycieki pamięci diagnozuj w DevTools (heap snapshot, „Detached elements”): typowe źródła to listenery i timery bez
  sprzątania oraz domknięcia trzymające odłączone węzły DOM.

## Critical Rendering Path (CRP)

1. **HTML → DOM** — parsowanie strumieniowe. `<script>` bez `async`/`defer`/`type="module"` **blokuje parser**, aż się
   pobierze i wykona. `defer` i moduły wykonują się po parsowaniu w kolejności; `async` — gdy tylko się pobiorą.
2. **CSS → CSSOM** — CSS jest **render-blocking**: przeglądarka nie maluje treści bez kompletnego CSSOM (kolejny arkusz
   może nadpisać reguły). Krytyczny CSS inline lub mały; reszta `media`/ładowana później.
3. **DOM + CSSOM → render tree** — elementy `display: none` do niego nie wchodzą; `visibility: hidden` wchodzi (zajmuje
   miejsce, niewidoczne).
4. **Layout (reflow)** — geometria każdego elementu.
5. **Paint** — piksele na warstwach (kolory, tekst, cienie, obrazy).
6. **Composite** — złożenie warstw (GPU).

Koszt zmian:
- Geometria (`width`, `top`, `margin`, dodanie węzła) → layout + paint + composite — najdrożej.
- Kolor/tło → paint + composite.
- `transform`, `opacity` (na własnej warstwie) → tylko composite — dlatego animuj je, nie `top/left/width` (fe-css).
- **Layout thrashing** — przeplatanie zapisu stylu i odczytu geometrii (`offsetHeight`, `getBoundingClientRect`) w
  pętli wymusza synchroniczny layout przy każdym odczycie. Najpierw wszystkie odczyty, potem wszystkie zapisy
  (lub zapisy w `requestAnimationFrame`).
- Ograniczaj zakres przeliczeń: `contain: layout paint`, `content-visibility: auto` dla sekcji poza ekranem.

## Priorytety ładowania

- `<link rel="preload">` dla krytycznego zasobu odkrywanego późno (font, obraz LCP z CSS); `rel="preconnect"` do
  kluczowych originów; `fetchpriority="high"` na obrazie LCP, `"low"` na mniej ważnych.
- `rel="modulepreload"` dla modułów ES; Speculation Rules (`<script type="speculationrules">`) do prefetch/prerender
  kolejnych stron w MPA.
- Fonty: `font-display: swap`/`optional` + `size-adjust`/metryki zastępcze, żeby podmiana nie przesuwała układu.
