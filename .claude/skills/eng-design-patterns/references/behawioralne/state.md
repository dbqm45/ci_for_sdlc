# Stan (State)

> **Spis treści:** Problem · Rozwiązanie i uczestnicy · Kiedy używać · Koszty · Powiązania · Forma idiomatyczna w TS · Przykład (TS) · Kiedy NIE używać / pułapki

Kategoria: behawioralne. Istota: każdy stan obiektu to osobny obiekt z **własnym zachowaniem**; kontekst deleguje
do bieżącego stanu, a stany same decydują o przejściach.

## Problem
Rezerwacja przechodzi przez „oczekuje → potwierdzona → zameldowana / anulowana”. Metody `confirm()`, `cancel()`,
`checkIn()` zawierają ten sam `switch (status)` z coraz większą liczbą gałęzi; opłata za anulowanie zależy od stanu
i czasu. Dodanie stanu „no-show” wymaga edycji każdej metody i łatwo przeoczyć jedną gałąź.

## Rozwiązanie i uczestnicy
- **Kontekst** — trzyma bieżący stan, deleguje mu operacje, udostępnia przejście (`transitionTo()`).
- **Interfejs stanu** — operacje zależne od stanu.
- **Konkretne stany** — zachowanie w danym stanie i decyzja o następnym; mogą mieć własne dane (np. czas
  potwierdzenia).

## Kiedy używać
- Te same pola stanu sterują rozgałęzieniami w wielu metodach jednej klasy.
- Stany mają **różne, nietrywialne zachowanie** (nie tylko inne dane) albo własne zależności.
- Liczba stanów rośnie lub stany mają być rozszerzane niezależnie.

## Koszty
Wiele małych klas; przy kilku prostych stanach — przerost formy; przejścia rozproszone po klasach stanów trudniej
zobaczyć w jednym miejscu niż w tabeli przejść.

## Powiązania
- **Strategia** ma ten sam kształt, ale strategie nie znają się i wybiera je klient; stany zmieniają się same.
- **Maszyna stanów** w modelu domeny (ddd-tactical-design) — jawne przejścia zamiast rozproszonych `if (status == …)`;
  ten plik to jedna z technik jej implementacji.
- **Most/Adapter** — też kompozycja + delegacja, inne problemy.

## Forma idiomatyczna w TS
**Unia dyskryminowana + wyczerpujący `switch`** (lub mapa przejść) jest pierwszym wyborem, gdy stany różnią się
głównie danymi i dozwolonymi przejściami — kompilator pilnuje kompletności (lang-typescript). Klasy stanów — gdy
każdy stan ma własną, rozbudowaną logikę.

## Przykład (TS)
Klasy stanów:
```ts
interface ReservationState {
  readonly name: string;
  confirm(reservation: Reservation): void;
  /** Zwraca opłatę za anulowanie w groszach. */
  cancel(reservation: Reservation, now: Date): number;
}

class Pending implements ReservationState {
  readonly name = 'oczekuje';
  confirm(r: Reservation): void {
    r.transitionTo(new Confirmed(new Date()));
  }
  cancel(r: Reservation): number {
    r.transitionTo(new Cancelled());
    return 0;
  }
}

class Confirmed implements ReservationState {
  readonly name = 'potwierdzona';
  readonly #confirmedAt: Date;
  constructor(confirmedAt: Date) {
    this.#confirmedAt = confirmedAt;
  }
  confirm(): void {
    throw new Error('rezerwacja już potwierdzona');
  }
  cancel(r: Reservation, now: Date): number {
    const hours = (now.getTime() - this.#confirmedAt.getTime()) / 3_600_000;
    r.transitionTo(new Cancelled());
    return hours <= 24 ? 0 : 5_000;
  }
}

class Cancelled implements ReservationState {
  readonly name = 'anulowana';
  confirm(): void {
    throw new Error('nie można potwierdzić anulowanej rezerwacji');
  }
  cancel(): number {
    return 0;
  }
}

class Reservation {
  #state: ReservationState = new Pending();

  get status(): string {
    return this.#state.name;
  }
  /** Wołane tylko przez stany; w większym kodzie ukryj je przed klientami (osobny interfejs). */
  transitionTo(next: ReservationState): void {
    this.#state = next;
  }
  confirm(): void {
    this.#state.confirm(this);
  }
  cancel(now = new Date()): number {
    return this.#state.cancel(this, now);
  }
}

const reservation = new Reservation();
reservation.confirm();
console.log(reservation.status, reservation.cancel(), reservation.status);
```
Forma z unią — często czytelniejsza w TS:
```ts
type OrderState =
  | { kind: 'pending' }
  | { kind: 'shipped'; trackingId: string }
  | { kind: 'delivered'; deliveredAt: Date };

function advance(state: OrderState, trackingId: string): OrderState {
  switch (state.kind) {
    case 'pending':
      return { kind: 'shipped', trackingId };
    case 'shipped':
      return { kind: 'delivered', deliveredAt: new Date() };
    case 'delivered':
      return state; // stan końcowy
  }
}
console.log(advance({ kind: 'pending' }, 'PL123'));
```

## Kiedy NIE używać / pułapki
- **2–3 stałe stany** — `if`/`switch` bez wzorca bywa najczytelniejszy.
- Stany różnią się tylko danymi → unia dyskryminowana; klasy stanów, gdy zachowanie jest naprawdę różne.
- Publiczne `transitionTo()` pozwala klientom ominąć reguły — ogranicz dostęp (interfejs dla stanów, moduł).
- Stan trwały: przy zapisie do bazy mapuj stan na wartość (nazwa + dane) i z powrotem — klasy stanów nie są modelem
  persystencji.
