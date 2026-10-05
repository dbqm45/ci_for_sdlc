# CSS Modules & Scoped Styles

> **Spis treści:** Metadane · TLDR · Uwagi (stan 2026, poprawki względem źródła) · Problem · Rozwiązanie · Przykłady kodu · Zalety · Wady / tradeoffs · Powiązane wzorce · Kiedy używać / kiedy NIE używać

Źródło: frontendpatterns.dev/css-modules-and-scoped-styles.

## Metadane

- **Kategoria:** Styling
- **Poziom:** Beginner
- **Przykłady frameworków:** React, Vue, Svelte, Native web
- **Data aktualizacji:** 13 grudnia 2025
- **Autor:** Den Odell

## TLDR

„Scope styles to components by generating unique class names at build time, preventing conflicts
without runtime overhead.”

## Uwagi (stan 2026, poprawki względem źródła)

- Mechanizmy izolacji w frameworkach: Angular — `ViewEncapsulation.Emulated` (domyślnie, atrybuty `_ngcontent-*`),
  `ShadowDom`, `None`; `:host`, `::ng-deep` jest przestarzałe (fw-angular). Vue `scoped`/`module`; Svelte — domyślnie;
  Web Components — Shadow DOM + `::part()`.
- Natywna alternatywa bez buildu: **`@scope (.card) to (.card__content) { … }`** — Baseline od końca 2025 (wszystkie
  główne silniki); z kaskadowymi warstwami `@layer` (reset, tokens, components, utilities) rozwiązuje większość
  kolizji bez generowanych nazw.
- Wartości w przykładach (`blue`, `10px`, `#1a1a1a`) to ilustracja — w projekcie wyłącznie tokeny (SKILL.md).
- Motyw: przełączaj tokeny na `:root`/`[data-theme]` i używaj `light-dark()` + `color-scheme`, zamiast klas
  motywu z modułu.
- Svelte: przykład w składni Svelte 4 (`export let`); w Svelte 5 `let { variant = 'primary' } = $props()`.
  Vue: przykład `$style` w Options API — w `<script setup>` użyj `useCssModule()`.
- Typy dla CSS Modules: Vite/TS — `vite/client` daje ogólny typ; dokładne klucze generuje np. `typed-css-modules`
  lub wtyczka TS (lang-typescript).

## Problem

Globalny namespace CSS tworzy konflikty między zespołami i bibliotekami — dwie różne osoby (albo
osoba i biblioteka komponentów) mogą nazwać klasę `.header`. Autor opisuje sytuację, w której zmiana
`.button` w jednym miejscu złamała padding przycisku w zupełnie innym obszarze aplikacji. Konwencja
BEM (`.component-name__element-name--modifier`) łagodzi problem, ale wymaga dyscypliny całego
zespołu i w praktyce robi się długa/verbose.

## Rozwiązanie

Narzędzia działające w czasie budowania automatycznie transformują czytelne nazwy klas w unikalne
identyfikatory — `.button` staje się `.Button_button__a1b2c3`. Styl importuje się jako moduł
JavaScript: `import styles from './Button.module.css'`. Vue robi to atrybutami `data-v-*`, Svelte
generuje unikalne klasy przy kompilacji. „When you genuinely need global styles, use `:global()`
selectors.”

## Przykłady kodu

### Basic Scoped Styles — React

```javascript
/* Button.module.css */
.button {
  padding: 10px;
  border-radius: 4px;
}

.primary { background: blue; }
.secondary { background: gray; }
.large { padding: 16px; font-size: 18px; }

import styles from './Button.module.css';

function Button({ variant = 'primary', size = 'normal', children }) {
  const className = [
    styles.button,
    styles[variant],
    size === 'large' && styles.large
  ].filter(Boolean).join(' ');

  return <button className={className}>{children}</button>;
}
```

### Basic Scoped Styles — Vue (Scoped)

```vue
<template>
  <button class="button primary">Click me</button>
</template>

<style scoped>
/* Vue adds data-v-xxx attribute to scope these rules */
.button { padding: 10px; }
.primary { background: blue; }

/* Deep selector affects child components */
.button :deep(.icon) { margin-right: 8px; }
</style>
```

### Basic Scoped Styles — Vue (CSS Modules)

```vue
<template>
  <button :class="$style.button">Click me</button>
</template>

<style module>
.button { background: blue; padding: 10px; }
</style>

<script>
export default {
  mounted() {
    console.log(this.$style.button); // "button_1a2b3c"
  }
}
</script>
```

### Basic Scoped Styles — Svelte

```svelte
<script>
  export let variant = 'primary';
</script>

<button class="button {variant}">Click me</button>

<style>
  /* Svelte scopes these automatically */
  .button { padding: 10px; border-radius: 4px; }
  .primary { background: blue; }
  .secondary { background: gray; }

  :global(body) { margin: 0; }
</style>
```

