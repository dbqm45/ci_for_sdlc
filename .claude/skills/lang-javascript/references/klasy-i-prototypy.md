# Klasy i dziedziczenie prototypowe

> **Spis treści:** Podstawy składni · Pola prywatne (`#`) · Dziedziczenie — `extends` i `super` · Kolejność ewaluacji (skrót) · Klasy vs prototype-based „pod maską” · Pułapki · W TypeScripcie

Na podstawie MDN Web Docs (developer.mozilla.org/docs/Web/JavaScript/Reference/Classes), opisane własnymi słowami; przykłady sprawdzone w Node 22.

## Podstawy składni

```js
class Rectangle {
  height = 0;          // pole publiczne z wartością domyślną
  #width;               // pole prywatne (dostępne tylko wewnątrz klasy)

  constructor(height, width) { this.height = height; this.#width = width; }

  get area() { return this.height * this.#width; }   // getter
  set width(w) { if (w <= 0) throw new Error("bad width"); this.#width = w; }

  calcPerimeter() { return 2 * (this.height + this.#width); } // metoda

  static defaultUnit = "cm";                    // pole statyczne (na klasie, nie instancji)
  static create(h, w) { return new Rectangle(h, w); } // metoda statyczna

  static { console.log("class initialized"); }  // statyczny blok inicjalizacyjny
}
```

**Ważne właściwości klas:**
- Klasy **nie są hoistowane** jak `function` — podlegają Temporal Dead Zone jak `let`/`const`.
  Nie można użyć klasy przed jej deklaracją w kodzie.
- Ciało klasy działa **zawsze w strict mode**, nawet bez `"use strict"`.
- Tylko **jeden** `constructor` — druga deklaracja to `SyntaxError`.
- Wywołanie bez `new` (`Rectangle(1,2)`) rzuca `TypeError` — klasy wymagają `new`, w przeciwieństwie
  do funkcji.

## Pola prywatne (`#`)

```js
class Account {
  #balance = 0;
  deposit(amount) { this.#balance += amount; }
  get balance() { return this.#balance; }
}
const a = new Account();
a.#balance; // SyntaxError poza klasą — to nie jest konwencja, to język to wymusza
```

Reguły: nazwy prywatne muszą być unikalne w klasie i zadeklarowane w jej ciele (w dowolnym miejscu —
nie muszą stać na początku); nie da się dodać `this.#x = 1` bez deklaracji `#x;`. Sprawdzenie „czy obiekt
ma pole prywatne”: `#balance in obj` (ES2022) — bezpieczniejsze niż `instanceof` między realmami.

## Dziedziczenie — `extends` i `super`

```js
class Animal {
  constructor(name) { this.name = name; }
  speak() { console.log(`${this.name} makes a noise.`); }
}
class Dog extends Animal {
  constructor(name) { super(name); } // MUSI być pierwsze — przed użyciem `this`
  speak() { super.speak(); console.log(`${this.name} barks.`); } // super.metoda() = wywołanie z rodzica
}
```

**Reguła bezwzględna:** klasa pochodna (`extends`) musi wywołać `super()` w konstruktorze **przed**
jakimkolwiek użyciem `this` — inaczej `ReferenceError`. Jeśli nie definiujesz własnego konstruktora,
JS wstawia domyślny, który sam wywołuje `super(...args)`.

## Kolejność ewaluacji (skrót)

1. `extends` jest ewaluowane najpierw.
2. `constructor` wyodrębniany (albo wstawiany domyślny).
3. Klucze właściwości ewaluowane w porządku deklaracji, metody instalowane na `prototype`
   (instancyjne) albo na samej klasie (statyczne).
4. Wartości pól instancji liczone **na początku konstruktora** (przed jego ciałem, po `super()` w
   klasach pochodnych); pola statyczne liczone z `this` = sama klasa.
5. Statyczne bloki inicjalizacyjne wykonywane w porządku deklaracji.

## Klasy vs prototype-based „pod maską”

Klasy to **cukier syntaktyczny** nad tym samym mechanizmem prototypów, który istniał w JS od
początku:

```js
// To samo zachowanie, styl przed ES6:
function Animal() {}
Animal.prototype.speak = function () { console.log("sound"); };
```

Różnice, o których warto pamiętać: klasy nie są hoistowane (funkcje są), klasy wymagają `new`
(funkcje nie), ciało klasy jest zawsze strict mode, `super` jest dostępne tylko w klasach.

## Pułapki

**Metoda odłączona od instancji traci `this`** (patrz też `this-i-funkcje.md`):
```js
class Animal { speak() { return this; } }
const speak = new Animal().speak;
speak(); // undefined (strict mode) — this zgubione
```
Rozwiązanie: pole klasy jako arrow function (`speak = () => this;`) albo `.bind(this)` w
konstruktorze.

**Zapomniane `super()` w konstruktorze pochodnym** → `ReferenceError` przy każdym `new`.

**Duplikaty nazw pól publicznych są dozwolone, ale mylące** — ostatnia deklaracja wygrywa, bez
ostrzeżenia:
```js
class C { x = 1; x = 2; } // OK składniowo
new C().x; // 2
```

**Prywatne pola nie mogą być tworzone dynamicznie** — `this.#foo = 1` w metodzie działa tylko jeśli
`#foo` zostało zadeklarowane w ciele klasy; próba dodania nowego prywatnego pola „w locie” to
`SyntaxError`.

## W TypeScripcie

`private`/`protected` z TS znikają w runtime — prawdziwą prywatność daje tylko `#`. Szczegóły klas w TS
(modyfikatory, `override`, parameter properties): lang-typescript `.claude/skills/lang-typescript/references/funkcje-obiekty-klasy.md`.
