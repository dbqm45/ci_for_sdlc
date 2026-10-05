# Iterator

Kategoria: behawioralne. Istota: jednolity sposób przechodzenia po elementach kolekcji **bez ujawniania jej
wewnętrznej struktury**; każdy iterator ma własną pozycję.

## Problem
Kod raportu przechodzi po zamówieniach z API stronicowanego kursorem, po drzewie jednostek organizacyjnych i po
tablicy w pamięci. Logika „pobierz następną stronę, sprawdź kursor, zejdź do dzieci” miesza się z logiką raportu
i powtarza w każdym miejscu użycia; zmiana API z offsetu na kursor psuje wszystkich klientów.

## Rozwiązanie i uczestnicy
- **Iterator** — daje kolejny element i informację o końcu; przechowuje własny stan iteracji.
- **Kolekcja** — tworzy iteratory (może kilka rodzajów: wgłąb, wszerz, odwrotnie).
- **Klient** — zna tylko protokół iteracji.

## Kiedy używać
- Chcesz ukryć reprezentację kolekcji (lista, drzewo, graf, API stronicowane), by móc ją zmienić.
- Potrzebujesz kilku sposobów przechodzenia albo kilku niezależnych, jednoczesnych pozycji.
- Dane są duże lub nieskończone — iteracja leniwa zamiast ładowania wszystkiego.

## Koszty
Przy prostych kolekcjach zbędny; bywa wolniejszy niż wyspecjalizowany dostęp.

## Powiązania
- Przechodzenie drzew **Kompozytu**; **Odwiedzający** wykonuje operację na odwiedzanych elementach.
- Kolekcja może tworzyć iterator **Metodą wytwórczą**; **Pamiątka** może zapisać pozycję iteracji.

## Forma idiomatyczna w TS
Protokół jest **wbudowany w język**: `Symbol.iterator`/`Symbol.asyncIterator`, `for…of`/`for await…of`, spread,
generatory `function*`/`async function*`, a od ES2025 metody pomocnicze iteratorów (`Iterator.prototype.map`,
`filter`, `take` — sprawdź target/lib w lang-typescript). Ręczna klasa z `current()/next()/valid()` to forma dla
języków bez protokołu.

## Przykład (TS)
Stronicowane API jako leniwy strumień elementów:
```ts
type Page<T> = { items: readonly T[]; next?: string };

async function* allItems<T>(fetchPage: (cursor?: string) => Promise<Page<T>>): AsyncGenerator<T> {
  let cursor: string | undefined;
  do {
    const page = await fetchPage(cursor);
    yield* page.items;
    cursor = page.next;
  } while (cursor !== undefined);
}

// Atrapa API: 3 strony po 2 elementy.
const fakeApi = async (cursor?: string): Promise<Page<number>> => {
  const n = Number(cursor ?? '0');
  return n < 2 ? { items: [n * 2, n * 2 + 1], next: String(n + 1) } : { items: [n * 2, n * 2 + 1] };
};

for await (const orderId of allItems(fakeApi)) {
  if (orderId > 3) break; // klient przerywa — kolejne strony nie są pobierane
  console.log('zamówienie', orderId);
}
```
Kolekcja drzewiasta z własnym porządkiem przechodzenia:
```ts
class OrgUnit implements Iterable<OrgUnit> {
  readonly name: string;
  readonly #children: OrgUnit[] = [];

  constructor(name: string) {
    this.name = name;
  }
  add(...units: OrgUnit[]): this {
    this.#children.push(...units);
    return this;
  }
  /** Przejście wgłąb (pre-order). */
  *[Symbol.iterator](): Generator<OrgUnit> {
    yield this;
    for (const child of this.#children) yield* child;
  }
}

const company = new OrgUnit('Zarząd').add(
  new OrgUnit('Sprzedaż').add(new OrgUnit('Region Północ')),
  new OrgUnit('IT'),
);
console.log([...company].map((u) => u.name).join(' → '));
```

## Kiedy NIE używać / pułapki
- Tablica, `Map`, `Set`, `string` już są iterowalne — nic nie dopisuj.
- Nie pisz klasy iteratora, gdy generator robi to samo w kilku liniach.
- Własna klasa iteratora ma sens przy wielu **jednocześnie żywych, niezależnych pozycjach** z dodatkowymi operacjami
  (np. cofanie, zapamiętanie pozycji).
- Modyfikacja kolekcji w trakcie iteracji — zdefiniuj zachowanie (kopiuj, zabroń lub dokumentuj), inaczej błędy są
  niedeterministyczne.
