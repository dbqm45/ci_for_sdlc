# Budowniczy (Builder)

> **Spis treści:** Problem · Rozwiązanie i uczestnicy · Kiedy używać · Koszty · Powiązania · Forma idiomatyczna w TS · Przykład (TS) · Kiedy NIE używać / pułapki

Kategoria: kreacyjne. Istota: złożony obiekt powstaje **krok po kroku**; kompletny i zwalidowany produkt odbierasz
dopiero na końcu.

## Problem
Kryteria wyszukiwania rezerwacji mają przedział czasu (wymagany), listę typów zasobów, minimalną pojemność, sortowanie,
czasem filtry dostępności. Konstruktor z ośmioma parametrami (część opcjonalna) jest nieczytelny i łatwo zamienić
kolejność; różne ekrany składają kryteria warunkowo, w kilku miejscach kodu.

## Rozwiązanie i uczestnicy
- **Budowniczy** — obiekt z metodami kroków (`between()`, `ofType()`…) i metodą `build()`, która waliduje i oddaje
  niezmienny produkt.
- **Produkt** — wynik; nie jest dostępny w stanie niekompletnym.
- **Kierownik (opcjonalnie)** — koduje powtarzalne sekwencje kroków („wyszukiwanie last minute”); w TS zwykle zwykła
  funkcja przyjmująca budowniczego.
- Różni budowniczowie mogą z tych samych kroków budować różne reprezentacje (np. zapytanie i jego opis dla UI).

## Kiedy używać
- Wiele opcjonalnych elementów składanych **warunkowo, w czasie lub rekurencyjnie** (także drzewa — Kompozyt).
- Kilka powtarzalnych „przepisów” na ten sam produkt (kandydat na kierownika).
- Niezmiennik produktu da się sprawdzić dopiero, gdy wszystkie części są znane (walidacja w `build()`).
- **Budowniczowie danych testowych** — domyślne poprawne wartości + nadpisanie tylko tego, co ważne w teście (eng-testing).

## Koszty
Dodatkowa klasa (i ew. kierownik); duplikacja listy pól między produktem a budowniczym.

## Powiązania
- Metoda wytwórcza → Fabryka abstrakcyjna → Budowniczy: coraz więcej elastyczności i złożoności.
- Fabryka abstrakcyjna oddaje produkt od razu; Budowniczy pozwala wykonać kroki przed odbiorem.
- Dobrze buduje drzewa Kompozytu.

## Forma idiomatyczna w TS
Najpierw **obiekt opcji** z nazwanymi polami i wartościami domyślnymi (`create({ from, to, sort = 'price' })`).
Łańcuchowe metody zwracają `this` — podklasy budowniczego zachowują wtedy poprawny typ (lang-typescript).

## Przykład (TS)
```ts
type SortOrder = 'price' | 'distance';

type BookingSearch = Readonly<{
  from: Date;
  to: Date;
  resourceTypes: readonly string[];
  minCapacity?: number;
  sort: SortOrder;
}>;

class BookingSearchBuilder {
  #from: Date | undefined;
  #to: Date | undefined;
  #types: string[] = [];
  #minCapacity: number | undefined;
  #sort: SortOrder = 'price';

  between(from: Date, to: Date): this {
    this.#from = from;
    this.#to = to;
    return this;
  }
  ofType(type: string): this {
    this.#types.push(type);
    return this;
  }
  forAtLeast(people: number): this {
    this.#minCapacity = people;
    return this;
  }
  sortedBy(sort: SortOrder): this {
    this.#sort = sort;
    return this;
  }

  build(): BookingSearch {
    if (this.#from === undefined || this.#to === undefined) throw new Error('brak przedziału czasu');
    if (this.#to <= this.#from) throw new RangeError('koniec musi być po początku');
    return {
      from: this.#from,
      to: this.#to,
      resourceTypes: [...this.#types],
      sort: this.#sort,
      ...(this.#minCapacity !== undefined ? { minCapacity: this.#minCapacity } : {}),
    };
  }
}

/** „Kierownik” jako funkcja: powtarzalny przepis na wyszukiwanie. */
function lastMinute(builder: BookingSearchBuilder, now: Date): BookingSearch {
  const in48h = new Date(now.getTime() + 48 * 3_600_000);
  return builder.between(now, in48h).sortedBy('distance').build();
}

const custom = new BookingSearchBuilder()
  .between(new Date('2026-10-01'), new Date('2026-10-03'))
  .ofType('sala')
  .forAtLeast(12)
  .build();
console.log(custom, lastMinute(new BookingSearchBuilder(), new Date()));
```

## Kiedy NIE używać / pułapki
- **2–3 opcjonalne parametry** — obiekt opcji (`{ url: string; method?: string }`) jest krótszy i czytelniejszy niż
  klasa z metodami łańcuchowymi.
- Sygnał, że Builder się opłaca: kilka powtarzalnych sekwencji budowy albo kroki odkładane w czasie, warunkowe,
  rekurencyjne. Jedno wywołanie z kompletem danych → zwykła funkcja (`krytyka-i-pulapki.md`).
- Budowniczy bez walidacji w `build()` to tylko rozwlekły konstruktor — cała wartość leży w gwarancji kompletnego
  produktu.
