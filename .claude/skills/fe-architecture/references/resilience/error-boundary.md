# Error Boundary

> **Spis treści:** Metadane · TLDR · Uwagi (stan 2026, poprawki względem źródła) · Problem · Rozwiązanie · Przykłady kodu · Zalety · Wady / tradeoffs · Powiązane wzorce · Kiedy używać / kiedy NIE używać

Źródło: frontendpatterns.dev/error-boundary.

## Metadane

- **Kategoria:** Resilience
- **Poziom:** Advanced
- **Przykłady:** React, Vue, Svelte, Native web
- **Data aktualizacji:** 29 października 2025
- **Autor:** Den Odell

## TLDR

„Catch render errors in a boundary component that displays a fallback UI instead of crashing the
entire application.”

## Uwagi (stan 2026, poprawki względem źródła)

- Odpowiedniki: React — nadal komponent klasowy (lub `react-error-boundary`); w React 19 dodatkowo
  `createRoot(el, { onCaughtError, onUncaughtError })` do raportowania. Vue `onErrorCaptured`/`app.config.errorHandler`.
  Svelte 5 — `<svelte:boundary onerror>` z snippetem `failed` (przykład Svelte niżej łapie tylko globalne `error`
  i nie jest prawdziwą granicą). Angular (fw-angular) — globalny `ErrorHandler`, lokalnie `@defer … @error` i
  status `error` w `resource`.
- `react-error-boundary` udostępnia `useErrorBoundary().showBoundary(err)` — tak przekazuje się błąd z kodu
  asynchronicznego do granicy (resilience/error-handling.md).
- Przykłady Svelte to składnia Svelte 4; w Svelte 5: `$props()`, `$state`, `onclick`, `<svelte:boundary>` (granica błędów
  i — z `await` w komponentach — ładowania).

## Problem

Nieobsłużone błędy JavaScript (błąd w kodzie, źle sformatowane dane z API, wyjątek z biblioteki)
propagują się przez drzewo komponentów aż do korzenia, gdzie cała aplikacja się wywraca — użytkownik
widzi czarny/pusty ekran zamiast czegokolwiek użytecznego. Autor: „I've seen users lose entire forms
because an unrelated chart component failed to render.”

## Rozwiązanie

Error Boundary działa jak blok try/catch dla drzewa komponentów — owija część interfejsu w
komponent, który przechwytuje błędy renderowania swoich dzieci i pokazuje fallback UI. Rekomendowana
strategia warstwowa: jedna granica na poziomie roota jako siatka bezpieczeństwa, plus osobne,
bardziej szczegółowe granice wokół ryzykownych, izolowanych funkcji.

**Ważne ograniczenie:** granice błędów przechwytują **tylko** błędy renderowania, metod cyklu życia i
konstruktorów — **nie** obejmują obsługi zdarzeń (`onClick` itd.), kodu asynchronicznego ani
odrzuconych Promise'ów. Te wymagają tradycyjnego try/catch (patrz `error-handling.md`).

## Przykłady kodu

### Basic Error Boundary — React

```javascript
class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error caught:', error, errorInfo);
  }

  resetError = () => this.setState({ hasError: false, error: null });

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <h1>Something went wrong</h1>
          <button onClick={this.resetError}>Try again</button>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  return (
    <ErrorBoundary>
      <Dashboard />
    </ErrorBoundary>
  );
}
```

### Basic Error Boundary — Vue

```vue
<script setup>
import { ref, onErrorCaptured } from 'vue';

const hasError = ref(false);
const error = ref(null);

onErrorCaptured((err) => {
  hasError.value = true;
  error.value = err;
  return false; // Prevent propagation
});

const reset = () => {
  hasError.value = false;
  error.value = null;
};
</script>

<template>
  <div v-if="hasError" class="error-boundary">
    <h1>Something went wrong</h1>
    <button @click="reset">Try again</button>
  </div>
  <slot v-else />
</template>
```

### Basic Error Boundary — Svelte

```svelte
<script>
  import { onMount } from 'svelte';

  let hasError = false;
  let errorMessage = '';

  onMount(() => {
    const handleError = (event) => {
      if (event.error) {
        hasError = true;
        errorMessage = event.error.message;
        event.preventDefault();
      }
    };
    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  });

  const reset = () => { hasError = false; errorMessage = ''; };
</script>

{#if hasError}
  <div class="error-boundary">
    <h1>Something went wrong</h1>
    <button on:click={reset}>Try again</button>
  </div>
{:else}
  <slot />
{/if}
```

### Basic Error Boundary — Web Components

