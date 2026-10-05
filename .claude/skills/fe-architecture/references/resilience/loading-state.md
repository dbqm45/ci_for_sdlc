# Loading State

> **Spis treści:** Metadane · TLDR · Uwagi (stan 2026, poprawki względem źródła) · Problem · Rozwiązanie · Przykłady kodu · Zalety · Wady / tradeoffs · Powiązane wzorce · Kiedy używać / kiedy NIE używać

Źródło: frontendpatterns.dev/loading-state.

## Metadane

- **Kategoria:** Resilience
- **Poziom:** Advanced
- **Przykłady:** React, Vue, Svelte, Native web
- **Data aktualizacji:** 15 listopada 2025
- **Autor:** Den Odell

## TLDR

Wyświetlaj spinnery, szkielety (skeletons) lub paski postępu podczas operacji asynchronicznych, żeby
użytkownik wiedział, że aplikacja pracuje, i nie porzucał ani nie ponawiał akcji przedwcześnie.

## Uwagi (stan 2026, poprawki względem źródła)

- Modeluj stan jako unię (`idle | loading | error | empty | success`) — nie trzy niezależne flagi. Każdy widok
  danych obsługuje cztery stany: ładowanie, błąd (z akcją „spróbuj ponownie”), pusto, dane.
- W przykładzie React przed nowym żądaniem zeruj `error` (inaczej stary błąd przykrywa nowe dane) — poprawiono.
- Optymistyczne aktualizacje: tylko dla operacji o wysokim prawdopodobieństwie sukcesu, zawsze z rollbackiem;
  React 19 ma `useOptimistic`, TanStack Query — `onMutate`/rollback. Rollback do `todos` z domknięcia może nadpisać
  późniejsze zmiany — cofaj konkretną zmianę, nie cały stan.
- Wyszukiwanie „inline” w przykładzie nie ma debounce ani anulowania — patrz performance/debounce.md.
- Kolory szkieletu w CSS to tokeny (fe-css), a animacja shimmer respektuje `prefers-reduced-motion`.
- `role="progressbar"` wymaga `aria-valuemin`/`aria-valuemax` (albo natywnego `<progress>`) — poprawiono.
- Angular: `resource`/`httpResource` dają `isLoading()`, `error()`, `value()`, `reload()` (fw-angular).
- Przykłady Svelte to składnia Svelte 4 (`export let`); w Svelte 5 `$props()`/`$state`.

## Problem

Użytkownik klika „Zapisz”, ale nic się wizualnie nie zmienia — przycisk wygląda tak samo, formularz
wygląda tak samo. Brak informacji zwrotnej powoduje, że użytkownik klika ponownie, przypadkowo
wysyłając formularz dwa razy, albo odświeża/opuszcza stronę, tracąc swoją pracę, myśląc, że aplikacja
się zawiesiła, choć w rzeczywistości działa w tle.

## Rozwiązanie

„Pokazuj użytkownikom, co się dzieje, zawsze — zbyt wiele aplikacji zapomina tę podstawową zasadę
UX.” Pokazuj spinner/szkielet/pasek postępu podczas ładowania; wyłączaj przyciski i zmieniaj ich
etykietę na „Zapisywanie…”; dla długich operacji pokazuj **realny** postęp („Przesyłanie: 47%”), nie
nieokreślony spinner; rozdzielaj stan ładowania od stanu danych i od stanu błędu (trzy różne stany,
nie jeden boolean).

Szkielety ekranów (skeleton screens) działają szczególnie dobrze — pokazują **kształt** nadchodzącej
treści, co sprawia, że ładowanie subiektywnie „czuje się” szybsze niż pusty spinner, nawet przy
identycznym rzeczywistym czasie oczekiwania.

## Przykłady kodu

### Basic Loading State — React

```javascript
function UserProfile({ userId }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function loadUser() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchUser(userId);
        if (!cancelled) setUser(data);
      } catch (err) {
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadUser();
    return () => { cancelled = true; };
  }, [userId]);

  if (loading) return <div className="spinner" role="status">Loading...</div>;
  if (error) return <div className="error">Failed to load user</div>;
  return <div>{user.name}</div>;
}
```

### Basic Loading State — Vue

