# Podstawy systemu typów i narrowing

> **Spis treści:** 1. Adnotacje typów, inferencja, erasure · 2. `any` vs `unknown` · 3. Typy podstawowe · 4. `type` vs `interface` · 5. Asercje: `as`, `!`, `as const`, `satisfies` · 6. `enum` vs unia literałów · Narrowing — techniki zawężania

Na podstawie podręcznika TypeScript („The Basics”, „Everyday Types”, „Narrowing”), opisane własnymi słowami.
Przykłady sprawdzone w tsc 6.0.3 i 7.0.2 (`strict`, `noUncheckedIndexedAccess`).

## 1. Adnotacje typów, inferencja, erasure

- **Adnotuj parametry funkcji** — to jedyne miejsce, gdzie TypeScript nie ma z czego wywnioskować typu:

  ```ts
  function greet(person, date) { /* ... */ }            // ❌ niejawne any (błąd w strict)
  function greet(person: string, date: Date) { /* ... */ } // ✅
  ```

- **Nie adnotuj tego, co TypeScript i tak wywnioskuje** (`let msg = "hello"` ma już typ `string`).
  Wyjątek: jawny typ wyniku funkcji publicznych (kontrakt — zasada 7 w SKILL.md).
- **Adnotacje są usuwane przy kompilacji** — nie kosztują nic w runtime, ale też niczego w runtime nie sprawdzają.
- **Typowanie istniejącego kodu krok po kroku:** zacznij od parametrów funkcji — natychmiast ujawnią niezgodności
  w miejscach wywołania.

## 2. `any` vs `unknown`

| `any` | `unknown` |
|---|---|
| wyłącza sprawdzanie typów i „zaraża” dalsze wyrażenia | bezpieczna alternatywa |
| można wywołać cokolwiek | trzeba zawęzić przed użyciem |
| błąd ucieka do runtime | błąd wykrywany przy kompilacji |

```ts
let a: any = { x: 0 };
a.foo(); // brak błędu kompilacji — wybuchnie w runtime

let u: unknown = { x: 0 };
u.foo(); // ❌ błąd — trzeba zawęzić
if (typeof u === "object" && u !== null && "foo" in u && typeof u.foo === "function") {
  u.foo(); // ✅ zawężone bez `as` (od TS 4.9 `in` dodaje właściwość do typu)
}
```

Nowy kod: `unknown`, nie `any`. `noImplicitAny` (część `strict`) zamienia niejawne `any` w błąd.

## 3. Typy podstawowe

```ts
let numbers: number[] = [1, 2, 3];
let strings: Array<string> = ["a", "b"];
let tuple: [number, string] = [42, "hi"];           // dokładna liczba i kolejność

function printName(obj: { first: string; last?: string }) {
  console.log(obj.last?.toUpperCase());            // trzeba obsłużyć undefined
}

function printText(s: string, alignment: "left" | "right" | "center") {}
printText("Hi", "centre"); // ❌ literal type — tylko podane wartości
```

Z `noUncheckedIndexedAccess` `numbers[0]` ma typ `number | undefined` — obsłuż brak elementu (`?? domyślna`, guard).

## 4. `type` vs `interface`

| | `type` | `interface` |
|---|---|---|
| rozszerzanie | `&` (intersection) | `extends` |
| declaration merging | nie | tak |
| unia, tuple, prymityw, typy mapowane/warunkowe | tak | nie |
| kształt obiektu | możliwy | zwykle preferowany (czytelniejsze błędy) |

```ts
type ID = number | string;
type Point = { x: number; y: number };
type Bear = Point & { honey: boolean };

interface Animal { name: string }
interface Bear2 extends Animal { honey: boolean }
```

**Konflikt w `&`** na niezgodnych polach daje `never` na tym polu — bez błędu w miejscu deklaracji:
```ts
interface A { name: string }
interface B { name: number }
declare const x: A & B;
x.name; // typ: never
```
(`extends` przy takim konflikcie zgłasza błąd od razu — kolejny argument za `interface` przy kształtach obiektów.)

## 5. Asercje: `as`, `!`, `as const`, `satisfies`

```ts
const canvas = document.getElementById("c") as HTMLCanvasElement; // tylko gdy typy się „nakładają”
const x = "hello" as unknown as number;                           // podwójna asercja — NIEBEZPIECZNE
```

`as` nie naprawia błędu typu — to deklaracja „wiem lepiej niż kompilator”, którą trzeba umieć uzasadnić
(np. po walidacji). Domyślnie zawężaj (guard) zamiast asercji.

