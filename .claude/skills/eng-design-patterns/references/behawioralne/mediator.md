# Mediator

> **Spis treści:** Problem · Rozwiązanie i uczestnicy · Kiedy używać · Koszty · Powiązania · Forma idiomatyczna w TS · Przykład (TS) · Kiedy NIE używać / pułapki

Kategoria: behawioralne. Istota: komponenty nie wołają się nawzajem — **zgłaszają zdarzenia pośrednikowi**, który
wie, jak zareagować. Sieć zależności „każdy z każdym” zamienia się w gwiazdę.

## Problem
Formularz rezerwacji sali: wybór dat odświeża listę wolnych sal, wybór sali przelicza cenę, cena i kompletność danych
decydują o aktywności przycisku „Rezerwuj”. Gdy pole dat zna listę sal, lista sal zna etykietę ceny, a etykieta zna
przycisk, żadnego komponentu nie da się użyć w innym formularzu, a zmiana reguły wymaga edycji kilku klas.

## Rozwiązanie i uczestnicy
- **Komponenty** — znają tylko interfejs mediatora; zgłaszają „coś się zmieniło”.
- **Mediator** — interfejs `notify(event)`.
- **Konkretny mediator** — trzyma referencje do komponentów i koduje reguły ich współpracy.

## Kiedy używać
- Zmiana jednej klasy wymaga zmian w wielu innych z powodu splątanych zależności.
- Komponentu nie da się ponownie użyć, bo zna konkretnych sąsiadów.
- Tworzysz podklasy komponentów tylko po to, by zmienić ich współpracę z otoczeniem.

## Koszty
Mediator łatwo staje się „boskim obiektem” — cała logika współpracy w jednej klasie.

## Powiązania
- **Fasada** — podsystem o niej nie wie; komponenty wiedzą o mediatorze.
- **Obserwator** — mediator bywa realizowany przez subskrypcje (komponenty publikują, mediator słucha).
- **Łańcuch, Polecenie, Obserwator** — alternatywne sposoby łączenia nadawców z odbiorcami.
- Na poziomie systemu rolę mediatora pełni broker/szyna zdarzeń; między kontekstami — zdarzenia i polityki
  (ddd-tactical-design, be-messaging-outbox).

## Forma idiomatyczna w TS
W UI rolę mediatora często pełni **komponent-kontener lub store** stanu formularza (fe-architecture): komponenty
prezentacyjne emitują zdarzenia w górę, kontener decyduje. Własny mediator pisz, gdy framework tego nie daje.

## Przykład (TS)
```ts
type FormEvent = 'datesChanged' | 'roomChanged';

interface FormMediator {
  notify(event: FormEvent): void;
}

class DatesField {
  nights: number | undefined;
  readonly #mediator: FormMediator;
  constructor(mediator: FormMediator) {
    this.#mediator = mediator;
  }
  choose(from: Date, to: Date): void {
    this.nights = Math.round((to.getTime() - from.getTime()) / 86_400_000);
    this.#mediator.notify('datesChanged');
  }
}

class RoomSelect {
  options: readonly string[] = [];
  selected: string | undefined;
  readonly #mediator: FormMediator;
  constructor(mediator: FormMediator) {
    this.#mediator = mediator;
  }
  select(room: string): void {
    this.selected = room;
    this.#mediator.notify('roomChanged');
  }
}

class PriceLabel {
  text = '—';
}
class SubmitButton {
  enabled = false;
}

/** Konkretny mediator: jedyne miejsce, które zna reguły współpracy pól. */
class BookingForm implements FormMediator {
  readonly dates = new DatesField(this);
  readonly room = new RoomSelect(this);
  readonly price = new PriceLabel();
  readonly submit = new SubmitButton();
  readonly #ratesPerNight: ReadonlyMap<string, number>;

  constructor(ratesPerNight: ReadonlyMap<string, number>) {
    this.#ratesPerNight = ratesPerNight;
  }

  notify(event: FormEvent): void {
    if (event === 'datesChanged') {
      this.room.options = [...this.#ratesPerNight.keys()];
      if (this.room.selected !== undefined && !this.room.options.includes(this.room.selected)) {
        this.room.selected = undefined;
      }
    }
    const rate = this.room.selected === undefined ? undefined : this.#ratesPerNight.get(this.room.selected);
    const nights = this.dates.nights;
    const complete = rate !== undefined && nights !== undefined && nights > 0;
    this.price.text = complete ? `${((rate * nights) / 100).toFixed(2)} zł` : '—';
    this.submit.enabled = complete;
  }
}

const form = new BookingForm(new Map([['Sala A', 90_000], ['Sala B', 60_000]]));
form.dates.choose(new Date('2026-10-01'), new Date('2026-10-03'));
form.room.select('Sala B');
console.log(form.price.text, form.submit.enabled);
```

## Kiedy NIE używać / pułapki
- **Dwa–trzy obiekty z jedną, stabilną relacją** — bezpośrednie wywołanie lub callback jest prostsze.
- Pilnuj rozrostu: `notify()` jako wielki `switch` po nazwach zdarzeń → podziel mediator per obszar albo przejdź na
  bardziej ziarniste subskrypcje (Obserwator).
- Store/kontener frameworka już koordynuje komponenty — nie dubluj go ręcznym mediatorem.
- Złożone reguły biznesowe (cennik, dostępność) nie powinny żyć w mediatorze UI — mediator woła domenę/serwis;
  w przykładzie mnożenie stawki zostało w mediatorze tylko dla zwięzłości.