```vue
<template>
  <div v-if="loading" class="spinner" role="status">Loading...</div>
  <div v-else-if="error" class="error">{{ error.message }}</div>
  <div v-else>{{ user.name }}</div>
</template>

<script setup>
import { ref, onMounted } from 'vue';

const props = defineProps(['userId']);
const loading = ref(true);
const error = ref(null);
const user = ref(null);

onMounted(async () => {
  try {
    user.value = await fetchUser(props.userId);
  } catch (err) {
    error.value = err;
  } finally {
    loading.value = false;
  }
});
</script>
```

### Basic Loading State — Svelte

```svelte
<script>
  export let userId;
  let userPromise = fetchUser(userId);
</script>

{#await userPromise}
  <div class="spinner">Loading...</div>
{:then user}
  <div>{user.name}</div>
{:catch error}
  <div class="error">Failed to load user</div>
{/await}
```

### Basic Loading State — Web Components

```javascript
class UserProfile extends HTMLElement {
  loading = true;
  user = null;
  error = null;

  async connectedCallback() {
    this.render();
    try {
      this.user = await fetchUser(this.getAttribute('user-id'));
    } catch (err) {
      this.error = err;
    } finally {
      this.loading = false;
      this.render();
    }
  }

  render() {
    if (this.loading) this.innerHTML = '<div class="spinner">Loading...</div>';
    else if (this.error) this.innerHTML = '<div class="error">Failed</div>';
    else this.innerHTML = `<div>${this.user.name}</div>`;
  }
}
customElements.define('user-profile', UserProfile);
```

### Button Loading State

```javascript
function SaveButton({ onSave }) {
  const [saving, setSaving] = useState(false);

  const handleClick = async () => {
    setSaving(true);
    try {
      await onSave();
    } finally {
      setSaving(false);
    }
  };

  return (
    <button onClick={handleClick} disabled={saving} aria-busy={saving}>
      {saving ? 'Saving...' : 'Save'}
    </button>
  );
}
```

### Skeleton Screen

```javascript
function UserList({ users, loading }) {
  if (loading) {
    return (
      <div className="user-list">
        {[1, 2, 3].map(i => (
          <div key={i} className="user-skeleton">
            <div className="skeleton-avatar" />
            <div className="skeleton-text" />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="user-list">
      {users.map(user => <UserCard key={user.id} user={user} />)}
    </div>
  );
}
```

```css
.skeleton-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: linear-gradient(90deg, var(--skeleton-base) 25%, var(--skeleton-highlight) 50%, var(--skeleton-base) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}

@keyframes shimmer {
  from { background-position: 200% 0; }
  to { background-position: -200% 0; }
}

@media (prefers-reduced-motion: reduce) {
  .skeleton-avatar { animation: none; }
}
```

### Progress Bar

```javascript
function FileUpload() {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleUpload = async (file) => {
    setUploading(true);
    setProgress(0);

    try {
      await uploadFile(file, (progressEvent) => {
        const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        setProgress(percent);
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <input type="file" onChange={(e) => handleUpload(e.target.files[0])} />

      {uploading && (
        <div className="progress-bar" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Upload progress">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
          <span>{progress}%</span>
        </div>
      )}
    </div>
  );
}
```

### Optimistic Updates

```javascript
function TodoList({ todos }) {
  const [optimisticTodos, setOptimisticTodos] = useState(todos);
  const [loading, setLoading] = useState({});

  const handleToggle = async (id) => {
    setOptimisticTodos(prev =>
      prev.map(t => t.id === id ? { ...t, completed: !t.completed } : t)
    );
    setLoading(prev => ({ ...prev, [id]: true }));

    try {
      await toggleTodo(id);
    } catch {
      setOptimisticTodos(todos);
    } finally {
      setLoading(prev => ({ ...prev, [id]: false }));
    }
  };

  return (
    <ul>
      {optimisticTodos.map(todo => (
        <li key={todo.id}>
          <input
            type="checkbox"
            checked={todo.completed}
            onChange={() => handleToggle(todo.id)}
            disabled={loading[todo.id]}
          />
          {todo.text}
        </li>
      ))}
    </ul>
  );
}
```

### Delayed Loading Indicator

