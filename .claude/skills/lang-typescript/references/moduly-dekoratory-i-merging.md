# Moduły, dekoratory i declaration merging

> **Spis treści:** Moduły · Dekoratory · Declaration merging

Na podstawie podręcznika TypeScript („Modules”, „Decorators”, „Declaration Merging”) i release notes 5.0–7.0,
opisane własnymi słowami. Przykłady sprawdzone w tsc 6.0.3 i 7.0.2 (`strict`, `module: nodenext`).

## Moduły

### Eksporty, importy, aliasy
```ts
// maths.ts
export const pi = 3.14;
export function absolute(n: number) { return n < 0 ? -n : n; }
export default function helloWorld() { console.log("Hello"); }

// import — w ESM pod `nodenext` z rozszerzeniem `.js` (albo `.ts` + `rewriteRelativeImportExtensions`)
import helloWorld, { pi, absolute as abs } from "./maths.js";
import * as math from "./maths.js";
```

### Importy tylko typów
```ts
import { createCatName, type Cat, type Dog } from "./animal.js"; // inline (4.5+)
import type { Cat, Dog } from "./animal.js";                     // cały import typowy
```
Z `verbatimModuleSyntax` (zalecane; zastępuje `importsNotUsedAsValues`/`preserveValueImports`) import typu bez
`type` jest błędem — i słusznie: bundlery/Node kompilujące plik po pliku nie wiedzą, co jest typem.

### Interop z CommonJS
| Sytuacja | Zapis |
|---|---|
| plik ESM importuje pakiet CJS | `import pkg from "pkg"` (`esModuleInterop` — od TS 6.0 zawsze włączone; `false` usunięte w 7.0) |
| plik `.cts` / projekt CJS | `import fs = require("node:fs")`, `export =` — **nie** w plikach ESM i błąd przy `erasableSyntaxOnly` |
| Node ≥ 22.12 | `require()` modułu ESM działa (bez top-level await) — mniej powodów do dual-package |

`module.exports = …` w pliku `.ts` to znak, że plik powinien być `.cts` albo przepisany na `export`.

### Dynamiczny import, pliki-skrypty
```ts
const math = await import("./maths.js");  // leniwe ładowanie (top-level await tylko w ESM)
export {};                                 // wymusza traktowanie pliku jako modułu
```
`moduleDetection: "force"` traktuje każdy plik jako moduł bez tej sztuczki.

### Import JSON i atrybuty importu
```ts
import data from "./data.json" with { type: "json" };   // ✅ import attributes
import data from "./data.json" assert { type: "json" }; // ❌ od TS 6.0 błąd — `assert` zastąpione przez `with`
```

### Reguły
- Preferuj eksporty nazwane; `default` dla jednego głównego eksportu pliku.
- `export *` ukrywa, co jest publicznym API — w `index.ts` modułu wypisuj eksporty jawnie.
- Aliasy ścieżek: `paths` względem tsconfig (bez `baseUrl`, usuniętego w 7.0) albo `imports` w `package.json`
  (`#shared/*` — `domain-modeling-patterns.md`); aliasy działają w runtime tylko, jeśli zna je bundler/Node.

---

## Dekoratory

Dwie **niezgodne** implementacje:

| | Standardowe (TC39) — **domyślne od TS 5.0** | Legacy (`experimentalDecorators: true`) |
|---|---|---|
| sygnatura | `(value, context)` — `context: ClassMethodDecoratorContext` itd. | `(target, key, descriptor)` |
| dekoratory parametrów | **brak** | są (`@Inject()` w konstruktorze) |
| `emitDecoratorMetadata` / `reflect-metadata` | brak | tak |
| `accessor` (auto-akcesory) | tak | nie |
| gdzie spotkasz | nowy kod, biblioteki ES | starsze NestJS, TypeORM, class-validator, Angular (dekoratory przetwarza kompilator Angulara — fw-angular) |

Nie zmieniaj trybu w istniejącym projekcie „przy okazji” — biblioteki oparte na metadanych przestaną działać.
Dekoratory nie są usuwalną składnią: Node 22 uruchamiający TS przez usuwanie typów ich nie obsłuży (V8 jeszcze
ich nie implementuje) — potrzebny kompilator/bundler.

