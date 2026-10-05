# Component Lifecycle

> **Spis treści:** Metadane · TLDR · Uwagi (stan 2026, poprawki względem źródła) · Problem · Rozwiązanie · Przykłady kodu · Zalety · Wady / tradeoffs · Powiązane wzorce · Kiedy używać / kiedy NIE używać

Źródło: frontendpatterns.dev/component-lifecycle.

## Metadane

- **Kategoria:** Components
- **Poziom:** Beginner
- **Przykłady:** React, Vue, Svelte, Native web
- **Data aktualizacji:** September 26, 2025
- **Autor:** Den Odell

## TLDR

„Hook into mount, update, and unmount phases to fetch data, sync with external systems, and clean up resources without causing leaks or stale state.”

## Uwagi (stan 2026, poprawki względem źródła)

- Zasada jest agnostyczna: **każdy zasób otwarty przy montowaniu ma symetryczne zamknięcie**. Odpowiedniki: React
  `useEffect` + cleanup; Vue `onMounted`/`onUnmounted` lub `watch(..., { onCleanup })`/`onWatcherCleanup`; Svelte 5
  `$effect` zwracający cleanup; Angular (fw-angular) `DestroyRef.onDestroy`, `takeUntilDestroyed()`, `effect(onCleanup => …)`;
  Web Components `connectedCallback`/`disconnectedCallback`.
- Wiele „ręcznych” efektów pobierających dane zastępują dziś warstwy danych (TanStack Query, loadery routera,
  Angular `httpResource`) — efekt zostaje dla synchronizacji z systemami zewnętrznymi (subskrypcje, DOM, timery).
- React w StrictMode (dev) celowo montuje efekt dwa razy — brak cleanupu wychodzi wtedy od razu.
- W zapytaniach koduj parametry: `` `/api/search?q=${encodeURIComponent(query)}` `` (poprawione niżej).
- Przykład Web Components poprawiony z `innerHTML` na `textContent`.
- Przykłady Svelte to składnia Svelte 4 (`export let`, `$:`, `on:click`, `<slot>`); w Svelte 5: `$props()`, `$state`,
  `$derived`, `$effect`, atrybuty `onclick`, snippety zamiast slotów.

## Problem

Wycieki pamięci w aplikacjach frontendowych: słuchacze zdarzeń nigdy nie usunięci, subskrypcje niezamknięte, timery działające dla już usuniętych komponentów. Przykład ze strony: nawigacja po 50 stronach aplikacji tworzy 500 „osieroconych” słuchaczy zdarzeń, bo każdy mount dodawał nowego, a żaden unmount go nie usuwał.

## Rozwiązanie

Każdy otworzony zasób wymaga zamknięcia, każdy słuchacz — usunięcia, każdy timer — wyczyszczenia w odpowiednim momencie cyklu życia komponentu. Na montowaniu: ustaw słuchaczy, rozpocznij subskrypcje, pobierz dane, inicjalizuj zasoby. Na demontowaniu: odwróć to wszystko, symetrycznie. Współczesne frameworki dają na to gotowe haki: React `useEffect` z funkcją czyszczącą (return), Vue `onMounted`/`onUnmounted`, Svelte `onMount`/`onDestroy`.

## Przykłady kodu

### React — Basic Lifecycle with Cleanup

```javascript
import { useEffect, useState } from 'react';

function DataSubscriber({ userId }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    const subscription = dataSource.subscribe(userId, setData);

    // Cleanup runs on unmount or before re-running effect
    return () => subscription.unsubscribe();
  }, [userId]);

  return <div>{data ? data.name : 'Loading...'}</div>;
}
```

### Vue

```javascript
<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue';

const props = defineProps(['userId']);
const data = ref(null);
let subscription = null;

onMounted(() => {
  subscription = dataSource.subscribe(props.userId, newData => {
    data.value = newData;
  });
});

onUnmounted(() => {
  if (subscription) subscription.unsubscribe();
});

watch(() => props.userId, (newId) => {
  if (subscription) subscription.unsubscribe();
  subscription = dataSource.subscribe(newId, newData => {
    data.value = newData;
  });
});
</script>
```

### Svelte

```javascript
<script>
  import { onMount } from 'svelte';

  export let userId;
  let subscription;
  let data;

  onMount(() => {
    subscription = dataSource.subscribe(userId, newData => {
      data = newData;
    });
    // Return cleanup function
    return () => subscription.unsubscribe();
  });

  // React to prop changes
  $: if (userId) {
    if (subscription) subscription.unsubscribe();
    subscription = dataSource.subscribe(userId, newData => {
      data = newData;
    });
  }
</script>
```

### Web Components

