# Memoization

> **Spis treści:** Metadane · TLDR · Uwagi (stan 2026, poprawki względem źródła) · Problem · Rozwiązanie · Przykłady kodu · Zalety · Wady / tradeoffs · Powiązane wzorce · Kiedy używać / kiedy NIE używać

Źródło: frontendpatterns.dev/memoization.

## Metadane

- **Kategoria:** Performance
- **Poziom:** Advanced
- **Przykłady frameworków:** React, Vue, Svelte, Native web
- **Data aktualizacji:** 29 listopada 2025
- **Autor:** Den Odell

## TLDR

„Cache expensive computation results so repeated calls with identical inputs return instantly
instead of recalculating.”

## Uwagi (stan 2026, poprawki względem źródła)

- **React Compiler** (stabilny, React 19) wstawia memoizację automatycznie — ręczne `useMemo`/`useCallback`/`React.memo`
  zostają dla przypadków, których kompilator nie obejmuje, i dla bibliotek wymagających stabilnych referencji.
- Odpowiedniki: Vue `computed`, Svelte 5 `$derived`, Angular `computed()` (memoizowane, leniwie przeliczane — fw-angular).
- `memoize` z kluczem `JSON.stringify(args)` jest kosztowny dla dużych tablic i nie ogranicza pamięci — dla danych
  obiektowych użyj `WeakMap` po referencji albo LRU (przykład niżej).
- Przykłady Svelte to składnia Svelte 4 (`export let`, `$:`, `on:click`, `<svelte:component>`); w Svelte 5: `$props()`,
  `$state`, `$derived`, `onclick`, komponent dynamiczny renderujesz wprost (`<Comp />`).

## Problem

Komponenty filtrujące duże zbiory danych (np. 10 000 produktów) przeliczają wynik przy każdym
renderowaniu rodzica, mimo że dane się nie zmieniły — autor obserwował prosty `sort`, który wykonał
się 47 razy podczas jednej interakcji użytkownika. Osobny wariant tego samego problemu: callbacki
inline tworzą nową referencję funkcji przy każdym renderze, wyzwalając niepotrzebne re-rendery
zmemoizowanych komponentów podrzędnych.

## Rozwiązanie

„Cache the results of expensive computations so that when inputs haven't changed, you return the
cached value instead of recalculating.” W React: `useMemo` dla wartości, `useCallback` dla funkcji.
Vue automatycznie cache'uje computed properties. Svelte robi to przez reaktywne instrukcje (`$:`).
Autor wprost przestrzega: „unikaj memoizowania wszystkiego — narzut memoizacji może przekroczyć
koszt przeliczenia tanich operacji”.

## Przykłady kodu

### Basic Memoization — React

```javascript
function ProductList({ products, category, sortBy }) {
  // Only recomputes when products or category change
  const filteredProducts = useMemo(() => {
    return products.filter(p => p.category === category);
  }, [products, category]);

  // Chain memoizations for multi-step transformations
  const sortedProducts = useMemo(() => {
    return [...filteredProducts].sort((a, b) =>
      a[sortBy] > b[sortBy] ? 1 : -1
    );
  }, [filteredProducts, sortBy]);

  return (
    <ul>
      {sortedProducts.map(p => <li key={p.id}>{p.name}</li>)}
    </ul>
  );
}
```

### Basic Memoization — Vue

```vue
<script setup>
import { computed } from 'vue';

const props = defineProps(['products', 'category']);

// computed() automatically memoizes
const filteredProducts = computed(() => {
  return props.products.filter(p => p.category === props.category);
});

const sortedProducts = computed(() => {
  return [...filteredProducts.value].sort((a, b) => a.name.localeCompare(b.name));
});
</script>

<template>
  <ul>
    <li v-for="product in sortedProducts" :key="product.id">
      {{ product.name }}
    </li>
  </ul>
</template>
```

### Basic Memoization — Svelte

```svelte
<script>
  export let products;
  export let category;
  export let sortBy;

  // Reactive statements are automatically memoized
  $: filteredProducts = products.filter(p => p.category === category);
  $: sortedProducts = [...filteredProducts].sort((a, b) =>
    a[sortBy] > b[sortBy] ? 1 : -1
  );
</script>

<ul>
  {#each sortedProducts as product (product.id)}
    <li>{product.name}</li>
  {/each}
</ul>
```

### Basic Memoization — Vanilla JS

```javascript
function memoize(fn) {
  const cache = new Map();

  return function(...args) {
    const key = JSON.stringify(args);
    if (cache.has(key)) return cache.get(key);

    const result = fn(...args);
    cache.set(key, result);
    return result;
  };
}

// Wrap expensive function
const filterProducts = memoize((products, category) => {
  return products.filter(p => p.category === category);
});

filterProducts(products, 'electronics'); // Computes and caches
filterProducts(products, 'electronics'); // Returns cached result
```

