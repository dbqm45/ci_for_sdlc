---
name: lang-javascript
description: Użyj przy czystym JavaScripcie ES2022+ — koercja, domknięcia, this, async i event loop, tablice, ESM vs CommonJS.
metadata:
  katalog: "Użyj przy kodzie i przeglądzie czystego JavaScriptu (ES2022+, przeglądarka lub Node) — koercja i porównania, zasięg i domknięcia, this, klasy, Promise/async i event loop, metody tablic (mutujące vs nie), ESM vs CommonJS, błędy — oraz pojęcia domenowe bez TypeScriptu (JSDoc, Object.freeze, bigint). Nie do API przeglądarki (fe-web-platform), typowania TS (lang-typescript) ani modelowania (ddd-*)."
---

# JavaScript

Zachowanie w runtime — dotyczy też kodu TypeScript (lang-typescript opisuje typy nałożone na to samo).

## Zasady języka
- Moduły ES (`import`/`export`), `const` domyślnie, bez zmiennych globalnych i bez `var`.
- `async/await`; każda obietnica ma obsługę błędu; równoległe niezależne operacje przez `Promise.all`/`allSettled`.
- Nie połykaj błędów (`catch {}`) — obsłuż, zaloguj albo przekaż dalej. Rzucaj `Error` (lub podklasy, z `cause`), nie stringi.
- Zakaz `eval`, `new Function`, `with`; porównania `===` (wyjątek: `x == null` łapie `null` i `undefined`).
- Włącz `// @ts-check` i opisuj typy w JSDoc — edytor sprawdzi kod bez migracji do TypeScriptu.
- Zanim dopiszesz kod, sprawdź system modułów pliku (ESM / CommonJS / klasyczny `<script>`) — nie mieszaj składni.

## Pułapki — pierwsze podejrzenia przy błędzie lub review
| Objaw | Prawdopodobna przyczyna → poprawka |
|---|---|
| dziwny wynik warunku | `==` z koercją (`"1" == 1`), `"0"` jest truthy, `typeof null === "object"`, `NaN !== NaN` → `===`, `Number.isNaN`, `== null` |
| `this` jest `undefined` / inne | metoda odłączona od obiektu (callback, `setTimeout`, handler) → pole-strzałka, `.bind`, `() => obj.m()` |
| tablica zmieniła się „sama” | metoda mutująca (`sort`, `reverse`, `splice`, `fill`) → `toSorted`/`toReversed`/`toSpliced`/`with`; kopie spread/`slice` są płytkie → `structuredClone` |
| `sort` liczb w złej kolejności | domyślne sortowanie tekstowe → `sort((a, b) => a - b)` |
| `undefined` w łańcuchu Promise | brak `return` w `.then()`; niezależne `await` po kolei → `Promise.all` |
| `catch` nie łapie błędu | błąd w callbacku (`setTimeout`, zdarzenie) poza `try` → opakuj w Promise i `await` |
| pętla zwraca indeksy-stringi | `for...in` na tablicy → `for...of` / `entries()` |
| closure widzi ostatnią wartość | `var` w pętli → `let`/`const` |
| `finally` „zjada” wynik | `return`/`throw` w `finally` nadpisuje wynik → w `finally` tylko sprzątanie |
| `require is not defined` / `Cannot use import` | pomieszane ESM i CommonJS → sprawdź `"type"`, rozszerzenie `.mjs`/`.cjs` |
| `ReferenceError` w podklasie | `this` przed `super()` |