```javascript
function DataDisplay() {
  const [showSpinner, setShowSpinner] = useState(false);
  const [data, setData] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => setShowSpinner(true), 200);

    fetchData().then(result => {
      clearTimeout(timer);
      setShowSpinner(false);
      setData(result);
    });

    return () => clearTimeout(timer);
  }, []);

  if (showSpinner) return <Spinner />;
  return data ? <Content data={data} /> : null;
}
```

### Inline Loading State

```javascript
function SearchBox() {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState([]);

  const handleSearch = async (q) => {
    setSearching(true);
    const data = await search(q);
    setResults(data);
    setSearching(false);
  };

  return (
    <div>
      <div className="search-input-wrapper">
        <input
          type="search"
          value={query}
          onChange={(e) => { setQuery(e.target.value); handleSearch(e.target.value); }}
        />
        {searching && <span className="spinner-inline" />}
      </div>
      <ul>
        {results.map(r => <li key={r.id}>{r.title}</li>)}
      </ul>
    </div>
  );
}
```

## Zalety

- Użytkownik przestaje „wściekle klikać” — informacja zwrotna potwierdza, że akcja została
  zarejestrowana.
- Porzucanie strony spada — użytkownik nie odświeża/nie ucieka, widząc, że aplikacja pracuje.
- Postrzegana wydajność się poprawia — szkielety „czują się” szybsze niż pusty spinner nawet przy
  identycznym czasie oczekiwania.
- Jasne rozróżnienie „ładowanie” / „załadowane ale puste” / „porażka” — nie trzeba zgadywać.
- Duplikaty zgłoszeń formularza znikają, bo wyłączony przycisk zapobiega przypadkowemu
  podwójnemu kliknięciu.
- Pasek postępu ustala oczekiwania — „Przesyłanie: 47%” mówi, jak długo jeszcze czekać.
- Układ strony jest stabilny — szkielet rezerwuje miejsce, więc nie ma nagłych przeskoków treści.

## Wady / tradeoffs

- Ryzyko „spinner spam” — zbyt wiele wskaźników naraz tworzy bałagan wizualny.
- Bardzo szybkie operacje mogą błysnąć wskaźnikiem na 50ms — to gorsze niż jego brak; dodaj krótkie
  opóźnienie (patrz „Delayed Loading Indicator” wyżej).
- Więcej stanu do zarządzania per komponent (`loading`, `data`, `error` zamiast samych danych).
- Szkielety wymagają utrzymania — zmiana layoutu wymaga aktualizacji odpowiadającego szkieletu.
- Optimistic updates są trudne — wymagają solidnej logiki wycofania (rollback) przy błędzie.
- Paski postępu wymagają wsparcia backendu — bez danych o postępie nie da się pokazać sensownego %.
- Wyrafinowany stan ładowania **nie** jest naprawą prawdziwego problemu wydajności — realną poprawką
  jest przyspieszenie samej operacji, nie ładniejszy spinner na wolnej operacji.
- Dostępność jest łatwo pomijana — `role="status"`, `aria-busy` są często zapominane.

## Powiązane wzorce

- [Error Handling](./error-handling.md) — Resilience
- [Async Boundary](./async-boundary.md) — Resilience
- [Progress Indicators (NN Group)](https://www.nngroup.com/articles/progress-indicators/)
- [Suspense (React)](https://react.dev/reference/react/Suspense)
- [Suspense (Vue)](https://vuejs.org/guide/built-ins/suspense.html)
- [Await Blocks (Svelte)](https://svelte.dev/docs/logic-blocks#await)

## Kiedy używać / kiedy NIE używać

Używaj **zawsze**, gdy operacja trwa długo/nieprzewidywalnie (sieć, upload) — to jest fundament
Resilience, nie opcja. **Nie** dodawaj wskaźnika dla operacji, które kończą się w <100–200ms — pusty
ekran przez ułamek sekundy jest lepszy niż migający spinner, który migocze i znika, zanim użytkownik
zdąży go zauważyć (patrz wzorzec „Delayed Loading Indicator”). Dopasuj typ wskaźnika do charakteru
operacji: spinner na przycisku dla krótkich akcji, szkielet dla treści strony, pasek postępu tylko
gdy backend faktycznie daje Ci dane o postępie.