### Callback Memoization

```javascript
function TodoList({ todos, onToggle }) {
  // Stable reference prevents child re-renders
  const handleToggle = useCallback((id) => {
    onToggle(id);
  }, [onToggle]);

  return (
    <ul>
      {todos.map(todo => (
        <TodoItem key={todo.id} todo={todo} onToggle={handleToggle} />
      ))}
    </ul>
  );
}

// React.memo skips re-render if props unchanged
const TodoItem = React.memo(({ todo, onToggle }) => (
  <li onClick={() => onToggle(todo.id)}>{todo.text}</li>
));
```

### Component Memoization

```javascript
// Wrap component to prevent re-renders when props unchanged
const ExpensiveComponent = React.memo(({ data }) => {
  const processedData = data.map(item => ({
    ...item,
    computed: expensiveCalculation(item)
  }));

  return processedData.map(item => <div key={item.id}>{item.computed}</div>);
});

// Custom comparison for complex props
const CustomCompare = React.memo(
  ({ data, config }) => { /* ... */ },
  (prev, next) => prev.data.length === next.data.length && prev.config.id === next.config.id
);
```

### LRU Cache for Limited Memory

```javascript
class LRUCache {
  constructor(maxSize = 100) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  get(key) {
    if (!this.cache.has(key)) return undefined;
    const value = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, value); // Move to end (most recent)
    return value;
  }

  set(key, value) {
    if (this.cache.has(key)) this.cache.delete(key);
    this.cache.set(key, value);
    if (this.cache.size > this.maxSize) {
      this.cache.delete(this.cache.keys().next().value); // Evict oldest
    }
  }
}
```

### Selector Pattern

```javascript
import { createSelector } from 'reselect';

const getProducts = state => state.products;
const getCategory = state => state.category;

// Memoized selector - only recomputes when inputs change
const getFilteredProducts = createSelector(
  [getProducts, getCategory],
  (products, category) => products.filter(p => p.category === category)
);

// Chained selectors
const getSortedProducts = createSelector(
  [getFilteredProducts, state => state.sortBy],
  (filtered, sortBy) => [...filtered].sort((a, b) => a[sortBy] > b[sortBy] ? 1 : -1)
);
```

### Fibonacci with Memoization

```javascript
// Exponential time -> linear time
const fibonacci = (() => {
  const cache = {};
  return function fib(n) {
    if (n in cache) return cache[n];
    if (n <= 1) return n;
    return cache[n] = fib(n - 1) + fib(n - 2);
  };
})();

fibonacci(50); // Instant with memoization
```

## Zalety

- Kosztowne operacje wykonują się tylko, gdy dane rzeczywiście się zmieniają.
- Znika widoczne opóźnienie w polach wyszukiwania i interakcjach scroll.
- Stabilne referencje callbacków zapobiegają kaskadowym re-renderom.
- Złożony stan pochodny (derived state) staje się praktyczny do utrzymania.
- Mniejsze zużycie CPU, lepsze działanie na urządzeniach mobilnych.

## Wady / tradeoffs

- Memoizacja handluje pamięcią za czas CPU — to nie jest darmowe.
- Dla tanich operacji narzut samej memoizacji może pogorszyć wydajność.
- Tablice zależności w React (`useMemo`/`useCallback`) łatwo się mylą.
- Porównanie płytkie (shallow) ma ograniczenia — nie wykrywa zmian zagnieżdżonych w obiekcie.
- Debugowanie zmemoizowanego kodu jest trudniejsze — breakpointy trafiają tylko czasem.
- Niestandardowe funkcje porównania w `React.memo` są podatne na błędy.
- Łatwo o nadmierne memoizowanie „na wszelki wypadek”.
- Memoizować należy tylko czyste funkcje (bez efektów ubocznych).

## Powiązane wzorce

- [Pure Component](../components/pure-component.md) — Components.
- Memoization — Wikipedia.
- `React.memo` i `useMemo` — dokumentacja React.
- Computed Properties — dokumentacja Vue.
- Reactive Statements — dokumentacja Svelte.

## Kiedy używać / kiedy NIE używać

Używaj dla operacji obliczeniowo ciężkich, wywoływanych często z tymi samymi argumentami — ale
**najpierw zmierz/sprofiluj**, żeby potwierdzić realny problem wydajności, zanim dodasz memoizację.
To dosłowna ilustracja YAGNI z `../principles.md`: memoizacja „na wszelki wypadek” dla tanich
operacji jest czystym narzutem bez zysku — dodaje złożoność (tablice zależności, ryzyko błędnego
porównania) w miejscu, gdzie problem wydajności nigdy nie istniał.