## Pojęcia domenowe w JavaScript
| Pojęcie (słownik) | Idiom w JavaScript |
|---|---|
| **obiekt wartości** | fabryka zwracająca `Object.freeze({...})` z walidacją; kwoty jako `bigint` w najmniejszej jednostce |
| **encja** | obiekt z polem `id` i zachowaniem; identyfikatory opakowane w fabrykę, żeby nie mieszać typów |
| **warianty** | obiekty z polem `kind` + `switch` z gałęzią `default: throw new Error('nieobsłużony wariant')`; w JSDoc `@typedef {A \| B}` |
| **wynik operacji** | `{ ok: true, value }` / `{ ok: false, error }` — odrzucenie biznesowe bez wyjątku |
| **agregat** | klasa z polami prywatnymi `#state`, metody biznesowe zwracające wynik, zdarzenia oddawane przez `pullEvents()` |
| **maszyna stanów** | stan jako obiekt `{ state: 'free' }` / `{ state: 'blocked', by }`, przejścia w jednej metodzie |
| **zdarzenie** | zamrożony obiekt `{ type: 'ResourceBlocked', ... }` w czasie przeszłym |
| **polityka** | funkcja przekazywana do fabryki/obiektu |
| **repozytorium** | obiekt/klasa z `async load/save`, domena zależy tylko od kształtu (JSDoc `@typedef`) |
| **read model** | zwykły zamrożony obiekt danych pod widok |
| **moduł** | plik lub katalog z `index.js` eksportującym tylko publiczne API |

Implementacje z `lang-typescript/references/domain-building-blocks.md` przenoszą się 1:1 po usunięciu typów:
`#private` zamiast `private`, `Object.freeze` zamiast `readonly`, JSDoc zamiast adnotacji.

## Indeks `references/` (czytaj tylko potrzebny plik)
| Plik | Czytaj, gdy… |
|---|---|
| `typy-i-porownania.md` | `==` vs `===`, algorytm koercji, `typeof`/`instanceof`, truthy/falsy |
| `zasieg-i-domkniecia.md` | `var`/`let`/`const`, TDZ, domknięcia, `var` w pętli, koszt closures |
| `this-i-funkcje.md` | reguły `this` w każdym kontekście, `call`/`apply`/`bind`, strzałki |
| `klasy-i-prototypy.md` | pola `#`, statyczne bloki, `extends`/`super`, kolejność ewaluacji, prototypy |
| `asynchronicznosc.md` | stany Promise, `all`/`allSettled`/`race`/`any`, mikro- vs makrozadania |
| `iteracje-i-tablice.md` | wybór pętli, metody mutujące vs nie, 10 pułapek, nowsze API tablic/Set |
| `moduly.md` | ESM vs CommonJS, live bindings, cykle, `require(esm)`, `import.meta` w Node |
| `bledy-i-wyjatki.md` | `try/catch/finally`, `Error.cause`, własne klasy błędów, typy błędów |

## Wersje ECMAScript / Node (sprawdź `target` i środowisko)
| Od | Co wolno użyć |
|---|---|
| ES2022 | `at()`, `Object.hasOwn`, `Error.cause`, pola `#`, `#x in obj`, statyczne bloki, top-level `await` (ESM) |
| ES2023 | `toSorted`/`toReversed`/`toSpliced`/`with`, `findLast` |
| ES2024 | `Object.groupBy`/`Map.groupBy`, `Promise.withResolvers`, `Array.fromAsync` |
| ES2025 | metody `Set` (`union`…), iterator helpers, atrybuty importu (`with { type: "json" }`), `Promise.try`, `RegExp.escape` |
| Node 22 | ma ES2024 + metody `Set` i iterator helpers; **brak** `Promise.try`, `RegExp.escape`, `using`, dekoratorów; `require(esm)` od 22.12, wykrywanie ESM w `.js` od 22.7 |

## Checklista
- [ ] `// @ts-check` + JSDoc w plikach domeny
- [ ] brak arytmetyki pieniędzy na `number`
- [ ] każdy `switch` po `kind` ma `default` z błędem
- [ ] brak `==` (poza `== null`), `for...in` na tablicach, `var`
- [ ] brak metod mutujących na danych współdzielonych; kopie głębokie przez `structuredClone`
- [ ] każda obietnica obsłużona; niezależne operacje równolegle
- [ ] system modułów pliku zgodny z `"type"`/rozszerzeniem

Źródła: MDN Web Docs (JavaScript Guide i Reference, treści CC-BY-SA) — opisane własnymi słowami.