```javascript
class DataSubscriber extends HTMLElement {
  constructor() {
    super();
    this.subscription = null;
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    const userId = this.getAttribute('user-id');
    this.subscription = dataSource.subscribe(userId, data => this.render(data));
  }

  disconnectedCallback() {
    if (this.subscription) this.subscription.unsubscribe();
  }

  static get observedAttributes() { return ['user-id']; }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'user-id' && oldValue !== newValue) {
      if (this.subscription) this.subscription.unsubscribe();
      this.subscription = dataSource.subscribe(newValue, data => this.render(data));
    }
  }

  render(data) {
    const div = document.createElement('div');
    div.textContent = data.name; // never interpolate data into innerHTML
    this.shadowRoot.replaceChildren(div);
  }
}

customElements.define('data-subscriber', DataSubscriber);
```

### Handling Multiple Lifecycle Concerns

```javascript
function UserProfile({ userId }) {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const subscription = dataSource.subscribe(userId, setUser);
    const interval = setInterval(() => console.log('Polling'), 5000);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      subscription.unsubscribe();
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [userId]);

  return <div>{user?.name}</div>;
}
```

### Preventing Race Conditions with Abort Controllers

```javascript
function SearchResults({ query }) {
  const [results, setResults] = useState([]);

  useEffect(() => {
    const controller = new AbortController();

    fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
      .then(res => res.json())
      .then(setResults)
      .catch(err => {
        if (err.name !== 'AbortError') console.error(err);
      });

    return () => controller.abort();
  }, [query]);

  return <ul>{results.map(r => <li key={r.id}>{r.title}</li>)}</ul>;
}
```

### Conditional Effects

```javascript
function ConditionalEffect({ shouldSubscribe, userId }) {
  useEffect(() => {
    if (!shouldSubscribe) return;

    const subscription = dataSource.subscribe(userId, setData);
    return () => subscription.unsubscribe();
  }, [shouldSubscribe, userId]);

  return <div>{/* ... */}</div>;
}
```

## Zalety

- Wyciek pamięci ustaje po odpowiednim czyszczeniu — aplikacja działa bez degradacji przy długiej nawigacji.
- Warunki wyścigu (race conditions) zanikają, gdy przestarzałe żądania są przerywane przy zmianie zależności (patrz `AbortController`).
- Zachowanie przewidywalne — efekty uruchamiają się w dokładnie określonych punktach cyklu życia.
- Zasoby zewnętrzne (WebSocket, interwały, słuchacze) są zarządzane symetrycznie: otwarcie na mount, zamknięcie na unmount.
- Reakcja na zmianę propsów jest jawna: zmiana `userId` = odsubskrybowanie starych danych i subskrypcja nowych.
- Debugowanie łatwiejsze — efekty scentralizowane w hakach cyklu życia, nie rozproszone losowo po komponencie.

## Wady / tradeoffs

- Zapomnienie funkcji czyszczącej jest łatwe; wynikające wycieki pamięci są subtelne i trudne do zdiagnozowania.
- Tablice zależności w React bywają trudne — błędy prowadzą do domknięć z nieaktualnymi wartościami albo do nieskończonych pętli.
- Komponent z pięcioma i więcej efektami staje się trudny do zrozumienia i utrzymania.
- `useEffect` w React uruchamia się asynchronicznie, po malowaniu przeglądarki — do synchronicznego czasu przed malowaniem trzeba rzadszego `useLayoutEffect`.
- Funkcja czyszcząca musi być synchroniczna — nie można zwrócić `Promise`; czyszczenie asynchroniczne wymaga innego podejścia.
- Frameworki różnią się semantyką czasową (React: async po paint; Vue: sync) — nie da się przenieść intuicji 1:1 między nimi.
- Testowanie zachowania cyklu życia wymaga uważnego setup/teardown — efekt z jednego testu może „przeciekać” do drugiego.

## Powiązane wzorce

- [Async Boundary](../resilience/async-boundary.md) — Resilience.
- `useEffect` — React docs.
- Lifecycle Hooks — Vue docs.
- Lifecycle — Svelte docs.
- Custom Elements Lifecycle — MDN.

## Kiedy używać / kiedy NIE używać

Używaj świadomego zarządzania cyklem życia zawsze, gdy komponent otwiera **jakikolwiek** zasób zewnętrzny (subskrypcja, timer, listener, żądanie sieciowe) — to nie jest optymalizacja „dla dużych aplikacji”, to podstawowy warunek, żeby aplikacja SPA nie degradowała się z czasem nawigacji (zgodne z fundamentem „Resilience by Design”, `../principles.md`).

Nie komplikuj tego tam, gdzie nie ma żadnego zasobu do zamknięcia — komponent czysto prezentacyjny bez efektów nie potrzebuje `useEffect` „na wszelki wypadek”; to byłoby dokładanie boilerplate’u bez żadnego realnego zysku (YAGNI). Jeśli komponent zbiera 5+ niezależnych efektów, rozważ rozbicie go na mniejsze, bardziej wyspecjalizowane komponenty/hooki, zamiast koordynować wszystko w jednym miejscu.
