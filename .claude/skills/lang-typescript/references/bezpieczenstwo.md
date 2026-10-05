# Bezpieczeństwo kodu TypeScript / Node

> **Spis treści:** Granica wejścia: `unknown` → walidacja → typ · Backend (Node) · Frontend · Łańcuch zależności (npm) · Checklista (TS-specyficzna) · Narzędzia

Zakres: pułapki bezpieczeństwa **specyficzne dla TS/JS i ekosystemu npm**. Zasady ogólne (auth, hasła, sesje,
autoryzacja per zasób, nagłówki, CORS, logowanie zdarzeń, rotacja sekretów) — be-auth-security; XSS, CSP, storage
w przeglądarce — fe-web-platform; granica klient/serwer i warstwa danych frontu — fe-architecture.
Przykłady sprawdzone w tsc 6.0.3/7.0.2 i uruchomione w Node 22.

**Teza:** typy nie są obroną. Znikają w runtime, więc nie powstrzymają SQL injection, XSS, prototype pollution,
ataku na zależności ani wycieku sekretu. `as`, `!` i `any` na danych z zewnątrz to sygnał bezpieczeństwa,
nie tylko stylu.

## Granica wejścia: `unknown` → walidacja → typ
- Dane z requestu, odpowiedzi API, kolejki, pliku, `process.env`, `localStorage`, URL są `unknown`, dopóki nie
  przejdą walidatora schematu (Zod, Valibot, ArkType, class-validator…). Typ bierz z walidatora (`z.infer`).
- `JSON.parse(x) as Dto` i `res.json() as Promise<Dto>` to rzutowanie, nie walidacja.
- Konfiguracja: waliduj `process.env` schematem **przy starcie** — aplikacja nie wstaje z brakującą/złą zmienną.
  Lokalnie `node --env-file=.env` (Node ≥ 20.6) zamiast dodatkowych pakietów; `.env` w `.gitignore`.

## Backend (Node)

### SQL injection — także przez ORM
```ts
const q = `SELECT * FROM users ORDER BY ${sortColumn} ${order}`;          // ❌ wartości z requestu w SQL
```
Wartości — tylko parametry (`$1`, `?`, tagged template query-buildera). Elementów, których nie da się
parametryzować (kolumna sortowania, kierunek), nie przepuszczaj — mapuj z zamkniętej listy:
```ts
const SORTABLE = ["name", "createdAt"] as const;
type SortColumn = (typeof SORTABLE)[number];
function parseSort(col: unknown, dir: unknown): { col: SortColumn; dir: "ASC" | "DESC" } {
  if (typeof col !== "string" || !(SORTABLE as readonly string[]).includes(col)) throw new RangeError("bad sort");
  return { col: col as SortColumn, dir: dir === "DESC" ? "DESC" : "ASC" };
}
```
Uwaga na „surowe” metody ORM (`query`, `$queryRawUnsafe`, `.raw()`) — interpolacja w nich to injection.

### NoSQL injection (MongoDB)
```ts
await User.findOne({ username: req.body.username, password: req.body.password }); // ❌ body: {"$ne": null}
```
Waliduj pola jako prymitywy (`z.string()`), zanim trafią do zapytania; operatorów `$…` z wejścia nie przepuszczaj
(schemat, ewentualnie `sanitizeFilter`/`mongo-sanitize` jako druga warstwa).

### Prototype pollution
```ts
deepMerge(defaults, req.body); // ❌ {"__proto__": {"isAdmin": true}} zmienia Object.prototype
```
- Schemat z odrzucaniem nieznanych kluczy (`z.strictObject`) zamiast mergowania całego wejścia.
- Własne merge/set-by-path: pomijaj `__proto__`, `constructor`, `prototype`; mapy z wejścia jako `Map` albo
  `Object.create(null)`; sprawdzanie kluczy przez `Object.hasOwn`.
- `node --disable-proto=delete` usuwa akcesor `__proto__` w całym procesie.

### JWT
```ts
jwt.verify(token, key);                                        // ❌ bez listy algorytmów
jwt.verify(token, key, { algorithms: ["RS256"], issuer, audience }); // ✅
```
`decode()` nie weryfikuje podpisu — nigdy jako uwierzytelnienie. Czas życia, refresh, weryfikowane claimy —
be-auth-security. W nowym kodzie rozważ bibliotekę `jose` (Web Crypto, wymusza algorytm przy kluczu).

### Porównanie sekretów w stałym czasie
```ts
if (provided === expected) { /* ❌ czas zależy od liczby zgodnych znaków */ }

import { createHash, timingSafeEqual } from "node:crypto";
function safeEqual(a: string, b: string): boolean {
  // timingSafeEqual rzuca przy różnej długości buforów — porównuj skróty o stałej długości
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}
```

### Szablony (SSTI) i wykonywanie kodu
- Wejście użytkownika nigdy jako *szablon* (Nunjucks, EJS, Pug, Handlebars) — tylko jako *dane* do szablonu.
- Zakaz `eval`, `new Function`, `vm` jako „piaskownicy” (`vm` nie jest granicą bezpieczeństwa),
  `child_process.exec` z interpolacją — `execFile`/`spawn` z tablicą argumentów.

### Niebezpieczna deserializacja
Biblioteki odtwarzające funkcje/klasy z danych (np. `node-serialize`, YAML z typami niestandardowymi) wykonują
kod z payloadu. Dane z zewnątrz: `JSON.parse` + walidacja schematem.

