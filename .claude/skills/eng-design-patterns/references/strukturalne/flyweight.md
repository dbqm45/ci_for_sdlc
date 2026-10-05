# Pyłek (Flyweight)

Kategoria: strukturalne. Istota: wiele drobnych obiektów **współdzieli niezmienną część stanu**, a unikalną część
dostaje z zewnątrz — optymalizacja pamięci, nie porządku.

## Problem
Mapa miejsc na stadionie ma 60 000 foteli. Każdy fotel kopiuje dane swojej kategorii (nazwa, cena, kolor, opis zasad
zwrotu), choć kategorii jest pięć. W przeglądarce klienta i w pamięci serwera rezerwacji to setki megabajtów
powtórzeń, a GC ma ciągle pracę.

## Rozwiązanie i uczestnicy
- **Stan wewnętrzny** (intrinsic) — wspólny i niezmienny (kategoria miejsca) → w obiekcie pyłku.
- **Stan zewnętrzny** (extrinsic) — unikalny (rząd, numer, zajętość) → w lekkim kontekście albo przekazywany
  w parametrach metod.
- **Pyłek** — niezmienny obiekt ze stanem wewnętrznym.
- **Fabryka pyłków** — pula; zwraca istniejący pyłek dla tego samego klucza zamiast tworzyć nowy.
- **Kontekst** — stan zewnętrzny + referencja do pyłku.

## Kiedy używać
Wszystkie trzy warunki naraz: bardzo dużo podobnych obiektów, **zmierzony** problem z pamięcią, stan da się czysto
rozdzielić na wspólny i unikalny. Przykłady: glify w edytorze, kafelki/markery map, cząstki w grafice, tablice
z milionami rekordów w przeglądarce.

## Koszty
Złożoność (dwa rodzaje stanu, fabryka); CPU za RAM — stan zewnętrzny trzeba przekazywać lub wyliczać; trudniej
czytać i testować.

## Powiązania
- **Kompozyt** — liście drzewa mogą być pyłkami.
- **Singleton** — jedna, często mutowalna instancja; pyłków jest wiele i są niezmienne.
- Obiekty wartości DDD są niezmienne, więc **mogą** być współdzielone jak pyłki (interning) — ale to optymalizacja,
  nie powód modelowania.

## Forma idiomatyczna w TS
Pula to `Map<klucz, Pyłek>`; niezmienność przez `readonly` + `Object.freeze`. W JS silnik i tak internuje stringi —
pyłek ma sens dla obiektów złożonych.

## Przykład (TS)
```ts
/** Pyłek: wspólny, niezmienny stan kategorii miejsca. */
class SeatCategory {
  readonly code: string;
  readonly priceCents: number;
  readonly color: string;

  constructor(code: string, priceCents: number, color: string) {
    this.code = code;
    this.priceCents = priceCents;
    this.color = color;
    Object.freeze(this);
  }

  label(row: number, seat: number): string {
    return `${this.code} rząd ${row}, miejsce ${seat}: ${(this.priceCents / 100).toFixed(2)} zł`;
  }
}

/** Fabryka pyłków z pulą. */
class SeatCategories {
  readonly #pool = new Map<string, SeatCategory>();

  get(code: string, priceCents: number, color: string): SeatCategory {
    const key = `${code}|${priceCents}|${color}`;
    let category = this.#pool.get(key);
    if (category === undefined) {
      category = new SeatCategory(code, priceCents, color);
      this.#pool.set(key, category);
    }
    return category;
  }

  get size(): number {
    return this.#pool.size;
  }
}

/** Kontekst: tylko stan zewnętrzny + referencja do pyłku. */
type Seat = { row: number; seat: number; taken: boolean; category: SeatCategory };

const categories = new SeatCategories();
const seats: Seat[] = [];
for (let row = 1; row <= 200; row++) {
  for (let seat = 1; seat <= 300; seat++) {
    const category = row <= 20 ? categories.get('VIP', 45_000, 'gold') : categories.get('STD', 12_000, 'blue');
    seats.push({ row, seat, taken: false, category });
  }
}
console.log(seats.length, 'miejsc,', categories.size, 'obiekty kategorii');
console.log(seats[0]?.category.label(1, 1));
```

## Kiedy NIE używać / pułapki
- **Obiektów jest mało lub pamięć nie jest zmierzonym problemem** — to wzorzec optymalizacyjny; w typowym kodzie
  aplikacyjnym najrzadziej potrzebny z katalogu. Najpierw profiler (fe-/be- wydajność: mierz przed optymalizacją).
- Nie umiesz czysto rozdzielić stanu na „zawsze wspólny” i „unikalny” → to nie ten problem.
- Pyłek musi być niezmienny; mutowalny pyłek zmienia dane wszystkich kontekstów naraz — trudny do znalezienia błąd.
