# Pamiątka (Memento)

> **Spis treści:** Problem · Rozwiązanie i uczestnicy · Kiedy używać · Koszty · Powiązania · Forma idiomatyczna w TS · Przykład (TS) · Kiedy NIE używać / pułapki

Kategoria: behawioralne. Istota: obiekt sam robi **migawkę swojego stanu** i sam się z niej przywraca; ktoś inny
przechowuje migawki, ale nie widzi ich zawartości.

## Problem
Edytor oferty handlowej ma prywatny stan (pozycje, rabaty negocjacyjne, notatki wewnętrzne) i potrzebuje „cofnij”
oraz „przywróć wersję sprzed negocjacji”. Kopiowanie stanu z zewnątrz wymaga upublicznienia pól — każdy mógłby je
zmieniać, a każda refaktoryzacja klasy psułaby kod robiący kopie.

## Rozwiązanie i uczestnicy
- **Źródło (originator)** — tworzy migawkę i przywraca się z niej; tylko ono zna jej zawartość.
- **Pamiątka** — niezmienna migawka; na zewnątrz udostępnia co najwyżej metadane (czas, etykieta).
- **Zarządca (caretaker)** — historia migawek (stos, limit); decyduje kiedy, ale nie zagląda do środka.

## Kiedy używać
- Cofnij/ponów, wersje robocze, punkty przywracania — bez łamania hermetyzacji.
- Wycofanie zmian obiektu w pamięci po nieudanej operacji wieloetapowej.

## Koszty
Pamięć przy częstych migawkach dużych obiektów; zarządca musi usuwać nieaktualne; w JS niezmienność i prywatność są
realne tylko przy `#polach`, `Object.freeze` i nieprzezroczystych typach.

## Powiązania
- **Polecenie** + Pamiątka — polecenie zapisuje migawkę przed wykonaniem, by móc cofnąć.
- **Prototyp** — prostsza alternatywa, gdy obiekt można po prostu sklonować.
- **Iterator** — migawka pozycji iteracji.
- Event sourcing (decider — ddd-tactical-design) odtwarza stan ze zdarzeń — inny mechanizm „cofania w czasie”.

## Forma idiomatyczna w TS
Gdy stan jest **niezmienny** (nowy obiekt przy każdej zmianie — styl reduktorów/store'ów), historia to po prostu
tablica poprzednich stanów. Nieprzezroczysty typ pamiątki: marka typu + `WeakMap` z właściwym stanem w module źródła.

## Przykład (TS)
```ts
declare const snapshotBrand: unique symbol;
/** Nieprzezroczysta pamiątka: na zewnątrz widać tylko metadane. */
type OfferSnapshot = { readonly takenAt: Date; readonly label: string; readonly [snapshotBrand]: true };

type OfferState = { title: string; lines: { sku: string; qty: number; discount: number }[] };

// Zawartość migawek dostępna tylko w tym module (u źródła).
const contents = new WeakMap<OfferSnapshot, OfferState>();

class OfferDraft {
  #state: OfferState = { title: '', lines: [] };

  rename(title: string): void {
    this.#state.title = title;
  }
  addLine(sku: string, qty: number, discount = 0): void {
    this.#state.lines.push({ sku, qty, discount });
  }
  summary(): string {
    return `${this.#state.title}: ${this.#state.lines.map((l) => `${l.qty}×${l.sku}`).join(', ')}`;
  }

  save(label: string): OfferSnapshot {
    const snapshot = Object.freeze({ takenAt: new Date(), label }) as OfferSnapshot;
    contents.set(snapshot, structuredClone(this.#state));
    return snapshot;
  }
  restore(snapshot: OfferSnapshot): void {
    const state = contents.get(snapshot);
    if (state === undefined) throw new Error('obca migawka');
    this.#state = structuredClone(state);
  }
}

/** Zarządca: przechowuje migawki z limitem, nie zna ich zawartości. */
class DraftHistory {
  readonly #stack: OfferSnapshot[] = [];
  readonly #limit: number;
  constructor(limit = 20) {
    this.#limit = limit;
  }
  push(snapshot: OfferSnapshot): void {
    this.#stack.push(snapshot);
    if (this.#stack.length > this.#limit) this.#stack.shift();
  }
  pop(): OfferSnapshot | undefined {
    return this.#stack.pop();
  }
}

const draft = new OfferDraft();
const history = new DraftHistory();
draft.rename('Oferta dla ACME');
draft.addLine('SALA-A', 2);
history.push(draft.save('przed negocjacją'));
draft.addLine('CATERING', 30, 0.15);
const previous = history.pop();
if (previous !== undefined) draft.restore(previous);
console.log(draft.summary(), '| przywrócono:', previous?.label);
```

## Kiedy NIE używać / pułapki
- **Stan już jest niezmienny** — tablica poprzednich stanów daje cofanie bez klas Memento/Caretaker.
- **Płaskie DTO bez prywatnego stanu** — `structuredClone` przy zmianie wystarczy; pełny wzorzec ma sens, gdy stan
  źródła jest prywatny i nie powinien być widoczny dla zarządcy.
- Od razu ustal limit historii (ostatnie N) — nieograniczona historia dużych obiektów to realny koszt pamięci.
- Migawka nie obejmuje świata zewnętrznego (zapisane rekordy, wysłane wiadomości) — tam potrzebna kompensacja.
