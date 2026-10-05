# Async Boundary

> **Spis treści:** Metadane · TLDR · Uwagi (stan 2026, poprawki względem źródła) · Problem · Rozwiązanie · Przykłady kodu · Zalety · Wady / tradeoffs · Powiązane wzorce · Kiedy używać / kiedy NIE używać

Źródło: frontendpatterns.dev/async-boundary.

## Metadane

- **Kategoria:** Resilience
- **Poziom:** Advanced
- **Przykłady:** React, Vue, Svelte, Native web
- **Data aktualizacji:** 15 listopada 2025
- **Autor:** Den Odell

## TLDR

„Wrap async operations in boundaries that handle loading and error states, keeping child components
focused on rendering data instead of managing request lifecycle.”

## Uwagi (stan 2026, poprawki względem źródła)

- **`use(fetchUser(userId))` bez cache to błąd**: każdy render tworzy nową obietnicę, więc Suspense zawiesza się w
  nieskończoność. Obietnica musi pochodzić z cache/warstwy danych (TanStack Query `useSuspenseQuery`, loader
  routera, framework RSC) albo być utworzona wyżej i przekazana. Poprawiono przykład.
- Odpowiedniki granicy: React `<Suspense>`; Vue `<Suspense>` (wciąż eksperymentalny); Svelte `{#await}` /
  `<svelte:boundary>`; Angular (fw-angular) `@defer` z `@placeholder`/`@loading`/`@error` oraz `resource`/
  `httpResource` ze statusem.
- Zamiast ręcznego „opóźnionego fallbacku” w React użyj przejść (`startTransition`) — przy nawigacji już widoczna
  treść zostaje, zamiast migać fallbackiem.
- Przykłady Svelte to składnia Svelte 4; w Svelte 5: `$props()`, `$state`, `onclick`, `<svelte:boundary>` (granica błędów
  i — z `await` w komponentach — ładowania).

## Problem

Bez koordynacji, niezależne komponenty na jednym ekranie (np. dashboard) pokazują niezsynchronizowane
stany ładowania — „one widget shows a skeleton, another shows a spinner, a third just sits there
empty” — co wygląda niechlujnie (jank). Alternatywnie, jeden globalny spinner blokuje całą stronę,
nie pozwalając użytkownikowi czytać treści, która już jest gotowa.

## Rozwiązanie

Owiń powiązane komponenty w granicę koordynującą ich stany ładowania: „think of it like a stage
curtain: you don't reveal the set piece by piece, you wait until everything's ready and show it all
at once”. Zagnieżdżanie granic umożliwia progresywne ładowanie — krytyczna treść pojawia się
najpierw, mniej istotna dociąga później.

## Przykłady kodu

### React — Basic Async Boundary

```javascript
import { Suspense } from 'react';

function App() {
  return (
    <Suspense fallback={<Spinner />}>
      <UserProfile userId={userId} />
    </Suspense>
  );
}

function UserProfile({ userId }) {
  // React 19+ use(): the promise MUST be cached (same promise across renders),
  // e.g. from a data layer — a fresh fetch() per render suspends forever.
  const user = use(getUserCached(userId));
  return (
    <div>
      <h1>{user.name}</h1>
      <p>{user.bio}</p>
    </div>
  );
}
```

### Vue — Basic Async Boundary

```vue
<template>
  <Suspense>
    <template #default>
      <UserProfile :userId="userId" />
    </template>
    <template #fallback>
      <Spinner />
    </template>
  </Suspense>
</template>

<script setup>
import { defineAsyncComponent } from 'vue';
const props = defineProps(['userId']);
const UserProfile = defineAsyncComponent(() => import('./UserProfile.vue'));
</script>
```

### Svelte — Basic Async Boundary

```svelte
<script>
  export let userId;
  let userPromise = fetch(`/api/users/${userId}`).then(r => r.json());
</script>

{#await userPromise}
  <Spinner />
{:then user}
  <div class="profile">
    <h1>{user.name}</h1>
    <p>{user.bio}</p>
  </div>
{:catch error}
  <ErrorMessage message={error.message} />
{/await}
```

### Web Components — Basic Async Boundary

```javascript
class AsyncBoundary extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  async connectedCallback() {
    this.shadowRoot.innerHTML = '<slot name="fallback"></slot>';
    try {
      const userId = this.getAttribute('user-id');
      const { UserProfile } = await import('./user-profile.js');
      const el = document.createElement('user-profile');
      el.setAttribute('user-id', userId);
      this.shadowRoot.innerHTML = '';
      this.shadowRoot.appendChild(el);
    } catch (error) {
      this.shadowRoot.innerHTML = '<slot name="error"></slot>';
    }
  }
}
customElements.define('async-boundary', AsyncBoundary);
```

