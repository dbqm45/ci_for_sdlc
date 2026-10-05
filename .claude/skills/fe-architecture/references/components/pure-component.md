# Pure Component

> **Spis treści:** Metadane · TLDR · Uwagi (stan 2026, poprawki względem źródła) · Problem · Rozwiązanie · Przykłady kodu · Zalety · Wady / tradeoffs · Powiązane wzorce · Kiedy używać / kiedy NIE używać

Źródło: frontendpatterns.dev/pure-component.

## Metadane

- **Kategoria:** Components
- **Poziom:** Beginner
- **Przykłady:** React, Vue, Svelte, Native web
- **Data aktualizacji:** September 26, 2025
- **Autor:** Den Odell

## TLDR

„Build components that produce the same output for the same inputs with no side effects, enabling memoization and predictable testing.”

## Uwagi (stan 2026, poprawki względem źródła)

- **React Compiler** (stabilny od 2025, React 19) automatycznie memoizuje komponenty i wartości — w projektach z
  kompilatorem ręczne `React.memo`/`useCallback` są zwykle zbędne; czystość renderu jest wtedy **warunkiem**
  poprawnej kompilacji. Odpowiedniki czystych obliczeń: Vue `computed`, Svelte 5 `$derived`, Angular `computed()`
  + `OnPush`/zoneless (fw-angular).
- „Fetch w `useEffect`” to minimum; lepsza jest warstwa danych/loader (resilience/async-boundary.md).
- Przykład Web Components poprawiony z `innerHTML` na `textContent`.
- Przykłady Vue w Options API (`data`, `mounted`) — w nowym kodzie Composition API (`<script setup>`).
- Przykłady Svelte to składnia Svelte 4 (`export let`, `$:`, `on:click`, `<slot>`); w Svelte 5: `$props()`, `$state`,
  `$derived`, `$effect`, atrybuty `onclick`, snippety zamiast slotów.

## Problem

Komponenty renderujące różne wyniki dla identycznych propsów (odczyt aktualnego czasu podczas renderu, odczyt globalnego stanu, wywołania analityczne w trakcie renderowania). To uniemożliwia memoizację, powoduje niestabilne testy i warunki wyścigu.

## Rozwiązanie

Buduj czyste funkcje komponentów: identyczne propsy → identyczne wyjście, zero efektów ubocznych podczas renderu. Efekty uboczne (fetch, subskrypcje, analytics) przenieś do `useEffect` (albo odpowiednika we frameworku), nie do ciała funkcji renderującej.

## Przykłady kodu

### React

```javascript
const Greeting = React.memo(function Greeting({ name, title }) {
  return (
    <div>
      <h1>Hello, {name}!</h1>
      {title && <p>{title}</p>}
    </div>
  );
});
```

### Vue

```html
<template>
  <div>
    <h1>Hello, {{ name }}!</h1>
    <p>{{ greeting }}</p>
  </div>
</template>

<script>
export default {
  props: ['name'],
  computed: {
    greeting() {
      return `Welcome, ${this.name}!`;
    }
  }
};
</script>
```

### Svelte

```svelte
<script>
  export let firstName;
  export let lastName;

  $: fullName = `${firstName} ${lastName}`;
</script>

<div>
  <h1>{fullName}</h1>
</div>
```

### Web Components

```javascript
class PureGreeting extends HTMLElement {
  static get observedAttributes() { return ['name']; }

  attributeChangedCallback(name, oldValue, newValue) {
    if (newValue !== oldValue) this.render();
  }

  render() {
    const h1 = document.createElement('h1');
    h1.textContent = `Hello, ${this.getAttribute('name')}!`;
    this.replaceChildren(h1);
  }
}
customElements.define('pure-greeting', PureGreeting);
```

### Pure vs impure

**Impure (unikać) — odczytuje stan zewnętrzny podczas renderu:**

```javascript
function ImpureTimestamp({ prefix }) {
  const time = new Date().toLocaleTimeString();
  return <div>{prefix}: {time}</div>;
}
```

**Pure (preferować) — czas jest propem, wyjście przewidywalne:**

```javascript
function PureTimestamp({ prefix, time }) {
  return <div>{prefix}: {time}</div>;
}
```

### Aktualizacje niemutujące (immutable)

