# Typy zaawansowane: keyof, typeof, indexed access, conditional, mapped, template literal

> **Spis treści:** `keyof` · `typeof` w kontekście typów (nie runtime) · Indexed access types (`Type["prop"]`) · Typy warunkowe (conditional types) · Typy mapowane (mapped types) · Template literal types · Koszt złożonych typów

Na podstawie podręcznika TypeScript („Type Manipulation”: keyof, typeof, indexed access, conditional, mapped,
template literal types), opisane własnymi słowami. Przykłady sprawdzone w tsc 6.0.3 i 7.0.2 (`strict`).

## `keyof`

```ts
type Point = { x: number; y: number };
type P = keyof Point; // "x" | "y"

type Mapish = { [k: string]: boolean };
type M = keyof Mapish; // string | number (JS zawsze konwertuje klucze na string)

type Arrayish = { [n: number]: unknown };
type A = keyof Arrayish; // number
```

Najczęstsze praktyczne użycie — bezpieczny dostęp do właściwości po nazwie:
```ts
function getProperty<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}
```

## `typeof` w kontekście typów (nie runtime)

```ts
let s = "hello";
type S = typeof s; // string — wyciąga typ ZE ZMIENNEJ, nie sprawdza runtime

class C { x = 0; }
type CType = typeof C; // typ konstruktora, nie instancji — patrz InstanceType w generyki-i-utility-types.md
```

## Indexed access types (`Type["prop"]`)

```ts
type Person = { age: number; name: string; alive: boolean };
type Age = Person["age"];              // number
type NameOrAge = Person["name" | "age"]; // string | number
type AnyValue = Person[keyof Person];    // string | number | boolean

// Element tablicy przez number:
const arr = [{ name: "A", age: 1 }];
type Elem = (typeof arr)[number];        // { name: string; age: number }

// typeof potrzebny, gdy indeksujesz zmienną, nie type alias:
const key = "age";
type AgeViaVar = Person[typeof key];    // OK
type Bad = Person[key];                  // ❌ 'key' to wartość, nie typ
```

## Typy warunkowe (conditional types)

### Podstawowa składnia
```ts
type Example = Dog extends Animal ? number : string;
```

### Z generykami — tu robią się użyteczne
```ts
type NameOrId<T extends number | string> = T extends number ? IdLabel : NameLabel;
function createLabel<T extends number | string>(x: T): NameOrId<T> { throw new Error("unimplemented"); }
```

### Constraint musi być w warunku, nie w samym dostępie do pola
```ts
// ❌ T nie ma gwarancji pola "message"
type MessageOf<T> = T["message"];

// ✅
type MessageOf<T> = T extends { message: unknown } ? T["message"] : never;
```

### `infer` — wyciąganie typu wewnątrz warunku
```ts
type Flatten<T> = T extends Array<infer Item> ? Item : T;
type Str = Flatten<string[]>; // string

type GetReturn<T> = T extends (...args: never[]) => infer R ? R : never;
type R1 = GetReturn<() => number>; // number
```

### Distributive vs non-distributive
```ts
// Distributive — conditional type na unii "rozprowadza się" po każdym członie
type ToArray<T> = T extends unknown ? T[] : never;
type Result = ToArray<string | number>; // string[] | number[]

// Non-distributive — [] wokół extends wyłącza to rozprowadzanie
type ToArrayNonDist<T> = [T] extends [unknown] ? T[] : never;
type Result2 = ToArrayNonDist<string | number>; // (string | number)[]
```
**Reguła:** jeśli wynik conditional type na unii wygląda „podzielony po elementach” tam, gdzie
oczekujesz jednego typu na całej unii (albo odwrotnie) — sprawdź, czy `T` w warunku jest goły
(distributive) czy owinięty w `[T]` (non-distributive). To częsta przyczyna „dlaczego mój typ się nie
zgadza” w skomplikowanych generykach.

## Typy mapowane (mapped types)

### Podstawa: `[K in Keys]`
```ts
type OptionsFlags<T> = { [P in keyof T]: boolean };
```

### Modyfikatory `+`/`-` na `readonly` i `?`
```ts
type CreateMutable<T> = { -readonly [P in keyof T]: T[P] };   // usuwa readonly
type Concrete<T> = { [P in keyof T]-?: T[P] };                 // usuwa opcjonalność
```

### Key remapping przez `as` — zwykle z template literal types
```ts
type Getters<T> = {
  [P in keyof T as `get${Capitalize<string & P>}`]: () => T[P];
};
interface Person { name: string; age: number; }
type LazyPerson = Getters<Person>; // { getName: () => string; getAge: () => number }

// Filtrowanie kluczy przez Exclude:
type RemoveKindField<T> = { [P in keyof T as Exclude<P, "kind">]: T[P] };

// Mapowanie unii dyskryminowanej po jej discriminant polu:
type EventConfig<E extends { kind: string }> = { [K in E as K["kind"]]: (e: K) => void };
```

### Kombinacja z conditional types
```ts
type ExtractPII<T> = { [P in keyof T]: T[P] extends { pii: true } ? true : false };
```

**Reguła refaktoryzacji:** gdy widzisz kilka ręcznie wypisanych, prawie identycznych typów różniących
się tylko modyfikatorem (`readonly`, `?`) albo prefiksem nazwy pola (`getX`, `setX`) — to kandydat na
jeden mapped type zamiast N osobnych deklaracji, które trzeba synchronizować ręcznie.

## Template literal types

```ts
type World = "world";
type Greeting = `hello ${World}`; // "hello world"

// Unie w interpolacji → cross-product wszystkich kombinacji
type Lang = "en" | "pl";
type Id = "welcome" | "footer";
type Keys = `${Lang}_${Id}`; // "en_welcome" | "en_footer" | "pl_welcome" | "pl_footer"
```

Praktyczny wzorzec — type-safe nazwy zdarzeń wyprowadzone z kluczy obiektu:
```ts
type PropEventSource<T> = {
  on<K extends string & keyof T>(
    eventName: `${K}Changed`,
    cb: (newValue: T[K]) => void
  ): void;
};
declare function watch<T>(obj: T): T & PropEventSource<T>;

const person = watch({ firstName: "John", age: 30 });
person.on("firstNameChanged", (v) => v.toUpperCase()); // v: string, wywnioskowane
person.on("ageChnaged", () => {}); // ❌ literal type wykrywa literówkę w compile time
```

Intrinsic string manipulation types używane w template literals: `Uppercase<S>`, `Lowercase<S>`,
`Capitalize<S>`, `Uncapitalize<S>` (tabela w `generyki-i-utility-types.md`).

**Kiedy sięgać po to w refaktorze:** wszędzie, gdzie masz string-based API (nazwy zdarzeń, klucze
konfiguracji, ścieżki) budowane przez konkatenację i dotąd otypowane jako goły `string` — template
literal types zwykle mogą to zamienić na w pełni sprawdzany przez kompilator, bez zmiany runtime
zachowania.
## Koszt złożonych typów

Głęboko rekurencyjne typy warunkowe/mapowane spowalniają kompilację i edytor (także w natywnym TS 7) i dają
nieczytelne błędy. Nazwij kroki pośrednie aliasami, ogranicz rekurencję, a gdy typ wymaga komentarza dłuższego
niż sam kod — rozważ prostszy kontrakt. Diagnostyka: `tsc --extendedDiagnostics`, `--generateTrace`.
