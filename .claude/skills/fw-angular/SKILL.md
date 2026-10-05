---
name: fw-angular
description: Użyj przy kodzie Angulara 17–22 — standalone, signals i resources, zoneless, Signal Forms, DI, HttpClient, routing, testy.
metadata:
  katalog: "Użyj przy kodzie Angulara (17–22) — komponenty standalone, signals i resources, zoneless/OnPush, Signal Forms, DI, HttpClient, routing, testy — oraz przy decyzji, gdzie w aplikacji Angular umieścić pojęcia domenowe. Uwzględnia różnice między wersjami (sekcja Zależne od wersji). Nie do składni TypeScript (lang-typescript) ani modelowania (ddd-*)."
  slowa: "ng update, aktualizacja Angulara, zaktualizować Angulara, przejść na nowszego Angulara, migracja Angulara, przejście na nowszą wersję Angulara, komponent Angulara, szablon"
---

# Angular

**Najpierw sprawdź wersję w projekcie** (`detect_stack.py` / `package.json`). Konwencje poniżej opisują nowoczesny
Angular; w starszych wersjach bierz z tabeli „Zależne od wersji” odpowiednik dostępny w projekcie.

## Konwencje
1. **Komponenty standalone** (domyślne — nie trzeba pisać `standalone: true`); bez nowych `NgModule`.
2. **Signals do stanu:** `signal`, `computed`, `linkedSignal`, `input()`/`input.required()`, `output()`, `model()`;
   `effect` tylko do efektów ubocznych poza Angularem (nie do synchronizacji stanu).
3. **Odczyty asynchroniczne przez resources:** `httpResource` / `resource` / `rxResource` (status idle → loading → resolved/error,
   `reload()`); `debounced()` dla pól wyszukiwania. RxJS tam, gdzie są prawdziwe strumienie; na granicy `toSignal`.
4. **Detekcja zmian:** aplikacje zoneless i komponenty `OnPush` — komponent zależy tylko od wejść i signals.
   W istniejącym kodzie ze strategią `Eager` (dawniej `Default`) nie zmieniaj jej hurtem bez testów.
5. **Nowy control flow** w szablonach: `@if`, `@for (…; track id)`, `@switch`, `@defer`; bez `*ngIf/*ngFor` w nowym kodzie.
   Szablon bez logiki biznesowej — nawet jeśli składnia pozwala (funkcje strzałkowe, spread), logika idzie do `computed`.
6. **DI przez `inject()`**; serwisy aplikacyjne `@Service()` (skrót dla `@Injectable({ providedIn: 'root' })`);
   leniwe ładowanie ciężkich serwisów przez `injectAsync()`; stan funkcji dostarczany na poziomie trasy.
7. **Formularze:** nowe formularze w **Signal Forms** (`@angular/forms/signals`: `form()`, schemat z `validate()`,
   `required()`…, dyrektywa `[formField]`); istniejące Reactive Forms (typowane, `nonNullable`) zostają. Reguły walidacji
   jako czyste funkcje domenowe — podpinane do obu API.
8. **HTTP:** `HttpClient` dostępny domyślnie i oparty o Fetch API; interceptory funkcyjne (auth, błędy, korelacja);
   mapowanie DTO → typy domenowe na krawędzi (np. opcja `parse` w `httpResource`), nie w komponencie.
9. **Routing:** trasy leniwe (`loadComponent`, `loadChildren`), guardy i resolvery funkcyjne, `withComponentInputBinding()`.
10. **Testy:** Vitest (`@angular/build:unit-test`); logika domeny bez `TestBed`; komponenty `await fixture.whenStable()`.
11. **Aktualizacje:** `ng update` (lub `nx migrate` w monorepo Nx) — migracje automatyczne zamiast ręcznych zmian.

