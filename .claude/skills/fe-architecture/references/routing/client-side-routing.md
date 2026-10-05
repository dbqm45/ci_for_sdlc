# Client-Side Routing

> **Spis treści:** Metadane · TLDR · Uwagi (stan 2026, poprawki względem źródła) · Problem · Rozwiązanie · Przykłady kodu · Zalety · Wady / tradeoffs · Powiązane wzorce · Kiedy używać / kiedy NIE używać

Źródło: frontendpatterns.dev/client-side-routing.

## Metadane

- **Kategoria:** Routing
- **Poziom:** Intermediate
- **Przykłady frameworków:** React, Vue, Svelte, Native web
- **Data aktualizacji:** 14 grudnia 2025
- **Autor:** Den Odell

## TLDR

„Intercept navigation to swap views without full page reloads, managing browser history and scroll
position for a seamless single-page experience.”

## Uwagi (stan 2026, poprawki względem źródła)

- **Błąd w przykładzie React poprawiony:** `useNavigate()` wywołane poza `<BrowserRouter>` rzuca wyjątek — hook
  działa tylko w komponencie pod routerem. W React Router 7 importuj z `react-router` (pakiet `react-router-dom`
  jest tylko re-eksportem); „tryb frameworka” daje loadery/akcje per trasa.
- Vanilla: `e.target.matches('a')` nie łapie kliknięć w elementy wewnątrz linku — użyj `e.target.closest('a')` i
  pomijaj kliknięcia z modyfikatorami (Ctrl/Cmd/Shift, środkowy przycisk), `target="_blank"`, `download` i linki
  do innych originów. Poprawiono.
- **Navigation API** (`navigation.addEventListener('navigate', e => e.intercept({ handler }))`) — nowoczesny
  następca ręcznego `pushState` + `popstate` + przechwytywania kliknięć; w 2026 dostępne we wszystkich głównych
  silnikach (sprawdź Baseline dla swojej publiczności), z History API jako fallback.
- Po zmianie trasy przenieś fokus na nagłówek i zaktualizuj `document.title` (fe-web-platform,
  `.claude/skills/fe-web-platform/references/accessibility/focus-management.md`); animacje przejść — View Transitions API.
- Alternatywa dla SPA przy treściach: MPA + cross-document View Transitions + Speculation Rules (prerender) daje
  płynność bez routera klienta (rendering-models.md).
- Svelte: `svelte-routing` to biblioteka niszowa — standardem jest routing plikowy SvelteKit. Angular: `provideRouter`,
  guardy funkcyjne, `withComponentInputBinding()`, `loadComponent` (fw-angular).

## Problem

Każde kliknięcie linku wyzwala pełny reload strony: biały błysk, przeskok scrolla na górę, utrata
danych formularza, zatrzymanie odtwarzanego wideo, zapadnięcie rozwiniętych akordeonów. Użytkownicy
tracą pracę, klikając link przed zapisaniem zmian. Każda nawigacja wymaga też własnego wskaźnika
ładowania całej strony.

## Rozwiązanie

Zatrzymaj pełne ładowanie stron — użyj History API do zmiany URL bez rzeczywistej nawigacji
przeglądarki, wymieniając tylko fragment treści, który faktycznie się zmienia. Przechwytuj kliknięcia
linków, wywołuj `pushState` do aktualizacji URL i renderuj nowy komponent trasy; na przycisk „wstecz”
słuchaj `popstate` i renderuj poprzednią trasę. To zachowuje stan formularza, pozycję scrolla,
rozwinięte menu i trwające multimedia.

## Przykłady kodu

### React

```javascript
import { BrowserRouter, Routes, Route, Link, useNavigate } from 'react-router'; // RR7

// useNavigate() works only in components rendered INSIDE the router
function LoginForm() {
  const navigate = useNavigate();
  const handleLogin = async (credentials) => {
    await login(credentials);
    navigate('/dashboard'); // Programmatic navigation
  };
  return <CredentialsForm onSubmit={handleLogin} />;
}

function App() {
  return (
    <BrowserRouter>
      <nav>
        <Link to="/">Home</Link>
        <Link to="/about">About</Link>
        <Link to="/products">Products</Link>
      </nav>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<About />} />
        <Route path="/products" element={<Products />} />
        <Route path="/login" element={<LoginForm />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
```

### Vue

