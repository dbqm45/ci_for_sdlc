# Debounce

> **Spis treści:** Metadane · TLDR · Uwagi (stan 2026, poprawki względem źródła) · Problem · Rozwiązanie · Przykłady kodu · Zalety · Wady / tradeoffs · Powiązane wzorce · Kiedy używać / kiedy NIE używać

Źródło: frontendpatterns.dev/debounce.

## Metadane

- **Kategoria:** Performance
- **Poziom:** Intermediate
- **Przykłady frameworków:** React, Vue, Svelte, Native web
- **Data aktualizacji:** 19 grudnia 2025
- **Autor:** Den Odell

## TLDR

„Czekaj, aż dane wejściowe się ustabilizują, zanim zareagujesz. Wykonuj wywołania API, walidacje lub
kosztowne obliczenia raz, po zatrzymaniu się pisania, zamiast przy każdym naciśnięciu klawisza.”

## Uwagi (stan 2026, poprawki względem źródła)

- Debounce nie usuwa wyścigów — przy zmianie zapytania **anuluj poprzednie żądanie** (`AbortController`) i koduj
  parametry (`encodeURIComponent`). Poprawiono przykład React.
- Odpowiedniki gotowe: Angular `debounced()` na signalach / `debounceTime` w RxJS (fw-angular); React 19
  `useDeferredValue` dla drogiego renderu (to nie debounce sieci, tylko priorytet renderu); Vue `watchDebounced`
  (VueUse).
- Dla `resize` często lepszy jest `ResizeObserver` na konkretnym elemencie niż debounce na `window`.
- Przykład Web Components wstawiał wyniki przez `innerHTML` (XSS) — używaj `textContent`/DOM API.
- Przykłady Svelte to składnia Svelte 4 (`export let`, `$:`, `on:click`, `<svelte:component>`); w Svelte 5: `$props()`,
  `$state`, `$derived`, `onclick`, komponent dynamiczny renderujesz wprost (`<Comp />`).

## Problem

Szybkie zdarzenia (np. wpisywanie w pole wyszukiwania) generują niepotrzebne żądania API — wpisanie
„javascript” wysyła siedem osobnych żądań, po jednym na literę. To marnuje pasmo, przeciąża serwer i
powoduje race conditions, gdy odpowiedzi wracają w niewłaściwej kolejności. Ten sam problem dotyczy
handlerów `resize` (60+ obliczeń/s) i walidacji formularzy (błędy pokazywane przed dokończeniem
wpisywania).

## Rozwiązanie

Debouncing opóźnia wykonanie funkcji do momentu upłynięcia okresu ciszy bez nowych zdarzeń — wzorzec
`clearTimeout(timeoutId); timeoutId = setTimeout(fn, delay);` anuluje oczekujące wykonanie i planuje
nowe. Zakresy opóźnień: 150–200ms dla responsywnego autocomplete, 300–500ms dla kosztownych wywołań
API.

**Kiedy debounce jest złym wyborem:** gdy potrzebujesz okresowych aktualizacji podczas ciągłej
aktywności (np. scroll-spy podświetlający aktywną sekcję) — debounced handler nie da feedbacku w
trakcie przewijania. Rozwiązanie w takim przypadku: **throttle** (wykonanie w regularnych
odstępach, np. co 100ms), nie debounce.

## Przykłady kodu

### React

```javascript
import { useState, useEffect } from 'react';

function useDebouncedValue(value, delay = 300) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timeoutId);
  }, [value, delay]);

  return debouncedValue;
}

function SearchInput() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const debouncedQuery = useDebouncedValue(query, 300);

  useEffect(() => {
    if (!debouncedQuery) return;
    const controller = new AbortController();
    fetch(`/api/search?q=${encodeURIComponent(debouncedQuery)}`, { signal: controller.signal })
      .then(res => res.json())
      .then(setResults)
      .catch(err => { if (err.name !== 'AbortError') throw err; });
    return () => controller.abort(); // stale responses never land
  }, [debouncedQuery]);

  return (
    <div>
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search..." />
      <ul>{results.map(item => <li key={item.id}>{item.name}</li>)}</ul>
    </div>
  );
}
```

### Vue

```javascript
<script setup>
import { ref, onBeforeUnmount } from 'vue';

const query = ref('');
const results = ref([]);
let timeoutId = null;

function handleInput(event) {
  query.value = event.target.value;
  clearTimeout(timeoutId);
  timeoutId = setTimeout(async () => {
    const response = await fetch(`/api/search?q=${query.value}`);
    results.value = await response.json();
  }, 300);
}

onBeforeUnmount(() => clearTimeout(timeoutId));
</script>

<template>
  <div>
    <input :value="query" @input="handleInput" placeholder="Search..." />
    <ul><li v-for="item in results" :key="item.id">{{ item.name }}</li></ul>
  </div>
</template>
```

