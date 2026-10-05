# Error Handling

> **Spis treści:** Metadane · TLDR · Uwagi (stan 2026, poprawki względem źródła) · Problem · Rozwiązanie · Przykłady kodu · Zalety · Wady / tradeoffs · Powiązane wzorce · Kiedy używać / kiedy NIE używać

Źródło: frontendpatterns.dev/error-handling.

## Metadane

- **Kategoria:** Resilience
- **Poziom:** Advanced
- **Przykłady:** React, Vue, Native web
- **Data aktualizacji:** 29 października 2025
- **Autor:** Den Odell

## TLDR

„Handle errors at appropriate layers: catch at API boundaries, transform for display, and show
users actionable messages with recovery options.”

## Uwagi (stan 2026, poprawki względem źródła)

- **Rzucenie błędu w `.catch()` wewnątrz `useEffect` NIE trafia do Error Boundary** (to odrzucona obietnica poza
  renderem). Przekaż go jawnie: `showBoundary(err)` z `react-error-boundary` albo przez stan
  (`setState(() => { throw err; })`). Poprawiono przykład „Error Boundary Integration”.
- „Try again” ma ponawiać operację, nie przeładowywać strony (`window.location.reload()` gubi stan) — poprawiono.
- Timeout: `AbortSignal.timeout(ms)` i łączenie z sygnałem anulowania `AbortSignal.any([signal, AbortSignal.timeout(ms)])`
  zamiast ręcznego `setTimeout` (daje `TimeoutError`, odróżnialny od `AbortError`).
- `TypeError` z `fetch` = błąd sieci/CORS, ale `TypeError` z Twojego kodu też — klasyfikuj tylko błędy z samego
  wywołania `fetch`, nie z całego bloku.
- Modeluj wynik jako unię dyskryminowaną (`idle | loading | error | success`), nie trzy niezależne flagi
  (lang-typescript). W Angularze status daje `resource`/`httpResource` (fw-angular).
- Retry z backoffem — kanoniczna wersja w resilience/retry.md (tu skrót); 409/422 to normalne wyniki biznesowe,
  pokazuj je przy polach (fe-web-platform).

## Problem

Brak konsekwentnej obsługi błędów prowadzi do: nieskończonych stanów ładowania (błąd nigdy nie
kończy `loading`), cichych porażek (błąd występuje, nic się nie dzieje na ekranie), braku logowania
błędów po stronie deva, i niekonsekwentnego podejścia między różnymi komponentami tej samej
aplikacji.

## Rozwiązanie

Kluczowe zasady: każda operacja asynchroniczna wymaga **jawnej** obsługi błędu; błędy trzeba
**klasyfikować** (404 vs timeout vs 401) i traktować różnie w zależności od typu; komunikaty dla
użytkownika muszą być **zrozumiałe dla człowieka**, nie surowym błędem z devtoolsów; gdzie to możliwe,
zastosuj graceful degradation (dane z cache) zamiast całkowitej porażki.

## Przykłady kodu

### Basic Error Handling

```javascript
async function fetchUser(id) {
  try {
    const response = await fetch(`/api/users/${id}`);
    if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Failed to fetch user:', error);
    throw error;
  }
}
```

### Error Classification and Recovery

```javascript
class APIError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function fetchUser(id) {
  try {
    const response = await fetch(`/api/users/${id}`);
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new APIError(errorData.message || 'Request failed', response.status, errorData.code);
    }
    return await response.json();
  } catch (error) {
    if (error instanceof TypeError) {
      throw new APIError('Network error - check your connection', 0, 'NETWORK_ERROR');
    }
    if (error instanceof APIError) throw error;
    throw new APIError('Unexpected error occurred', 500, 'UNKNOWN_ERROR');
  }
}
```

### Component with Error State — React

```javascript
function UserProfile({ userId }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0); // bump to retry

  useEffect(() => {
    async function loadUser() {
      try {
        setLoading(true);
        setError(null);
        setUser(await fetchUser(userId));
      } catch (err) {
        setError(err);
        window.Sentry?.captureException(err, { tags: { userId } });
      } finally {
        setLoading(false);
      }
    }
    loadUser();
  }, [userId, attempt]);

  if (loading) return <Spinner />;
  if (error) return <ErrorDisplay error={error} onRetry={() => setAttempt(a => a + 1)} />;
  return <div>{user.name}</div>;
}
```

### Component with Error State — Vue

```vue
<script setup>
import { ref, onMounted } from 'vue';

const user = ref(null);
const loading = ref(true);
const error = ref(null);

async function loadUser(userId) {
  try {
    loading.value = true;
    error.value = null;
    const response = await fetch(`/api/users/${userId}`);
    if (!response.ok) throw new Error('Failed to fetch user');
    user.value = await response.json();
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}

onMounted(() => loadUser(props.userId));
</script>

<template>
  <div v-if="loading">Loading...</div>
  <div v-else-if="error">
    <p>{{ error }}</p>
    <button @click="loadUser(props.userId)">Try again</button>
  </div>
  <div v-else>{{ user.name }}</div>
</template>
```

### Centralized Error Handler