### SSRF — parsuj URL, nie porównuj stringów
```ts
new URL("http://127.0.0.1@evil.com").hostname; // "evil.com" — `includes("127.0.0.1")` by przepuścił
new URL("http://0x7f.0.0.1/").hostname;        // "127.0.0.1"
```
Parsuj `new URL()`, wymagaj `https:`, odrzucaj `username`/`password`, dopasuj host do allowlisty; przy
dowolnych hostach rozwiąż DNS, odrzuć zakresy prywatne/link-local/metadata i łącz się z **tym** adresem
(DNS rebinding). Polityka allowlisty — be-auth-security.

### GraphQL
Introspekcja wyłączona w produkcji; argumenty resolverów walidowane jak body REST; limity głębokości/złożoności
zapytań.

## Frontend

### XSS przez URL i HTML
```tsx
<a href={userUrl}>…</a>                       // ❌ `javascript:alert(1)` wykona się po kliknięciu
<a href={safeHref(userUrl)}>…</a>              // ✅ tylko http(s)/mailto po `new URL()`
<a href={`/search?q=${encodeURIComponent(q)}`}>…</a> // segmenty URL zawsze kodowane
```
`dangerouslySetInnerHTML` / `[innerHTML]` / `v-html` tylko po DOMPurify; nie omijaj sanitizera frameworka
(`bypassSecurityTrust…` w Angularze). CSP, Trusted Types, `textContent` — fe-web-platform.

### Sekrety w bundlu klienta
TypeScript nie wie, gdzie kod się wykona — import modułu z sekretem do kodu współdzielonego wrzuca go do bundla.
Do klienta trafiają tylko zmienne z prefiksem publicznym frameworka (`NEXT_PUBLIC_`, `VITE_`, …); moduły
serwerowe oznaczaj (`import "server-only"` w Next.js, osobny katalog/projekt z regułą importów). Wszystko, co
jest w bundlu, jest publiczne.

### CSRF
Mutacje przez ciasteczka sesyjne: `SameSite=Lax/Strict`, weryfikacja `Origin`, token CSRF dla formularzy —
szczegóły be-auth-security.

## Łańcuch zależności (npm)
- `npm ci` z lockfile w CI; przegląd diffu lockfile w PR; `npm audit` / Snyk / Socket w pipeline.
- Skrypty instalacyjne to wykonanie cudzego kodu: `--ignore-scripts` (lub allowlista skryptów w menedżerze
  pakietów), zwłaszcza w CI z sekretami. Przykład: `event-stream` (2018) — złośliwy kod dodany przez nowego opiekuna.
- **Dependency confusion:** prywatne scope'y przypisane do prywatnego rejestru w `.npmrc`
  (`@firma:registry=…`), rezerwacja nazw scope w publicznym npm.
- Typosquatting: sprawdzaj nazwę i wydawcę przed `npm i`; preferuj pakiety z provenance; mniej zależności =
  mniejsza powierzchnia ataku; aktualizacje z przeglądem, nie „zawsze najnowsze”.
- Karencja nowych wersji: `min-release-age=3` w `.npmrc` (npm ≥ 11.10, w dniach), `minimumReleaseAge` w pnpm (minuty).
  Przypadek axios (marzec 2026): złośliwe wersje z nową zależnością i `postinstall` były dostępne około 3 godzin.
  Pełny zestaw zasad i procedura po incydencie — ops-supply-chain-security.

## Checklista (TS-specyficzna)
- [ ] brak `as`/`!`/`any` na danych z zewnątrz — walidacja schematem, typ z walidatora
- [ ] `process.env` walidowane przy starcie; brak sekretów w kodzie współdzielonym z klientem
- [ ] zapytania parametryzowane; nazwy kolumn/kierunki z zamkniętej listy
- [ ] brak ślepego merge wejścia (prototype pollution); nieznane klucze odrzucane
- [ ] `jwt.verify` z `algorithms`; brak `decode()` jako auth
- [ ] sekrety porównywane w stałym czasie (`timingSafeEqual` na skrótach)
- [ ] URL-e od użytkownika parsowane `new URL()` (SSRF, `javascript:`)
- [ ] brak `eval`/`new Function`/`exec` z interpolacją; deserializacja tylko `JSON.parse`
- [ ] `npm ci`, audyt zależności, kontrola skryptów instalacyjnych, scope'y w `.npmrc`
- [ ] lint: `eslint-plugin-security` / reguły `no-unsafe-*` z typescript-eslint

## Narzędzia
| Narzędzie | Do czego |
|---|---|
| Zod / Valibot / ArkType / class-validator | walidacja wejścia, konfiguracji, odpowiedzi API |
| DOMPurify | sanityzacja HTML przed wstawieniem do DOM |
| Helmet | nagłówki HTTP w Express (lista nagłówków — be-auth-security) |
| `jose` / `jsonwebtoken` | JWT z jawnym algorytmem |
| `node:crypto` `timingSafeEqual` | porównanie w stałym czasie |
| npm audit / Snyk / Socket | skanowanie zależności |
| eslint-plugin-security, typescript-eslint `no-unsafe-*` | statyczne wykrywanie wzorców |

Źródło inspiracji: artykuł „TypeScript Application Security from A to Z” (dev.to, devsdaddy) — treść opisana
własnymi słowami, poprawiona i uzupełniona.