### Svelte

```javascript
<script>
  import { onDestroy } from 'svelte';

  let query = '';
  let results = [];
  let timeoutId;

  function handleInput(event) {
    query = event.target.value;
    clearTimeout(timeoutId);
    timeoutId = setTimeout(async () => {
      const response = await fetch(`/api/search?q=${query}`);
      results = await response.json();
    }, 300);
  }

  onDestroy(() => clearTimeout(timeoutId));
</script>

<div>
  <input value={query} on:input={handleInput} placeholder="Search..." />
  <ul>{#each results as item}<li>{item.name}</li>{/each}</ul>
</div>
```

### Web Components

```javascript
function debounce(fn, delay) {
  let timeoutId;
  return function(...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this, args), delay);
  };
}

class SearchInput extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `<input type="text" placeholder="Search..." /><ul class="results"></ul>`;
    const input = this.querySelector('input');
    const resultsList = this.querySelector('.results');

    const debouncedSearch = debounce(async (query) => {
      const response = await fetch(`/api/search?q=${query}`);
      const results = await response.json();
      resultsList.replaceChildren(...results.map(item => {
        const li = document.createElement('li');
        li.textContent = item.name;
        return li;
      }));
    }, 300);

    input.addEventListener('input', (e) => debouncedSearch(e.target.value));
  }
}

customElements.define('search-input', SearchInput);
```

### Debounce with Loading State

```javascript
function SearchInput() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const debouncedQuery = useDebouncedValue(query, 300);

  useEffect(() => {
    if (!debouncedQuery) return;
    setIsSearching(true);
    fetch(`/api/search?q=${debouncedQuery}`)
      .then(res => res.json())
      .then(data => { setResults(data); setIsSearching(false); });
  }, [debouncedQuery]);

  return (
    <div>
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search..." />
      {isSearching && <span>Searching...</span>}
      <ul>{results.map(item => <li key={item.id}>{item.name}</li>)}</ul>
    </div>
  );
}
```

### Debounced Window Resize Handler

```javascript
const debouncedResize = debounce(() => {
  recalculateLayout();
  updateResponsiveElements();
}, 150);

window.addEventListener('resize', debouncedResize);
window.removeEventListener('resize', debouncedResize); // cleanup
```

## Zalety

- Pole wyszukiwania wysyła jedno żądanie po ustaniu wpisywania, zamiast jednego na literę.
- Kosztowne handlery `resize` uruchamiają się raz po zakończeniu gestu, nie kilkadziesiąt razy/s.
- Race conditions z odpowiedziami przychodzącymi poza kolejnością stają się rzadkie.
- Walidacja formularza czeka, aż użytkownik się zatrzyma, zanim pokaże błąd.
- Poprawia się czas pracy baterii na urządzeniach mobilnych.
- Implementacja to kilka linii wokół `setTimeout`/`clearTimeout` — brak zależności.

## Wady / tradeoffs

- Opóźnienie jest zawsze obecne, niezależnie od szybkości operacji.
- Wybór opóźnienia wymaga balansu między responsywnością a efektywnością.
- Zarządzanie timerami łatwo zepsuć — zapomnienie `clearTimeout` przy unmount powoduje wyciek pamięci.
- Powolni użytkownicy (pauzy dłuższe niż opóźnienie) mogą wyzwolić wiele żądań mimo debounce.
- Bez wskaźnika „searching…” opóźnienie może wydawać się brakiem reakcji UI.
- Debounce **nie** jest rate-limiterem — ciągłe pisanie bez przerw nigdy nie wyzwoli funkcji.

## Powiązane wzorce

- [Code Splitting](../performance/code-splitting.md) — Performance.
- [Lazy Loading](../performance/lazy-loading.md) — Performance.
- [Memoization](../performance/memoization.md) — Performance.
- Debouncing and Throttling Explained — CSS-Tricks.
- Debounce — dokumentacja Lodash.
- `setTimeout()` — MDN.

## Kiedy używać / kiedy NIE używać

Używaj dla zdarzeń, gdzie liczy się **wynik końcowy po ustaniu aktywności** — pole wyszukiwania,
walidacja formularza, `resize`. **Nie** używaj, gdy potrzebny jest feedback **w trakcie** ciągłej
aktywności (scroll-spy) — tam prawidłowy wzorzec to throttle, nie debounce; użycie złego z tych
dwóch to częsty, konkretny błąd, nie subtelny trade-off.