```javascript
class ErrorHandler {
  constructor(options = {}) {
    this.logger = options.logger || console;
    this.onError = options.onError;
  }

  handle(error, context = {}) {
    this.logger.error('Error:', { message: error.message, ...context });
    window.Sentry?.captureException(error, { contexts: context });
    this.onError?.(error, context);
    return this.getUserMessage(error);
  }

  getUserMessage(error) {
    if (error instanceof APIError) {
      const messages = {
        404: "The requested resource wasn't found",
        401: 'Please log in to continue',
        403: "You don't have permission to access this",
        500: 'Server error - please try again later',
      };
      return messages[error.status] || error.message || 'Something went wrong';
    }
    if (error.code === 'NETWORK_ERROR') return 'Network connection failed';
    return 'An unexpected error occurred';
  }
}
```

### Retry Logic with Exponential Backoff

```javascript
async function fetchWithRetry(url, options = {}, maxRetries = 3) {
  let lastError;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        if (response.status >= 400 && response.status < 500) {
          throw new APIError('Request failed', response.status);
        }
        lastError = new APIError('Request failed', response.status);
      } else {
        return await response.json();
      }
    } catch (error) {
      lastError = error;
      if (attempt === maxRetries - 1) throw error;
    }

    await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
  }
  throw lastError;
}
```

### Error Boundary Integration

```javascript
import { ErrorBoundary, useErrorBoundary } from 'react-error-boundary';

function DataComponent() {
  const [data, setData] = useState(null);
  const { showBoundary } = useErrorBoundary();

  useEffect(() => {
    // Throwing inside .catch() would NOT reach the boundary — hand the error over explicitly
    fetchData().then(setData).catch(showBoundary);
  }, [showBoundary]);

  return <div>{data?.value}</div>;
}

function App() {
  return (
    <ErrorBoundary fallback={<ErrorMessage />}>
      <DataComponent />
    </ErrorBoundary>
  );
}
```

### Global Error Handler

```javascript
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled rejection:', event.reason);
  window.Sentry?.captureException(event.reason);
  showToast('An unexpected error occurred', 'error');
  event.preventDefault();
});

window.addEventListener('error', (event) => {
  console.error('Global error:', event.error);
  window.Sentry?.captureException(event.error);
});
```

### Timeout Handling

```javascript
async function fetchWithTimeout(url, { timeout = 5000, signal } = {}) {
  // Combine the caller's cancel signal with a timeout (both are native)
  const combined = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(timeout)])
    : AbortSignal.timeout(timeout);
  try {
    const response = await fetch(url, { signal: combined });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    if (error.name === 'TimeoutError') throw new Error('Request timeout', { cause: error });
    throw error; // AbortError = cancelled by caller, not a failure to show
  }
}
```

### Graceful Degradation

```javascript
async function fetchUserWithFallback(userId) {
  try {
    return await fetchUser(userId);
  } catch (error) {
    console.warn('Fetch failed, using cache:', error);
    const cached = getCachedUser(userId);
    return cached ? { ...cached, stale: true } : { id: userId, name: 'User', stale: true };
  }
}
```

## Zalety

- Użytkownik widzi, co się stało, zamiast czekać na nieskończone ładowanie.
- Przejściowe błędy stają się odzyskiwalne dzięki przyciskom retry.
- Debugowanie produkcyjne jest możliwe dzięki logowaniu z kontekstem.
- Częściowa funkcjonalność bije całkowitą porażkę.
- Różne typy błędów dostają odpowiednie, dopasowane traktowanie.
- Użytkownik nie traci wpisanych danych formularza dzięki zachowaniu stanu przy błędzie.

## Wady / tradeoffs

- Bloki try/catch dodają boilerplate w każdym miejscu, gdzie się z czymś łączymy.
- Pusty `catch (e) {}` ukrywa błąd zamiast go obsłużyć — to antywzorzec, nie „obsługa błędów”.
- Każdy typ błędu wymaga przemyślanego, osobnego podejścia — nie da się tego uogólnić w 100%.
- Scentralizowane handlery mogą nadmiernie uprościć niuanse konkretnego przypadku.
- W React obsługa błędów **asynchronicznych** nie jest oczywista — Error Boundary tego nie łapie.
- Komunikaty błędów muszą służyć dwóm odbiorcom naraz: użytkownikowi (przyjazny język) i deweloperowi
  (szczegóły do debugowania) — to bywa sprzeczne.
- Zbyt agresywne logowanie może zalać narzędzia monitoringu szumem.
- Fallback z cache może zmylić użytkownika, jeśli nie zaznaczysz wprost, że dane są nieaktualne
  (`stale: true` w przykładzie wyżej to nie tylko flaga techniczna — powinna mieć odzwierciedlenie w UI).

## Powiązane wzorce

- [Error Boundary](./error-boundary.md) — Resilience
- [Loading State](./loading-state.md) — Resilience
- [Retry](./retry.md) — Resilience
- [Error Handling (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Control_flow_and_error_handling#exception_handling_statements)
- [try...catch Statement (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/try...catch)
- [Promise Error Handling (MDN)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Using_promises#error_handling)

## Kiedy używać / kiedy NIE używać

To nie jest opcjonalny wzorzec „do dodania później” — każda operacja asynchroniczna w produkcyjnym
kodzie **musi** mieć jawną obsługę błędu (patrz fundament „Resilience by Design” w
`../principles.md`). Jedyna decyzja to **poziom** obsługi: prosty try/catch + komunikat
wystarcza dla mało istotnych operacji; klasyfikacja błędów + centralny handler + Sentry ma sens, gdy
błędy w danym miejscu realnie wpływają na zaufanie użytkownika (płatności, utrata danych
formularza). Nie buduj `ErrorHandler` klasy z przykładu dla jednego, rzadko wywoływanego
`fetch()` — to przerost formy nad treścią (YAGNI).
