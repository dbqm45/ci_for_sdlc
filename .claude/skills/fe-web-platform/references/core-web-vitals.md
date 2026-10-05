# Core Web Vitals i pomiar wydajności

Przeniesione z importu frontend-developer (`senior.md`, „Core Web Vitals”), uzupełnione o narzędzia 2026.

## Trzy metryki (próg „dobry” na 75. percentylu wizyt)

| Metryka | Mierzy fazę | Dobry | Typowe przyczyny złego wyniku | Typowe poprawki |
|---|---|---|---|---|
| **LCP** — Largest Contentful Paint | ładowanie | ≤ 2,5 s | wolny TTFB, render-blocking CSS/JS, obraz LCP odkrywany późno lub leniwy, ciężkie obrazy | cache/CDN, SSR/SSG, `fetchpriority="high"`, preload, nowoczesne formaty (AVIF/WebP), `srcset` |
| **INP** — Interaction to Next Paint | interaktywność | ≤ 200 ms | long tasks, ciężkie handlery, duże przerenderowania, hydratacja | dzielenie pracy (`scheduler.yield()`), Web Worker, mniejszy zakres renderu, debounce, mniej JS |
| **CLS** — Cumulative Layout Shift | stabilność wizualna | ≤ 0,1 | obrazy/iframe/reklamy bez wymiarów, podmiana fontów, treść wstrzykiwana nad istniejącą | `width`/`height` lub `aspect-ratio`, rezerwacja miejsca, `font-display` + metryki zastępcze, animacje `transform` |

- **INP zastąpił FID** (marzec 2024): FID mierzył tylko opóźnienie do startu handlera, INP — cały czas od
  interakcji do odmalowania, z najgorszych interakcji w wizycie.
- **TTI** nie jest już metryką Lighthouse; pomocnicze: TTFB, FCP, TBT (laboratoryjny zamiennik INP).
- Każda metryka to inna faza — dobry LCP nic nie mówi o INP. Najpierw ustal, **która** jest zła, potem szukaj przyczyny
  (rendering-pipeline.md).

## Dane polowe vs laboratoryjne

- **Polowe (RUM)** — prawdziwi użytkownicy: CrUX (Chrome UX Report), PageSpeed Insights, biblioteka `web-vitals`
  (`onLCP`, `onINP`, `onCLS` z atrybucją — który element/skrypt winny) wysyłana do własnej telemetrii
  (ops-observability). To one decydują o ocenie i SEO.
- **Laboratoryjne** — Lighthouse, DevTools Performance (panel pokazuje też lokalne LCP/INP/CLS na żywo), WebPageTest;
  powtarzalne, do diagnozy i regresji w CI (Lighthouse CI, budżety rozmiaru bundla).
- Long Animation Frames API (LoAF) wskazuje skrypty odpowiedzialne za wolne klatki — lepsze od Long Tasks API.

## Zasady

- Mierz przed i po zmianie; optymalizuj najgorszy percentyl realnych urządzeń (średni Android, słaba sieć), nie
  MacBooka dewelopera.
- Budżety wydajności (rozmiar JS na trasę, LCP) w CI zatrzymują regresje, zanim trafią do użytkowników.
- Checklista przed wydaniem i budżety w CI: `checklista-wydajnosci.md`.
- Wzorce: code splitting, lazy loading, debounce, memoizacja — fe-architecture (`references/performance/`).
