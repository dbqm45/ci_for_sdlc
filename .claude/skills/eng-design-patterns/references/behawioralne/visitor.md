# Odwiedzający (Visitor)

> **Spis treści:** Problem · Rozwiązanie i uczestnicy · Kiedy używać · Koszty · Powiązania · Forma idiomatyczna w TS · Przykład (TS) · Kiedy NIE używać / pułapki

Kategoria: behawioralne. Istota: nowe **operacje** na stabilnej hierarchii typów żyją w osobnych obiektach
odwiedzających; elementy tylko „przyjmują gościa” (`accept`) i kierują go do właściwej metody (podwójna dyspozycja).

## Problem
Taryfa ładowania lub cennik jest wyrażeniem: stała, cena za kWh × energia, suma, iloczyn, minimum. Na tym samym drzewie
potrzeba wielu operacji: obliczenie kwoty, czytelny opis dla klienta, walidacja, eksport do formatu partnera. Dopisywanie
każdej operacji do każdej klasy węzła rozdyma model i miesza odpowiedzialności.

## Rozwiązanie i uczestnicy
- **Odwiedzający** — interfejs z metodą na każdy konkretny typ elementu.
- **Konkretny odwiedzający** — jedna operacja dla wszystkich typów (obliczenie, opis).
- **Element** — `accept(visitor)`.
- **Konkretne elementy** — `accept` woła metodę odwiedzającego właściwą dla swojego typu.

## Kiedy używać
- Hierarchia typów jest **stabilna**, a przybywa **operacji** na niej.
- Operacje pomocnicze (eksport, raport, walidacja) mają nie zaśmiecać klas elementów.
- Odwiedzający może zbierać stan podczas przechodzenia struktury (np. statystyki drzewa).

## Koszty
Nowy typ elementu wymaga zmiany **wszystkich** odwiedzających; odwiedzający widzi tylko publiczne API elementów;
dodatkowa złożoność podwójnej dyspozycji.

## Powiązania
- Pracuje zwykle na drzewie **Kompozytu**, często razem z **Iteratorem**.
- Bywa opisywany jako silniejsze **Polecenie** — operacja na obiektach wielu niezwiązanych typów.

## Forma idiomatyczna w TS
**Unia dyskryminowana + funkcja ze `switch`** to „odwiedzający bez `accept`”: każda operacja to funkcja, a kompilator
wymusza obsługę wszystkich wariantów przy dodaniu nowego (lang-typescript). Klasyczny Visitor — gdy hierarchia jest
otwarta (klasy z różnych modułów) lub elementy mają własną logikę.

## Przykład (TS)
```ts
interface TariffVisitor<R> {
  fixed(node: Fixed): R;
  perKwh(node: PerKwh): R;
  sum(node: Sum): R;
  min(node: Min): R;
}

interface TariffNode {
  accept<R>(visitor: TariffVisitor<R>): R;
}

class Fixed implements TariffNode {
  readonly cents: number;
  constructor(cents: number) {
    this.cents = cents;
  }
  accept<R>(v: TariffVisitor<R>): R {
    return v.fixed(this);
  }
}
class PerKwh implements TariffNode {
  readonly centsPerKwh: number;
  constructor(centsPerKwh: number) {
    this.centsPerKwh = centsPerKwh;
  }
  accept<R>(v: TariffVisitor<R>): R {
    return v.perKwh(this);
  }
}
class Sum implements TariffNode {
  readonly parts: readonly TariffNode[];
  constructor(...parts: TariffNode[]) {
    this.parts = parts;
  }
  accept<R>(v: TariffVisitor<R>): R {
    return v.sum(this);
  }
}
class Min implements TariffNode {
  readonly a: TariffNode;
  readonly b: TariffNode;
  constructor(a: TariffNode, b: TariffNode) {
    this.a = a;
    this.b = b;
  }
  accept<R>(v: TariffVisitor<R>): R {
    return v.min(this);
  }
}

/** Operacja 1: kwota za sesję. */
class Price implements TariffVisitor<number> {
  readonly #kwh: number;
  constructor(kwh: number) {
    this.#kwh = kwh;
  }
  fixed(n: Fixed): number {
    return n.cents;
  }
  perKwh(n: PerKwh): number {
    return Math.round(n.centsPerKwh * this.#kwh);
  }
  sum(n: Sum): number {
    return n.parts.reduce((total, p) => total + p.accept(this), 0);
  }
  min(n: Min): number {
    return Math.min(n.a.accept(this), n.b.accept(this));
  }
}

/** Operacja 2: opis dla klienta. */
class Describe implements TariffVisitor<string> {
  fixed(n: Fixed): string {
    return `${(n.cents / 100).toFixed(2)} zł`;
  }
  perKwh(n: PerKwh): string {
    return `${(n.centsPerKwh / 100).toFixed(2)} zł/kWh`;
  }
  sum(n: Sum): string {
    return n.parts.map((p) => p.accept(this)).join(' + ');
  }
  min(n: Min): string {
    return `min(${n.a.accept(this)}, ${n.b.accept(this)})`;
  }
}

const tariff = new Min(new Sum(new Fixed(200), new PerKwh(239)), new Fixed(15_000));
console.log(tariff.accept(new Describe()), '=', tariff.accept(new Price(40)) / 100, 'zł za 40 kWh');
```
Forma z unią (zamknięty zbiór węzłów):
```ts
type Tariff =
  | { kind: 'fixed'; cents: number }
  | { kind: 'perKwh'; centsPerKwh: number }
  | { kind: 'sum'; parts: readonly Tariff[] }
  | { kind: 'min'; a: Tariff; b: Tariff };

function price(t: Tariff, kwh: number): number {
  switch (t.kind) {
    case 'fixed':
      return t.cents;
    case 'perKwh':
      return Math.round(t.centsPerKwh * kwh);
    case 'sum':
      return t.parts.reduce((s, p) => s + price(p, kwh), 0);
    case 'min':
      return Math.min(price(t.a, kwh), price(t.b, kwh));
  }
}
console.log(price({ kind: 'sum', parts: [{ kind: 'fixed', cents: 200 }, { kind: 'perKwh', centsPerKwh: 239 }] }, 40));
```

## Kiedy NIE używać / pułapki
- **Typy elementów często przybywają** — to odwrotność sytuacji, w której wzorzec pomaga; każdy nowy typ = zmiana
  każdego odwiedzającego. Wtedy zwykły polimorfizm (metoda w każdej klasie).
- Sprawdź, w którym wymiarze kod naprawdę rośnie (typy czy operacje), zanim wybierzesz.
- 2–3 typy i jedna operacja → unia + `switch`; Visitor opłaca się przy kombinacji wielu typów × wielu operacji.
- Odwiedzający sięgający do wnętrza elementów przez gettery łamie hermetyzację — udostępniaj tylko to, co operacje
  naprawdę potrzebują.
