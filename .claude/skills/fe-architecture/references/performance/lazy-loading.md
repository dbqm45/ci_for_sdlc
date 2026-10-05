# Lazy Loading

> **Spis treści:** Metadane · TLDR · Uwagi (stan 2026, poprawki względem źródła) · Problem · Rozwiązanie · Przykłady kodu · Zalety · Wady / tradeoffs · Powiązane wzorce · Kiedy używać / kiedy NIE używać

Źródło: frontendpatterns.dev/lazy-loading.

## Metadane

- **Kategoria:** Performance
- **Poziom:** Advanced
- **Przykłady frameworków:** React, Vue, Svelte, Native web
- **Data aktualizacji:** 30 listopada 2025
- **Autor:** Den Odell

## TLDR

„Defer loading of images, components, and data until they're needed, reducing initial load time and
saving bandwidth.”

## Uwagi (stan 2026, poprawki względem źródła)

- **Nie ładuj leniwie obrazu LCP (hero, powyżej zgięcia)** — `loading="lazy"` na nim pogarsza LCP. Dla hero:
  `fetchpriority="high"` (i ewentualnie `<link rel="preload" as="image">`). Poprawiono przykład niżej.
- Core Web Vitals = LCP, INP, CLS (FCP to metryka pomocnicza) — fe-web-platform (`.claude/skills/fe-web-platform/references/core-web-vitals.md`).
- Angular: `@defer` w szablonie i `loadComponent` w routingu (fw-angular). Iframe też wspiera `loading="lazy"`.
- Własny Intersection Observer dla `<img>` jest zbędny — natywne `loading="lazy"` ma pełne wsparcie.
- Przykłady Svelte to składnia Svelte 4 (`export let`, `$:`, `on:click`, `<svelte:component>`); w Svelte 5: `$props()`,
  `$state`, `$derived`, `onclick`, komponent dynamiczny renderujesz wprost (`<Comp />`).

## Problem

Strony ładują zasoby przed ich realną potrzebą. Przykład ze źródła: strona ładowania pobiera
JavaScript dla panelu admina, analityki, ustawień i 47 obrazów poniżej fałdy, choć użytkownik chce
tylko sekcji hero — autor szacuje, że 80% pakietu JS to kod, którego użytkownik nigdy nie dotyka.
Parsing na urządzeniach mobilnych trwa 2–3× dłużej; obrazy poniżej fałdy zużywają pasmo i pamięć bez
potrzeby.

## Rozwiązanie

„Don't load resources until users actually need them.” Dla JavaScriptu: dynamiczny `import()` do
podziału pakietu — komponenty tras ładowane przy nawigacji, ciężkie funkcje (biblioteki wykresów)
odłożone. Dla obrazów: atrybut `loading="lazy"` albo Intersection Observer. Dla skryptów trzecich:
`async`/`defer` albo ładowanie po interakcji użytkownika. Połącz z preloadingiem na hover, żeby
zniwelować odczuwalne opóźnienie przy nawigacji.

## Przykłady kodu

### Component Lazy Loading — React

```javascript
import { lazy, Suspense } from 'react';

const AdminPanel = lazy(() => import('./AdminPanel'));

function App() {
  return (
    <div>
      <Header />
      <MainContent />
      <Suspense fallback={<Loading />}>
        <AdminPanel />
      </Suspense>
    </div>
  );
}
```

### Component Lazy Loading — Vue

```vue
<template>
  <Suspense>
    <AsyncAdminPanel />
    <template #fallback>
      <Loading />
    </template>
  </Suspense>
</template>

<script>
import { defineAsyncComponent } from 'vue';

export default {
  components: {
    AsyncAdminPanel: defineAsyncComponent(() =>
      import('./AdminPanel.vue')
    )
  }
};
</script>
```

### Component Lazy Loading — Svelte

```svelte
<script>
  let AdminPanel;

  async function loadAdminPanel() {
    const module = await import('./AdminPanel.svelte');
    AdminPanel = module.default;
  }
</script>

<button on:click={loadAdminPanel}>Load Admin Panel</button>

{#if AdminPanel}
  <svelte:component this={AdminPanel} />
{/if}
```

### Component Lazy Loading — Web Components

```javascript
class LazyComponent extends HTMLElement {
  async connectedCallback() {
    this.innerHTML = '<div class="loading">Loading...</div>';
    const { AdminPanel } = await import('./admin-panel.js');
    this.innerHTML = '';
    this.appendChild(new AdminPanel());
  }
}

customElements.define('lazy-component', LazyComponent);
```

### Route-Based Code Splitting

```javascript
import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

const Home = lazy(() => import('./pages/Home'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Admin = lazy(() => import('./pages/Admin'));

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/admin" element={<Admin />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
```

