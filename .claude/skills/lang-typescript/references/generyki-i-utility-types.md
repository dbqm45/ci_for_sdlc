# Generyki i wbudowane utility types

Na podstawie podręcznika TypeScript („Generics”, „Utility Types”), opisane własnymi słowami.
Przykłady sprawdzone w tsc 6.0.3 i 7.0.2 (`strict`, `noUncheckedIndexedAccess`).

## Generyki

### Ograniczenia (`extends`) i zależne parametry (`keyof`)
```ts
function loggingIdentity<T>(arg: T): T { console.log(arg.length); return arg; }   // ❌ brak .length

interface Lengthwise { length: number }
function loggingIdentity2<T extends Lengthwise>(arg: T): T { console.log(arg.length); return arg; }

function getProperty<T, K extends keyof T>(obj: T, key: K): T[K] { return obj[key]; }
getProperty({ a: 1, b: 2 }, "m"); // ❌ "m" nie jest kluczem
```

### Domyślne parametry typu
```ts
declare function create<T extends HTMLElement = HTMLDivElement, U extends HTMLElement[] = T[]>(
  element?: T, children?: U,
): { element: T; children: U };
const div = create(); // element: HTMLDivElement
```
Domyślne parametry stoją po wymaganych i muszą spełniać własne ograniczenie.

### `const` parametry typu (od TS 5.0) i `NoInfer` (od TS 5.4)
```ts
function identity<const T>(x: T): T { return x; }
const pair = identity(["a", "b"]);                 // readonly ["a", "b"] bez `as const` u wywołującego

function withDefault<T extends string>(values: readonly T[], fallback: NoInfer<T>): T {
  return values[0] ?? fallback;
}
withDefault(["a", "b"], "c");                      // ❌ "c" nie poszerza T — musi być jedną z wartości
```

### Zasady pisania generyków
1. Pozwól wnioskować — `identity("x")`, nie `identity<string>("x")`.
2. Ogranicz przez `extends`, gdy ciało zależy od właściwości typu.
3. Ograniczenie generyczne zamiast sztywnej unii, gdy trzeba zachować związek wejście → wyjście
   (`merge<T extends object, U extends object>(a: T, b: U): T & U`).
4. Nie mnóż parametrów typu; parametr użyty raz w sygnaturze jest zbędny.
5. Fabryka z typem konstruktora: `function make<T>(c: new () => T): T { return new c(); }`.
6. Generyczne interfejsy dla powtarzalnych kształtów — np. port repozytorium (asynchroniczny, jak w domenie):
   ```ts
   interface Repository<T, Id> {
     getById(id: Id): Promise<T | undefined>;
     save(item: T): Promise<void>;
   }
   ```

Checklista przy refaktorze generyków:
- [ ] generyk zamiast `any`?
- [ ] potrzebne `extends`? zależność parametrów → `K extends keyof T`?
- [ ] domyślny parametr typu zamiast przeciążeń?
- [ ] typ nieczytelny na pierwszy rzut oka → rozbij na nazwane kawałki

---

## Wbudowane utility types

| Utility type | Co robi | Przykład |
|---|---|---|
| `Partial<T>` / `Required<T>` | wszystkie pola opcjonalne / wymagane | `Partial<Todo>` — częściowy update |
| `Readonly<T>` | wszystkie pola `readonly` (płytko) | `Readonly<Todo>` |
| `Record<K, V>` | obiekt o kluczach `K` i wartościach `V` | `Record<CatName, CatInfo>` — wymusza komplet kluczy |
| `Pick<T, K>` / `Omit<T, K>` | wybiera / usuwa pola | `Pick<Todo, "title" \| "done">` |
| `Exclude<U, M>` / `Extract<U, M>` | usuwa / zostawia człony unii | `Exclude<"a"\|"b"\|"c", "a">` → `"b"\|"c"` |
| `NonNullable<T>` | usuwa `null`/`undefined` | `NonNullable<string \| undefined>` → `string` |
| `Parameters<F>` / `ReturnType<F>` | parametry (tuple) / wynik funkcji | `ReturnType<typeof fn>` |
| `ConstructorParameters<C>` / `InstanceType<C>` | parametry / instancja konstruktora | `InstanceType<typeof MyClass>` |
| `Awaited<T>` | rekurencyjnie odwija `Promise` | `Awaited<Promise<Promise<number>>>` → `number` |
| `NoInfer<T>` (5.4+) | blokuje wnioskowanie z tej pozycji | wartości domyślne w generykach |
| `ThisParameterType<F>` / `OmitThisParameter<F>` | typ `this` / usunięcie `this` z sygnatury | rzadkie, biblioteki |
| `ThisType<T>` | znacznik kontekstowego `this` (`noImplicitThis`) | budowniczowie obiektów |
| `Uppercase` / `Lowercase` / `Capitalize` / `Uncapitalize` | przekształcenia literałów tekstowych | `typy-zaawansowane.md` |

```ts
interface Todo { title: string; description: string; completed: boolean }
function updateTodo(todo: Todo, fields: Partial<Todo>): Todo { return { ...todo, ...fields }; }
type TodoPreview = Pick<Todo, "title" | "completed">;
type TodoInfo = Omit<Todo, "completed">;
type FnReturn = ReturnType<typeof updateTodo>;
```

Zanim ręcznie wypiszesz wariant istniejącego typu — złóż go z utility types. Ręczna kopia to dwa miejsca do
synchronizacji. Wyjątek: kontrakty zewnętrzne (DTO API) celowo niezależne od modelu domeny.
