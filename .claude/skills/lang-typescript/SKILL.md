---
name: lang-typescript
description: Użyj przy kodzie TypeScript 5.x–7.x — typy, zawężanie, generyki, tsconfig, walidacja na granicach, pojęcia domenowe.
metadata:
  katalog: "Użyj przy pisaniu, refaktorze i przeglądzie kodu TypeScript 5.x–7.x — typy, zawężanie, generyki, dekoratory, moduły, tsconfig, walidacja na granicach, pułapki bezpieczeństwa TS/npm oraz pojęcia domenowe (obiekt wartości, warianty, agregat, wynik) idiomami TS. Nie do mechaniki runtime JS (lang-javascript), frameworka (fw-*), ogólnych zasad auth (be-auth-security) ani modelowania (ddd-*)."
---

# TypeScript

## Zasady języka
1. `strict: true` (najlepiej też `noUncheckedIndexedAccess`) jest nienegocjowalne. Nie wyłączasz reguł, żeby kod się skompilował.
2. Zakaz `any`. Typ nieznany → `unknown` + zawężenie (type guard, walidator schematu na granicy).
3. Zakaz `as` do „uciszania” kompilatora; dopuszczalne `as const`, `satisfies` i rzutowanie po walidacji.
4. `// @ts-ignore` zabronione; `// @ts-expect-error` tylko z komentarzem dlaczego.
5. Typy kontraktów zewnętrznych w jednym miejscu (albo generowane z OpenAPI/JSON Schema) — bez duplikatów.
6. Unie dyskryminowane zamiast wielu opcjonalnych flag; wyczerpujący `switch` z `assertNever` w `default`.
7. Funkcje publiczne mają jawnie typowany wynik; dane domyślnie `readonly`.
8. Dane z sieci, storage, URL-i, formularzy, env są `unknown`, dopóki ich nie zwalidujesz — typ z walidatora
   (`z.infer<typeof Schema>` lub odpowiednik) to jedyne źródło prawdy. Typy nie są obroną → `references/bezpieczenstwo.md`.

## Pułapki i decyzje (skrót)
| Sytuacja | Zasada |
|---|---|
| `interface` / `type` | kształt obiektu → `interface`; unia, tuple, typ mapowany/warunkowy → `type`; konflikt w `&` daje `never` |
| `enum`, `namespace`, parameter properties | nowy kod: unia literałów + towarzysz; te konstrukcje łamią `erasableSyntaxOnly` |
| zmiana publicznego API | nowe pole najpierw `?`; poszerzenie parametru / zwężenie wyniku bezpieczne, odwrotnie — sprawdź wywołania |
| generyki, przeciążenia | parametr typu użyty raz jest zbędny; z zewnątrz widać tylko sygnatury przeciążeń; gdy wystarczy unia — unia |
| klasy | `#pole` zamiast `private` (znika w runtime); `override`; metoda przekazana jako referencja gubi `this`; baza nie widzi pól podklasy |
| dekoratory | standardowe TC39 (5.0+) ≠ legacy `experimentalDecorators` (parametry, `reflect-metadata`) — nie zmieniaj trybu w istniejącym projekcie |
| typy bibliotek | module augmentation / `declare global`, nie `as any` w miejscach użycia |

## Konfiguracja (tsconfig) — styl zgodny z TS 6/7
- Jawnie: `"strict": true`, `"rootDir"`, `"types": [...]` (od 6.0 domyślnie `[]` — wpisz np. `["node", "vitest/globals"]`),
  `"moduleResolution": "bundler"` (aplikacje z bundlerem) lub `"nodenext"` (Node/biblioteki), `"verbatimModuleSyntax": true`.
- Bez `baseUrl` (aliasy w `paths` względem katalogu tsconfig), bez `moduleResolution: node/node10/classic`,
  bez `module: amd/umd/system/none`, bez `target: es5`, bez `outFile`; `esModuleInterop` zawsze włączone.
- Uruchamianie TS przez usuwanie typów w Node → `erasableSyntaxOnly`; dekoratory i `using` na Node 22 i tak wymagają kompilacji.
- Wersję TS dobiera framework: sprawdź ograniczenia (np. Angular 22 → TS 6.0.x) — **nie podnoś TS ponad zakres frameworka**.

## Pojęcia domenowe w TypeScript
| Pojęcie (słownik) | Idiom w TypeScript |
|---|---|
| **obiekt wartości** | klasa z `private constructor` + fabryka `static of()`, pola `readonly`, operacje zwracają nowe instancje; kwoty jako `bigint` w najmniejszej jednostce (nigdy `number` w obliczeniach) |
| **identyfikator / encja** | typ markowany (branded) `string & { __brand: 'PartyId' }` — nie pomylisz ID różnych bytów |
| **warianty** | unia dyskryminowana z polem `kind`/`type` + wyczerpujący `switch` i `assertNever` |
| **wynik operacji** | `type Result<E, T> = { ok: true; value: T } \| { ok: false; error: E }` — odrzucenie z powodem zamiast wyjątku |
| **agregat** | klasa z prywatnym stanem, zmiany tylko metodami biznesowymi zwracającymi `Result`, zdarzenia zbierane i oddawane przez `pullEvents()` |
| **maszyna stanów** | unia stanów (`{ state: 'free' } \| { state: 'blocked'; by }`) — nieprawidłowe stany są niereprezentowalne |
| **zdarzenie** | niezmienny obiekt w unii zdarzeń, nazwa w czasie przeszłym (`type: 'ResourceBlocked'`) |
| **polityka** | typ funkcji (`(ctx: Ctx) => Money`) lub interfejs strategii; wybór polityki w fabryce |
| **specyfikacja** | predykaty `(x: T) => boolean` składane funkcjami `and/or/not` |
| **repozytorium / port** | `interface` w domenie (async), implementacja (HTTP, baza, pamięć) poza domeną |
| **read model** | płaski `readonly` typ dopasowany do widoku/zapytania, bez metod biznesowych |
| **moduł** | katalog z `index.ts` eksportującym tylko publiczny interfejs; reguły importów (np. eslint `no-restricted-imports`) pilnują granic |

