# Moduły: ES Modules (ESM) vs CommonJS

> **Spis treści:** Dwa systemy modułów — nie mieszaj ich bezmyślnie · ES Modules — składnia · CommonJS — składnia · Kiedy który — praktyczna reguła · Pułapki · Node — stan na 22.x

Na podstawie MDN Web Docs (developer.mozilla.org/docs/Web/JavaScript/Guide/Modules), opisane własnymi słowami; przykłady sprawdzone w Node 22.

## Dwa systemy modułów — nie mieszaj ich bezmyślnie

| Aspekt | ES Modules (ESM) | CommonJS |
|---|---|---|
| Składnia | `import`/`export` | `require()`/`module.exports` |
| Analiza | statyczna (importy znane przed wykonaniem) | dynamiczna (`require` to zwykłe wywołanie funkcji) |
| Top-level `await` | tak | nie |
| Strict mode | zawsze, automatycznie | opcjonalnie |
| Live bindings (patrz niżej) | tak | nie (kopia wartości w momencie `require`) |
| Ładowanie/ewaluacja | graf importów ładowany i łączony przed wykonaniem; moduły wykonywane raz, w kolejności zależności | synchronicznie, w momencie wywołania `require` |
| Środowisko | przeglądarka (`<script type="module">`), Node z `"type":"module"`/`.mjs` | Node domyślnie (`.js` bez `"type":"module"`), `.cjs` |

**Reguła:** sprawdź, w jakim systemie żyje plik/projekt, **zanim** dopisujesz kod — `import` w
pliku CommonJS (albo `require` w pliku ESM) to błąd składniowy/runtime, nie stylistyczna preferencja.

## ES Modules — składnia

```js
// square.js
export const name = "square";
export function draw() { /* ... */ }
export default function mainExport() { /* ... */ } // jeden default per moduł

// main.js
import mainExport, { name, draw } from "./square.js"; // default + named naraz
import { draw as drawSquare } from "./square.js";      // alias
import * as Square from "./square.js";                  // wszystko jako namespace object
```

**Dynamic import** — zwraca Promise, działa też w plikach nie-modułowych:
```js
const module = await import("./square.js"); // top-level await albo w async function
```

**Live bindings** — importowana wartość śledzi zmiany w module źródłowym (to nie jest kopia z
momentu importu):
```js
// counter.js
export let count = 0;
export function increment() { count++; }
// main.js
import { count, increment } from "./counter.js";
console.log(count); // 0
increment();
console.log(count); // 1 — zmieniło się, bo to żywe wiązanie
count = 5;           // ❌ TypeError: count is read-only — importu nie można przypisać
```

**Moduły są zawsze strict mode i mają własny zasięg** (nie globalny) — zmienna zadeklarowana w
module top-level nie wycieka do `window`/`globalThis`.

## CommonJS — składnia

```js
// maths.js
function absolute(n) { return n < 0 ? -n : n; }
module.exports = { pi: 3.14, absolute };

// main.js
const { pi, absolute } = require("./maths.js");
const maths = require("./maths.js"); // cały obiekt module.exports
```

`require()` jest **synchroniczny i eager** — kod modułu wykonuje się dokładnie w momencie
`require()`, nie wcześniej/później; wynik jest cache'owany (drugi `require()` tej samej ścieżki nie
wykonuje modułu ponownie, zwraca ten sam obiekt z cache).

## Kiedy który — praktyczna reguła

- **Node.js, skrypt/serwer bez frameworka narzucającego inaczej** → sprawdź `package.json`
  (`"type": "module"`?) i rozszerzenie plików (`.mjs`/`.cjs` wygrywają niezależnie od `package.json`).
  Brak `"type"` = CommonJS, ale od Node 22.7 plik `.js` ze składnią ESM jest wykrywany i ładowany jako ESM
  (dodatkowe parsowanie; ostrzeżenie, gdy obok jest `package.json` bez `"type"`) — ustawiaj `"type"` jawnie.
- **Przeglądarka** → ESM wymaga `<script type="module">` i serwera HTTP (nie działa z `file://` —
  błąd CORS); bez `type="module"` to „classic script” z CommonJS niedostępnym natywnie (potrzebuje
  bundlera).
- **Ten sam projekt może mieć oba** (np. build tooling w CommonJS, kod aplikacji w ESM) — nie
  zakładaj jednego systemu dla całego repo bez sprawdzenia per plik/folder.

## Pułapki

**Cykliczne importy** — moduł A importuje B, które importuje A z powrotem: w ESM działa częściowo
(live bindings pozwalają odczytać wartość *później*, ale nie w momencie importu, jeśli jeszcze nie
została wyeksportowana); w CommonJS `require()` cyklu zwraca **częściowo wypełniony** obiekt
`module.exports` (to, co zdążyło się wykonać przed cyklem) — częsta przyczyna
`undefined is not a function` przy złej kolejności importów.

**Mieszanie składni w jednym pliku** — `import` w pliku bez `type="module"`/`.mjs` daje
`SyntaxError: Cannot use import statement outside a module`; `require` w prawdziwym module ESM daje
`ReferenceError: require is not defined`.

**Testowanie modułów przez `file://`** — ESM w przeglądarce wymaga serwera HTTP; otwarcie pliku
`.html` z modułami bezpośrednio z dysku (`file://`) rzuci błąd CORS przy imporcie.

**Import to nie zmienna do przypisania** — `import { x } from "./m.js"; x = 5;` to zawsze błąd w
ESM (read-only binding); w CommonJS `const { x } = require(...)` jest zwykłym przypisaniem, więc
dana zmienna lokalna jest normalnie mutowalna (choć zmiana `x` lokalnie nie wpływa na moduł źródłowy
— to kopia wartości, nie referencja do niej).

## Node — stan na 22.x

- `require()` modułu ESM działa od Node 22.12 (bez flagi), o ile moduł nie używa top-level `await` — CJS może
  konsumować pakiety ESM; odwrotnie ESM importuje CJS przez `import pkg from "pkg"` (default = `module.exports`).
- W ESM nie ma `__dirname`/`__filename`/`require` — użyj `import.meta.dirname`, `import.meta.filename`
  (Node 20.11+), `import.meta.url`, ewentualnie `createRequire(import.meta.url)`.
- Import JSON: `import data from "./data.json" with { type: "json" }` (atrybuty importu; stare `assert` wycofane).
- Wbudowane moduły z prefiksem `node:` (`import { readFile } from "node:fs/promises"`).
- Aliasy wewnętrzne: pole `imports` w `package.json` (`"#shared/*": "./src/shared/*"`) zamiast względnych `../../..`.
