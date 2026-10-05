# Funkcje, typy obiektowe i klasy

> **Spis treści:** Funkcje · Typy obiektowe · Klasy

Na podstawie podręcznika TypeScript („More on Functions”, „Object Types”, „Classes”), opisane własnymi słowami.
Przykłady sprawdzone w tsc 6.0.3 i 7.0.2 (`strict`, `noUncheckedIndexedAccess`).

## Funkcje

### Typy funkcji, sygnatury wywołania i konstrukcji
```ts
type GreetFunction = (a: string) => void;            // nazwa parametru wymagana w składni

type DescribableFunction = {
  description: string;
  (someArg: number): boolean;                         // call signature — funkcja z dodatkowymi polami
};

type SomeConstructor = new (s: string) => SomeObject; // construct signature
```
Unikaj globalnego typu `Function` (wywołanie zwraca `any`) — typuj konkretną sygnaturę.

### Generyczne funkcje — zasady
```ts
function firstElement<T>(arr: readonly T[]): T | undefined { return arr[0]; }
function longest<T extends { length: number }>(a: T, b: T): T { return a.length >= b.length ? a : b; }
```
- Ogranicz element (`T extends { length: number }`), nie całość (`T extends any[]`), jeśli nie musisz.
- Parametr typu powinien wystąpić **co najmniej dwa razy** w sygnaturze; inaczej zastąp go konkretnym typem.
- Nie podawaj argumentu typu jawnie (`identity<string>("x")`), gdy inferencja wystarcza.
- Więcej: `generyki-i-utility-types.md`.

### Parametry opcjonalne w callbackach i wariancja
```ts
function f(x?: number) {}   // x: number | undefined
function g(x = 10) {}       // x: number

// ❌ `index?` w typie callbacku sugeruje, że wywołujący może go nie przekazać — i tak się dzieje:
function myForEach<T>(arr: readonly T[], cb: (arg: T, index?: number) => void) {
  for (const item of arr) cb(item); // index nigdy nie przekazany
}
```
Callback deklaruj z **wymaganymi** parametrami — funkcja przyjmująca mniej argumentów i tak pasuje.
Z `strictFunctionTypes` (część `strict`) parametry typów funkcyjnych są sprawdzane kontrawariantnie, ale
parametry **metod** (`method(x: T): void` w interfejsie) pozostają biwariantne — dla ścisłego sprawdzania
w interfejsach używaj składni właściwości: `handle: (x: T) => void`.

### `this` w funkcjach (nie w arrow function)
```ts
interface DB { filterUsers(filter: (this: User) => boolean): User[] }
db.filterUsers(function (this: User) { return this.admin; }); // ✅ `this` typowane
db.filterUsers(() => this.admin);                              // ❌ arrow bierze `this` z otoczenia
```

### Przeciążenia (overloads)
```ts
function makeDate(timestamp: number): Date;
function makeDate(m: number, d: number, y: number): Date;
function makeDate(mOrTs: number, d?: number, y?: number): Date {
  if (d !== undefined && y !== undefined) return new Date(y, mOrTs, d);
  return new Date(mOrTs);
}
makeDate(1, 2); // ❌ sygnatura implementacji NIE jest widoczna z zewnątrz
```
- Sygnatury przeciążeń stoją nad implementacją; z zewnątrz widać **tylko przeciążenia**, a implementacja musi
  być zgodna z każdym z nich.
- Gdy wystarczy unia — użyj unii zamiast przeciążeń:
  ```ts
  function len(x: string | readonly unknown[]): number { return x.length; }
  ```

### `void`, `unknown`, `never` jako wynik
```ts
type VoidFunc = () => void;
const f1: VoidFunc = () => true;                 // OK — wynik ignorowany (kontekstowe void)
function f2(): void { return true; }             // ❌ w jawnej deklaracji to błąd
function fail(msg: string): never { throw new Error(msg); }
```

---

## Typy obiektowe

### `?`, `readonly`, sygnatury indeksu
```ts
interface Options { shape: Shape; xPos?: number }
interface Locked { readonly id: string }
interface Dict {
  [key: string]: number | string; // zwykłe pola muszą być zgodne z sygnaturą indeksu
  length: number;
}
```
`exactOptionalPropertyTypes` (poza `strict`) odróżnia „brak pola” od `xPos: undefined` — warto włączyć w nowym kodzie.

### Excess property checks
```ts
interface SquareConfig { color?: string; width?: number }
createSquare({ colour: "red", width: 100 }); // ❌ 'colour' nie istnieje
```
Działa tylko dla literału przekazanego bezpośrednio; obejścia (asercja, sygnatura indeksu, zmienna pośrednia)
stosuj świadomie — zwykle błąd wskazuje literówkę.

