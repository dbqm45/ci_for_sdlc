# Barrel Export

> **Spis treści:** Metadane · TLDR · Uwagi (stan 2026, poprawki względem źródła) · Problem · Rozwiązanie · Przykłady kodu · Zalety · Wady / tradeoffs · Powiązane wzorce · Kiedy używać / kiedy NIE używać

Źródło: frontendpatterns.dev/barrel-export („Aggregate Module Exports”).

## Metadane

- **Kategoria:** Fundamentals
- **Poziom:** Beginner
- **Przykłady:** Native web
- **Data aktualizacji:** September 22, 2025
- **Autor:** Den Odell

## TLDR

„Use index files to re-export modules from a single entry point, simplifying imports while being mindful of tree-shaking implications.”

## Uwagi (stan 2026, poprawki względem źródła)

- Barrel to naturalny **publiczny API modułu/slice'a** (FSD: `index.ts` każdego slice'a — fsd-screaming-architecture.md;
  granice wymusza lint, np. `eslint-plugin-boundaries`, Nx `enforce-module-boundaries` — tool-nx).
- Koszt 2026: duże barrele spowalniają dev server/testy (ładowanie całego grafu modułów) i utrudniają tree-shaking
  przy efektach ubocznych. Nie rób barrela „wszystkiego” w `shared/`; importuj z podmodułów
  (`shared/ui/button`), oznacz pakiety `"sideEffects": false`.
- W TS z `verbatimModuleSyntax`/`isolatedModules` re-eksport typów musi być jawny: `export type { X }` lub
  `export { type X }` (lang-typescript).

## Problem

Długie ścieżki importu typu `import { Button } from './components/atoms/buttons/Button/Button.tsx'` ujawniają całą wewnętrzną strukturę folderów, co uniemożliwia bezpieczną refaktoryzację (przeniesienie pliku łamie każdy import). Bez wyraźnych granic modułu konsumenci importują szczegóły implementacji, którymi nigdy nie zamierzano dzielić się publicznie.

## Rozwiązanie

Utwórz plik indeksowy w katalogu modułu, który re-eksportuje publiczny interfejs API tego modułu. Zamiast głębokiej ścieżki — `import { Button } from './components'`. Pozwala to reorganizować wnętrze folderu bez zmiany importów zewnętrznych i ustanawia jawną granicę tego, co jest publicznym API modułu.

## Przykłady kodu

### Podstawowy barrel

```javascript
// components/Button.js
export function Button(props) { /* ... */ }

// components/Input.js
export function Input(props) { /* ... */ }

// components/index.js - Barrel file
export { Button } from './Button';
export { Input } from './Input';

// Usage
import { Button, Input } from './components';
```

### Zagnieżdżony wzorzec barrel

```javascript
// components/forms/index.js
export { Input } from './Input';
export { TextArea } from './TextArea';

// components/buttons/index.js
export { PrimaryButton } from './PrimaryButton';

// components/index.js - Top-level barrel
export * from './forms';
export * from './buttons';

// Usage - Import from any level
import { Input } from './components/forms';
import { Input, PrimaryButton } from './components';
```

### Import przez namespace

```javascript
import * as Components from './components';

const button = <Components.Button label="Click me" />;
const { Button, Card } = Components;  // Can destructure
```

### Selektywne re-eksportowanie (bezpieczniejsze niż `export *`)

```javascript
// utils/dateUtils.js
export function parseDate(str) { /* ... */ }
export function _internalHelper(date) { /* ... */ }  // Internal

// utils/index.js - Selective exports (prefer over export *)
export { parseDate, formatDate } from './dateUtils';
export { capitalize, truncate } from './stringUtils';
// Internal helpers stay hidden
```

### Re-eksport typów w TypeScript

```typescript
// components/index.ts
export { Button, type ButtonProps } from './Button';
export { Input, type InputProps } from './Input';

// Usage
import { Button, type ButtonProps } from './components';
```

## Zalety

- Czystsze importy zamiast długich, głębokich ścieżek.
- Łatwiejsza refaktoryzacja — pliki wewnątrz modułu można swobodnie przenosić bez łamania importów zewnętrznych.
- Jawne publiczne API modułu — barrel decyduje, co jest eksponowane, co pozostaje wewnętrzne.
- Hierarchiczna organizacja skoncentrowana na granicach modułów, nie na fizycznej lokalizacji plików.

## Wady / tradeoffs

- **Tree-shaking:** „Using `export *` can prevent bundlers from eliminating unused code” — barrel z `export *` bywa gorszy dla rozmiaru bundla niż bezpośrednie importy.
- Konieczność aktualizowania pliku barrel przy każdym nowym eksporcie modułu — dodatkowy krok do pamiętania.
- Trudniejsze śledzenie, z którego pliku faktycznie pochodzi dany eksport (jedna warstwa indirekcji więcej).
- Ryzyko zależności cyklicznych, gdy dwa barrel eksportują z siebie nawzajem.

## Powiązane wzorce

- ES6 Modules — MDN.
- Tree Shaking and Barrel Files — Webpack docs.
- Module Systems — javascript.info.

## Kiedy używać / kiedy NIE używać

Używaj barrel exportów dla **granic publicznego API** — np. cały folder `components/` albo `utils/`, żeby konsument importował z jednego, stabilnego miejsca, nie z głębokiej ścieżki wewnętrznej.

Nie używaj `export *` bezmyślnie na dużych modułach w projekcie z wrażliwym na rozmiar bundlem — preferuj selektywne, nazwane re-eksporty (`export { X, Y } from './plik'`), które bundler łatwiej przeanalizuje pod tree-shaking. Jeśli projekt nie ma realnego problemu z rozmiarem bundla (np. mały, wewnętrzny skrypt), różnica jest nieistotna — nie optymalizuj tego z góry bez powodu (YAGNI, patrz `../principles.md`).