### Conditional Feature Loading

```javascript
function Dashboard({ user }) {
  const [AnalyticsPanel, setAnalyticsPanel] = useState(null);

  useEffect(() => {
    if (user.isPremium) {
      import('./AnalyticsPanel').then(m => setAnalyticsPanel(() => m.default));
    }
  }, [user.isPremium]);

  return (
    <div>
      <h1>Dashboard</h1>
      {AnalyticsPanel && <AnalyticsPanel />}
    </div>
  );
}
```

### Image Lazy Loading — natywny atrybut

```html
<!-- Hero (LCP): NOT lazy — load eagerly with high priority -->
<img src="hero.jpg" alt="Hero" fetchpriority="high" width="800" height="600" />
<!-- Below the fold: lazy, with dimensions to avoid CLS -->
<img src="image1.jpg" loading="lazy" alt="Image 1" width="400" height="300" />
<img src="image2.jpg" loading="lazy" alt="Image 2" width="400" height="300" />
```

### Image Lazy Loading — Intersection Observer

```javascript
const observer = new IntersectionObserver((entries, obs) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.src = entry.target.dataset.src;
      obs.unobserve(entry.target);
    }
  });
});

document.querySelectorAll('img[data-src]').forEach(img => observer.observe(img));
// HTML: <img data-src="actual.jpg" alt="Lazy image" />
```

### Preloading on Hover

```javascript
function ProductCard({ product }) {
  return (
    <div onMouseEnter={() => import('./ProductDetails')}>
      <h3>{product.name}</h3>
      <Link to={`/product/${product.id}`}>View Details</Link>
    </div>
  );
}
```

### Lazy Third-Party Scripts

```html
<script src="analytics.js" defer></script>
<script src="chat-widget.js" async></script>

<script>
  function loadAnalytics() {
    const script = document.createElement('script');
    script.src = 'https://analytics.example.com/script.js';
    document.head.appendChild(script);
  }

  document.addEventListener('click', loadAnalytics, { once: true });
</script>
```

## Zalety

- Initial bundle drastycznie mniejszy — użytkownik pobiera tylko to, co potrzebne na start.
- Czas do interaktywności spada; różnica między 50KB a 500KB decyduje o rezygnacji użytkownika
  mobilnego.
- Użytkownicy bez dostępu premium/adminowego nie pobierają kodu, którego nie użyją.
- Obrazy poniżej fałdy ładują się na żądanie, oszczędzając pasmo.
- Metryki ładowania (FCP, LCP) się poprawiają; z wymiarami obrazów także CLS.
- Efektywność cache się poprawia — zmiana rzadko używanej funkcji nie unieważnia cache popularnych
  ścieżek.

## Wady / tradeoffs

- Pierwsza nawigacja na trasę z lazy loadingiem pokazuje spinner — może wydawać się wolniejsza niż
  tradycyjny SPA bez podziału.
- Każda granica lazy loading wymaga stanu ładowania i fallback UI.
- Obsługa błędów się komplikuje — błędy sieci wymagają retry i error boundaries.
- Debugowanie między fragmentami trudniejsze (osobne source mapy, przerywane stack trace).
- Leniwe obrazy powodują przeskoki layoutu, jeśli nie ustawisz jawnej `width`/`height`.
- Bez preloadingu kliknięcie „czuje się” wolne — połącz z prefetchem na hover.
- Nieprawidłowe granice podziału mogą przypadkowo zduplikować współdzielone zależności — sprawdzaj
  bundle analyzer.
- Modale/szuflady, których użytkownik oczekuje natychmiast, nie współpracują dobrze z lazy loadingiem.

## Powiązane wzorce

- [Code Splitting](../performance/code-splitting.md) — Performance.
- Lazy Loading — web.dev.
- `React.lazy` — dokumentacja React.
- Async Components — dokumentacja Vue.
- Dynamic Imports — dokumentacja Svelte.

## Kiedy używać / kiedy NIE używać

Używaj dla komponentów tras, obrazów poniżej fałdy i funkcji używanych tylko przez część
użytkowników. **Nie** stosuj do elementów, których użytkownik oczekuje natychmiast (modal otwierany
z głównej akcji, kluczowy widget powyżej fałdy) — spinner w takim miejscu psuje wrażenie bardziej,
niż zyskujesz na initial bundle; to przykład, gdzie fundament „Performance” i fundament „Resilience”
(nie zaskakuj użytkownika stanem ładowania w oczekiwanym miejscu) mogą wejść w konflikt — rozstrzygaj
na korzyść tego, co użytkownik faktycznie odczuje jako szybsze, nie tego, co jest mniejsze w bundle
analyzerze.
