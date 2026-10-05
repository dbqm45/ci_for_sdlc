# Singleton

Kategoria: kreacyjne. Istota: klasa pilnuje, by istniała **jedna** instancja, i daje do niej globalny dostęp.
W praktyce to wzorzec, który najczęściej **odradzamy** — czytaj sekcję pułapek jako główną część pliku.

## Problem
Wzorzec łączy dwie niezależne potrzeby (i przez to narusza SRP):
1. **Gwarancja jednej instancji** — dwie kopie zepsułyby program (np. jeden lokalny rejestr flag, jedna pula połączeń
   w procesie).
2. **Globalny punkt dostępu** — jak zmienna globalna, ale chroniona przed nadpisaniem.
Często nazywa się singletonem rozwiązania spełniające tylko punkt 2 — to rozmycie pojęcia.

## Rozwiązanie i uczestnicy
Prywatny konstruktor blokuje `new` z zewnątrz; statyczne pole trzyma instancję; statyczny akcesor tworzy ją leniwie
przy pierwszym użyciu i potem zwraca tę samą.

## Kiedy używać
- Program ma prawo mieć dokładnie jeden obiekt danej klasy i **dwa naprawdę by go zepsuły**.
- Potrzebujesz ściślejszej kontroli nad czymś, co inaczej byłoby mutowalną zmienną globalną.

## Koszty
- Ukryte zależności: z sygnatury funkcji nie widać, że sięga po singleton.
- Trudne testy: nie podstawisz łatwo zamiennika, stan przecieka między testami.
- Maskuje zły podział odpowiedzialności — każdy sięga po wszystko.
- W środowiskach wielowątkowych (inne języki) wymaga synchronizacji przy tworzeniu.

## Powiązania
- Fasada bywa jedyną instancją — ale to decyzja kompozycji aplikacji, nie klasy.
- Pyłek też współdzieli obiekty, lecz ma **wiele** niezmiennych instancji; singleton jedną, często mutowalną.
- Konkretne fabryki/budowniczowie bywają jedynymi instancjami — zwykle wystarczy jeden obiekt wstrzyknięty przez DI.

## Forma idiomatyczna w TS
**Moduł ES wykonuje się raz** — eksportowana stała jest współdzielona przez wszystkich importujących. W aplikacjach
z kontenerem DI „jedna instancja” to zakres providera (fw-*), nie cecha klasy. Klasyczny prywatny konstruktor to
najczęściej przeniesienie idiomu z języków bez modułów.

## Przykład (TS)
Wariant idiomatyczny — instancja na poziomie modułu, wstrzykiwana jawnie tam, gdzie to możliwe:
```ts
// metrics.ts — moduł wykonuje się raz, `metrics` jest współdzielony
const counters = new Map<string, number>();

export const metrics = {
  inc(name: string, by = 1): void {
    counters.set(name, (counters.get(name) ?? 0) + by);
  },
  snapshot(): ReadonlyMap<string, number> {
    return new Map(counters);
  },
};
```
Wariant klasyczny (gdy naprawdę trzeba wymusić jedną instancję w klasie) — pola `#` są prywatne także w runtime:
```ts
class FeatureFlags {
  static #instance: FeatureFlags | undefined;
  #enabled = new Set<string>();

  private constructor() {}

  static get instance(): FeatureFlags {
    return (FeatureFlags.#instance ??= new FeatureFlags());
  }

  enable(flag: string): void {
    this.#enabled.add(flag);
  }
  isOn(flag: string): boolean {
    return this.#enabled.has(flag);
  }
}

FeatureFlags.instance.enable('nowy-cennik');
console.log(FeatureFlags.instance === FeatureFlags.instance, FeatureFlags.instance.isOn('nowy-cennik'));
```

## Kiedy NIE używać / pułapki
- Zapytaj: potrzebuję **wymusić** jedną instancję (bo dwie zepsują program), czy tylko **wygodnego** dostępu? Drugie
  nie uzasadnia wzorca — jawnie wstrzyknięty/importowany obiekt jest testowalny.
- W TS/JS zamiast klasy z `getInstance()` użyj instancji modułu; w frameworku z DI — zakresu providera. Nie dubluj
  mechanizmu frameworka ręcznym singletonem na klasie serwisu.
- Globalny **mutowalny** stan to źródło niestabilnych testów; jeśli już musi być, daj interfejs i wstrzykuj go, a
  singleton trzymaj wyłącznie w miejscu kompozycji aplikacji.
- Moduł ES jest „jeden” na instancję ładowarki modułów — przy mikrofrontendach, workerach czy zduplikowanych paczkach
  w `node_modules` możesz dostać kilka kopii.
