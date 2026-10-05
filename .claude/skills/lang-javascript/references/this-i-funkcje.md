# `this` i funkcje

> **Spis treści:** Zasada nadrzędna · Tabela — `this` w każdym kontekście · Zwykłe funkcje — strict vs non-strict · Arrow functions — `this` leksykalne · `call`, `apply`, `bind` · Klasy — `this` w konstruktorze i metodach · Pułapki

Na podstawie MDN Web Docs (developer.mozilla.org/docs/Web/JavaScript/Reference/Operators/this), opisane własnymi słowami; przykłady sprawdzone w Node 22.

## Zasada nadrzędna

**`this` zależy od SPOSOBU WYWOŁANIA funkcji, nie od miejsca jej DEFINICJI** (wyjątek: arrow
functions — patrz niżej). Ta sama funkcja przypisana do dwóch obiektów daje różne `this`:

```js
function getThis() { return this; }
const obj1 = { name: "obj1" }, obj2 = { name: "obj2" };
obj1.getThis = getThis; obj2.getThis = getThis;
obj1.getThis(); // this === obj1
obj2.getThis(); // this === obj2 — ta sama funkcja, inny wynik
```

## Tabela — `this` w każdym kontekście

| Kontekst | `this` |
|---|---|
| Globalny zasięg | skrypt: `globalThis`; moduł ESM: `undefined`; plik CommonJS w Node: `module.exports` |
| `new Klasa()` | nowo tworzony obiekt |
| `fn.call(obj)` / `fn.apply(obj)` / `fn.bind(obj)()` | jawnie podany `obj` |
| Arrow function | `this` z **otaczającego zasięgu w momencie definicji** (lexical), niemożliwe do zmiany |
| `obj.method()` | `obj` (obiekt, na którym wywołano, nawet jeśli metoda żyje w prototypie) |
| Zwykła funkcja, strict mode | `undefined` |
| Zwykła funkcja, non-strict mode | `globalThis` (tzw. „this substitution”) |
| Event handler (`addEventListener`) | element, do którego dołączono handler (`currentTarget`) |
| Getter/setter | obiekt, na którym wykonano dostęp do właściwości |
| Callback (`forEach`, `map`...) | zwykle `undefined`/`globalThis`, chyba że podano `thisArg` jako 2. argument |

## Zwykłe funkcje — strict vs non-strict

```js
function f() { "use strict"; return this; }
typeof f(); // "undefined" — strict: brak podstawiania

function g() { return this; }
g() === globalThis; // true — non-strict: null/undefined this → globalThis
```

## Arrow functions — `this` leksykalne

Arrow function **nie ma własnego `this`** — dziedziczy z otoczenia, w którym została **zdefiniowana**,
i nie da się tego zmienić przez `call`/`apply`/`bind`:

```js
const obj = {
  getThisGetter() {
    const inner = () => this; // domyka `this` z getThisGetter → this obj
    return inner;
  },
};
obj.getThisGetter()() === obj; // true

// ALE jeśli odłączymy metodę zewnętrzną (nie samą arrow function):
const detached = obj.getThisGetter;
detached()() === globalThis; // true — bo `this` w getThisGetter (zwykła metoda) już się zgubiło
```

**Praktyczna reguła:** arrow function jako pole klasy (`this.method = () => {...}` albo
`method = () => {...}` jako class field) to standardowy sposób „przypięcia” `this` na stałe do
instancji — przydatne dla callbacków/event handlerów.

## `call`, `apply`, `bind`

```js
function add(c, d) { return this.a + this.b + c + d; }
const o = { a: 1, b: 3 };

add.call(o, 5, 7);   // 16 — this=o, argumenty pojedynczo
add.apply(o, [5, 7]); // 16 — this=o, argumenty jako tablica

const bound = add.bind(o);
bound(5, 7); // 16 — this trwale ustawione na o

bound.bind({ a: 100 })(5, 7); // wciąż 16! — bind działa tylko RAZ, kolejny bind nie nadpisuje
```

## Klasy — `this` w konstruktorze i metodach

```js
class C {
  constructor() { this.a = 37; }
}
new C().a; // 37

class Derived extends Base {
  constructor() { super(); /* dopiero PO super() można użyć this */ }
}
class Bad extends Base {
  constructor() {} // ReferenceError przy new Bad(): must call super() before accessing/returning
}
```

Pola instancji jako arrow function trwale wiążą `this`:
```js
class Car {
  constructor() { this.sayBye = this.sayBye.bind(this); } // alternatywa: pole = arrow function
  sayHi() { console.log(`Hi from ${this.name}`); }
  sayBye() { console.log(`Bye from ${this.name}`); }
  get name() { return "Ferrari"; }
}
const car = new Car();
const bird = { name: "Tweety" };
bird.sayHi = car.sayHi;  bird.sayHi();  // "Hi from Tweety" — this = bird (metoda niebound)
bird.sayBye = car.sayBye; bird.sayBye(); // "Bye from Ferrari" — this = car (bound w konstruktorze)
```

## Pułapki

**Odłączona metoda:**
```js
const carSayHi = car.sayHi; // odłączona od obiektu
carSayHi(); // TypeError (strict mode) — this jest undefined, nie car
```
Rozwiązanie: `.bind(this)` w konstruktorze, albo pole klasy jako arrow function.

**Callback bez `this`:**
```js
class Widget {
  constructor() { this.value = 1; }
  handle() { console.log(this.value); } // zwykła metoda
}
const w = new Widget();
button.addEventListener("click", w.handle); // ❌ this w handle = przycisk, nie w
button.addEventListener("click", () => w.handle()); // ✅ arrow zachowuje this = w
button.addEventListener("click", w.handle.bind(w)); // ✅ alternatywa
```

**`this` a `forEach`/`map`/inne callbacki tablicowe:** przekazywana funkcja **nie** dziedziczy
`this` z otaczającej metody, jeśli jest zwykłą funkcją zadeklarowaną osobno — użyj arrow function
inline albo drugiego argumentu `thisArg`.
