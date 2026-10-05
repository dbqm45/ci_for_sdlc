# Presentational vs. Container

> **Spis treści:** Metadane · TLDR · Uwagi (stan 2026, poprawki względem źródła) · Problem · Rozwiązanie · Przykłady kodu · Zalety · Wady / tradeoffs · Powiązane wzorce · Kiedy używać / kiedy NIE używać

Źródło: frontendpatterns.dev/presentational-vs-container.

## Metadane

- **Kategoria:** Components
- **Poziom:** Beginner
- **Przykłady:** React, Vue, Svelte
- **Data aktualizacji:** September 26, 2025
- **Autor:** Den Odell

## TLDR

„Separate dumb components that just render props from smart components that manage data, making UI reusable and trivial to test.”

## Uwagi (stan 2026, poprawki względem źródła)

- Rola „kontenera” to dziś częściej **hook / composable / serwis** (React custom hook, Vue composable, Angular serwis
  z `signal`/`httpResource`) albo loader trasy / Server Component, a komponent prezentacyjny dostaje dane przez
  wejścia. Zasada zostaje: UI renderuje z wejść, logika danych żyje gdzie indziej.
- Ręczne `useEffect` + `fetch` w przykładach nie obsługuje anulowania ani wyścigów — w produkcji użyj warstwy danych
  (resilience/loading-state.md, TanStack Query itp.).
- `<li onClick>` nie jest dostępny z klawiatury — w realnym kodzie użyj `<button>`/`<a>` wewnątrz `<li>`
  (fe-web-platform, `.claude/skills/fe-web-platform/references/accessibility/semantic-html.md`).
- Testy: `screen.getByRole(...)` zamiast destrukturyzacji z `render` (testing/component-testing.md).
- Przykłady Vue w Options API (`data`, `mounted`) — w nowym kodzie Composition API (`<script setup>`).
- Przykłady Svelte to składnia Svelte 4 (`export let`, `$:`, `on:click`, `<slot>`); w Svelte 5: `$props()`, `$state`,
  `$derived`, `$effect`, atrybuty `onclick`, snippety zamiast slotów.

## Problem

Komponent o 800 liniach mieszający: wywołania API, obsługę błędów, transformację danych i JSX. Efekt: trudne testowanie, brak możliwości ponownego użycia komponentu z innym źródłem danych, brak jasnej granicy między logiką stylistyczną i biznesową.

## Rozwiązanie

Podział na dwa typy komponentów: **prezentacyjne** (renderują UI wyłącznie na podstawie propsów, bez efektów ubocznych) i **kontenerowe** (zarządzają stanem, pobierają dane, obsługują błędy i przekazują wynik do komponentu prezentacyjnego jako propsy).

## Przykłady kodu

### React

```javascript
// Presentational - only renders UI
function UserList({ users, onUserClick, loading, error }) {
  if (loading) return <div className="spinner">Loading...</div>;
  if (error) return <div className="error">{error.message}</div>;
  if (users.length === 0) return <div className="empty">No users</div>;

  return (
    <ul className="user-list">
      {users.map(user => (
        <li key={user.id} onClick={() => onUserClick(user.id)}>
          <img src={user.avatar} alt="" />
          <h3>{user.name}</h3>
        </li>
      ))}
    </ul>
  );
}

// Container - handles data fetching and state
function UserListContainer() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchUsers()
      .then(setUsers)
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  const handleUserClick = async (userId) => {
    await trackUserClick(userId);
    navigate(`/user/${userId}`);
  };

  return (
    <UserList
      users={users}
      onUserClick={handleUserClick}
      loading={loading}
      error={error}
    />
  );
}
```

### Vue

```vue
<!-- UserList.vue - Presentational -->
<template>
  <div v-if="loading">Loading...</div>
  <div v-else-if="error">{{ error.message }}</div>
  <ul v-else class="user-list">
    <li v-for="user in users" :key="user.id" @click="$emit('user-click', user.id)">
      <h3>{{ user.name }}</h3>
    </li>
  </ul>
</template>

<script>
export default {
  props: ['users', 'loading', 'error'],
  emits: ['user-click']
};
</script>

<!-- UserListContainer.vue - Container -->
<template>
  <UserList :users="users" :loading="loading" :error="error" @user-click="handleUserClick" />
</template>

<script>
import UserList from './UserList.vue';

export default {
  components: { UserList },
  data: () => ({ users: [], loading: true, error: null }),
  async mounted() {
    try {
      this.users = await fetchUsers();
    } catch (err) {
      this.error = err;
    } finally {
      this.loading = false;
    }
  },
  methods: {
    async handleUserClick(userId) {
      await trackUserClick(userId);
      this.$router.push(`/user/${userId}`);
    }
  }
};
</script>
```

### Svelte

