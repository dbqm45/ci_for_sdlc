# Fabryka abstrakcyjna (Abstract Factory)

Kategoria: kreacyjne. Istota: jeden obiekt tworzy **całą rodzinę** współpracujących obiektów, które muszą do siebie
pasować; klient zna tylko interfejsy.

## Problem
System fakturowania obsługuje kilka krajów. Stawka podatku, numeracja dokumentów i format daty muszą pochodzić z **tej
samej** jurysdykcji — polska numeracja z niemieckim VAT-em to błąd prawny, a nie estetyczny. Gdy klient sam dobiera
elementy (`new PolishNumbering()`, `new GermanTax()`), łatwo je pomieszać, a każdy nowy kraj rozlewa `if (country)`
po kodzie.

## Rozwiązanie i uczestnicy
- **Produkty abstrakcyjne** — interfejs na każdy element rodziny (`TaxPolicy`, `InvoiceNumbering`).
- **Fabryka abstrakcyjna** — interfejs z metodą tworzącą na każdy produkt (`InvoicingKit`).
- **Konkretne fabryki** — jedna na rodzinę (`PolishInvoicing`, `GermanInvoicing`); zwracają wyłącznie produkty swojej
  rodziny.
- **Klient** — dostaje fabrykę raz (konfiguracja, DI) i dalej nie wie, z jaką rodziną pracuje.

## Kiedy używać
- Kod działa na produktach z różnych rodzin, a spójność rodziny jest regułą (jurysdykcja, platforma, motyw UI).
- Rodzin realnie przybywa lub jest ich kilka od początku.
- Klasa obrasta w wiele metod wytwórczych przesłaniających jej główną odpowiedzialność — sygnał, by je wydzielić.

## Koszty
Dużo interfejsów i klas; dodanie **nowego typu produktu** wymaga zmiany interfejsu fabryki i wszystkich fabryk.

## Powiązania
- Zwykle zestaw Metod wytwórczych w jednym interfejsie; metody mogą też klonować Prototypy.
- Budowniczy składa jeden złożony obiekt krokami; Fabryka abstrakcyjna oddaje gotowe produkty od razu.
- Z Mostem: fabryka może tworzyć pasujące pary abstrakcja–implementacja.
- Fasada też ukrywa złożoność, ale nie specjalizuje się w tworzeniu.

## Forma idiomatyczna w TS
Fabryką może być zwykły obiekt spełniający interfejs (`const polishKit = { taxPolicy, numbering } satisfies
InvoicingKit`), wybierany z mapy `Record<Country, InvoicingKit>`. Klasy dodawaj, gdy fabryka ma zależności.

## Przykład (TS)
```ts
interface TaxPolicy {
  vatCents(netCents: number): number;
}
interface InvoiceNumbering {
  next(sequence: number, issuedAt: Date): string;
}

/** Fabryka abstrakcyjna: rodzina elementów jednej jurysdykcji. */
interface InvoicingKit {
  taxPolicy(): TaxPolicy;
  numbering(): InvoiceNumbering;
}

class PolishInvoicing implements InvoicingKit {
  taxPolicy(): TaxPolicy {
    return { vatCents: (net) => Math.round(net * 0.23) };
  }
  numbering(): InvoiceNumbering {
    return {
      next: (seq, at) => `FV/${seq}/${String(at.getMonth() + 1).padStart(2, '0')}/${at.getFullYear()}`,
    };
  }
}

class GermanInvoicing implements InvoicingKit {
  taxPolicy(): TaxPolicy {
    return { vatCents: (net) => Math.round(net * 0.19) };
  }
  numbering(): InvoiceNumbering {
    return { next: (seq, at) => `RE-${at.getFullYear()}-${String(seq).padStart(6, '0')}` };
  }
}

// Klient: nie zna konkretnych klas, nie może pomieszać rodzin.
// (W realnym modelu kwoty to obiekt wartości Money — ddd-archetypes, quantity-money.)
function issueInvoice(kit: InvoicingKit, sequence: number, netCents: number) {
  const taxCents = kit.taxPolicy().vatCents(netCents);
  return {
    number: kit.numbering().next(sequence, new Date()),
    netCents,
    taxCents,
    grossCents: netCents + taxCents,
  };
}

const kits = { PL: new PolishInvoicing(), DE: new GermanInvoicing() } satisfies Record<string, InvoicingKit>;
console.log(issueInvoice(kits.PL, 42, 10_000));
console.log(issueInvoice(kits.DE, 42, 10_000));
```

## Kiedy NIE używać / pułapki
- **Tworzysz jeden produkt, nie rodzinę** → to Metoda wytwórcza albo zwykła funkcja.
- **Jedna rodzina bez perspektywy na drugą** — struktura „na zapas” to klasyczny młotek z `krytyka-i-pulapki.md` (pkt 3):
  koszt interfejsów bez zysku.
- Przy 2–3 stałych rodzinach funkcja zwracająca literał obiektu (`{ taxPolicy, numbering }`) zwykle wystarcza.
- Nowe **typy** produktów pojawiają się częściej niż nowe **rodziny** — wzorzec działa odwrotnie do potrzeby (każdy
  nowy typ zmienia wszystkie fabryki).
