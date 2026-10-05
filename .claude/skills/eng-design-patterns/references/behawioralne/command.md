# Polecenie (Command)

> **Spis treści:** Problem · Rozwiązanie i uczestnicy · Kiedy używać · Koszty · Powiązania · Forma idiomatyczna w TS · Przykład (TS) · Kiedy NIE używać / pułapki

Kategoria: behawioralne. Istota: żądanie staje się **obiektem-wartością** z metodą wykonania — można je przekazać,
zakolejkować, zapisać, zalogować i cofnąć.

## Problem
Kalendarz rezerwacji w panelu recepcji: te same akcje (zarezerwuj, przesuń, zwolnij) wywołuje przycisk, menu
kontekstowe, skrót klawiszowy i import z pliku; recepcja chce „cofnij” i dziennik zmian. Gdy każdy element UI woła
logikę bezpośrednio, nie ma jednego miejsca na historię, a cofanie wymaga wiedzy o każdej akcji w wielu miejscach.

## Rozwiązanie i uczestnicy
- **Polecenie** — interfejs `execute()` (i `undo()`, jeśli potrzebne).
- **Konkretne polecenia** — przechowują parametry i to, co potrzebne do cofnięcia; delegują pracę odbiorcy.
- **Odbiorca** — obiekt z właściwą logiką.
- **Wywołujący** — uruchamia polecenia, prowadzi historię/kolejkę; nie zna szczegółów akcji.
- **Klient** — tworzy polecenia i przekazuje je wywołującemu.

## Kiedy używać
- Parametryzowanie UI akcjami (przyciski, menu, skróty, paleta poleceń).
- Kolejkowanie, harmonogramowanie, wykonywanie zdalne — polecenie da się zserializować.
- Cofnij/ponów, dziennik operacji, makra (polecenie złożone z poleceń).

## Koszty
Dodatkowa warstwa; poprawne `undo()` bywa trudne (efekty uboczne na zewnątrz, np. wysłany e-mail).

## Powiązania
- **Pamiątka** — polecenie zapisuje stan przed wykonaniem, by cofnąć.
- **Strategia** też parametryzuje obiekt obiektem, ale wymienia *sposób* liczenia; Polecenie reprezentuje *akcję*.
- **Prototyp** — kopie poleceń w historii; **Łańcuch** — polecenie jako żądanie wędrujące przez ogniwa.
- **Komenda w CQRS/decider** (ddd-tactical-design) to intencja-wartość bez metody `execute()`; wykonuje ją handler.
  Nazwa ta sama, rola inna — nie mieszaj.

## Forma idiomatyczna w TS
Funkcja/closure (`() => void`) w tablicy lub `Map<string, () => void>` wystarcza, gdy nie trzeba serializacji ani
cofania. Serializowalne polecenie to często **unia dyskryminowana** danych + interpreter.

## Przykład (TS)
```ts
type Calendar = Map<string, string>; // slot → osoba

interface Command {
  readonly label: string;
  execute(): void;
  undo(): void;
}

class BookSlot implements Command {
  readonly label: string;
  readonly #calendar: Calendar;
  readonly #slot: string;
  readonly #owner: string;
  #previousOwner: string | undefined;

  constructor(calendar: Calendar, slot: string, owner: string) {
    this.#calendar = calendar;
    this.#slot = slot;
    this.#owner = owner;
    this.label = `rezerwacja ${slot} dla ${owner}`;
  }

  execute(): void {
    this.#previousOwner = this.#calendar.get(this.#slot);
    this.#calendar.set(this.#slot, this.#owner);
  }

  undo(): void {
    if (this.#previousOwner === undefined) this.#calendar.delete(this.#slot);
    else this.#calendar.set(this.#slot, this.#previousOwner);
  }
}

class CommandHistory {
  readonly #done: Command[] = [];
  readonly #limit: number;
  constructor(limit = 50) {
    this.#limit = limit;
  }
  run(command: Command): void {
    command.execute();
    this.#done.push(command);
    if (this.#done.length > this.#limit) this.#done.shift();
  }
  undo(): string | undefined {
    const command = this.#done.pop();
    command?.undo();
    return command?.label;
  }
}

const calendar: Calendar = new Map();
const history = new CommandHistory();
history.run(new BookSlot(calendar, 'pon 10:00', 'Anna'));
history.run(new BookSlot(calendar, 'pon 10:00', 'Piotr'));
console.log(calendar.get('pon 10:00'), '→ cofnięto:', history.undo(), '→', calendar.get('pon 10:00'));
```

## Kiedy NIE używać / pułapki
- **Brak kolejkowania, serializacji i cofania** — funkcja/closure (`Map<string, () => void>`) wystarcza zamiast klas.
- Pełna klasa zarabia, gdy polecenie niesie własne parametry i stan do cofnięcia albo musi zostać zapisane i odtworzone.
- Nie wszystko da się cofnąć: dla efektów zewnętrznych (płatność, e-mail) potrzebna jest **akcja kompensująca**
  (saga — ddd-tactical-design), nie `undo()`.
- Historię ograniczaj (limit N) — nieograniczona lista poleceń ze stanem to wyciek pamięci.
