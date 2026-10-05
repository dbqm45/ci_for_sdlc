# Przykłady czystego kodu

> **Spis treści:** 1. Funkcja z flagą i `null` jako znaczeniem · 2. Długi `switch` po typie · 3. Połykany wyjątek i `None` jako błąd

## 1. Funkcja z flagą i `null` jako znaczeniem
**Sytuacja:** „Zrób review `process()` — ciężko się ją czyta, a testy przechodzą”.

**Jak:**
1. **Nazwy:** `process` i `data` nic nie mówią → nazwa z języka domeny (`blockResource`).
2. **Parametr-flaga** `notify: boolean` → dwie funkcje (komenda bez i z powiadomieniem).
3. **`null` jako znaczenie** („brak właściciela = system”) → osobna funkcja zamiast `null` w argumencie.
4. **Wczesny powrót** zamiast zagnieżdżeń.
5. Każdy krok osobno, testy zielone po każdym, commit `refactor:`.

**Wynik:**
```ts
// przed
declare const repo: { find(id: string): { blocked: boolean; by: string } | undefined; save(r: { blocked: boolean; by: string }): void };
declare function sendMail(to: string): void;

export function process(data: string, owner: string | null, notify: boolean): boolean {
  const r = repo.find(data);
  if (r) {
    if (!r.blocked) {
      r.blocked = true;
      r.by = owner === null ? "system" : owner;
      repo.save(r);
      if (notify) sendMail(r.by);
      return true;
    }
  }
  return false;
}
```
```ts
// po
type Resource = { blocked: boolean; by: string };
declare const resources: { find(id: string): Resource | undefined; save(r: Resource): void };
declare function sendMail(to: string): void;

export function blockResource(resourceId: string, ownerId: string): boolean {
  const resource = resources.find(resourceId);
  if (!resource || resource.blocked) return false;
  resources.save({ ...resource, blocked: true, by: ownerId });
  return true;
}

export function blockResourceBySystem(resourceId: string): boolean {
  return blockResource(resourceId, "system");
}

export function blockResourceAndNotify(resourceId: string, ownerId: string): boolean {
  const blocked = blockResource(resourceId, ownerId);
  if (blocked) sendMail(ownerId);
  return blocked;
}
```
Uwaga do review: zwracany `boolean` zostaje, bo `refactor:` nie zmienia zachowania. Zamianę `false` na wynik
operacji albo wyjątek (rozdzielenie komendy od zapytania — CQS) proponuję w osobnym PR po uzgodnieniu z wywołującymi.

## 2. Długi `switch` po typie
**Sytuacja:** „Linter zgłasza `complexity` 12 w `shipping_cost()`. Ten sam `if` po typie przesyłki jest jeszcze w dwóch
innych plikach”.

**Jak:**
1. Złożoność cyklomatyczna 12 > ok. 10 (próg McCabe'a) → dziel.
2. Zapach „`switch` po typie w wielu miejscach” → polityka/warianty: jedna tabela cen w jednym miejscu.
3. Kwota jako `float` to **obsesja typów prostych** → grosze w `int` z jednostką w nazwie.
4. Testy charakteryzujące przed zmianą, potem kroki: wydziel tabelę → podmień trzy miejsca użycia → usuń stare gałęzie.

**Wynik** (złożoność 12 → 2; nowy typ przesyłki = nowy wiersz, bez edycji funkcji):
```python
from dataclasses import dataclass


@dataclass(frozen=True)
class Tariff:
    base_grosze: int
    per_kg_grosze: int


TARIFFS: dict[str, Tariff] = {
    "letter": Tariff(base_grosze=500, per_kg_grosze=0),
    "parcel": Tariff(base_grosze=1200, per_kg_grosze=150),
    "pallet": Tariff(base_grosze=9000, per_kg_grosze=40),
}


def shipping_cost_grosze(kind: str, weight_kg: int) -> int:
    tariff = TARIFFS.get(kind)
    if tariff is None:
        raise ValueError(f"Nieznany typ przesyłki: {kind!r}. Dozwolone: {', '.join(TARIFFS)}")
    return tariff.base_grosze + tariff.per_kg_grosze * weight_kg
```

## 3. Połykany wyjątek i `None` jako błąd
**Sytuacja:** „Import cennika czasem po cichu daje pusty wynik. Popraw obsługę błędów”.

**Jak:**
1. **Błędy:** `except Exception: return None` połyka przyczynę, a `None` udaje błąd → wynik operacji.
2. Komunikat mówi, co się stało i co zrobić, bez danych wrażliwych (bez całej linii pliku).
3. **Komentarze:** zakomentowany stary parser usunięty (jest w historii git), zostaje tylko *dlaczego*.

**Wynik:**
```python
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation


@dataclass(frozen=True)
class Parsed:
    prices: dict[str, Decimal]


@dataclass(frozen=True)
class ParseError:
    line_no: int
    message: str


def parse_price_list(lines: list[str]) -> Parsed | ParseError:
    prices: dict[str, Decimal] = {}
    for line_no, line in enumerate(lines, start=1):
        sku, _, raw = line.partition(";")
        try:
            prices[sku] = Decimal(raw)
        except InvalidOperation:
            # dostawca wysyła przecinek dziesiętny tylko w starych plikach — nie zgadujemy, prosimy o poprawny eksport
            return ParseError(line_no, f"Linia {line_no}: cena nie jest liczbą. Wyeksportuj cennik z kropką dziesiętną.")
    return Parsed(prices)
```