### Composition

```css
/* shared.module.css */
.baseButton { padding: 10px; border: none; border-radius: 4px; cursor: pointer; }

/* Button.module.css */
.button {
  composes: baseButton from './shared.module.css';
  background: blue;
}

.iconButton {
  composes: baseButton from './shared.module.css';
  background: transparent;
}
```

```javascript
import styles from './Button.module.css';

<button className={styles.button}>Primary</button>
<button className={styles.iconButton}>Icon</button>
```

### Global Styles

```css
/* App.module.css */
:global(.legacy-class) { color: red; }

.container { padding: 20px; }
.container :global(.legacy-component) { margin: 10px; }
```

### TypeScript Support

```typescript
// Button.module.css.d.ts (auto-generated or manual)
declare const styles: {
  readonly button: string;
  readonly primary: string;
};
export default styles;

import styles from './Button.module.css';

<button className={styles.button}>Click</button>
<button className={styles.nonexistent}>Error</button> // TS error
```

### Dynamic Classes with classnames

```javascript
import styles from './Button.module.css';
import classNames from 'classnames';

function Button({ variant, size, disabled, children }) {
  const buttonClass = classNames(styles.button, styles[variant], {
    [styles.large]: size === 'large',
    [styles.disabled]: disabled
  });
  return <button className={buttonClass}>{children}</button>;
}
```

### Theming with CSS Variables

```css
/* theme.module.css */
.light { --primary: blue; --bg: white; }
.dark { --primary: lightblue; --bg: #1a1a1a; }
```

```javascript
import theme from './theme.module.css';
import styles from './Button.module.css';

function App({ isDark }) {
  return (
    <div className={isDark ? theme.dark : theme.light}>
      <button className={styles.button}>Themed</button>
    </div>
  );
}
```

### Build Tool Configuration

```javascript
// webpack.config.js
module.exports = {
  module: {
    rules: [{
      test: /\.module\.css$/,
      use: ['style-loader', {
        loader: 'css-loader',
        options: { modules: { localIdentName: '[name]__[local]___[hash:base64:5]' } }
      }]
    }]
  }
};

// vite.config.js
export default {
  css: {
    modules: { localsConvention: 'camelCase', generateScopedName: '[name]__[local]___[hash:base64:5]' }
  }
};
```

## Zalety

- Konflikty nazw znikają całkowicie — bez ręcznej konwencji nazewniczej.
- Izolacja wymuszana przez narzędzia, nie przez dyscyplinę zespołu (jak w BEM).
- Zerowy koszt runtime — wszystko rozstrzyga się na etapie budowania.
- To zwykła składnia CSS — brak nowego języka do nauki.
- Bezpieczniejsza refaktoryzacja dzięki jawnym, importowanym zależnościom.
- Łatwiej znaleźć martwy kod — nieużywany moduł CSS jest widoczny.
- `:global()` pozwala świadomie wyjść poza izolację, gdy trzeba (integracja z bibliotekami trzecimi).

## Wady / tradeoffs

- DevTools pokazuje wygenerowane, nieczytelne nazwy klas (`Button_button__a1b2c3`) — utrudnia
  debugowanie bez source maps.
- Współdzielenie stylów między modułami wymaga jawnej kompozycji (`composes`).
- Style w pełni dynamiczne są trudne — CSS Modules są statyczne; potrzebne CSS custom properties albo
  inline style.
- Wymaga konfiguracji narzędzia budowania (Webpack, Vite, Parcel).
- Frameworki CSS (Bootstrap, Material UI) zakładają globalne klasy — potrzeba wrapperów `:global()`.
- Konkatenacja wielu klas robi się verbose — potrzebne template literale albo helper (`classnames`).
- Wsparcie TypeScript wymaga wygenerowanych/ręcznych deklaracji typów dla modułów CSS.

## Powiązane wzorce

- CSS Modules — repozytorium GitHub.
- CSS Modules Specification — CSS-Tricks.
- Scoped CSS — oficjalna dokumentacja Vue.js.

## Kiedy używać / kiedy NIE używać

Używaj domyślnie w każdym projekcie komponentowym z realnym ryzykiem kolizji nazw CSS (więcej niż
jeden zespół/biblioteka w tej samej bazie stylów) — to niski koszt za pełną izolację bez runtime
overhead. **Nie** jest to jedyna droga: dla bardzo małych, jednoosobowych projektów albo dla stylów
z natury globalnych (reset, design tokens, theme) prostszy, jeden globalny arkusz CSS może być
wystarczający — nie wprowadzaj build-time tooling tylko po to, żeby „robić to poprawnie”, jeśli
problem kolizji nazw w praktyce nie występuje (YAGNI — eng-design-principles).
