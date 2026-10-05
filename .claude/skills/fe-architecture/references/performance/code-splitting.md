# Code Splitting

> **Spis treści:** Metadane · TLDR · Uwagi (stan 2026, poprawki względem źródła) · Problem · Rozwiązanie · Przykłady kodu · Zalety · Wady / tradeoffs · Powiązane wzorce · Kiedy używać / kiedy NIE używać

Źródło: frontendpatterns.dev/code-splitting.

## Metadane

- **Kategoria:** Performance
- **Poziom:** Advanced
- **Przykłady frameworków:** React, Vue, Svelte, Native web
- **Data aktualizacji:** 13 grudnia 2025
- **Autor:** Den Odell

## TLDR

„Split your bundle into chunks that load on demand, deferring code for routes and features until users actually need them.”

## Uwagi (stan 2026, poprawki względem źródła)

- **Core Web Vitals to LCP, INP i CLS** (INP zastąpił FID w 2024; TTI nie jest już metryką Lighthouse) — patrz
  fe-web-platform (`.claude/skills/fe-web-platform/references/core-web-vitals.md`). Poprawiono listę w „Zaletach”.
- Angular (fw-angular): `loadComponent`/`loadChildren` w routingu i `@defer (on viewport | idle | interaction)` w
  szablonach — deklaratywny odpowiednik `lazy()` + `Suspense`.
- Vite 8 buduje Rolldownem: `build.rollupOptions.output.manualChunks` jest przestarzałe na rzecz grup chunków
  Rolldowna (`build.rolldownOptions.output.advancedChunks` / `codeSplitting`, zależnie od wersji) — sprawdź
  dokumentację swojej wersji; zanim ręcznie dzielisz vendor, zmierz (bundle analyzer).
- Magic comments `webpackPrefetch/Preload` działają tylko w webpack/Rspack; w Vite prefetch robi się przez
  `<link rel="modulepreload">` lub import przy hover/`requestIdleCallback`.
- Nieudany import chunka po wdrożeniu (stary HTML → usunięty chunk) obsłuż Error Boundary + przeładowaniem
  (np. zdarzenie `vite:preloadError`).
- Przykłady Svelte to składnia Svelte 4 (`export let`, `$:`, `on:click`, `<svelte:component>`); w Svelte 5: `$props()`,
  `$state`, `$derived`, `onclick`, komponent dynamiczny renderujesz wprost (`<Comp />`).

## Problem

Aplikacje wysyłają zbyt dużo kodu jednocześnie. Przykład ze źródła: strona główna ładuje się 8
sekund, bo pobiera kod panelu administratora, edytory tekstu i biblioteki wykresów, których
użytkownik nigdy nie użyje — bundle 2MB, z czego realnie potrzebne jest 100KB. Problem dotyczy
zarówno czasu pobierania, jak i czasu parsowania JavaScriptu przez przeglądarkę.

## Rozwiązanie

Dynamiczne `import()` dzieli kod na logiczne części — bundler tworzy osobne chunki ładowane na
żądanie. Główne punkty podziału: granice tras (route boundaries), komponenty o dużej „wadze”, flagi
funkcji.

## Przykłady kodu

### Route-Based Splitting — React

```javascript
import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Analytics = lazy(() => import('./pages/Analytics'));
const Settings = lazy(() => import('./pages/Settings'));

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<LoadingSpinner />}>
        <Routes>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
```

### Route-Based Splitting — Vue

```javascript
import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/dashboard', component: () => import('./views/Dashboard.vue') },
    { path: '/analytics', component: () => import('./views/Analytics.vue') },
    { path: '/settings', component: () => import('./views/Settings.vue') }
  ]
});
```

### Route-Based Splitting — Svelte

```svelte
<script>
  let DashboardComponent;

  async function loadDashboard() {
    const module = await import('./Dashboard.svelte');
    DashboardComponent = module.default;
  }

  // $page pochodzi z SvelteKit ($app/stores); w SvelteKit routing i podział kodu per trasa są wbudowane
  $: if ($page.route.id === '/dashboard') loadDashboard();
</script>

{#if DashboardComponent}
  <svelte:component this={DashboardComponent} />
{:else}
  <LoadingSpinner />
{/if}
```

### Component-Level Splitting

