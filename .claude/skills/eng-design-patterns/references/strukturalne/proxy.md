# Pełnomocnik (Proxy)

Kategoria: strukturalne. Istota: obiekt z **tym samym interfejsem** co usługa stoi przed nią i kontroluje dostęp:
leniwe tworzenie, uprawnienia, cache, zdalność, audyt. Klient nie odróżnia go od prawdziwej usługi.

## Problem
Magazyn dokumentów łączy się z kosztownym zasobem (inicjalizacja klienta chmury, pobranie kluczy) i zawiera dane
poufne. Część ekranów nigdy nie czyta dokumentów, a dostęp ma zależeć od uprawnień. Dopisywanie sprawdzeń i leniwej
inicjalizacji w każdym miejscu użycia duplikuje logikę; zmiana klasy magazynu jest niemożliwa (biblioteka).

## Rozwiązanie i uczestnicy
- **Interfejs usługi** — wspólny kontrakt.
- **Usługa** — prawdziwa logika (wolna, kosztowna, wrażliwa lub zdalna).
- **Pełnomocnik** — trzyma (lub tworzy) usługę, wykonuje pracę pomocniczą przed/po delegacji, często zarządza jej
  cyklem życia.

| Odmiana | Po co |
|---|---|
| wirtualny (leniwy) | odłożenie kosztownej inicjalizacji do pierwszego użycia |
| ochronny | sprawdzenie uprawnień przed wywołaniem |
| zdalny | ukrycie sieci (stub klienta RPC/HTTP generowany z kontraktu) |
| cache'ujący | zapamiętanie wyników powtarzalnych żądań |
| logujący/audytowy | zapis, kto i kiedy korzystał |
| inteligentna referencja | licznik użyć, zwolnienie zasobu, gdy nikt go nie trzyma |

## Kiedy używać
Gdy dostęp do istniejącej usługi wymaga nadzoru, a klient ma pozostać nieświadomy — i ten nadzór powtarza się
w wielu miejscach.

## Koszty
Dodatkowa pośredniość i klasa; możliwe opóźnienie; trudniej śledzić przepływ.

## Powiązania
- **Dekorator** — ten sam kształt; rozstrzyga motywacja: Dekorator **dodaje** zachowanie i warstwy składa klient,
  Pełnomocnik **kontroluje dostęp** do tego, co usługa już robi, i zwykle sam zarządza jej cyklem życia.
- **Adapter** zmienia interfejs; **Fasada** daje inny, prostszy interfejs do wielu obiektów.

## Forma idiomatyczna w TS
Leniwa inicjalizacja: `this.#real ??= create()`. Cache: `Map`. Wbudowany obiekt `Proxy` (`new Proxy(target, handler)`)
przechwytuje operacje na poziomie języka — to jedna z możliwych technik realizacji (np. w bibliotekach reaktywnych),
nie synonim wzorca; w kodzie aplikacyjnym jawna klasa jest czytelniejsza i lepiej typowana.

## Przykład (TS)
```ts
interface DocumentStore {
  read(documentId: string): Promise<string>;
}

class CloudDocumentStore implements DocumentStore {
  constructor() {
    console.log('kosztowna inicjalizacja klienta chmury');
  }
  async read(documentId: string): Promise<string> {
    return `treść ${documentId}`;
  }
}

/** Pełnomocnik ochronny + wirtualny: sprawdza uprawnienia i tworzy usługę dopiero przy pierwszym użyciu. */
class GuardedLazyStore implements DocumentStore {
  #real: DocumentStore | undefined;
  readonly #create: () => DocumentStore;
  readonly #canRead: (documentId: string) => boolean;

  constructor(create: () => DocumentStore, canRead: (documentId: string) => boolean) {
    this.#create = create;
    this.#canRead = canRead;
  }

  async read(documentId: string): Promise<string> {
    if (!this.#canRead(documentId)) throw new Error(`brak dostępu do ${documentId}`);
    this.#real ??= this.#create();
    return this.#real.read(documentId);
  }
}

const store: DocumentStore = new GuardedLazyStore(
  () => new CloudDocumentStore(),
  (id) => !id.startsWith('HR-'),
);
store.read('UMOWA-1').then(console.log);
store.read('HR-7').catch((e: unknown) => console.warn(String(e)));
```

## Kiedy NIE używać / pułapki
- **Motywacją jest nowe zachowanie biznesowe** → to Dekorator (lub zmiana usługi), nie Pełnomocnik.
- Jedno sprawdzenie w jednym miejscu → zwykły `if` przed wywołaniem.
- Leniwość i cache często załatwia `??=` i `Map` bez osobnej klasy — Pełnomocnik ma sens, gdy nadzór jest
  wielokrotnie używany i klient ma go nie widzieć.
- Autoryzacja ukryta w pełnomocniku nie zastępuje autoryzacji na granicy systemu (be-auth-security) — to warstwa
  dodatkowa.
