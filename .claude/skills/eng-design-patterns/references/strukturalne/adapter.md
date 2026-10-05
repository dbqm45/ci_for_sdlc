# Adapter

Kategoria: strukturalne. Istota: obiekt, który **implementuje interfejs oczekiwany przez nasz kod** i tłumaczy wywołania
na API, którego nie możemy zmienić.

## Problem
Domena oczekuje portu `PaymentGateway` (async, kwoty w groszach, wynik jako unia). Dostawca płatności daje SDK
z callbackami, kwotami jako tekst w złotówkach i własnymi kodami błędów. Wołanie SDK bezpośrednio z logiki
rozlewa jego konwencje po całym kodzie i uniemożliwia zmianę dostawcy.

## Rozwiązanie i uczestnicy
- **Interfejs klienta (port)** — to, czego chce nasz kod.
- **Usługa (adaptee)** — istniejące API: biblioteka zewnętrzna, legacy, inny kontekst.
- **Adapter** — implementuje port, trzyma referencję do usługi, konwertuje dane i wywołania w obie strony.
Usługa nie wie o adapterze. Adapter „klasowy” (wielodziedziczenie) nie istnieje w TS — używamy kompozycji.

## Kiedy używać
- Integracja biblioteki zewnętrznej lub legacy o niezgodnym interfejsie.
- Architektura heksagonalna: adapter infrastruktury implementuje port zdefiniowany przez domenę
  (ddd-tactical-design; w kodzie serwera — be-*).
- Kilka usług o podobnej funkcji i różnych sygnaturach ma być używanych jednolicie.
- Warstwa antykorupcyjna między kontekstami — adapter to jej budulec (ddd-context-mapping).

## Koszty
Nowy interfejs i klasa; czasem prościej zmienić samą usługę, jeśli jest nasza.

## Powiązania
- **Most** ma podobną strukturę, ale jest planowany z góry; Adapter łata istniejącą niezgodność.
- **Dekorator** zachowuje interfejs i pozwala nakładać warstwy; Adapter zmienia interfejs.
- **Pełnomocnik** ma ten sam interfejs co obiekt i kontroluje dostęp; Adapter tłumaczy na inny.
- **Fasada** tworzy nowy, prostszy interfejs do całego podsystemu; Adapter zwykle opakowuje jeden obiekt.

## Forma idiomatyczna w TS
Gdy port to pojedyncza funkcja, adapterem jest funkcja: `const charge: Charge = (id, cents) => sdk.pay(...)`.
Promisyfikacja callbacków (`new Promise(...)`) to typowa praca adaptera.

## Przykład (TS)
```ts
type Currency = 'PLN' | 'EUR';
type ChargeResult = { ok: true; reference: string } | { ok: false; reason: string };

/** Port zdefiniowany po naszej stronie. */
interface PaymentGateway {
  charge(orderId: string, amountCents: number, currency: Currency): Promise<ChargeResult>;
}

/** Zewnętrzne SDK — nie możemy go zmienić. */
class LegacyPayClient {
  pay(
    request: { ref: string; amount: string; cur: string },
    done: (error: string | null, transactionId?: string) => void,
  ): void {
    setTimeout(() => done(null, `tx-${request.ref}`), 10);
  }
}

class LegacyPayAdapter implements PaymentGateway {
  readonly #client: LegacyPayClient;

  constructor(client: LegacyPayClient) {
    this.#client = client;
  }

  charge(orderId: string, amountCents: number, currency: Currency): Promise<ChargeResult> {
    const request = { ref: orderId, amount: (amountCents / 100).toFixed(2), cur: currency };
    return new Promise((resolve) => {
      this.#client.pay(request, (error, transactionId) => {
        if (error !== null || transactionId === undefined) {
          resolve({ ok: false, reason: error ?? 'brak identyfikatora transakcji' });
        } else {
          resolve({ ok: true, reference: transactionId });
        }
      });
    });
  }
}

const gateway: PaymentGateway = new LegacyPayAdapter(new LegacyPayClient());
gateway.charge('ORD-9', 12_345, 'PLN').then((result) => console.log(result));
```

## Kiedy NIE używać / pułapki
- **Obie strony są pod twoją kontrolą** — ujednolić interfejs u źródła zamiast utrwalać warstwę tłumaczącą.
- **Projektujesz od zera dwa niezależne wymiary zmienności** — to raczej Most.
- Tłumaczenie to jedna linijka w jednym miejscu → funkcja mapująca, nie klasa z interfejsem.
- Adapter nie może „przeciekać”: jeśli w domenie pojawiają się typy lub wyjątki SDK, adapter nie spełnia swojej roli.