```javascript
import { lazy, Suspense } from 'react';

const Chart = lazy(() => import('./components/Chart'));

function Dashboard({ showChart }) {
  return (
    <div>
      <h1>Dashboard</h1>
      {showChart && (
        <Suspense fallback={<ChartSkeleton />}>
          <Chart data={data} />
        </Suspense>
      )}
    </div>
  );
}
```

### Named Chunks and Prefetching (Webpack)

```javascript
const Dashboard = () => import(
  /* webpackChunkName: "dashboard" */
  /* webpackPrefetch: true */
  './pages/Dashboard'
);

const HeavyEditor = () => import(
  /* webpackChunkName: "editor" */
  /* webpackPreload: true */
  './components/RichTextEditor'
);
```

### Feature Flag Splitting

```javascript
async function loadFeature(featureName) {
  const features = {
    'advanced-analytics': './features/AdvancedAnalytics',
    'admin-panel': './features/AdminPanel'
  };

  if (features[featureName]) {
    const module = await import(features[featureName]);
    return module.default;
  }
  return null;
}
```

### Vendor Splitting Configuration — Webpack

```javascript
// webpack.config.js
module.exports = {
  optimization: {
    splitChunks: {
      cacheGroups: {
        vendor: { test: /[\\/]node_modules[\\/]/, name: 'vendor', chunks: 'all' },
        common: { minChunks: 2, name: 'common', chunks: 'all' }
      }
    }
  }
};
```

### Vendor Splitting Configuration — Vite

```javascript
// vite.config.js
export default {
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'charts': ['chart.js', 'd3']
        }
      }
    }
  }
};
```

### Error Handling and Preloading

```javascript
// Handle failed chunk loads gracefully
async function loadDashboard() {
  try {
    const module = await import('./pages/Dashboard');
    return module.default;
  } catch (error) {
    console.error('Failed to load dashboard:', error);
    return ErrorComponent;
  }
}

// Preload on hover to anticipate navigation
document.querySelector('#dashboard-link').addEventListener('mouseenter', () => {
  import('./pages/Dashboard');
});
```

## Zalety

- Rozmiar initial bundle drastycznie maleje.
- Time-to-interactive lepszy na wszystkich urządzeniach, zwłaszcza mobilnych na wolnych połączeniach.
- Nieużywane funkcje nie wpływają na rozmiar innych bundli.
- Biblioteki vendor cachują się niezależnie od kodu aplikacji.
- Metryki ładowania się poprawiają (FCP, LCP; mniej pracy głównego wątku → lepszy INP).

## Wady / tradeoffs

- Pierwsza nawigacja na danej trasie „czuje się” wolniej niż w tradycyjnym SPA bez podziału.
- Każdy punkt podziału wymaga własnego loading UI.
- Konfiguracja build'u staje się bardziej złożona.
- Na HTTP/1.1 wiele małych plików szkodzi wydajności; HTTP/2 to rozwiązuje.
- Trudna granularność: zbyt wiele małych chunków vs zbyt mało dużych.
- Dynamic imports zwracają promisy — trzeba obsłużyć nieudane żądania sieciowe.
- Strategia prefetchingu wymaga balansu między zmarnowanym pasmem a wolną nawigacją.
- Współdzielone zależności mogą się przypadkowo zduplikować bez poprawnej konfiguracji bundlera.

## Powiązane wzorce

- [Lazy Loading](../performance/lazy-loading.md) — Performance.
- Code Splitting — web.dev.
- Dynamic `import()` — MDN.
- Webpack Code Splitting — dokumentacja Webpack.

## Kiedy używać / kiedy NIE używać

Używaj przy realnych granicach tras i przy funkcjach, z których korzysta tylko część użytkowników
(panel admina, ciężki edytor, wykresy) — tam koszt (bardziej złożony build, loading UI) jest
uzasadniony realnym zyskiem w initial bundle. **Nie** dziel kodu „na wszelki wypadek” dla małych,
zawsze używanych komponentów — to czysty przykład złamania YAGNI z `../principles.md`:
narzut (dodatkowy request, własny stan ładowania, ryzyko błędu sieci) przewyższa zysk, jeśli dany
kod i tak zawsze się wykonuje. Sprawdź bundle analyzer, zanim zdecydujesz, gdzie realnie jest ciężar.