### Nested Boundaries for Progressive Loading

```javascript
function Dashboard() {
  return (
    <div className="dashboard">
      <Suspense fallback={<MainContentSkeleton />}>
        <MainContent />
      </Suspense>
      <Suspense fallback={<SidebarSkeleton />}>
        <Sidebar />
      </Suspense>
      <Suspense fallback={<ActivitySkeleton />}>
        <ActivityFeed />
      </Suspense>
    </div>
  );
}
```

### Multiple Async Dependencies

```javascript
// All three must load before the boundary resolves
function ProductPage({ productId }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ProductDetails productId={productId} />
      <ProductReviews productId={productId} />
      <RelatedProducts productId={productId} />
    </Suspense>
  );
}
```

### Streaming with Server Components

```javascript
// Next.js App Router - static content renders immediately, async streams in
export default function Page() {
  return (
    <div>
      <Header />
      <Suspense fallback={<ProductGridSkeleton />}>
        <ProductGrid />
      </Suspense>
      <Footer />
    </div>
  );
}
```

### Delayed Fallback

```javascript
// Avoid spinner flash for fast loads by delaying 200ms
function PageWithTimeout() {
  const [showFallback, setShowFallback] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setShowFallback(true), 200);
    return () => clearTimeout(timer);
  }, []);

  return (
    <Suspense fallback={showFallback ? <Spinner /> : null}>
      <SlowComponent />
    </Suspense>
  );
}
```

## Zalety

- UI ładuje się w spójne fragmenty zamiast migotać — „entire sections appear together, which feels
  polished”.
- Stany ładowania są przewidywalne; użytkownik wie, co się ładuje.
- Komponenty-dzieci nie zarządzają własnym stanem ładowania — ta odpowiedzialność żyje na granicy.
- Progresywne ładowanie (najważniejsza treść pierwsza) staje się naturalnym efektem zagnieżdżania
  granic, nie dodatkową logiką.

## Wady / tradeoffs

- Wymaga wsparcia frameworka (React Suspense, Vue Suspense, Svelte `{#await}`) — nie da się tego
  zrobić czysto ręcznie bez wsparcia platformy.
- Jedno wolne dziecko blokuje **całą** granicę — jeśli jeden z trzech widgetów czeka długo, wszystkie
  trzy czekają.
- Rozmieszczenie granic jest trudne: zbyt mało → grube, rzadkie ładowanie; zbyt wiele → wszechobecne
  spinnery.
- Nie każde pobieranie danych współpracuje z granicami — `useEffect` + `fetch` nie wyzwala Suspense
  samo z siebie, wymaga integracji.
- Brak wbudowanego timeoutu — dziecko, które nigdy się nie rozwiąże, czeka wiecznie.
- Obsługa błędów wymaga dodatkowej pracy — połączenia z Error Boundary (patrz
  `../resilience/error-boundary.md`).

## Powiązane wzorce

- [Error Boundary](../resilience/error-boundary.md) — Resilience
- [Loading State](../resilience/loading-state.md) — Resilience
- [Lazy Loading](../performance/lazy-loading.md) — Performance
- [Suspense (React)](https://react.dev/reference/react/Suspense)
- [Suspense (Vue)](https://vuejs.org/guide/built-ins/suspense.html)
- [Await Blocks (Svelte)](https://svelte.dev/docs/logic-blocks#await)
- [Streaming and Suspense (Next.js)](https://nextjs.org/docs/app/building-your-application/routing/loading-ui-and-streaming)

## Kiedy używać / kiedy NIE używać

Używaj, gdy masz **kilka niezależnych operacji asynchronicznych renderujących się w tym samym
obszarze ekranu** i chcesz, żeby pojawiały się jako spójna grupa, nie migoczący, niezsynchronizowany
zestaw spinnerów. To nie jest wzorzec do wprowadzenia „wszędzie, gdzie jest `fetch()`” — jeśli masz
jeden, samodzielny komponent z własnym stanem ładowania, prostszy lokalny `loading`/`error` (patrz
`loading-state.md`) załatwia sprawę bez narzutu Suspense/frameworka. Sięgaj po to specyficznie, gdy
problem to **koordynacja wielu** stanów ładowania naraz, nie pojedynczy `fetch`.
