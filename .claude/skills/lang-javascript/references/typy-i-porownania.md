# Typy, koercja i porównania

Na podstawie MDN Web Docs (developer.mozilla.org/docs/Web/JavaScript/Reference/Operators/Equality), opisane własnymi słowami; przykłady sprawdzone w Node 22.

## `==` (loose equality) vs `===` (strict equality)

- **`===`** — nigdy nie konwertuje typów; operandy różnych typów są zawsze różne.
- **`==`** — próbuje skonwertować operandy różnych typów przed porównaniem (koercja).

### Algorytm koercji dla `==` (skrót)

1. **Ten sam typ** → porównanie jak `===` (Object: ta sama referencja; String: te same znaki;
   Number: ta sama wartość, `NaN` nigdy nie równa się niczemu, `+0 == -0`; Boolean/BigInt/Symbol:
   dosłowna równość).
2. **`null`/`undefined`** — jeśli jeden operand to `null` lub `undefined`, drugi musi być też
   `null`/`undefined`, inaczej `false`. To jest **specjalna reguła**: `null == undefined` → `true`,
   ale `null === undefined` → `false`.
3. **Obiekt + prymityw** — obiekt konwertowany do prymitywu (`valueOf`/`toString`).
4. **Prymityw + prymityw różnych typów** — Boolean→Number (`true`→`1`), Number+String→String
   konwertowany do Number, Symbol+cokolwiek → `false` (bez konwersji).

### Tabela przykładów

```js
"1" == 1;                  // true  (string → number)
0 == false;                 // true  (false → 0)
0 == null;                  // false (null tylko == null/undefined)
0 == undefined;              // false
null == undefined;           // true  (reguła specjalna)
NaN == NaN;                  // false (NaN nigdy nie jest równe niczemu, nawet sobie)
+0 == -0;                    // true

const o1 = { k: "v" }, o2 = { k: "v" };
o1 == o2;                    // false (różne obiekty, ta sama zawartość)
o1 == o1;                    // true  (ta sama referencja)

[1, 2, 3] == "1,2,3";        // true  (array → string przez toString())
```

## Kiedy używać którego

**Domyślnie: `===`.** Jest przewidywalny, nie wymaga rozumienia algorytmu koercji, zapobiega
subtelnym bugom (`"1" == 1` bywa niezamierzone).

```js
if (value === 0) { /* ... */ }
if (status === "active") { /* ... */ }
```

**`==` świadomie, w jednym idiomatycznym przypadku:** sprawdzenie „czy `null` albo `undefined`”,
naraz, jednym porównaniem:

```js
if (value == null) {
  // true dla value === null LUB value === undefined
}
// zamiast dłuższego:
if (value === null || value === undefined) { /* ... */ }
```

Poza tym jednym przypadkiem, użycie `==` w code review jest sygnałem do zapytania „czy to
zamierzone”, nie domyślną praktyką.

## `typeof` i `instanceof`

- `typeof` zwraca string: `"string"`, `"number"`, `"bigint"`, `"boolean"`, `"symbol"`,
  `"undefined"`, `"object"`, `"function"`.
- **Pułapka historyczna:** `typeof null === "object"` — błąd zakorzeniony w JS od początku, nie da
  się go naprawić bez złamania wsteczności. Do sprawdzania `null` używaj `=== null`, nie `typeof`.
- `instanceof` sprawdza łańcuch prototypów (`obj instanceof Klasa`) — działa dla obiektów tworzonych
  przez `new`/klasy, nie dla prymitywów ani obiektów z innego kontekstu (np. `iframe`, inny
  realm — tam `instanceof Array` może zawodzić, mimo że to faktycznie tablica).

## Truthy / Falsy

Falsy (dokładnie te wartości, wszystko inne jest truthy): `false`, `0`, `-0`, `0n` (BigInt zero),
`""`, `null`, `undefined`, `NaN`.

**Pułapka:** `"0"` (string) jest **truthy** (niepusty string), `0` (number) jest falsy — łatwo
pomylić przy danych z formularza/URL, gdzie wartości bywają stringami.
