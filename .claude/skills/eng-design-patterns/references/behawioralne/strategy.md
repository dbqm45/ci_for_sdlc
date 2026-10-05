# Strategia (Strategy)

Kategoria: behawioralne. Istota: wymienne warianty algorytmu lub reguły za **wspólnym interfejsem**; kontekst
deleguje, a wybór wariantu należy do klienta lub konfiguracji.

## Problem
Koszyk liczy rabat: brak, rabat ilościowy, rabat lojalnościowy zależny od stażu, promocja sezonowa. Wszystkie warianty
w jednej metodzie z `switch (promoType)` sprawiają, że każda nowa promocja zmienia kod koszyka, testy obejmują całość
naraz, a dwie osoby edytujące promocje konfliktują w tym samym pliku.

## Rozwiązanie i uczestnicy
- **Strategia** — interfejs wariantu (w TS najczęściej typ funkcji).
- **Konkretne strategie** — warianty algorytmu.
- **Kontekst** — trzyma strategię i deleguje; nie wybiera jej sam.
- **Klient** — dobiera strategię (konfiguracja, DI, reguła wyboru).

## Kiedy używać
- Kilka wariantów tego samego zadania, wymiennych w runtime lub per konfiguracja.
- Chcesz usunąć duży warunek wybierający algorytm i testować warianty osobno.
- Warianty zmieniają się niezależnie od kodu, który ich używa.
- **Polityka** w DDD (rabatowanie, naliczanie kar, alokacja) to strategia nazwana językiem biznesu
  (ddd-tactical-design); w archetypie Pricing warianty cen to polityki (ddd-archetypes).

## Koszty
Klient musi znać różnice między wariantami, by wybrać; przy 2 rzadko zmienianych wariantach — przerost.

## Powiązania
- **Stan** — ten sam kształt, ale stany znają się i same zmieniają; strategie są niezależne.
- **Metoda szablonowa** — wymienność kroków przez dziedziczenie (statycznie); Strategia — przez kompozycję (dynamicznie).
- **Polecenie** parametryzuje *akcją*; Strategia *sposobem* wykonania. **Dekorator** zmienia otoczkę, Strategia wnętrze.

## Forma idiomatyczna w TS
Strategia to zwykle **funkcja** o nazwanym typie. Klasa-strategia — gdy wariant ma własne zależności (repozytorium,
klient HTTP) lub stan wstrzykiwany w konstruktorze.

## Przykład (TS)
```ts
type CartLine = { sku: string; unitCents: number; qty: number };
type Cart = { lines: readonly CartLine[]; customerSince: Date };

/** Strategia (polityka rabatowa): zwraca rabat w groszach. */
type DiscountPolicy = (cart: Cart, today: Date) => number;

const subtotal = (cart: Cart): number => cart.lines.reduce((sum, l) => sum + l.unitCents * l.qty, 0);

const noDiscount: DiscountPolicy = () => 0;

const volumeDiscount =
  (thresholdCents: number, rate: number): DiscountPolicy =>
  (cart) =>
    subtotal(cart) >= thresholdCents ? Math.round(subtotal(cart) * rate) : 0;

const loyaltyDiscount: DiscountPolicy = (cart, today) => {
  const years = (today.getTime() - cart.customerSince.getTime()) / (365 * 86_400_000);
  return Math.round(subtotal(cart) * Math.min(0.1, 0.02 * Math.floor(years)));
};

/** Kombinacja strategii: najlepszy rabat dla klienta. */
const bestOf =
  (...policies: DiscountPolicy[]): DiscountPolicy =>
  (cart, today) =>
    Math.max(0, ...policies.map((p) => p(cart, today)));

class Checkout {
  #policy: DiscountPolicy;
  constructor(policy: DiscountPolicy = noDiscount) {
    this.#policy = policy;
  }
  usePolicy(policy: DiscountPolicy): void {
    this.#policy = policy;
  }
  totalCents(cart: Cart, today = new Date()): number {
    const gross = subtotal(cart);
    return gross - Math.min(gross, this.#policy(cart, today));
  }
}

const cart: Cart = { lines: [{ sku: 'KAWA', unitCents: 4_900, qty: 12 }], customerSince: new Date('2021-03-01') };
const checkout = new Checkout(bestOf(volumeDiscount(50_000, 0.05), loyaltyDiscount));
console.log(checkout.totalCents(cart, new Date('2026-09-27')));
```

## Kiedy NIE używać / pułapki
- W TS/JS nie buduj `interface Strategy` + klas dla wariantów, które są czystymi funkcjami — typ funkcyjny daje tę samą
  wymienność bez nowych plików i `new` (`krytyka-i-pulapki.md`, pkt 1).
- Jeden algorytm bez realnego drugiego wariantu — nie wprowadzaj interfejsu „na przyszłość”.
- Jeśli strategie zaczynają się znać i przełączać nawzajem, to w rzeczywistości **Stan**.
- Wybór strategii też jest regułą — nie rozsiewaj go po kodzie; jedno miejsce (fabryka, konfiguracja, polityka wyboru).