```ts
function f(x?: number | null) {
  console.log(x!.toFixed());               // ! = „na pewno nie null/undefined” — ryzykowne
  if (x != null) console.log(x.toFixed()); // ✅ zawężenie
}
```

**`as const`** — najwęższy, niemutowalny typ literałów (`"GET"` zamiast `string`):
```ts
const req = { url: "/x", method: "GET" } as const; // req.method: "GET"
```

**`satisfies`** (od TS 4.9) — sprawdza zgodność z typem, **nie poszerzając** wywnioskowanego typu:
```ts
const cfg = { port: 8080, host: "localhost" } satisfies Record<string, string | number>;
cfg.port; // number (a nie string | number)
```

## 6. `enum` vs unia literałów

```ts
enum Direction { Up = 1, Down, Left, Right }                  // generuje kod JS; błąd przy erasableSyntaxOnly
type Direction2 = "Up" | "Down" | "Left" | "Right";           // czysto typowe
const DIRECTIONS = ["Up", "Down", "Left", "Right"] as const;  // + tablica wartości do iteracji
type Direction3 = (typeof DIRECTIONS)[number];
```

- Nowy kod: unia literałów / `as const` (wzorzec „typ + towarzysz” z `is()` i `values` →
  `domain-modeling-patterns.md`). `enum` i `const enum` nie działają z `--erasableSyntaxOnly` ani z uruchamianiem
  TS przez samo usuwanie typów (Node).
- Nie zamieniaj istniejących `enum` „przy okazji” — wartości bywają serializowane (API, baza); to osobna migracja.

---

## Narrowing — techniki zawężania

### `typeof`
```ts
function padLeft(padding: number | string, input: string) {
  if (typeof padding === "number") return " ".repeat(padding) + input;
  return padding + input;
}
```
Wartości: `"string" | "number" | "bigint" | "boolean" | "symbol" | "undefined" | "object" | "function"`.
Pułapka: `typeof null === "object"`.

### Truthiness
```ts
function printAll(strs: string | string[] | null) {
  if (strs && typeof strs === "object") for (const s of strs) console.log(s);
}
```
Falsy: `0`, `-0`, `NaN`, `""`, `0n`, `null`, `undefined`, `false` — uwaga na `0` i `""` jako poprawne wartości.

### Równość
```ts
function example(x: string | number, y: string | boolean) {
  if (x === y) x.toUpperCase(); // x: string — jedyny wspólny typ
}
if (value != null) value.trim(); // `!= null` usuwa jednocześnie null i undefined
```

### `in`, `instanceof`
```ts
type Fish = { swim: () => void };
type Bird = { fly: () => void };
function move(a: Fish | Bird) { return "swim" in a ? a.swim() : a.fly(); }

function logValue(x: Date | string) {
  if (x instanceof Date) console.log(x.toUTCString()); else console.log(x.toUpperCase());
}
```

### Analiza przepływu sterowania
TypeScript śledzi *obserwowany* typ zmiennej po każdym przypisaniu i każdej gałęzi:
```ts
let x: string | number | boolean;
x = Math.random() < 0.5;             // boolean
if (cond) { x = "a"; } else { x = 1; }
// tutaj: string | number
```

### Predykaty typów (`pet is Fish`)
```ts
function isFish(pet: Fish | Bird): pet is Fish { return "swim" in pet; }
const fishes: Fish[] = animals.filter(isFish);

// od TS 5.5 predykat jest wnioskowany z prostych lambd:
const nums = [1, undefined, 2].filter((x) => x !== undefined); // number[]
```
Predykat to obietnica bez sprawdzenia przez kompilator — błędna implementacja daje fałszywe zawężenie.

### Unie dyskryminowane + wyczerpujący `switch`
```ts
interface Circle { kind: "circle"; radius: number }
interface Square { kind: "square"; sideLength: number }
type Shape = Circle | Square;

export function assertNever(x: never): never { throw new Error(`unhandled: ${JSON.stringify(x)}`); }

function area(shape: Shape): number {
  switch (shape.kind) {
    case "circle": return Math.PI * shape.radius ** 2; // shape: Circle
    case "square": return shape.sideLength ** 2;       // shape: Square
    default: return assertNever(shape);                // błąd kompilacji po dodaniu wariantu
  }
}
```
Każde rozgałęzienie po polu dyskryminującym ma `default` z `assertNever` — tylko wtedy kompilator zgłosi
nieobsłużony nowy wariant (a w runtime nieznana wartość z sieci rzuci błąd zamiast przejść cicho).
