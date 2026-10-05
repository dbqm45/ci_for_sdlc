# Retry

> **Spis treści:** Metadane · TLDR · Uwagi (stan 2026, poprawki względem źródła) · Problem · Rozwiązanie · Przykłady kodu · Zalety · Wady / tradeoffs · Powiązane wzorce · Kiedy używać / kiedy NIE używać

Źródło: frontendpatterns.dev/retry.

## Metadane

- **Kategoria:** Resilience
- **Poziom:** Advanced
- **Przykłady:** React, Native web
- **Data aktualizacji:** 15 listopada 2025
- **Autor:** Den Odell

## TLDR

„Re-attempt failed requests with exponential backoff to handle transient network issues without
showing errors for temporary problems.”

## Uwagi (stan 2026, poprawki względem źródła)

- **Błąd w przykładzie źródła poprawiony:** błąd „non-retryable” był rzucany wewnątrz `try` i łapany przez własny
  `catch`, więc 404/401 też były ponawiane. Teraz błędy nieponawialne wychodzą od razu; `options` trafiają do
  `fetch`; dodano `onRetry` (używane w przykładzie „User Feedback”) i obsługę anulowania.
- Jitter: rekomendowany „full jitter” (`random(0, delay)`) — lepiej rozprasza klientów niż ±25%.
- Ponawiaj tylko operacje idempotentne; `POST` — wyłącznie z kluczem idempotencji (`Idempotency-Key`), uzgodnionym z
  backendem (be-api-design).
- Warstwy danych mają retry wbudowany (TanStack Query `retry`/`retryDelay`, RxJS `retry({ delay })` w Angularze) —
  nie pisz własnego, jeśli już ich używasz. Circuit breaker to zwykle zadanie backendu/bramy, rzadko przeglądarki.

## Problem

Awarie przejściowe (chwilowy problem sieciowy, timeout serwera, wdrożenie, restart kontenera)
wyglądają dla użytkownika identycznie jak błędy trwałe. Przerwanie połączenia na 2 sekundy pokazuje
ten sam komunikat błędu, co żądanie zasobu, który nie istnieje. Użytkownicy mobilni cierpią
szczególnie — ciągłe zrywanie pakietów i przełączanie WiFi↔mobile sprawia, że „every dropout
triggers an error dialog”.

## Rozwiązanie

Automatyczna logika ponownych prób: gdy żądanie zawiedzie błędem **przejściowym** (5xx, timeout,
brak sieci), spróbuj ponownie, zanim pokażesz błąd użytkownikowi — w większości przypadków druga
próba się powiedzie i użytkownik nigdy się o awarii nie dowie.

**Kluczowa technika — exponential backoff:** czekaj 1s przed pierwszą retry, 2s przed drugą, 4s
przed trzecią. Dodaj losowy **jitter**, żeby uniknąć „thundering herd” (tysiące klientów ponawiających
jednocześnie po tej samej awarii serwera). Ponawiaj **tylko** rzeczywiście przejściowe błędy —
`404` (zasób nie istnieje) i `401` (brak autentykacji) nie naprawi się przez powtórzenie — i ustaw
sensowny limit maksymalnej liczby prób.

## Przykłady kodu

### Exponential Backoff with Jitter

```javascript
class HttpError extends Error {
  constructor(status, retryable) {
    super(`HTTP ${status}`);
    this.status = status;
    this.retryable = retryable;
  }
}

async function fetchWithRetry(url, options = {}) {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 30000,
    retryableStatuses = [408, 429, 500, 502, 503, 504],
    onRetry,
    ...fetchOptions // method, headers, body, signal…
  } = options;

  for (let attempt = 0; ; attempt++) {
    let error;
    try {
      const response = await fetch(url, fetchOptions);
      if (response.ok) return await response.json();
      error = new HttpError(response.status, retryableStatuses.includes(response.status));
    } catch (e) {
      if (e.name === 'AbortError') throw e; // cancelled by the caller — never retry
      error = e;                            // network error (TypeError) — retryable
    }

    const retryable = error.retryable ?? true;
    if (!retryable || attempt >= maxRetries - 1) throw error;

    // Exponential backoff with full jitter
    const cap = Math.min(baseDelay * 2 ** attempt, maxDelay);
    onRetry?.(attempt + 1, error);
    await new Promise(resolve => setTimeout(resolve, Math.random() * cap));
  }
}
```

### React Hook with Retry

```javascript
function useDataWithRetry(url) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      setLoading(true);
      try {
        const result = await fetchWithRetry(url, { maxRetries: 3 });
        if (!cancelled) setData(result);
      } catch (err) {
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => { cancelled = true; };
  }, [url, retryCount]);

  return { data, loading, error, retry: () => setRetryCount(c => c + 1) };
}
```

### Retry with Circuit Breaker

