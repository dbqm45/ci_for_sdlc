# Iteracje, pętle i metody tablicowe

> **Spis treści:** Który typ pętli, kiedy · ⚠️ `for...in` na tablicy to pułapka — nigdy tego nie rób · `forEach` nie wspiera `break`/`continue` · Metody tablicowe — mutujące vs niemutujące · 10 konkretnych pułapek · `break`/`continue` z etykietą (rzadkie, ale bywa potrzebne… · Nowsze API (sprawdź `target`/środowisko)

Na podstawie MDN Web Docs (Guide/Loops_and_iteration, Reference/Global_Objects/Array), opisane własnymi słowami;
przykłady sprawdzone w Node 22.

## Który typ pętli, kiedy

| Pętla | Kiedy | Wartości czy klucze | break/continue |
|---|---|---|---|
| `for` | znana liczba iteracji, potrzebna kontrola indeksu | indeks | tak |
| `for...in` | iterowanie **właściwości obiektu** | nazwy właściwości (stringi!) | tak |
| `for...of` | iterowanie **wartości** iterowalnych (Array, Map, Set, String) | wartości | tak |
| `forEach` | tablica, styl funkcyjny, nie potrzebujesz przerwać | wartość + indeks | **nie** (patrz pułapka) |
| `while` | dynamiczny warunek, nieznana z góry liczba iteracji | — | tak |
| `do...while` | ciało musi wykonać się **co najmniej raz** | — | tak |

## ⚠️ `for...in` na tablicy to pułapka — nigdy tego nie rób

```js
const arr = [3, 5, 7];
arr.foo = "hello"; // dodatkowa właściwość na tablicy (rzadkie, ale możliwe)

for (const i in arr) console.log(i);   // "0" "1" "2" "foo"  ❌ — stringi + własne właściwości
for (const v of arr) console.log(v);   // 3 5 7               ✅ — tylko wartości tablicy
```
`for...in` iteruje po **właściwościach** (włącznie z dziedziczonymi z prototypu i dodanymi
ręcznie), zwraca ich nazwy jako stringi, nie gwarantuje kolejności. Do tablic zawsze `for...of` albo
`for`.

## `forEach` nie wspiera `break`/`continue`

```js
arr.forEach((n) => { if (n === 3) break; }); // ❌ SyntaxError — break nie działa w callbacku
arr.forEach((n) => { if (n === 3) return; }); // ✅ return = "continue" (pomija resztę CIAŁA callbacku, nie pętli)
```
Jeśli potrzebujesz przerwać iterację przedwcześnie — użyj `for...of` z `break`, albo `some()`/
`every()` (które **mogą** się zatrzymać wcześniej, w przeciwieństwie do `forEach`).

## Metody tablicowe — mutujące vs niemutujące

**Mutujące** (zmieniają tablicę w miejscu, zwracają często coś innego niż nową tablicę):
`push`, `pop`, `shift`, `unshift`, `splice`, `sort` ⚠️, `reverse`, `fill`, `copyWithin`.

**Niemutujące** (zwracają nową tablicę/wartość, oryginał niezmieniony):
`map`, `filter`, `slice`, `concat`, `flat`, `flatMap`, `find`, `findIndex`, `includes`, `indexOf`,
`every`, `some`, `reduce`, `join`, `at`, oraz **odpowiedniki ES2023** dla mutujących:
`toSorted`, `toReversed`, `toSpliced`, `with`.

| Mutująca | Niemutujący odpowiednik (ES2023+) |
|---|---|
| `sort()` | `toSorted()` |
| `reverse()` | `toReversed()` |
| `splice()` | `toSpliced()` |
| `arr[i] = v` (pojedynczy element) | `arr.with(i, v)` |

## 10 konkretnych pułapek

**1. `sort()` sortuje leksykograficznie (jak stringi), nie numerycznie:**
```js
[10, 5, 40, 25, 1000].sort();           // [10, 1000, 25, 40, 5] ❌ (jako stringi)
[10, 5, 40, 25, 1000].sort((a, b) => a - b); // [5, 10, 25, 40, 1000] ✅
```

**2. `sort()`/`reverse()`/`splice()` mutują oryginał:**
```js
const arr = [3, 1, 2];
const sorted = arr.sort();
sorted === arr; // true — to TA SAMA tablica, nie kopia
```
Jeśli nie chcesz mutować: `arr.toSorted()` (ES2023) albo `arr.slice().sort(...)` (starsze silniki).

**3. `reduce()` bez `initialValue` na krótkiej/pustej tablicy:**
```js
[].reduce((a, b) => a + b);        // TypeError: Reduce of empty array with no initial value
[5].reduce((a, b) => a - b);       // 5 — pierwszy element użyty jako start, żadna redukcja się nie stała
[1,2,3,4].reduce((s, n) => s + n, 0); // 10 — ZAWSZE podawaj initialValue, jednoznaczne zachowanie
```

**4. Mutacja tablicy w trakcie iteracji po niej:**
```js
arr.forEach((el, i, a) => { if (i === 1) a.splice(2, 1); }); // nieprzewidywalne pominięcia
// bezpieczniej: iteruj po kopii — arr.slice().forEach(...)
```

**5. Kopie (`slice()`, spread `[...arr]`) są PŁYTKIE:**
```js
const original = [{ id: 1 }];
const copy = original.slice();
copy[0].id = 999;
original[0].id; // 999 — obiekty w środku to wciąż te same referencje!
```
Głęboka kopia: `structuredClone(original)` (nowoczesne) albo `JSON.parse(JSON.stringify(original))`
(starsze, gubi funkcje/`undefined`/`Date` itd.).

**6. `find()` vs `filter()` — różny typ wyniku:**
```js
arr.find(x => x > 2);   // pojedyncza wartość albo undefined
arr.filter(x => x > 2); // ZAWSZE tablica (może być pusta)
```

**7. `indexOf(NaN)` nie znajduje `NaN`, ale `includes(NaN)` tak:**
```js
[NaN].indexOf(NaN);   // -1  (używa === wewnętrznie, NaN !== NaN)
[NaN].includes(NaN);  // true (używa SameValueZero — traktuje NaN jako równe sobie)
```

**8. Puste sloty (sparse arrays) — starsze metody je pomijają:**
```js
const arr = [1, , 3]; // arr[1] to "dziura", nie undefined
arr.map(x => x * 2);  // [2, <empty>, 6] — dziura pozostaje dziurą, callback się nie wywołał dla niej
Array.from(arr);      // [1, undefined, 3] — Array.from wypełnia dziury jako undefined
```

**9. `for...in` na tablicy** — patrz osobna sekcja wyżej, to jedna z najczęstszych pomyłek.

**10. `Map`/`Set` iterowane przez `for...of`, nie `for...in`:**
```js
const m = new Map([["a", 1]]);
for (const [k, v] of m) { /* ... */ }        // ✅ for...of + destructuring
for (const [k, v] of Object.entries(obj)) {} // dla zwykłego obiektu — Object.entries + for...of
```

## `break`/`continue` z etykietą (rzadkie, ale bywa potrzebne dla zagnieżdżonych pętli)

```js
outer: for (const a of listA) {
  for (const b of listB) {
    if (shouldStopAll(a, b)) break outer;    // wychodzi z OBU pętli
    if (shouldSkipA(a, b)) continue outer;   // przechodzi do następnego `a`, pomijając resztę `b`
  }
}
```

## Nowsze API (sprawdź `target`/środowisko)

| API | Od | Zamiast |
|---|---|---|
| `at(-1)` | ES2022 | `arr[arr.length - 1]` |
| `findLast`, `findLastIndex` | ES2023 | `slice().reverse().find()` |
| `toSorted`, `toReversed`, `toSpliced`, `with` | ES2023 | kopia + metoda mutująca |
| `Object.groupBy`, `Map.groupBy` | ES2024 | `reduce` do słownika (wynik `groupBy` ma prototyp `null`) |
| `Array.fromAsync` | ES2024 | pętla `for await` z `push` |
| metody `Set` (`union`, `intersection`, `difference`…) | ES2025 | ręczne filtrowanie |
| iterator helpers (`iter.map/filter/take/toArray`) | ES2025 | `Array.from(iter).map(...)` (leniwie, bez kopii) |
