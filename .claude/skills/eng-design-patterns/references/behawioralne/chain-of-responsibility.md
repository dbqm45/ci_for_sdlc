# Łańcuch zobowiązań (Chain of Responsibility)

> **Spis treści:** Problem · Rozwiązanie i uczestnicy · Kiedy używać · Koszty · Powiązania · Forma idiomatyczna w TS · Przykład (TS) · Kiedy NIE używać / pułapki

Kategoria: behawioralne. Istota: żądanie przechodzi przez sekwencję obsługujących; każdy **obsługuje je albo przekazuje
dalej** (i może zatrzymać przepływ). Nadawca nie wie, kto ostatecznie obsłużył.

## Problem
Wydatek zatwierdza osoba o odpowiednim limicie: kierownik zespołu do 1 000 zł, dyrektor do 10 000 zł, zarząd powyżej;
kategoria „sprzęt IT” zawsze idzie przez dział IT. Jedna funkcja z zagnieżdżonymi `if`-ami rośnie z każdą zmianą
struktury firmy, a konfiguracja różni się między spółkami.

## Rozwiązanie i uczestnicy
- **Obsługujący** — wspólny interfejs `handle(request)`.
- **Bazowy obsługujący (opcjonalnie)** — trzyma referencję do następnego ogniwa i domyślnie przekazuje dalej.
- **Konkretni obsługujący** — decydują: obsłużyć czy przekazać.
- **Klient** — składa łańcuch (kolejność ma znaczenie) i może go rekonfigurować w runtime.

## Kiedy używać
- Kolejność i skład kroków zmieniają się (konfiguracja, per klient, w runtime).
- Nie wiadomo z góry, który krok obsłuży żądanie, i pierwszy właściwy ma je „zabrać”.
- Middleware, walidatory z wczesnym przerwaniem, propagacja zdarzeń UI w górę drzewa.

## Koszty
Żądanie może przejść bez obsługi — potrzebny jawny wynik „nikt nie obsłużył”; debugowanie ścieżki przez wiele ogniw.

## Powiązania
- **Dekorator** ma ten sam kształt, ale zawsze deleguje dalej; ogniwo łańcucha może przerwać.
- **Polecenie** bywa żądaniem wędrującym przez łańcuch; **Kompozyt** — łańcuch od liścia do korzenia.
- **Polecenie, Mediator, Obserwator** — inne sposoby łączenia nadawców z odbiorcami.

## Forma idiomatyczna w TS
**Tablica funkcji** i `for`/`find` z wczesnym wyjściem; middleware `(ctx, next) => …` znane z frameworków HTTP to ten
wzorzec wbudowany.

## Przykład (TS)
```ts
type Expense = { amountCents: number; category: string };
type Decision = { approvedBy: string } | { rejected: string };

abstract class Approver {
  #next: Approver | undefined;
  protected abstract readonly role: string;
  protected abstract canApprove(expense: Expense): boolean;

  /** Zwraca następne ogniwo, żeby łańcuch składać płynnie. */
  then(next: Approver): Approver {
    this.#next = next;
    return next;
  }

  handle(expense: Expense): Decision {
    if (this.canApprove(expense)) return { approvedBy: this.role };
    return this.#next?.handle(expense) ?? { rejected: 'nikt w łańcuchu nie może zatwierdzić' };
  }
}

class ItDepartment extends Approver {
  protected readonly role = 'dział IT';
  protected canApprove(e: Expense): boolean {
    return e.category === 'sprzęt IT' && e.amountCents <= 2_000_000;
  }
}
class TeamLead extends Approver {
  protected readonly role = 'kierownik zespołu';
  protected canApprove(e: Expense): boolean {
    return e.category !== 'sprzęt IT' && e.amountCents <= 100_000;
  }
}
class Director extends Approver {
  protected readonly role = 'dyrektor';
  protected canApprove(e: Expense): boolean {
    return e.category !== 'sprzęt IT' && e.amountCents <= 1_000_000;
  }
}

const chain = new ItDepartment();
chain.then(new TeamLead()).then(new Director());

console.log(chain.handle({ amountCents: 50_000, category: 'szkolenie' }));
console.log(chain.handle({ amountCents: 5_000_000, category: 'szkolenie' }));
```
Forma funkcyjna:
```ts
type Expense = { amountCents: number; category: string };
type Rule = (e: Expense) => string | undefined; // zwraca rolę albo undefined = „przekaż dalej”

const rules: readonly Rule[] = [
  (e) => (e.amountCents <= 100_000 ? 'kierownik zespołu' : undefined),
  (e) => (e.amountCents <= 1_000_000 ? 'dyrektor' : undefined),
];

function approve(e: Expense): string {
  for (const rule of rules) {
    const role = rule(e);
    if (role !== undefined) return role;
  }
  return 'zarząd';
}
console.log(approve({ amountCents: 300_000, category: 'szkolenie' }));
```

## Kiedy NIE używać / pułapki
- **Stała, krótka sekwencja** — `a(); b(); c();` lub tablica funkcji jest czytelniejsza niż obiekty z `setNext()`.
  Klasowy łańcuch ma sens przy realnej rekonfiguracji w runtime.
- Framework już ma middleware/interceptory — nie buduj równoległej infrastruktury.
- Każde żądanie **musi** przejść przez wszystkie kroki (bez przerwania) → to pipeline/kompozycja funkcji, nie łańcuch.
- Reguły zatwierdzania to wiedza biznesowa — często lepiej modelować je jako polityki/specyfikacje w domenie
  (ddd-tactical-design), a łańcuch zostawić infrastrukturze.