## Indeks `references/` (czytaj tylko potrzebny plik)
| Plik | Czytaj, gdy… |
|---|---|
| `domain-building-blocks.md` | implementujesz Money, Quantity, Party, TimeSlot, Result, agregat ze zdarzeniami |
| `domain-modeling-patterns.md` | typ + towarzysz, zdarzenia wewnętrzne vs publikowane, decider, `#imports`, pułapki dat |
| `podstawy-i-narrowing.md` | `any`/`unknown`, `type`/`interface`, asercje, `satisfies`, `enum`, zawężanie |
| `funkcje-obiekty-klasy.md` | sygnatury, przeciążenia, wariancja, excess property checks, klasy, `this` |
| `generyki-i-utility-types.md` | ograniczenia, `const T`, `NoInfer`, utility types |
| `typy-zaawansowane.md` | `keyof`, typy warunkowe (`infer`), mapowane, template literal |
| `moduly-dekoratory-i-merging.md` | importy typów, interop CJS, dekoratory standard/legacy, `accessor`, merging |
| `bezpieczenstwo.md` | wejście z zewnątrz, SQL/NoSQL, merge obiektów, JWT, sekrety, URL-e, zależności npm |

## Zależne od wersji
| Wersja | Zmiany istotne dla tego skilla |
|---|---|
| 5.0 | dekoratory standardowe (TC39; legacy tylko z `experimentalDecorators` — jedyne z dekoratorami parametrów i `emitDecoratorMetadata`), `const` w parametrach typów, `moduleResolution: bundler`, `verbatimModuleSyntax` |
| 5.2 | `using` / `await using` (w runtime: Node 24+ lub transpilacja — Node 22 ich nie zna), metadane dekoratorów (`context.metadata`) |
| 5.4 | `NoInfer<T>` |
| 5.5 | wnioskowane predykaty typów (`filter(x => x !== undefined)` zawęża typ), sprawdzanie składni RegExp |
| 5.7 | `rewriteRelativeImportExtensions` (importy `./x.ts` przepisywane na `.js`) |
| 5.8 | `--erasableSyntaxOnly` (kod uruchamialny przez usuwanie typów, np. Node): błąd dla `enum`, `namespace` z wartościami, parameter properties, `import x = require` |
| 5.9 | ostatnia linia 5.x; minimalny, nowoczesny `tsc --init` |
| 6.0 | **zmienione domyślne**: `strict: true`, `module: esnext`, `target: es2025`, `types: []`, `rootDir: .` (błąd TS5011, gdy nie ustawisz), `noUncheckedSideEffectImports: true`; **wycofane** (błąd TS5101/5107, tymczasowo `"ignoreDeprecations": "6.0"`; usunięte w 7.0): `target: es5`, `downlevelIteration`, `moduleResolution: node/node10/classic`, `baseUrl`, `module: amd/umd/system/none`, `outFile`, `esModuleInterop: false`, słowo `module` dla namespace; `assert` w importach → błąd (używaj `with`); `tsc plik.ts` przy istniejącym tsconfig kończy się błędem (`--ignoreConfig`); `--stableTypeOrdering` do przygotowania pod 7.0; nowe: `es2025`, typy Temporal, importy `#/` |
| 7.0 | **natywny kompilator (Go), ~10× szybszy**; opcje wycofane w 6.0 **usunięte** (TS5102/5108); brak programistycznego API do 7.1 — narzędzia korzystające z API (Angular, typescript-eslint, loadery) nadal wymagają TS 6 → instaluj obok `@typescript/typescript6` (`tsc6`); nowe flagi `--checkers`, `--builders`, `--singleThreaded`; dekoratory legacy nadal obsługiwane |

Migracja 5.x → 6.0 w praktyce: ustaw `rootDir` i `types`, zamień `baseUrl` na `paths`, `moduleResolution` na `bundler`/`nodenext`;
przetestuj z `--stableTypeOrdering` przed przejściem na 7.0. Kod `domain-*.md` sprawdzony w 5.9/6.0/7.0, pozostałe
references w 6.0.3/7.0.2 (przykłady legacy/`enum` oznaczone).

## Checklista
- [ ] `tsc --noEmit` bez błędów w wersji TS z projektu (i w zakresie wymaganym przez framework)
- [ ] brak nowych `any`, `as`, `@ts-ignore`; brak `as`/`!` na danych z zewnątrz
- [ ] warianty obsłużone wyczerpująco
- [ ] kod domenowy bez importów frameworka
- [ ] nowy kod bez `enum`/`namespace`/parameter properties, gdy projekt używa `erasableSyntaxOnly` lub usuwania typów

Źródła: TypeScript Handbook i release notes 5.0–7.0 (typescriptlang.org, devblogs.microsoft.com) — opisane własnymi słowami.