## Pojęcia domenowe w Angularze — gdzie co mieszka
| Pojęcie (słownik) | Miejsce w aplikacji Angular |
|---|---|
| **obiekt wartości** | czysty TS w `domain/` (lang-typescript); w UI **pipe** do formatowania (np. `money`), własna kontrolka formularza (`FormValueControl` w Signal Forms / `ControlValueAccessor`), gdy pole powtarza się w wielu formularzach |
| **encja** | typ domenowy w `domain/`; komponent otrzymuje ją przez `input()` i nie modyfikuje |
| **warianty** | `@switch` po `kind` w szablonie; osobne komponenty prezentacyjne dla mocno różnych wariantów |
| **wynik operacji** | stan komendy w store (`idle / pending / done / rejected`); odrzucenie (409/422) jako komunikat, nie wyjątek |
| **agregat** | zwykle **na backendzie**; we froncie tylko gdy działa offline/lokalnie — klasa w `domain/`, store woła jej metody |
| **maszyna stanów** | unia stanów w signalu store'u; widok zależny od `computed` na stanie |
| **zdarzenie** | zdarzenia UI przez `output()`; zdarzenia domenowe z backendu (WebSocket/SSE) aktualizują read model w serwisie |
| **polityka** | czysta funkcja w `domain/`; wstrzykiwana tokenem (`InjectionToken`), gdy wariant zależy od konfiguracji |
| **specyfikacja / reguły** | czyste funkcje w `domain/` → `validate()` w schemacie Signal Forms, `ValidatorFn` lub `computed` |
| **repozytorium / port** | serwis danych (`@Service()`) z `HttpClient`/`httpResource`, mapujący DTO ↔ typy domenowe — **krawędź** funkcji |
| **read model** | `httpResource`/`resource` w store funkcji; widoki czytają przez `computed` |
| **moduł** | katalog funkcji (`features/<nazwa>/`) z trasą i publicznym `index.ts` (w Nx — biblioteka z tagami, tool-nx); `domain/` bez importów z `@angular/*` |

Przetestowane adaptery (Angular 22, `ngc` + `strictTemplates`): pipe `money`, pole cechy w Signal Forms i walidator
Reactive Forms z tej samej reguły, store z `@Service` + `httpResource` + stanem komendy, komponent wariantów Party:
`references/domain-adapters.md` (z odpowiednikami dla starszych wersji).

## Zależne od wersji
| Wersja | Zmiany istotne dla tego skilla |
|---|---|
| 17 | nowy control flow (`@if/@for/@switch`), `@defer`; builder `application` (esbuild); w 17.1–17.3 `input()`, `model()`, `output()` w developer preview |
| 18 | zoneless eksperymentalnie; `@let` (18.1); zdarzenia formularzy (`events`) w Reactive Forms |
| 19 | **standalone domyślne**; `input`/`output`/`model` i signal queries stabilne; `linkedSignal`, `resource`/`httpResource` (19.2) eksperymentalne; incremental hydration (preview); TS ≥5.5 <5.9 |
| 20 | stabilne `effect`, `linkedSignal`, `toSignal`; zoneless w developer preview; strukturalne `*ngIf/*ngFor/*ngSwitch` wycofane (deprecated); TS ≥5.8 <6.0 |
| 21 | **zoneless domyślnie** (Zone.js tylko przez `provideZoneChangeDetection()`); **Vitest domyślnym runnerem** (`await fixture.whenStable()`); **HttpClient dostępny domyślnie**; Signal Forms eksperymentalne (`@angular/forms/signals`); `@angular/aria` w preview; TS ≥5.9 <6.1 |
| 22 | **`OnPush` domyślnie** (`ChangeDetectionStrategy.Default` → `Eager`; migracja dodaje `Eager` tam, gdzie trzeba); **Signal Forms stabilne**; `resource`/`httpResource` stabilne; `@Service()`, `injectAsync()`, `debounced()`; HttpClient na Fetch API (`withFetch()` wycofane, `withXhr()` jako opcja); `?.` w szablonach zwraca `undefined` jak w TS; `strictTemplates` domyślnie; incremental hydration domyślnie; `canMatch` z trzecim parametrem; `paramsInheritanceStrategy: 'always'`; Webpack i builder `@angular-devkit/build-angular` wycofane; **TS ≥6.0 <6.1** (TS 7 nieobsługiwany — brak API kompilatora); Node ^22.22 / ^24.15 / ≥26 |

Odpowiedniki dla starszych wersji: `@Service()` → `@Injectable({ providedIn: 'root' })` (<22); `httpResource` →
serwis z `HttpClient` + `toSignal` (<19, eksperymentalne 19–21); Signal Forms → typowane Reactive Forms (<21, eksperymentalne w 21);
zoneless → Zone.js + `OnPush` (<20).

## Checklista
- [ ] wersja Angulara w projekcie sprawdzona; użyte API dostępne w tej wersji
- [ ] brak nowych `NgModule` i `*ngIf/*ngFor`
- [ ] `domain/` nie importuje `@angular/*`; mapowanie DTO → domena na krawędzi
- [ ] stany komend jawne (pending/rejected), konflikty obsłużone w UI