```javascript
class CircuitBreaker {
  constructor(threshold = 5, timeout = 60000) {
    this.failureCount = 0;
    this.threshold = threshold;
    this.timeout = timeout;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.nextAttempt = Date.now();
  }

  async execute(fn) {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttempt) throw new Error('Circuit breaker is OPEN');
      this.state = 'HALF_OPEN';
    }

    try {
      const result = await fn();
      this.failureCount = 0;
      this.state = 'CLOSED';
      return result;
    } catch (error) {
      this.failureCount++;
      if (this.failureCount >= this.threshold) {
        this.state = 'OPEN';
        this.nextAttempt = Date.now() + this.timeout;
      }
      throw error;
    }
  }
}
```

### Retry-After Header Support

```javascript
async function fetchWithRetryAfter(url, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();

      if (response.status === 429 && attempt < maxRetries - 1) {
        const retryAfter = response.headers.get('Retry-After');
        if (retryAfter) {
          // Retry-After can be seconds or HTTP date
          const delay = Number.isNaN(Number(retryAfter))
            ? Math.max(0, new Date(retryAfter) - Date.now())
            : Number(retryAfter) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
      }

      if (response.status >= 500) throw new Error(`Server error: ${response.status}`);
      throw new Error(`Client error: ${response.status}`);
    } catch (error) {
      if (attempt === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
    }
  }
}
```

### User Feedback During Retry

```javascript
function DataLoader({ url }) {
  const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState(null);

  useEffect(() => {
    fetchWithRetry(url, {
      maxRetries: 3,
      onRetry: (attemptNum) => setAttempt(attemptNum),
    }).then(setData);
  }, [url]);

  if (!data) {
    return (
      <div>
        Loading...
        {attempt > 0 && <p>Connection issue, retrying (attempt {attempt})...</p>}
      </div>
    );
  }
  return <div>{data.content}</div>;
}
```

## Zalety

- Przerwania sieciowe pozostają niewidoczne dla użytkownika.
- Użytkownicy mobilni nie widzą ciągłych, powtarzających się komunikatów o błędach.
- Aplikacja przetrwa wdrożenia serwera i zmiany infrastruktury bez widocznej awarii dla klienta.
- Limitowanie żądań (rate limiting) staje się obsługiwalne dzięki nagłówkowi `Retry-After`.
- Operacje odczytu (GET) stają się praktycznie „bulletproof” — bezpieczne do ponawiania z natury.
- Znacznie mniej tarcia dla użytkownika — brak potrzeby ręcznego klikania „Try Again”.

## Wady / tradeoffs

- Komunikat o błędzie opóźnia się — użytkownik czeka przez **wszystkie** próby, zanim dowie się o
  rzeczywistym, trwałym problemie.
- Bez jittera powstaje problem „thundering herd” — tysiące klientów przytłaczają serwer w tym samym
  momencie po wspólnej awarii.
- Tuning parametrów jest trudny: zbyt agresywne ponawianie marnuje zasoby, zbyt konserwatywne zmusza
  użytkownika do zbyt długiego czekania.
- Logika retry może **maskować** rzeczywiste problemy infrastrukturalne, które powinny zostać
  zauważone i naprawione, nie tylko cierpliwie obchodzone.
- Opóźnienia rosną szybko (1s, 2s, 4s, 8s, 16s) — po kilku próbach użytkownik może uznać, że
  aplikacja się zawiesiła.
- **Nigdy nie ponawiaj bezmyślnie operacji nieidempotentnych** — ponowienie `POST` może stworzyć
  duplikat zasobu (np. dwa zamówienia z jednego kliknięcia „Kup”).
- Circuit breaker dodaje realną złożoność implementacyjną.
- Koszty transferu danych rosną na limitowanych, mobilnych połączeniach.

## Powiązane wzorce

- [Error Handling](./error-handling.md) — Resilience
- [Retry Pattern (Microsoft)](https://docs.microsoft.com/en-us/azure/architecture/patterns/retry)
- [Exponential Backoff (Wikipedia)](https://en.wikipedia.org/wiki/Exponential_backoff)

## Kiedy używać / kiedy NIE używać

Używaj dla operacji **idempotentnych** (GET, i starannie zaprojektowane PUT/DELETE) narażonych na
przejściowe błędy sieciowe — to jest domyślnie bezpieczne i wysoko opłacalne. **Nie** ponawiaj
automatycznie `POST`/operacji tworzących zasób, jeśli serwer nie gwarantuje idempotencji (np. przez
`Idempotency-Key`) — ryzyko duplikatu jest gorsze niż jednorazowy, widoczny błąd. Nie buduj Circuit
Breakera „na wszelki wypadek” dla aplikacji z małym ruchem — to jest narzut uzasadniony przy realnej
skali i realnym ryzyku przeciążenia backendu, nie domyślny dodatek do każdego `fetch()`.
