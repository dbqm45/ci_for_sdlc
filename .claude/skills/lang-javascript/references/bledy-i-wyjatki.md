# Błędy i wyjątki: try/catch/finally

> **Spis treści:** Składnia — trzy formy · Optional catch binding i destrukturyzacja · Warunkowa obsługa po typie błędu, i re-throw · Custom error classes i `Error.cause` · ⚠️ `finally` z `return`/`throw` NADPISUJE wynik z… · `finally` wykonuje się zawsze, nawet przy nieobsłużonym… · Zagnieżdżone try/catch — błąd łapany tylko przez najbliższy… · Async — `try/catch` nie łapie błędu z callbacku, ale łapie… · Katalog wbudowanych typów błędów (MDN Reference)

Na podstawie MDN Web Docs (Reference/Statements/try...catch, wbudowane typy błędów), opisane własnymi słowami;
przykłady sprawdzone w Node 22.

## Składnia — trzy formy

```js
try { risky(); } catch (e) { handle(e); }                    // try...catch
try { risky(); } finally { cleanup(); }                       // try...finally
try { risky(); } catch (e) { handle(e); } finally { cleanup(); } // pełna forma
```

`try`/`catch`/`finally` **muszą** być blokami `{}` — `try foo(); catch (e) bar();` to `SyntaxError`.

## Optional catch binding i destrukturyzacja

```js
try { JSON.parse(text); return true; }
catch { return false; } // parametr błędu pominięty, nie jest potrzebny

try { throw new TypeError("oops"); }
catch ({ name, message }) { console.log(name, message); } // "TypeError" "oops"
```

## Warunkowa obsługa po typie błędu, i re-throw

```js
try { myRoutine(); }
catch (e) {
  if (e instanceof TypeError) { /* obsłuż */ }
  else if (e instanceof RangeError) { /* obsłuż */ }
  else { throw e; } // nieznany błąd — przekaż dalej, nie "połykaj" cicho
}
```

**Reguła:** nie łap błędu, którego nie umiesz sensownie obsłużyć — re-throw jest lepsze niż
milczące `catch (e) {}`, które chowa realne problemy.

## Custom error classes i `Error.cause`

```js
class ValidationError extends Error {
  constructor(message) { super(message); this.name = "ValidationError"; }
}

try { throw new ValidationError("Pole wymagane"); }
catch (e) { if (e instanceof ValidationError) console.log(e.message); }

// Error.cause — łańcuch przyczynowy błędów (przydatne przy owijaniu błędu niższego poziomu)
try {
  try { throw new Error("Błąd bazy danych"); }
  catch (dbError) { throw new Error("Nie mogę załadować użytkownika", { cause: dbError }); }
} catch (e) {
  console.error(e.message);        // "Nie mogę załadować użytkownika"
  console.error(e.cause.message);  // "Błąd bazy danych"
}
```

## ⚠️ `finally` z `return`/`throw` NADPISUJE wynik z `try`/`catch`

```js
function doIt() {
  try { return "z try"; }
  finally { return "z finally"; } // to wygrywa — funkcja zwraca "z finally"!
}

function doIt2() {
  try { throw "z try"; }
  catch { throw "z catch"; }
  finally { return "z finally"; } // return w finally ZATRZYMUJE propagację throw!
}
```

**Reguła:** unikaj `return`/`throw`/`break`/`continue` w `finally` — ich efekt jest zaskakujący
(nadpisuje wynik z `try`/`catch`) i trudny do przewidzenia przy review. `finally` powinien służyć
tylko do **czyszczenia zasobów** (zamknięcie połączenia, usunięcie listenera), nie do zwracania
wartości.

## `finally` wykonuje się zawsze, nawet przy nieobsłużonym błędzie

```js
try { throw new Error("oops"); }
finally { console.log("zawsze się wykonam"); }
// log się wypisuje, A POTEM błąd wciąż propaguje się dalej (brak catch = nieobsłużony wyjątek)
```

## Zagnieżdżone try/catch — błąd łapany tylko przez najbliższy `catch`

```js
try {
  try { throw new Error("oops"); }
  catch (e) { console.log("inner", e.message); } // łapie tutaj, koniec propagacji
  finally { console.log("finally"); }
} catch (e) {
  console.log("outer", e.message); // NIE wykona się — błąd już obsłużony wewnątrz
}
```
Żeby błąd doszedł do zewnętrznego `catch`, wewnętrzny musi go **re-throw** (`throw e;`).

## Async — `try/catch` nie łapie błędu z callbacku, ale łapie `await`

Patrz `asynchronicznosc.md`, sekcja o `setTimeout`/callbackach — to jedna z najczęstszych pomyłek
przy łączeniu `try/catch` z kodem asynchronicznym.

## Katalog wbudowanych typów błędów (MDN Reference)

| Typ | Kiedy |
|---|---|
| `Error` | bazowa klasa, ogólny błąd |
| `TypeError` | operacja na wartości niewłaściwego typu (`null.foo`, wywołanie nie-funkcji) |
| `RangeError` | wartość poza dozwolonym zakresem (np. `new Array(-1)`) |
| `ReferenceError` | odwołanie do nieistniejącej zmiennej |
| `SyntaxError` | nieprawidłowa składnia (często przy `eval`/`JSON.parse`) |
| `URIError` | nieprawidłowe użycie funkcji URI (`decodeURIComponent`) |
| `EvalError` | historyczny, praktycznie nieużywany dziś |
| `AggregateError` | wiele błędów naraz (np. z `Promise.any`, gdy wszystkie rejected) |

**Praktyczna reguła przy rzucaniu własnych błędów:** rzucaj instancje `Error` (albo podklasy), nie
gołe stringi/obiekty — `throw "coś"` sprawia, że `e.message`/`e.stack` nie istnieją w `catch`, co
utrudnia diagnozowanie później.
