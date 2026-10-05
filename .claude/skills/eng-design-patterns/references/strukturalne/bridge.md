# Most (Bridge)

> **Spis treści:** Problem · Rozwiązanie i uczestnicy · Kiedy używać · Koszty · Powiązania · Forma idiomatyczna w TS · Przykład (TS) · Kiedy NIE używać / pułapki

Kategoria: strukturalne. Istota: rozdziel dwa **niezależne wymiary zmienności** na dwie hierarchie połączone kompozycją,
zamiast mnożyć podklasy dla każdej kombinacji.

## Problem
Raporty (obłożenie, przychody, reklamacje) trzeba generować w kilku formatach (CSV, Markdown, PDF). Dziedziczenie daje
`OccupancyCsvReport`, `OccupancyPdfReport`, `RevenueCsvReport`… — liczba klas to iloczyn raportów i formatów, a zmiana
formatu CSV wymaga edycji w wielu klasach.

## Rozwiązanie i uczestnicy
- **Abstrakcja** — logika wysokiego poziomu (`Report`), trzyma referencję do implementacji.
- **Rozszerzone abstrakcje** — warianty logiki (`OccupancyReport`, `RevenueReport`).
- **Interfejs implementacji** — proste, prymitywne operacje (`heading()`, `row()`).
- **Konkretne implementacje** — szczegóły technologii/platformy (`CsvWriter`, `MarkdownWriter`).
- **Klient** — łączy parę abstrakcja + implementacja (zwykle w konstruktorze lub przez DI).

## Kiedy używać
- Klasa rośnie w dwóch (lub więcej) kierunkach niezależnie: logika × platforma, dane × format, UI × system.
- Monolityczną klasę obsługującą wiele wariantów technologii (np. kilka baz) trzeba podzielić.
- Implementację trzeba wymieniać w runtime.

## Koszty
Więcej typów i pośredniości; przy spójnej, mało zmiennej klasie tylko zaciemnia kod.

## Powiązania
- **Adapter** — podobna struktura, ale reaktywny (łata niezgodność); Most jest decyzją projektową z góry.
- **Strategia** / **Stan** — też kompozycja + delegacja, ale jeden wymienny algorytm/stan, nie dwie hierarchie.
- **Fabryka abstrakcyjna** może tworzyć pasujące pary abstrakcja–implementacja.
- Porty i adaptery w architekturze heksagonalnej to w praktyce most między domeną a infrastrukturą.

## Forma idiomatyczna w TS
Implementacja jako `interface` (lub typ funkcyjny), abstrakcja jako klasa lub funkcja przyjmująca implementację.
Często wystarczą **funkcje wyższego rzędu**: `renderOccupancy(writer, data)`.

## Przykład (TS)
```ts
/** Implementacja: format wyjścia. */
interface ReportWriter {
  heading(text: string): void;
  row(cells: readonly string[]): void;
  result(): string;
}

class CsvWriter implements ReportWriter {
  #lines: string[] = [];
  heading(text: string): void {
    this.#lines.push(`# ${text}`);
  }
  row(cells: readonly string[]): void {
    this.#lines.push(cells.map((c) => `"${c.replaceAll('"', '""')}"`).join(','));
  }
  result(): string {
    return this.#lines.join('\n');
  }
}

class MarkdownWriter implements ReportWriter {
  #lines: string[] = [];
  heading(text: string): void {
    this.#lines.push(`## ${text}`, '');
  }
  row(cells: readonly string[]): void {
    this.#lines.push(`| ${cells.join(' | ')} |`);
  }
  result(): string {
    return this.#lines.join('\n');
  }
}

/** Abstrakcja: co raportujemy. */
abstract class Report {
  protected readonly writer: ReportWriter;
  constructor(writer: ReportWriter) {
    this.writer = writer;
  }
  abstract render(): string;
}

class OccupancyReport extends Report {
  readonly #occupancy: ReadonlyMap<string, number>;
  constructor(writer: ReportWriter, occupancy: ReadonlyMap<string, number>) {
    super(writer);
    this.#occupancy = occupancy;
  }
  render(): string {
    this.writer.heading('Obłożenie sal');
    for (const [room, ratio] of this.#occupancy) this.writer.row([room, `${Math.round(ratio * 100)}%`]);
    return this.writer.result();
  }
}

class RevenueReport extends Report {
  readonly #revenueCents: number;
  constructor(writer: ReportWriter, revenueCents: number) {
    super(writer);
    this.#revenueCents = revenueCents;
  }
  render(): string {
    this.writer.heading('Przychód');
    this.writer.row(['razem', (this.#revenueCents / 100).toFixed(2)]);
    return this.writer.result();
  }
}

const occupancy = new Map([['A1', 0.82], ['B2', 0.4]]);
console.log(new OccupancyReport(new MarkdownWriter(), occupancy).render());
console.log(new RevenueReport(new CsvWriter(), 1_250_000).render());
```

## Kiedy NIE używać / pułapki
- **Rośnie tylko jeden wymiar** — zwykła kompozycja lub jedna hierarchia wystarczy; nie buduj mostu „gdyby drugi
  wymiar kiedyś się pojawił” (YAGNI — eng-design-principles).
- Sygnał do zastosowania: nazwy klas będące iloczynem dwóch cech (`CsvOccupancy`, `PdfOccupancy`, `CsvRevenue`…)
  i realnie rosnąca liczba kombinacji po obu stronach.
- Interfejs implementacji ma być **niski** i stabilny; jeśli rośnie o metody pod konkretną abstrakcję, granica jest źle
  wyznaczona.