```javascript
<template>
  <div>
    <nav>
      <router-link to="/">Home</router-link>
      <router-link to="/about">About</router-link>
      <router-link to="/dashboard">Dashboard</router-link>
    </nav>
    <router-view />
  </div>
</template>

<script>
import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: Home },
    { path: '/about', component: About },
    {
      path: '/dashboard',
      component: Dashboard,
      beforeEnter: (to, from) => {
        if (!isAuthenticated()) return '/login';
      }
    }
  ]
});

export default { router };
</script>
```

### Svelte

```javascript
<script>
  import { Router, Route, Link, navigate } from 'svelte-routing';
  import Home from './Home.svelte';
  import About from './About.svelte';

  function handleLogin() {
    navigate('/dashboard', { replace: true });
  }
</script>

<Router>
  <nav>
    <Link to="/">Home</Link>
    <Link to="/about">About</Link>
  </nav>
  <Route path="/" component={Home} />
  <Route path="/about" component={About} />
</Router>
```

### Vanilla JavaScript

```javascript
class Router {
  constructor(routes) {
    this.routes = routes;

    document.addEventListener('click', (e) => {
      const link = e.target.closest('a[href]');
      if (!link || link.origin !== location.origin) return;
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (link.target === '_blank' || link.hasAttribute('download')) return;
      e.preventDefault();
      this.navigate(link.pathname + link.search + link.hash);
    });

    window.addEventListener('popstate', () => this.render(location.pathname));
    this.render(location.pathname);
  }

  navigate(path) {
    history.pushState({}, '', path);
    this.render(path);
  }

  render(path) {
    const route = this.routes.find(r => r.path === path)
      || this.routes.find(r => r.path === '*');
    if (!route) return;

    const container = document.querySelector('#app');
    container.innerHTML = '';
    container.appendChild(new route.component().render());
  }
}

const router = new Router([
  { path: '/', component: HomePage },
  { path: '/about', component: AboutPage },
  { path: '*', component: NotFoundPage }
]);
```

### Scroll Position Management

```javascript
// Scroll to top on route change
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => window.scrollTo(0, 0), [pathname]);
  return null;
}

// Or preserve scroll per route
const scrollPositions = new Map();

function preserveScroll() {
  scrollPositions.set(location.pathname, window.scrollY);
}

function restoreScroll(pathname) {
  window.scrollTo(0, scrollPositions.get(pathname) || 0);
}
```

### Hash-Based Routing

```javascript
// For environments without server config (URLs: example.com/#/about)
window.addEventListener('hashchange', () => {
  render(location.hash.slice(1) || '/');
});
```

## Zalety

- Natychmiastowa nawigacja, bez białego błysku i wskaźników ładowania całej strony.
- Stan UI przetrwa nawigację — dane formularza, scroll, trwające multimedia.
- Możliwość animowanych przejść między widokami.
- Mniejsze obciążenie serwera (pobieranie danych, nie pełnych stron HTML).
- Precyzyjna kontrola nad guardami, nawigacją i hookami przejść (np. `beforeEnter`).

## Wady / tradeoffs

- Wymaga JavaScriptu — bez niego całość się nie rusza.
- Wymaga konfiguracji serwera (bezpośrednie wejście na URL musi zwrócić aplikację, nie 404).
- Komplikacje SEO — crawlery mogą nie wykonywać JS.
- Ręczne zarządzanie pamięcią — trzeba pilnować czyszczenia listenerów przy unmount.
- Ręczna obsługa scrolla i fokusu (przeglądarka robi to automatycznie przy pełnym ładowaniu).
- „History quirks if you mix up `pushState` and `replaceState`, creating confusing back-button
  behavior.”

## Powiązane wzorce

- History API — MDN.
- React Router — dokumentacja.
- Vue Router — dokumentacja.
- SvelteKit Routing — dokumentacja Svelte.

## Kiedy używać / kiedy NIE używać

Client-side routing to fundament każdego SPA — używaj go zawsze, gdy budujesz aplikację
komponentową z wieloma widokami. **Nie** traktuj go jako oczywistego wyboru dla treści głównie
statycznej/dokumentowej, gdzie SEO i pierwsze wyrenderowanie liczą się bardziej niż płynność
przejść między podstronami — tam pełne przeładowania (albo SSR/SSG, patrz
`../rendering-models.md`, sekcja „Modele renderowania”) bywają lepszym
wyborem. Pamiętaj też o konfiguracji serwera (fallback do `index.html` dla każdej ścieżki) — bez
tego bezpośrednie wejście na głęboki URL po prostu nie zadziała.