```svelte
<!-- UserList.svelte - Presentational -->
<script>
  export let users;
  export let onUserClick;
</script>

<ul>
  {#each users as user (user.id)}
    <li on:click={() => onUserClick(user.id)}>{user.name}</li>
  {/each}
</ul>

<!-- UsersPage.svelte - Container -->
<script>
  import { onMount } from 'svelte';
  import UserList from './UserList.svelte';

  let users = [], loading = true, error = null;

  onMount(async () => {
    try {
      users = await fetchUsers();
    } catch (err) {
      error = err;
    } finally {
      loading = false;
    }
  });
</script>

{#if loading}
  <div>Loading...</div>
{:else if error}
  <div>{error.message}</div>
{:else}
  <UserList {users} onUserClick={(id) => navigate(`/user/${id}`)} />
{/if}
```

### Alternatywa: custom hook zamiast kontenera

```javascript
// Custom hook extracts data logic - replaces container component
function useUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchUsers()
      .then(setUsers)
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  return { users, loading, error };
}

// Component uses hook instead of container wrapper
function UsersPage() {
  const { users, loading, error } = useUsers();
  if (loading) return <Spinner />;
  if (error) return <Error error={error} />;
  return <UserList users={users} onUserClick={(id) => navigate(`/user/${id}`)} />;
}
```

### Ten sam komponent prezentacyjny, różne źródła danych

```javascript
// Same presentational component, different data sources
function ProductList({ items, onItemClick }) {
  return (
    <ul>
      {items.map(item => (
        <li key={item.id} onClick={() => onItemClick(item.id)}>{item.name}</li>
      ))}
    </ul>
  );
}

// From API
function APIProducts() {
  const [items, setItems] = useState([]);
  useEffect(() => { fetchProducts().then(setItems); }, []);
  return <ProductList items={items} onItemClick={trackClick} />;
}

// From WebSocket
function LiveProducts() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const ws = new WebSocket('/products');
    ws.onmessage = (e) => setItems(JSON.parse(e.data));
    return () => ws.close();
  }, []);
  return <ProductList items={items} onItemClick={trackClick} />;
}
```

### Testowanie komponentu prezentacyjnego (bez mockowania danych)

```javascript
test('renders user list', () => {
  const users = [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }];
  const { getByText } = render(<UserList users={users} />);
  expect(getByText('Alice')).toBeInTheDocument();
  expect(getByText('Bob')).toBeInTheDocument();
});

test('calls onClick handler', () => {
  const handleClick = jest.fn();
  const { getByText } = render(
    <UserList users={[{ id: 1, name: 'Alice' }]} onUserClick={handleClick} />
  );
  fireEvent.click(getByText('Alice'));
  expect(handleClick).toHaveBeenCalledWith(1);
});
```

## Zalety

- Komponent prezentacyjny działa z dowolnym źródłem danych (API, WebSocket, props statyczne) bez zmiany kodu.
- Testowanie jest proste — bez mockowania serwisów, tylko propsy i asercje.
- Projektanci/inne zespoły mogą iterować nad UI bez rozumienia logiki pobierania danych.
- Komponenty prezentacyjne są przenośne między projektami.

## Wady / tradeoffs

- Więcej plików i pośredniej indirekcji (dwa komponenty tam, gdzie mógłby być jeden).
- To overkill dla prostych komponentów bez realnej złożoności logiki danych.
- W nowoczesnym React custom hooki (`useUsers()`) często zastępują ten wzorzec — mniej boilerplate.
- Prop drilling i rozmyte granice mogą się pojawić, jeśli podział nie jest konsekwentny.
- Nowoczesne podejście (hooki + kolokacja) faworyzuje trzymanie logiki bliżej komponentu, nie oddzielny plik kontenera.

## Powiązane wzorce

- [Separation of Concerns](../fundamentals/separation-of-concerns.md) — Fundamentals.
- [Single Responsibility](../fundamentals/single-responsibility.md) — Fundamentals.
- [Component Testing](../testing/component-testing.md) — Testing.
- „Smart and Dumb Components” — Dan Abramov.
- „Thinking in React” — React docs.

## Kiedy używać / kiedy NIE używać

Używaj tego rozdzielenia, gdy realnie potrzebujesz **wielokrotnego użycia** tego samego UI z różnymi źródłami danych (przykład: `ProductList` zasilany raz z REST, raz z WebSocket) albo gdy komponent mieszający dane i UI już jest trudny do przetestowania/utrzymania.

Nie wprowadzaj tego podziału mechanicznie dla każdego komponentu z jednym `useEffect` — w nowoczesnym React (hooki) prostszy, jednoplikowy komponent z wydzieloną logiką do custom hooka często daje ten sam zysk (testowalność, reużywalność) bez podwojenia liczby plików. To dokładnie przypadek z eng-design-principles (YAGNI, krytyka nadużywania wzorców): stosuj wzorzec, gdy rozwiązuje nazwany problem, nie „bo jest w podręczniku”.
