# Obserwator (Observer)

Kategoria: behawioralne. Istota: obiekt ze stanem (**publikujący**) utrzymuje listę subskrybentów i powiadamia tylko
ich, gdy stan się zmienia; subskrybenci dołączają i odchodzą w runtime.

## Problem
Stan magazynowy produktu zmienia się często. Zainteresowani są: widok koszyka, alert „mało sztuk”, lista „powiadom mnie
o dostępności”, metryki. Odpytywanie w pętli marnuje zasoby i spóźnia reakcje, a wołanie wszystkich odbiorców
bezpośrednio z klasy stanu magazynowego wiąże ją z każdym nowym odbiorcą.

## Rozwiązanie i uczestnicy
- **Publikujący** — `subscribe()`/`unsubscribe()` i powiadamianie przy zmianie.
- **Subskrybent** — interfejs (w TS zwykle typ funkcji) wywoływany z nową wartością lub zdarzeniem.
- **Klient** — łączy publikujących z subskrybentami i odpowiada za wypisanie.

## Kiedy używać
- Zmiana jednego obiektu ma wywołać reakcje w innych, a zbiór odbiorców nie jest znany z góry lub zmienia się.
- Odbiorcy obserwują tylko czasowo lub warunkowo.
- Zdarzenia UI podpinane do własnego kodu bez modyfikacji komponentów.

## Koszty
Kolejność powiadomień nieokreślona (nie buduj na niej logiki); łatwo o wycieki pamięci i kaskady aktualizacji;
przepływ trudniejszy do prześledzenia niż wywołanie wprost.

## Powiązania
- **Mediator** bywa zbudowany na subskrypcjach.
- **Łańcuch** przekazuje żądanie sekwencyjnie do jednego obsługującego; Obserwator rozsyła do wszystkich.
- **Zdarzenia domenowe** (ddd-tactical-design) to Obserwator na poziomie modelu; między procesami — broker i outbox
  (be-messaging-outbox), bo powiadomienie w pamięci ginie przy awarii.

## Forma idiomatyczna w TS
Prawie nigdy od zera: `EventTarget`/`CustomEvent` (przeglądarka i Node), `EventEmitter` (Node), RxJS
`Observable`/`Subject`, sygnały frameworków (fw-*). `subscribe()` zwracające **funkcję wypisania** to idiom, który
ułatwia sprzątanie.

## Przykład (TS)
```ts
type Listener<T> = (value: T) => void;

class Observable<T> {
  readonly #listeners = new Set<Listener<T>>();

  /** Zwraca funkcję wypisania — łatwo ją wywołać przy niszczeniu subskrybenta. */
  subscribe(listener: Listener<T>): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  protected emit(value: T): void {
    for (const listener of [...this.#listeners]) listener(value);
  }
}

type StockChange = { sku: string; available: number };

class StockLevels extends Observable<StockChange> {
  readonly #levels = new Map<string, number>();

  set(sku: string, available: number): void {
    if (this.#levels.get(sku) === available) return; // brak zmiany — brak powiadomienia
    this.#levels.set(sku, available);
    this.emit({ sku, available });
  }
}

const stock = new StockLevels();
const stopLowStockAlert = stock.subscribe(({ sku, available }) => {
  if (available < 5) console.log(`mało sztuk: ${sku} (${available})`);
});
stock.subscribe(({ sku, available }) => {
  if (available > 0) console.log(`powiadom oczekujących na ${sku}`);
});

stock.set('KAWA-1KG', 3);
stopLowStockAlert();
stock.set('KAWA-1KG', 2); // alert już wypisany
```

## Kiedy NIE używać / pułapki
- **Jeden, znany z góry odbiorca** — zwykły callback wystarczy.
- Sprawdź mechanizmy platformy i frameworka, zanim napiszesz własny `Subject`.
- **Wycieki pamięci**: przy każdym `subscribe()` wskaż, gdzie następuje wypisanie (zniszczenie komponentu,
  `AbortSignal`, `using`/`Symbol.dispose` — lang-typescript).
- Nie zakładaj kolejności subskrybentów; wyjątek w jednym subskrybencie nie powinien blokować pozostałych
  (rozważ izolację błędów).
- Obserwator w pamięci nie jest niezawodną integracją między modułami — do tego zdarzenia z outboxem.
