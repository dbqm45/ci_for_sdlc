# Zasięg zmiennych i domknięcia (closures)

> **Spis treści:** `var` vs `let`/`const` · Co to jest closure · Zastosowanie: module pattern / prywatny stan · Pułapka klasyczna: `var` w pętli · Closures i moduły ES — live bindings · Wydajność/pamięć — kiedy closures są problemem

Na podstawie MDN Web Docs (developer.mozilla.org/docs/Web/JavaScript/Closures), opisane własnymi słowami; przykłady sprawdzone w Node 22.

## `var` vs `let`/`const`

| | `var` | `let`/`const` |
|---|---|---|
| Zasięg | funkcja (function scope) | blok (`{}`, block scope) |
| Hoisting | podnoszone, zainicjowane `undefined` | podnoszone, ale w **Temporal Dead Zone** do deklaracji |
| Redeklaracja w tym zasięgu | dozwolona | `SyntaxError` |

```js
if (Math.random() > 0.5) { var x = 1; } else { var x = 2; }
console.log(x); // 1 albo 2 — blok NIE tworzy zasięgu dla var

if (Math.random() > 0.5) { const y = 1; } else { const y = 2; }
console.log(y); // ReferenceError: y is not defined — poza blokiem nie istnieje
```

**Reguła:** domyślnie `const`, `let` gdy wartość się zmienia, `var` praktycznie nigdy w nowym
kodzie — `let`/`const` dają przewidywalniejszy zasięg i przewidywalniejsze domknięcia (patrz pułapka
niżej).

## Co to jest closure

Closure = funkcja + referencja do jej **lexical environment** (zasięgu, w którym została
zdefiniowana). Tworzone automatycznie dla każdej funkcji w JS — to nie opt-in feature.

```js
function makeAdder(x) {
  return function (y) {
    return x + y; // domknięcie nad `x` z zewnętrznego zasięgu
  };
}
const add5 = makeAdder(5);
add5(2); // 7 — `x=5` żyje dalej, mimo że makeAdder() już zwróciło
```

Każde wywołanie `makeAdder` tworzy **nowy, niezależny** lexical environment — `add5` i `add10` mają
własne, odseparowane kopie `x`.

## Zastosowanie: module pattern / prywatny stan

```js
const counter = (function () {
  let privateCounter = 0; // niedostępne z zewnątrz
  function changeBy(val) { privateCounter += val; }
  return {
    increment() { changeBy(1); },
    decrement() { changeBy(-1); },
    value() { return privateCounter; },
  };
})();

counter.increment(); counter.increment();
counter.value(); // 2 — privateCounter nie jest dostępne inaczej niż przez te 3 metody
```

Wywołanie tej samej fabryki (`makeCounter()`) dwa razy dałoby dwa **niezależne** liczniki — każde
wywołanie tworzy własny lexical environment.

## Pułapka klasyczna: `var` w pętli

```js
// ❌ BUG — wszystkie callbacki widzą tę samą, ostatnią wartość item
for (var i = 0; i < items.length; i++) {
  var item = items[i];
  el[i].onfocus = function () { showHelp(item.help); }; // zawsze ostatni item.help
}
```

**Przyczyna:** `var` ma function scope — jest **jedna** zmienna `item` współdzielona przez wszystkie
domknięcia utworzone w pętli; po zakończeniu pętli wskazuje na ostatni element.

**Poprawki (od najstarszej do rekomendowanej):**
```js
// 1) Function factory — nowy lexical environment per wywołanie
function makeCallback(help) { return function () { showHelp(help); }; }
for (var i = 0; i < items.length; i++) { el[i].onfocus = makeCallback(items[i].help); }

// 2) IIFE — nowy zasięg blokowy przez wywołanie funkcji
for (var i = 0; i < items.length; i++) {
  (function () { const item = items[i]; el[i].onfocus = () => showHelp(item.help); })();
}

// 3) let/const — REKOMENDOWANE: każda iteracja ma własne wiązanie blokowe
for (let i = 0; i < items.length; i++) {
  const item = items[i];
  el[i].onfocus = () => showHelp(item.help);
}
```

## Closures i moduły ES — live bindings

```js
// counter.js
export let count = 0;
export function increment() { count++; }
```
Import w innym module widzi **żywe** wiązanie — po `increment()` odczyt `count` w miejscu importu
też się zmienia (to nie jest kopia w momencie importu). Patrz `moduly.md`.

## Wydajność/pamięć — kiedy closures są problemem

```js
// ❌ nieoptymalne — każda instancja dostaje WŁASNĄ kopię metody (closure per instancja)
function MyObject(name) {
  this.name = name;
  this.getName = function () { return this.name; }; // nowa funkcja przy każdym `new`
}

// ✅ metody współdzielone przez prototype — jedna funkcja dla wszystkich instancji
function MyObject(name) { this.name = name; }
MyObject.prototype.getName = function () { return this.name; };
```

**Reguła:** jeśli metoda nie musi domykać się nad czymś specyficznym dla instancji (poza `this`,
które i tak dostaje przez wywołanie), definiuj ją na `prototype`/w ciele klasy, nie jako pole
przypisywane w konstruktorze — inaczej płacisz nową alokację funkcji za każdą instancję.
