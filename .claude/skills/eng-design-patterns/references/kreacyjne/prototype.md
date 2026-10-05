# Prototyp (Prototype)

Kategoria: kreacyjne. Istota: obiekt **sam wie, jak się skopiować**; klient klonuje go przez interfejs, nie znając
konkretnej klasy ani prywatnych pól.

## Problem
Dział prawny utrzymuje kilka skonfigurowanych szablonów umów (klauzule, metadane, wersje). Nowa umowa to kopia
szablonu z drobnymi zmianami. Kopiowanie „z zewnątrz” nie widzi pól prywatnych, wymaga znajomości konkretnej klasy
i łatwo kończy się płytką kopią, w której zmiana klauzuli w umowie psuje szablon.

## Rozwiązanie i uczestnicy
- **Prototyp** — interfejs z `clone()`.
- **Konkretny prototyp** — implementuje `clone()` wewnątrz klasy (ma dostęp do pól `#prywatnych`) i sam decyduje, co
  kopiować głęboko (kolekcje, obiekty zagnieżdżone, referencje zwrotne).
- **Rejestr prototypów (opcjonalnie)** — mapa `nazwa → gotowy prototyp`, zwracająca klony.

## Kiedy używać
- Kod dostaje obiekty przez interfejs i musi je kopiować bez znajomości klasy.
- Zamiast wielu podklas różniących się tylko konfiguracją — kilka skonfigurowanych egzemplarzy do klonowania.
- Utworzenie obiektu od zera jest kosztowne (obliczenia, wczytanie), a kopia gotowego — tania.

## Koszty
Poprawne klonowanie złożonych grafów (cykle, współdzielone referencje, zasoby) bywa trudne; każda nowa pole w klasie
wymaga pamiętania o `clone()`.

## Powiązania
- Alternatywa dla Metody wytwórczej (nie wymaga podklas twórcy); Fabryka abstrakcyjna może klonować prototypy.
- Pomaga kopiować drzewa Kompozytu i stosy Dekoratorów; historia Poleceń może przechowywać kopie.
- Prosta alternatywa Pamiątki, gdy obiekt można po prostu sklonować.

## Forma idiomatyczna w TS
Dla danych bez metod i prywatnego stanu: `structuredClone(obj)` (głęboka kopia, obsługuje cykle, `Map`, `Date`) albo
spread `{ ...obj }` (płytka). Obiekty niezmienne w ogóle nie potrzebują kopii — współdziel je.

## Przykład (TS)
```ts
interface Cloneable<T> {
  clone(): T;
}

class ContractTemplate implements Cloneable<ContractTemplate> {
  #clauses: string[];
  #meta: Map<string, string>;

  constructor(clauses: readonly string[], meta: ReadonlyMap<string, string> = new Map()) {
    this.#clauses = [...clauses];
    this.#meta = new Map(meta);
  }

  withClause(text: string): this {
    this.#clauses.push(text);
    return this;
  }
  tag(key: string, value: string): this {
    this.#meta.set(key, value);
    return this;
  }

  /** Kopia robiona wewnątrz klasy: widzi pola #prywatne, kolekcje kopiuje głęboko. */
  clone(): ContractTemplate {
    return new ContractTemplate(this.#clauses, this.#meta);
  }

  render(): string {
    return this.#clauses.map((clause, i) => `§${i + 1}. ${clause}`).join('\n');
  }
}

const registry = new Map<string, ContractTemplate>([
  ['najem-sali', new ContractTemplate(['Przedmiot najmu', 'Czynsz', 'Kaucja']).tag('wersja', '3')],
  ['usługa-it', new ContractTemplate(['Zakres usług', 'SLA', 'Poufność']).tag('wersja', '7')],
]);

function contractFrom(name: string): ContractTemplate {
  const prototype = registry.get(name);
  if (prototype === undefined) throw new Error(`nieznany szablon: ${name}`);
  return prototype.clone();
}

const contract = contractFrom('najem-sali').withClause('Kara umowna');
console.log(contract.render());
console.log(contractFrom('najem-sali').render()); // szablon bez zmian
```

## Kiedy NIE używać / pułapki
- **Płaskie DTO i obiekty konfiguracyjne** — `structuredClone`/spread wystarcza; interfejs `clone()` i rejestr mają
  sens przy prywatnym stanie, głębokich hierarchiach klas lub referencjach cyklicznych.
- „Unikanie `new`” nie jest powodem. Sprawdź, czy naprawdę kopiujesz **bez znajomości klasy**, czy tylko kopiujesz dane.
- Uważaj na płytkie kopie kolekcji — współdzielona tablica między prototypem a klonem to klasyczny błąd.
- `structuredClone` gubi prototyp klasy (metody) — do instancji klas używaj `clone()` z klasy.
