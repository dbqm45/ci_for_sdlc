# Metoda wytwórcza (Factory Method)

> **Spis treści:** Problem · Rozwiązanie i uczestnicy · Kiedy używać · Koszty · Powiązania · Forma idiomatyczna w TS · Przykład (TS) · Kiedy NIE używać / pułapki

Kategoria: kreacyjne. Istota: klasa bazowa ma wspólną logikę, a **to, jaki obiekt współpracujący powstaje**, decyduje
nadpisywalna metoda — podklasy wymieniają produkt bez ruszania logiki.

## Problem
Serwis przypomnień ma nietrywialną logikę (ponawianie, logowanie, limity), ale kanał dostarczenia bywa różny: e-mail,
SMS, push. Gdy `new EmailChannel()` siedzi w środku logiki, każdy nowy kanał oznacza edycję tej logiki albo `switch`
po typie kanału rozsiany po kodzie.

## Rozwiązanie i uczestnicy
- **Produkt** — interfejs (`Channel`); **konkretne produkty** — `EmailChannel`, `SmsChannel`.
- **Twórca** — klasa bazowa z logiką korzystającą z produktu i abstrakcyjną metodą `createChannel()`.
- **Konkretni twórcy** — podklasy zwracające konkretny produkt.
Metoda wytwórcza może też zwracać obiekt z puli/cache zamiast nowego — wywołujący tego nie widzi.

## Kiedy używać
- Biblioteka/framework ma dać użytkownikom rozszerzanie wewnętrznych komponentów przez podklasę.
- Logika twórcy jest **sama nietrywialna** i ma być dziedziczona razem z punktem wymiany produktu.
- Hierarchia twórców już istnieje (nie budujesz jej tylko dla wzorca).

## Koszty
Każdy nowy produkt to nowa podklasa twórcy; dziedziczenie wiąże warianty statycznie.

## Powiązania
- Często punkt startowy: rozrasta się w Fabrykę abstrakcyjną (rodziny), Budowniczego (złożona konstrukcja) albo
  Prototyp (klonowanie zamiast podklas).
- Jest szczególnym przypadkiem Metody szablonowej — „utwórz obiekt” to jeden z kroków szkieletu.
- Kolekcja może zwracać swój iterator metodą wytwórczą.
- W DDD fabryka agregatu to inna rzecz (gwarancja poprawnego stanu) — ddd-tactical-design.

## Forma idiomatyczna w TS
Bez dziedziczenia: przekaż **funkcję tworzącą** (`createChannel: () => Channel`) do konstruktora albo użyj zwykłej
funkcji fabrykującej (niżej, w pułapkach). Klasowa wersja ma sens, gdy wymiana produktu idzie w parze z innymi
nadpisaniami.

## Przykład (TS)
```ts
interface Channel {
  deliver(to: string, text: string): Promise<void>;
}

class EmailChannel implements Channel {
  async deliver(to: string, text: string): Promise<void> {
    console.log(`e-mail → ${to}: ${text}`);
  }
}

class SmsChannel implements Channel {
  async deliver(to: string, text: string): Promise<void> {
    console.log(`SMS → ${to}: ${text.slice(0, 160)}`);
  }
}

/** Twórca: wspólna logika ponawiania + metoda wytwórcza dla kanału. */
abstract class ReminderService {
  protected abstract createChannel(): Channel;

  async remind(to: string, bookingId: string, attempts = 3): Promise<boolean> {
    const channel = this.createChannel();
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        await channel.deliver(to, `Przypomnienie o rezerwacji ${bookingId}`);
        return true;
      } catch (error) {
        console.warn(`próba ${attempt} nieudana`, error);
      }
    }
    return false;
  }
}

class EmailReminderService extends ReminderService {
  protected createChannel(): Channel {
    return new EmailChannel();
  }
}

class SmsReminderService extends ReminderService {
  protected createChannel(): Channel {
    return new SmsChannel();
  }
}

const services: readonly ReminderService[] = [new EmailReminderService(), new SmsReminderService()];
for (const service of services) void service.remind('klient@example.com', 'B-17');
```

## Kiedy NIE używać / pułapki
- **Jeden wariant i brak sygnału, że przybędą kolejne** — zwykły `new` wystarczy; nie buduj `Creator`/`ConcreteCreator`
  na wyrost.
- **Wybór wariantu jest prosty i nie wymaga dziedziczenia** — funkcja fabrykująca ze `switch` po parametrze jest
  czytelniejsza niż hierarchia klas (`krytyka-i-pulapki.md`, pkt 1):
  ```ts
  interface Notifier { send(msg: string): void; }
  class EmailNotifier implements Notifier { send(msg: string) { console.log('e-mail', msg); } }
  class SmsNotifier implements Notifier { send(msg: string) { console.log('SMS', msg); } }

  function createNotifier(kind: 'email' | 'sms'): Notifier {
    switch (kind) {
      case 'email': return new EmailNotifier();
      case 'sms': return new SmsNotifier();
    }
  }
  ```
- Klasowa wersja zarabia na siebie dopiero, gdy logika w klasie bazowej twórcy jest nietrywialna i dziedziczona —
  nie po to, by „mieć nazwany wzorzec”.