### Rozszerzanie, generyczne kształty, `readonly` tablice, tuple
```ts
interface ColorfulCircle extends Colorful, Circle {}
type ColorfulCircle2 = Colorful & Circle;

interface Box<T> { contents: T }

function f(v: readonly string[]) { v.push("x"); } // ❌ readonly
let ro: readonly string[] = []; let m: string[] = [];
ro = m; // ✅   m = ro; // ❌

type Pair = [string, number];
type Optional3rd = [number, number, number?];
type RestTuple = [string, ...boolean[]];
const point = [3, 4] as const; // readonly [3, 4]
```
Funkcja tylko czytająca dane: parametr `readonly T[]` / `Readonly<T>` — dokumentuje intencję i blokuje mutację.

---

## Klasy

### Pola, `readonly`, `strictPropertyInitialization`
```ts
class Point {
  x = 0;
  y = 0;
  readonly id: string;               // zainicjalizuj w konstruktorze albo od razu
  constructor(id: string) { this.id = id; }
}
```
`name!: string` (definite assignment) tylko gdy pole ustawia framework/inicjalizator poza konstruktorem.

### `public` / `protected` / `private` vs `#`
```ts
class Example {
  public x = 0;
  protected y = 0;
  private z = 0;       // tylko kontrola typów — w runtime dostępne (`obj["z"]`)
  #realPrivate = 0;    // prywatne naprawdę (JS), także w runtime
}
```
- W nowym kodzie domyślnie `#pole` dla stanu wewnętrznego (agregaty — `domain-building-blocks.md`).
- `protected` nie daje dostępu do składowych równoległej podklasy tej samej bazy.
- `implements Interfejs` nie przenosi typów parametrów na metody: parametr bez adnotacji to niejawne `any`
  (w `strict` błąd). Adnotuj parametry metod jawnie.
- Nadpisywanie: `override` + `noImplicitOverride` — kompilator wykryje zmianę nazwy metody w bazie.

### Statyczne składowe, klasy generyczne
```ts
class MyClass { static x = 0; static printX() { console.log(MyClass.x); } }

class Box<T> {
  readonly contents: T;
  constructor(contents: T) { this.contents = contents; }
  // static defaultValue: T; // ❌ pola statyczne nie widzą parametrów typu klasy
}
```

### Polimorficzne `this`, strażnicy oparte na `this`
```ts
class Box2 { contents = ""; set(v: string) { this.contents = v; return this; } }
class Clearable extends Box2 { clear() { this.contents = ""; } }
new Clearable().set("hi").clear(); // set zwraca Clearable, nie Box2

class FSObject { isFile(): this is FileRep { return this instanceof FileRep; } }
```

### Parameter properties — tylko przy składni nieusuwalnej
```ts
class Service {
  constructor(private readonly http: HttpClient) {} // tworzy pole + przypisanie
}
```
- To składnia generująca kod: **błąd przy `erasableSyntaxOnly`** i nie działa przy uruchamianiu TS przez usuwanie
  typów (Node). W nowym kodzie deklaruj pole jawnie (`readonly #http: HttpClient;` + przypisanie w konstruktorze).
- Angular: nowoczesne DI to `inject()` w polu (`private readonly http = inject(HttpClient)`) — szczegóły w fw-angular.
  Zmiana parametrów konstruktora w klasach z DI to zmiana kontraktu z frameworkiem.

### Klasy abstrakcyjne, `implements` vs `extends`
```ts
abstract class BaseService {
  abstract getData(): unknown;
  processData() { return this.getData(); }
}
class UserService extends BaseService { getData() { return { id: 1 }; } }
```
- `implements X` — klasa spełnia kontrakt `X`, nic nie dziedziczy.
- `extends X` — dziedziczy implementację; preferuj kompozycję, gdy nie ma prawdziwej relacji „jest”.

### Pułapki wykonania

**`super()` przed `this`** w konstruktorze podklasy.

**Kolejność inicjalizacji:** pola bazy → konstruktor bazy → pola podklasy → konstruktor podklasy.
```ts
class Base { name = "base"; constructor() { console.log(this.name); } }
class Derived extends Base { override name = "derived"; }
new Derived(); // loguje "base"
```
Jeśli baza potrzebuje wartości z podklasy — przekaż ją argumentem konstruktora.

**Utrata `this` przy przekazaniu metody jako referencji** (handlery, `setTimeout`, `.subscribe(this.m)`):
```ts
class C {
  name = "C";
  getName() { return this.name; }       // `this` zależy od sposobu wywołania
  getNameBound = () => this.name;        // pole-strzałka: zawsze instancja
}
setTimeout(c.getName);                   // ❌
setTimeout(c.getNameBound);              // ✅  (albo: () => c.getName(), c.getName.bind(c))
```
Mechanika `this` w runtime: lang-javascript `.claude/skills/lang-javascript/references/this-i-funkcje.md`.
