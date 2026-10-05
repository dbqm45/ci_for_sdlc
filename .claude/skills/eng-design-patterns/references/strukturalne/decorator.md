# Dekorator (Decorator)

> **Spis treści:** Problem · Rozwiązanie i uczestnicy · Kiedy używać · Koszty · Powiązania · Forma idiomatyczna w TS · Przykład (TS) · Kiedy NIE używać / pułapki

Kategoria: strukturalne. Istota: obiekt opakowuje inny obiekt **o tym samym interfejsie** i dokłada zachowanie
przed/po delegacji; warstwy można składać w runtime w dowolnych kombinacjach.

## Problem
Pobieranie kursów walut wymaga: ponawiania przy błędach sieci, cache'owania, logowania, metryk — w różnych
kombinacjach zależnie od środowiska. Podklasy (`CachedRetryingLoggingRates`…) mnożą się kombinatorycznie, a flagi
w jednej klasie robią z niej worek warunków.

## Rozwiązanie i uczestnicy
- **Komponent** — wspólny interfejs (`RateProvider`).
- **Konkretny komponent** — podstawowe zachowanie (`HttpRateProvider`).
- **Dekoratory** — implementują ten sam interfejs, trzymają opakowany komponent (typu interfejsu, nie klasy!)
  i dodają logikę przed/po wywołaniu.
- **Klient/kompozycja aplikacji** — składa stos warstw.

## Kiedy używać
- Obowiązki dokładane w runtime, bez zmiany klasy i bez wybuchu podklas.
- Dziedziczenie niemożliwe lub niepraktyczne (klasa z biblioteki, zamknięta hierarchia).
- Zachowanie naturalnie układa się w warstwy przekrojowe: retry, cache, logowanie, metryki, autoryzacja, kompresja.

## Koszty
Kolejność warstw zmienia wynik (cache przed czy po retry?); trudno wyjąć warstwę ze środka stosu; debugowanie przez
wiele poziomów pośredniości; kod składający stos bywa nieczytelny.

## Powiązania
- **Adapter** zmienia interfejs; Dekorator go zachowuje i pozwala nakładać warstwy.
- **Pełnomocnik** ma ten sam kształt, inną motywację: kontrola dostępu i cyklu życia obiektu, zwykle jedna warstwa.
- **Łańcuch zobowiązań** może przerwać przepływ; dekorator zawsze deleguje dalej.
- **Kompozyt** ma wiele dzieci; dekorator jedno. **Strategia** zmienia wnętrze, Dekorator otoczkę.

## Forma idiomatyczna w TS
Dla pojedynczej funkcji dekoratorem jest **funkcja wyższego rzędu**: `withRetry(fetchRate, 3)` zwraca funkcję o tej
samej sygnaturze. Middleware frameworków HTTP i interceptory klientów to ten wzorzec w wersji frameworkowej.

**Uwaga terminologiczna:** składnia `@dekorator` (dekoratory ECMAScript w TS 5+, legacy `experimentalDecorators`)
to **mechanizm języka** działający na klasach/metodach w chwili ich definiowania — nie to samo co wzorzec. Może
posłużyć do jego realizacji (dekorator metody owijający wywołanie), ale obecność `@coś` nie oznacza wzorca:
sprawdź, czy istnieje opakowanie przez kompozycję ze wspólnym interfejsem (lang-typescript).

## Przykład (TS)
```ts
interface RateProvider {
  rate(from: string, to: string): Promise<number>;
}

class HttpRateProvider implements RateProvider {
  async rate(from: string, to: string): Promise<number> {
    if (from === to) return 1;
    return 4.27; // tu byłoby wywołanie HTTP
  }
}

class RetryingRates implements RateProvider {
  readonly #inner: RateProvider;
  readonly #attempts: number;
  constructor(inner: RateProvider, attempts = 3) {
    this.#inner = inner;
    this.#attempts = attempts;
  }
  async rate(from: string, to: string): Promise<number> {
    let lastError: unknown;
    for (let i = 0; i < this.#attempts; i++) {
      try {
        return await this.#inner.rate(from, to);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  }
}

class CachedRates implements RateProvider {
  readonly #inner: RateProvider;
  readonly #cache = new Map<string, number>();
  constructor(inner: RateProvider) {
    this.#inner = inner;
  }
  async rate(from: string, to: string): Promise<number> {
    const key = `${from}/${to}`;
    const hit = this.#cache.get(key);
    if (hit !== undefined) return hit;
    const value = await this.#inner.rate(from, to);
    this.#cache.set(key, value);
    return value;
  }
}

// Kompozycja: cache na zewnątrz — trafienie nie uruchamia ponawiania.
const rates: RateProvider = new CachedRates(new RetryingRates(new HttpRateProvider()));
rates.rate('EUR', 'PLN').then((r) => console.log('EUR/PLN', r));
```
Forma funkcyjna:
```ts
type Fetch<A extends unknown[], R> = (...args: A) => Promise<R>;

function withRetry<A extends unknown[], R>(fn: Fetch<A, R>, attempts = 3): Fetch<A, R> {
  return async (...args) => {
    let lastError: unknown;
    for (let i = 0; i < attempts; i++) {
      try {
        return await fn(...args);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  };
}

const fetchRate = withRetry(async (from: string, to: string) => (from === to ? 1 : 4.27));
fetchRate('EUR', 'PLN').then(console.log);
```

## Kiedy NIE używać / pułapki
- **To nie jest `@dekorator` z TS** — najczęstsza pomyłka w tym języku (uwaga wyżej).
- Mało (1–2), nierosnących dodatków — parametr lub opcja konfiguracyjna są prostsze niż stos klas.
- Trzeba często **zdejmować** konkretną warstwę ze środka — rozważ kompozycję funkcji z jawną listą kroków.
- Dekorator zmieniający znaczenie wyniku (a nie tylko otoczkę) ukrywa logikę biznesową w infrastrukturze — reguły
  należą do domeny (ddd-tactical-design).
