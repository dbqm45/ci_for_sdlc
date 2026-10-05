# Metoda szablonowa (Template Method)

Kategoria: behawioralne. Istota: klasa bazowa ustala **niezmienny szkielet algorytmu**, a podklasy nadpisują wybrane
kroki (wymagane, opcjonalne i punkty zaczepienia).

## Problem
Miesięczne zestawienie dla klienta indywidualnego i firmowego: oba zbierają operacje, doliczają opłaty, sumują,
formatują i wysyłają. Różnią się źródłem operacji, opłatami i formatem. Dwie kopie całego procesu rozjeżdżają się
przy każdej zmianie (np. nowy krok audytu dopisany tylko w jednej).

## Rozwiązanie i uczestnicy
- **Klasa bazowa** — metoda szablonowa (kolejność kroków) oraz kroki:
  - **abstrakcyjne** — każda podklasa musi je dostarczyć,
  - **z domyślną implementacją** — podklasa może nadpisać,
  - **punkty zaczepienia (hooki)** — puste, do opcjonalnego rozszerzenia w konkretnym miejscu.
- **Konkretne klasy** — implementują kroki; nie zmieniają samej metody szablonowej.

## Kiedy używać
- Kilka klas ma prawie identyczny algorytm różniący się w kilku, dobrze wyodrębnionych krokach.
- Chcesz pozwolić rozszerzać tylko wybrane kroki procesu, a kolejność i wspólne kroki (audyt, walidacja) chronić.
- Frameworki: cykl życia komponentu/żądania z hookami.

## Koszty
Dziedziczenie wiąże warianty statycznie; stały szkielet ogranicza klientów potrzebujących innej kolejności; rosnąca
liczba hooków utrudnia zrozumienie; ryzyko złamania LSP, gdy podklasa narusza założenia szkieletu.

## Powiązania
- **Strategia** — to samo przez kompozycję (dynamicznie); często lepsza w TS.
- **Metoda wytwórcza** to szczególny przypadek: krok „utwórz obiekt”.
- eng-design-principles: kompozycja ponad dziedziczenie — Metoda szablonowa to świadomy wyjątek przy stabilnym szkielecie.

## Forma idiomatyczna w TS
TS nie ma `final` — ochronę szkieletu zapewnia konwencja i review (albo brak dziedziczenia). Alternatywa bez klas:
**funkcja szkieletu przyjmująca obiekt kroków** (`runStatement(steps, account)`), gdzie kroki opcjonalne mają wartości
domyślne.

## Przykład (TS)
```ts
type Entry = { date: Date; amountCents: number; description: string };

abstract class StatementJob {
  /** Metoda szablonowa — nie nadpisuj (konwencja: w TS brak `final`). */
  run(accountId: string, month: string): string {
    const entries = this.collect(accountId, month);
    const all = [...entries, ...this.fees(entries)];
    const totalCents = all.reduce((sum, e) => sum + e.amountCents, 0);
    this.beforeRender(accountId, totalCents);
    return this.render(accountId, month, all, totalCents);
  }

  /** Krok wymagany. */
  protected abstract collect(accountId: string, month: string): Entry[];
  /** Krok wymagany. */
  protected abstract render(accountId: string, month: string, entries: readonly Entry[], totalCents: number): string;
  /** Krok z domyślną implementacją. */
  protected fees(_entries: readonly Entry[]): Entry[] {
    return [];
  }
  /** Punkt zaczepienia. */
  protected beforeRender(_accountId: string, _totalCents: number): void {}
}

class RetailStatement extends StatementJob {
  protected collect(_accountId: string, month: string): Entry[] {
    return [{ date: new Date(`${month}-05`), amountCents: -12_000, description: 'Rezerwacja kortu' }];
  }
  protected render(accountId: string, month: string, entries: readonly Entry[], total: number): string {
    return `${accountId} ${month}: ${entries.length} operacji, saldo ${(total / 100).toFixed(2)} zł`;
  }
}

class BusinessStatement extends StatementJob {
  protected collect(_accountId: string, month: string): Entry[] {
    return [
      { date: new Date(`${month}-02`), amountCents: -250_000, description: 'Sala konferencyjna' },
      { date: new Date(`${month}-20`), amountCents: -80_000, description: 'Catering' },
    ];
  }
  protected override fees(entries: readonly Entry[]): Entry[] {
    return entries.length > 1 ? [{ date: new Date(), amountCents: -2_000, description: 'Opłata za zestawienie' }] : [];
  }
  protected override beforeRender(accountId: string, totalCents: number): void {
    if (totalCents < -300_000) console.log(`audyt: wysokie saldo na ${accountId}`);
  }
  protected render(accountId: string, month: string, entries: readonly Entry[], total: number): string {
    const lines = entries.map((e) => `  ${e.description}: ${(e.amountCents / 100).toFixed(2)}`);
    return [`Zestawienie ${accountId} za ${month}`, ...lines, `Razem: ${(total / 100).toFixed(2)} zł`].join('\n');
  }
}

for (const job of [new RetailStatement(), new BusinessStatement()]) console.log(job.run('ACC-1', '2026-09'));
```

## Kiedy NIE używać / pułapki
- Różnice między wariantami są w wielu miejscach i nie dają się wyodrębnić do kilku kroków — wspólna baza zmusza do
  czytania dwóch klas naraz, by zrozumieć jedną ścieżkę. Wybierz kompozycję (Strategia).
- Kroki mają się zmieniać w runtime, nie tylko przy wyborze klasy → Strategia.
- Pilnuj LSP: podklasa nadpisująca krok nie może łamać założeń szkieletu (np. oczekiwanej kolejności efektów
  ubocznych) — takie błędy są trudne do zauważenia, bo `run()` wygląda tak samo dla każdej podklasy.
- Głęboka hierarchia (szablon w szablonie) to sygnał do przejścia na kompozycję.
