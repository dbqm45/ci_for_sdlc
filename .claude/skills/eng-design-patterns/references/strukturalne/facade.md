# Fasada (Facade)

> **Spis treści:** Problem · Rozwiązanie i uczestnicy · Kiedy używać · Koszty · Powiązania · Forma idiomatyczna w TS · Przykład (TS) · Kiedy NIE używać / pułapki

Kategoria: strukturalne. Istota: jeden **prosty interfejs** do złożonego podsystemu; klient woła jedną operację zamiast
koordynować wiele klas we właściwej kolejności.

## Problem
Złożenie zamówienia wymaga: rezerwacji stanów magazynowych, wyliczenia ceny, obciążenia płatności, wycofania rezerwacji
przy błędzie płatności i wysłania potwierdzenia. Gdy każdy kontroler, job i test powtarza tę choreografię, zmiana
kolejności lub dodanie kroku trzeba nanosić w wielu miejscach, a kod wywołujący zna szczegóły czterech modułów.

## Rozwiązanie i uczestnicy
- **Fasada** — udostępnia ograniczony, wygodny zestaw operacji (`placeOrder()`); wie, do kogo kierować żądania i w jakiej
  kolejności.
- **Podsystem** — klasy, które o fasadzie nie wiedzą i mogą być używane bezpośrednio przez tych, którzy potrzebują więcej.
- **Dodatkowe fasady** — gdy jedna rośnie, dziel ją per obszar.

## Kiedy używać
- Potrzebujesz prostego wejścia do złożonej biblioteki lub modułu — dla 80% przypadków użycia.
- Chcesz warstwować system: każda warstwa/moduł wystawia fasadę, reszta jest wewnętrzna (publiczny `index.ts`
  modułu — fe-architecture; moduł głęboki — ddd-context-mapping).
- W DDD cienki **serwis aplikacyjny** realizujący przypadek użycia odgrywa rolę fasady nad domeną i infrastrukturą
  (ddd-tactical-design) — bez reguł biznesowych w środku.

## Koszty
Fasada łatwo staje się „boskim obiektem” sprzężonym z całą aplikacją; zmiana w niej dotyka wielu klientów naraz.

## Powiązania
- **Adapter** dopasowuje istniejący interfejs jednego obiektu; Fasada definiuje nowy dla wielu.
- **Mediator** też centralizuje współpracę, ale komponenty o nim wiedzą; podsystem nie wie o fasadzie.
- **Pełnomocnik** ma identyczny interfejs jak obiekt; Fasada — inny, uproszczony.
- **Fabryka abstrakcyjna** może zastąpić fasadę, gdy ukrywać trzeba tylko tworzenie obiektów podsystemu.

## Forma idiomatyczna w TS
Często wystarczy **funkcja modułu** (`export async function placeOrder(deps, cmd)`) z zależnościami przekazanymi
jawnie; klasa — gdy fasada ma stan lub wiele operacji dzielących zależności.

## Przykład (TS)
```ts
type Line = { sku: string; qty: number };
type OrderResult = { ok: true; orderId: string } | { ok: false; reason: string };

class Inventory {
  reserve(lines: readonly Line[]): string {
    return `res-${lines.length}`;
  }
  release(reservationId: string): void {
    console.log('zwolniono', reservationId);
  }
}
class Pricing {
  totalCents(lines: readonly Line[]): number {
    return lines.reduce((sum, l) => sum + l.qty * 1_999, 0);
  }
}
class Payments {
  async charge(customerId: string, cents: number): Promise<boolean> {
    return cents < 100_000 && customerId !== '';
  }
}
class Mailer {
  send(customerId: string, text: string): void {
    console.log(`→ ${customerId}: ${text}`);
  }
}

/** Fasada: jeden przypadek użycia zamiast choreografii w każdym wywołującym. */
class Checkout {
  readonly #inventory: Inventory;
  readonly #pricing: Pricing;
  readonly #payments: Payments;
  readonly #mailer: Mailer;

  constructor(inventory: Inventory, pricing: Pricing, payments: Payments, mailer: Mailer) {
    this.#inventory = inventory;
    this.#pricing = pricing;
    this.#payments = payments;
    this.#mailer = mailer;
  }

  async placeOrder(customerId: string, lines: readonly Line[]): Promise<OrderResult> {
    const reservation = this.#inventory.reserve(lines);
    const total = this.#pricing.totalCents(lines);
    if (!(await this.#payments.charge(customerId, total))) {
      this.#inventory.release(reservation);
      return { ok: false, reason: 'płatność odrzucona' };
    }
    const orderId = `ORD-${reservation}`;
    this.#mailer.send(customerId, `Zamówienie ${orderId} przyjęte`);
    return { ok: true, orderId };
  }
}

const checkout = new Checkout(new Inventory(), new Pricing(), new Payments(), new Mailer());
checkout.placeOrder('C-1', [{ sku: 'KAWA', qty: 2 }]).then(console.log);
```

## Kiedy NIE używać / pułapki
- **Podsystem już ma prosty interfejs** — fasada nad fasadą to zbędna warstwa.
- Fasada zaczyna znać i koordynować wszystko w aplikacji → podziel ją per obszar.
- Fasada nie jest miejscem na reguły biznesowe (rabaty, limity) — te idą do domeny; fasada tylko orkiestruje.
- Nie zamykaj podsystemu całkowicie: zaawansowani klienci mogą potrzebować bezpośredniego dostępu.