```javascript
const UserDisplay = React.memo(({ user }) => <div>{user.name}</div>);

// Mutacja — ta sama referencja, brak re-rendera
user.name = 'Bob';
<UserDisplay user={user} />

// Immutable — nowa referencja, re-render następuje
const updated = { ...user, name: 'Bob' };
<UserDisplay user={updated} />
```

### Testowanie memoizacji

```javascript
test('memoized component skips re-render with same props', () => {
  const renderSpy = jest.fn();
  const MemoizedGreeting = React.memo(({ name }) => {
    renderSpy();
    return <div>{name}</div>;
  });

  const { rerender } = render(<MemoizedGreeting name="Alice" />);
  expect(renderSpy).toHaveBeenCalledTimes(1);

  rerender(<MemoizedGreeting name="Alice" />);
  expect(renderSpy).toHaveBeenCalledTimes(1); // Skipped

  rerender(<MemoizedGreeting name="Bob" />);
  expect(renderSpy).toHaveBeenCalledTimes(2); // Rendered
});
```

### Efekty uboczne w Effects, nie w renderze

**Unikać — fetch synchroniczny podczas renderu powoduje zduplikowane wywołania:**

```javascript
function BadProfile({ userId }) {
  const user = fetchUserSync(userId);
  return <div>{user.name}</div>;
}
```

**Preferować — fetch w `useEffect`, render pozostaje czysty:**

```javascript
function GoodProfile({ userId }) {
  const [user, setUser] = useState(null);
  useEffect(() => { 
    fetchUser(userId).then(setUser); 
  }, [userId]);
  return user ? <div>{user.name}</div> : <div>Loading...</div>;
}
```

### Stabilne referencje callbacków

```javascript
function TodoList({ todos }) {
  const handleToggle = useCallback((id) => toggleTodo(id), []);

  return todos.map(todo => (
    <TodoItem key={todo.id} todo={todo} onToggle={handleToggle} />
  ));
}

const TodoItem = React.memo(({ todo, onToggle }) => (
  <li onClick={() => onToggle(todo.id)}>{todo.text}</li>
));
```

## Zalety

- Zachowanie przewidywalne — identyczne propsy zawsze dają identyczne wyjście.
- Memoizacja rzeczywiście działa — `React.memo` (i odpowiedniki) skutecznie pomijają zbędne re-rendery.
- Testowanie proste — tylko propsy na wejściu i asercja na wyjściu, bez mockowania efektów.
- Reużywalność lepsza — komponent bez zewnętrznych zależności działa wszędzie.
- Timing bugs znikają — efekty przeniesione do `useEffect` dają kontrolę nad momentem wykonania.
- Bezpieczny dla concurrent rendering — React może renderować wielokrotnie bez duplikowania efektów ubocznych.

## Wady / tradeoffs

- Efekty uboczne muszą wyjść z ciała renderu — fetch, subskrypcje, analytics zawsze do `useEffect`/odpowiednika.
- Memoizacja ma swój koszt (overhead porównania) — dla szybko zmieniających się propsów koszt może przewyższyć korzyść.
- Shallow comparison ma granice — zmiana `user.name` bez zmiany referencji obiektu `user` nie wywoła re-rendera.
- Callbacki przekazywane jako propsy potrzebują `useCallback` — inline funkcje tworzą nową referencję przy każdym renderze, unieważniając memoizację dziecka.
- Nie wszystko może być czyste — imperatywne API (np. focus, scroll) z natury mają efekt uboczny.
- Profiluj przed optymalizacją — `React.memo` „na wszelki wypadek” wszędzie dodaje niepotrzebny narzut porównań.

## Powiązane wzorce

- [Memoization](../performance/memoization.md) — Performance.
- `React.memo` — React docs.
- Computed Properties — Vue docs.
- Reactive Declarations — Svelte docs.
- Pure Functions — Wikipedia.

## Kiedy używać / kiedy NIE używać

Trzymaj komponenty czyste **domyślnie** — to nie jest optymalizacja opcjonalna, to warunek, żeby memoizacja/concurrent rendering w ogóle miały sens, i żeby testy były deterministyczne.

Nie owijaj każdego komponentu w `React.memo` „na wszelki wypadek” bez zmierzonego problemu wydajnościowego — koszt porównania propsów bywa większy niż koszt samego re-renderu dla prostych komponentów; to klasyczna premature optimization (patrz YAGNI w `../principles.md`). Najpierw zmierz, potem memoizuj tam, gdzie realnie boli.