### Standardowe dekoratory (TS 5.0+)
```ts
// dekorator metody — zwraca funkcję zastępującą
function logged<This, Args extends unknown[], R>(
  target: (this: This, ...args: Args) => R,
  context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => R>,
) {
  return function (this: This, ...args: Args): R {
    console.log(`→ ${String(context.name)}`, args);
    return target.call(this, ...args);
  };
}

// fabryka dekoratora (parametryzowany)
function repeat(times: number) {
  return function <This, Args extends unknown[]>(
    target: (this: This, ...args: Args) => void,
    _context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => void>,
  ) {
    return function (this: This, ...args: Args): void {
      for (let i = 0; i < times; i++) target.call(this, ...args);
    };
  };
}

// dekorator auto-akcesora (`accessor` — TS 4.9+ składnia, dekorowanie w 5.0+)
function nonNegative<This>(
  target: ClassAccessorDecoratorTarget<This, number>,
  _context: ClassAccessorDecoratorContext<This, number>,
): ClassAccessorDecoratorResult<This, number> {
  return { set(this: This, v: number) { if (v < 0) throw new RangeError("negative"); target.set.call(this, v); } };
}

// dekorator klasy
function sealed<T extends abstract new (...args: never[]) => unknown>(value: T, _ctx: ClassDecoratorContext<T>) {
  Object.seal(value);
  Object.seal(value.prototype);
}

@sealed
class Calculator {
  @nonNegative accessor total = 0;
  @logged add(a: number, b: number) { return a + b; }
  @repeat(2) ping(msg: string) { console.log(msg); }
}
```
`context.addInitializer(fn)` uruchamia kod przy tworzeniu instancji (np. rejestracja, wiązanie `this`);
`context.metadata` (TS 5.2, `Symbol.metadata`) zastępuje `reflect-metadata` w nowym kodzie.

### Legacy (`experimentalDecorators`) — tylko do utrzymania istniejącego kodu
```ts
function logMethod(_target: object, key: string, descriptor: PropertyDescriptor) {
  const original = descriptor.value as (...a: unknown[]) => unknown;
  descriptor.value = function (this: unknown, ...args: unknown[]) {
    console.log(key, args);
    return original.apply(this, args);
  };
}
function requiredParam(_target: object, _key: string | symbol | undefined, _index: number) { /* metadane */ }
class Report {
  @logMethod add(a: number, b: number) { return a + b; }
  print(@requiredParam verbose: boolean) { return verbose; } // parametry — tylko legacy
}
```
Kolejność (oba tryby): wyrażenia dekoratorów/fabryk ewaluowane z góry na dół, same dekoratory stosowane
z dołu do góry; dekoratory składowych przed dekoratorem klasy (klasa na końcu).

### Angular
Dekoratory `@Component`, `@Injectable`/`@Service` zostają, ale `@Input`/`@Output` i DI przez konstruktor
zastępują funkcje `input()`, `output()`, `inject()` — nie wprowadzaj nowego kodu na starych wzorcach (fw-angular).

---

## Declaration merging

### Interfejsy
```ts
interface Box { height: number; width: number }
interface Box { scale: number }  // Box ma height, width, scale
```
Metody o tej samej nazwie stają się przeciążeniami; późniejsza deklaracja ma pierwszeństwo, sygnatury z typami
literałów trafiają na początek.

### Namespace + funkcja/klasa/enum
```ts
function buildLabel(name: string): string { return buildLabel.prefix + name; }
namespace buildLabel { export let prefix = "Hello, "; }   // namespace z wartością — błąd przy erasableSyntaxOnly
```
Nowy kod: przypisanie właściwości do funkcji (`buildLabel.prefix = "Hello, "` — TS rozumie je od 3.1) albo
obiekt-towarzysz; `namespace` tylko w plikach deklaracji (`declare namespace`). Słowo `module` zamiast `namespace`
(`module Foo {}`) jest wycofane od TS 6.0.

### Module augmentation — rozszerzanie typów bibliotek
```ts
declare module "./observable.js" {
  interface Observable<T> { map<U>(f: (x: T) => U): Observable<U> }
}
declare module "node:http" {
  interface IncomingMessage { userId?: string }
}
declare global {
  interface Window { appVersion?: string }
}
```
Plik z `declare module`/`declare global` musi być modułem (mieć `import`/`export`). To właściwa droga zamiast
`as any` rozsianego po miejscach użycia.

### Co może się łączyć

| Deklaracja | tworzy namespace | tworzy typ | tworzy wartość | łączy się z `namespace` |
|---|---|---|---|---|
| namespace | tak | — | tak (jeśli ma wartości) | tak |
| class | — | tak | tak | tak |
| enum | — | tak | tak | tak |
| interface | — | tak | — | tak (wzorzec „typ + towarzysz”) |
| type alias | — | tak | — | tak |
| function | — | — | tak | tak |
| variable (`const`/`let`) | — | — | tak | nie |

Nie łączą się: dwie klasy, klasa i zmienna, zmienna i namespace z wartościami, dwa `type` o tej samej nazwie.
Typ + `const` o tej samej nazwie (typ i wartość w osobnych przestrzeniach) to najprostszy „towarzysz” bez namespace.
