# Asynchroniczność: Promise, async/await, event loop

> **Spis treści:** Stany Promise · `.then()` zawsze zwraca NOWY Promise · ⚠️ Reguła #1: zawsze `return` w `.then()`, inaczej floating… · Obsługa błędów — `.catch()` · `Promise.all` / `allSettled` / `race` / `any` · Sekwencyjne vs równoległe `await` — częsty problem z… · `async`/`await` — cukier nad Promise, nie inny mechanizm · ⚠️ Pułapka: `try/catch` NIE łapie błędu z callbacku… · Microtask queue vs macrotask (event loop)

Na podstawie MDN Web Docs (developer.mozilla.org/docs/Web/JavaScript/Guide/Using_promises), opisane własnymi słowami; przykłady sprawdzone w Node 22.

## Stany Promise

Promise ma jeden z trzech stanów, nieodwracalnie: **pending** → **fulfilled** albo **rejected**.

```js
const p = new Promise((resolve, reject) => { /* operacja async */ });
Promise.resolve(value);  // od razu fulfilled
Promise.reject(error);   // od razu rejected
```

## `.then()` zawsze zwraca NOWY Promise

```js
const p2 = p.then(onFulfilled, onRejected); // p2 !== p
```

## ⚠️ Reguła #1: zawsze `return` w `.then()`, inaczej floating promise

```js
// ❌ BUG — brak return, kolejny .then() NIE czeka na fetch()
doSomething().then((url) => { fetch(url); })
             .then((result) => console.log(result)); // undefined — fetch się jeszcze nie skończył

// ✅ POPRAWNIE
doSomething().then((url) => { return fetch(url); })
             .then((result) => console.log(result)); // prawidłowa odpowiedź
```

To jest jeden z najczęstszych realnych bugów w kodzie z Promise — brakujący `return` tworzy **race
condition**: kod dalej w łańcuchu wykonuje się, zanim wewnętrzna operacja faktycznie się zakończy.

## Obsługa błędów — `.catch()`

`.catch()` łapie błąd z **każdego** wcześniejszego kroku w łańcuchu (odpowiednik `try/catch` dla
kodu synchronicznego):

```js
doSomething()
  .then((r) => doSomethingElse(r))
  .then((r2) => doThirdThing(r2))
  .catch(failureCallback); // łapie błąd z doSomething, doSomethingElse LUB doThirdThing
```

Kod po `.catch()` w łańcuchu **wykonuje się dalej normalnie**, nawet po złapaniu błędu:
```js
doSomething()
  .then(() => { throw new Error("x"); })
  .catch(() => console.error("handled"))   // wykonane
  .then(() => console.log("runs anyway")); // WYKONANE — .catch() "naprawił" łańcuch
```

**Unhandled rejection** — Promise rejected bez `.catch()`/bez `try/catch` wokół `await`:
```js
window.addEventListener("unhandledrejection", (e) => console.error(e.reason)); // przeglądarka
process.on("unhandledRejection", (reason) => console.error(reason));           // Node.js
```

## `Promise.all` / `allSettled` / `race` / `any`

| Metoda | Czeka na | Wynik przy błędzie |
|---|---|---|
| `Promise.all([...])` | wszystkie | odrzuca całość przy **pierwszym** rejected |
| `Promise.allSettled([...])` | wszystkie, zawsze | nigdy nie odrzuca — zwraca `{status, value/reason}` per Promise |
| `Promise.race([...])` | pierwszy zakończony (fulfilled **lub** rejected) | wynik/błąd tego pierwszego |
| `Promise.any([...])` | pierwszy **fulfilled** | `AggregateError`, jeśli wszystkie rejected |

```js
const [r1, r2] = await Promise.all([func1(), func2()]); // obie równolegle
const results = await Promise.allSettled([func1(), func2()]); // żadna nie "zepsuje" reszty
```

## Sekwencyjne vs równoległe `await` — częsty problem z wydajnością

```js
// ❌ niepotrzebnie sekwencyjne — func2 czeka na func1, mimo że są niezależne
const r1 = await func1();
const r2 = await func2();

// ✅ równoległe — obie startują natychmiast
const [r1, r2] = await Promise.all([func1(), func2()]);
```

Sekwencyjne `await` jest właściwe **tylko** wtedy, gdy druga operacja faktycznie zależy od wyniku
pierwszej — w przeciwnym razie to niepotrzebne, łatwe do naprawienia opóźnienie.

## `async`/`await` — cukier nad Promise, nie inny mechanizm

```js
// Identyczne zachowanie:
doSomething().then((url) => fetch(url)).then((r) => r.json()).then((d) => console.log(d));

async function run() {
  const url = await doSomething();
  const r = await fetch(url);
  const d = await r.json();
  console.log(d);
}
```

Obsługa błędów z `async/await` — zwykły `try/catch` (patrz `bledy-i-wyjatki.md`):
```js
async function main() {
  try {
    const result = await doSomething();
    return await doSomethingElse(result);
  } catch (error) {
    failureCallback(error);
  }
}
```

## ⚠️ Pułapka: `try/catch` NIE łapie błędu z callbacku asynchronicznego

```js
// ❌ catch nigdy się nie wykona — setTimeout callback biegnie poza tym try
try {
  setTimeout(() => { throw new Error("boom"); }, 1000);
} catch (e) { console.error(e); } // nieużywalne

// ✅ owinięcie w Promise + await sprowadza błąd do miejsca, gdzie try/catch działa
async function safe() {
  try {
    await new Promise((_, reject) => setTimeout(() => reject(new Error("boom")), 1000));
  } catch (e) { console.error(e); } // teraz działa
}
```

## Microtask queue vs macrotask (event loop)

Promise callbacki (`.then`, `await`) trafiają do **microtask queue**, która jest opróżniana
**przed** kolejnym makrotaskiem (np. `setTimeout`, nawet z opóźnieniem `0`):

```js
Promise.resolve().then(() => console.log("promise"));
setTimeout(() => console.log("timeout"), 0);
console.log("sync");
// kolejność: "sync", "promise", "timeout" — ZAWSZE, niezależnie od tego, że wygląda symetrycznie
```

**Reguła praktyczna:** `async`/Promise-based kod jest zawsze asynchroniczny, nawet jeśli Promise
jest już `resolved` w momencie tworzenia — callback i tak trafia do kolejki mikrotasków, nie
wykonuje się synchronicznie w miejscu.