```javascript
class ErrorBoundary extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.hasError = false;
  }

  connectedCallback() {
    this.render();
    this.addEventListener('error', (event) => {
      this.hasError = true;
      this.errorMessage = event.error?.message || 'Unknown error';
      this.render();
      event.stopPropagation();
    }, true);
  }

  reset() {
    this.hasError = false;
    this.render();
  }

  render() {
    if (this.hasError) {
      this.shadowRoot.innerHTML = `
        <div class="error-boundary">
          <h1>Something went wrong</h1>
          <button id="reset">Try again</button>
        </div>
      `;
      this.shadowRoot.getElementById('reset').onclick = () => this.reset();
    } else {
      this.shadowRoot.innerHTML = '<slot></slot>';
    }
  }
}

customElements.define('error-boundary', ErrorBoundary);
```

### Granular Boundaries

```javascript
function Dashboard() {
  return (
    <ErrorBoundary fallback={<PageError />}>
      <ErrorBoundary fallback={<WidgetError />}>
        <SalesChart />
      </ErrorBoundary>
      <ErrorBoundary fallback={<WidgetError />}>
        <RecentActivity />
      </ErrorBoundary>
      <ErrorBoundary fallback={<WidgetError />}>
        <UserList />
      </ErrorBoundary>
    </ErrorBoundary>
  );
}
```

### Custom Fallback UI

```javascript
<ErrorBoundary
  fallback={(error, reset) => (
    <div>
      <h2>Widget failed to load</h2>
      <p>{error.message}</p>
      <button onClick={reset}>Retry</button>
    </div>
  )}
>
  <ComplexWidget />
</ErrorBoundary>
```

### Using react-error-boundary

```javascript
import { ErrorBoundary } from 'react-error-boundary';

function ErrorFallback({ error, resetErrorBoundary }) {
  return (
    <div role="alert">
      <p>Something went wrong:</p>
      <pre>{error.message}</pre>
      <button onClick={resetErrorBoundary}>Try again</button>
    </div>
  );
}

<ErrorBoundary FallbackComponent={ErrorFallback} onError={logErrorToService}>
  <Dashboard />
</ErrorBoundary>
```

## Zalety

- Aplikacja pozostaje częściowo funkcjonalna — użytkownik nadal ma nawigację i nieuszkodzone
  komponenty.
- Użytkownik widzi użyteczny komunikat zamiast pustego ekranu.
- Awaria jest zawarta w konkretnej, ograniczonej części interfejsu.
- Automatyczne logowanie błędów przy integracji z monitoringiem (np. Sentry).
- Przyciski „Try again” umożliwiają odzyskanie bez odświeżania całej strony.
- Można rozdzielić komunikat: przyjazny dla użytkownika, szczegółowy stack trace dla developera.

## Wady / tradeoffs

- Przechwytują tylko błędy renderowania/cyklu życia — event handlery, kod async i odrzucenia
  Promise wymagają zwykłego try/catch osobno.
- W React wymagają komponentu klasowego (biblioteka `react-error-boundary` pozwala tego uniknąć).
- Ogólne „coś poszło nie tak” może **maskować** błąd zamiast pomóc go naprawić — potrzebne
  szczegółowe logowanie po stronie deva.
- Rozmieszczenie jest trudne: zbyt mało granic → łączne awarie; zbyt wiele → wszechobecny fallback UI.
- Reset bez naprawy przyczyny błędu może natychmiast doprowadzić do powtórzenia tego samego błędu.
- W trakcie developmentu warto czasem **wyłączyć** granice błędów, żeby błędy były widoczne przy
  testowaniu, nie po cichu łapane.

## Powiązane wzorce

- [Error Handling](./error-handling.md) — Resilience
- [Async Boundary](./async-boundary.md) — Resilience
- [Loading State](./loading-state.md) — Resilience
- [Error Boundaries (React)](https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary)
- [onErrorCaptured Hook (Vue)](https://vuejs.org/api/composition-api-lifecycle.html#onerrorcaptured)
- [Error Handling (Svelte)](https://svelte.dev/docs/svelte#onerror)
- [react-error-boundary Library](https://github.com/bvaughn/react-error-boundary)

## Kiedy używać / kiedy NIE używać

Używaj **zawsze** przynajmniej na poziomie roota aplikacji — to jest minimalna, tania siatka
bezpieczeństwa. Dodawaj granularne granice wokół konkretnych, ryzykownych widgetów (wykresy,
integracje trzecich stron), gdzie awaria jednego elementu nie powinna zabrać ze sobą reszty strony.
**Nie** próbuj łapać nią błędów sieciowych/async — to jest zadanie dla `error-handling.md`/`retry.md`,
Error Boundary rozwiązuje inny problem (crash renderowania), nie failed fetch.
