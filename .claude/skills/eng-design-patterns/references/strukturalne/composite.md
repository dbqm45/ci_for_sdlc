# Kompozyt (Composite)

> **Spis treści:** Problem · Rozwiązanie i uczestnicy · Kiedy używać · Koszty · Powiązania · Forma idiomatyczna w TS · Przykład (TS) · Kiedy NIE używać / pułapki

Kategoria: strukturalne. Istota: pojedynczy element i grupa elementów mają **ten sam interfejs**, więc klient
przetwarza całe drzewo rekurencyjnie, nie rozróżniając liści od kontenerów.

## Problem
Cennik zawiera produkty i pakiety; pakiet może zawierać produkty i inne pakiety, każdy z własnym rabatem. Kod liczący
cenę, który sprawdza „czy to pakiet?” i ręcznie schodzi w głąb, powiela się przy każdej operacji (cena, waga, lista
SKU) i psuje się przy kolejnym poziomie zagnieżdżenia.

## Rozwiązanie i uczestnicy
- **Komponent** — wspólny interfejs operacji sensownych dla liścia i kontenera (`priceCents()`).
- **Liść** — wykonuje pracę sam (`Item`).
- **Kompozyt** — trzyma dzieci typu Komponent, deleguje im pracę i agreguje wynik, dodając własny wkład (rabat pakietu).
- **Klient** — pracuje wyłącznie przez interfejs komponentu.

## Kiedy używać
- Model jest naturalnie drzewem część–całość: pakiety, struktura organizacyjna, menu, reguły złożone z reguł.
- Operacje mają sens na każdym poziomie i mają działać dla dowolnej głębokości.
- **Specyfikacje** biznesowe łączone przez i/lub/nie to kompozyt (ddd-tactical-design) — tam szczegóły modelowania.

## Koszty
Trudno o wspólny interfejs dla bardzo różnych elementów; interfejs kusi, by stać się zbyt ogólny; metody `add()`
na liściu nie mają sensu (trzymaj je tylko w kompozycie).

## Powiązania
- **Dekorator** ma jedno opakowane dziecko i dodaje zachowanie; Kompozyt agreguje wiele dzieci.
- **Iterator** przechodzi drzewo; **Odwiedzający** wykonuje na nim nowe operacje; **Budowniczy** składa je krokami.
- **Pyłek** — liście mogą być współdzielone, gdy jest ich bardzo dużo; **Prototyp** klonuje całe poddrzewa.
- **Łańcuch zobowiązań** — żądanie może iść od liścia w górę do przodków.

## Forma idiomatyczna w TS
Drzewo jako **unia dyskryminowana** + funkcja rekurencyjna (`switch (node.kind)`) — dobra, gdy zbiór typów węzłów jest
zamknięty. Klasy z interfejsem — gdy typy węzłów mają być otwarte na rozszerzanie.

## Przykład (TS)
```ts
interface PriceComponent {
  readonly name: string;
  priceCents(): number;
}

class Item implements PriceComponent {
  readonly name: string;
  readonly #priceCents: number;
  constructor(name: string, priceCents: number) {
    this.name = name;
    this.#priceCents = priceCents;
  }
  priceCents(): number {
    return this.#priceCents;
  }
}

class Bundle implements PriceComponent {
  readonly name: string;
  readonly #discount: number;
  readonly #children: PriceComponent[] = [];

  constructor(name: string, discount = 0) {
    if (discount < 0 || discount >= 1) throw new RangeError('rabat w przedziale [0, 1)');
    this.name = name;
    this.#discount = discount;
  }

  add(...components: PriceComponent[]): this {
    this.#children.push(...components);
    return this;
  }

  priceCents(): number {
    const sum = this.#children.reduce((total, child) => total + child.priceCents(), 0);
    return Math.round(sum * (1 - this.#discount));
  }
}

const conference = new Bundle('Pakiet konferencyjny', 0.1).add(
  new Item('Sala na dzień', 250_000),
  new Bundle('Catering', 0.05).add(new Item('Lunch', 60_000), new Item('Przerwa kawowa', 20_000)),
);
console.log(conference.name, conference.priceCents());
```
Wariant z unią (zamknięty zbiór węzłów):
```ts
type PriceNode =
  | { kind: 'item'; name: string; priceCents: number }
  | { kind: 'bundle'; name: string; discount: number; children: readonly PriceNode[] };

function price(node: PriceNode): number {
  switch (node.kind) {
    case 'item':
      return node.priceCents;
    case 'bundle':
      return Math.round(node.children.reduce((s, c) => s + price(c), 0) * (1 - node.discount));
  }
}
```

## Kiedy NIE używać / pułapki
- **Dane nie są drzewem** — płaska lista + `map`/`reduce` wystarczy.
- Operacja ma sens tylko dla liści albo tylko dla kontenerów → to dwa różne typy; puste `add()`/`remove()` na liściu
  sygnalizują, że podział jest sztuczny.
- Rekurencja bez ograniczeń: przy danych od użytkownika pilnuj cykli i głębokości.
- Agregaty DDD: nie buduj ogromnego drzewa w jednym agregacie „bo kompozyt” — granice spójności ważniejsze
  (ddd-tactical-design).
