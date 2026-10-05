# Props and Attributes

> **Spis treści:** Metadane · TLDR · Uwagi (stan 2026, poprawki względem źródła) · Problem · Rozwiązanie · Przykłady kodu · Zalety · Wady / tradeoffs · Powiązane wzorce · Kiedy używać / kiedy NIE używać

Źródło: frontendpatterns.dev/props-and-attributes.

## Metadane

- **Kategoria:** Components
- **Poziom:** Beginner
- **Przykłady:** React, Vue, Svelte, Native web
- **Data aktualizacji:** September 26, 2025
- **Autor:** Den Odell

## TLDR

„Pass data into components through props to create flexible, reusable building blocks configured from the outside.”

## Uwagi (stan 2026, poprawki względem źródła)

- Odpowiedniki API wejść: React props; Vue `defineProps`/`defineEmits`; Svelte 5 `$props()`; Angular (fw-angular)
  `input()`/`input.required()`/`output()`/`model()`; Web Components — atrybuty (stringi) + właściwości JS.
- Gdy boolowskich wariantów przybywa, zamiast kolejnych flag użyj unii (`variant: 'primary' | 'danger'`) albo
  kompozycji (children/sloty/compound components — components/compound-components.md).
- Przykład Web Components poprawiony: `label` z atrybutu trafiał do `innerHTML` (XSS) — teraz `textContent`.
- Przykłady Svelte to składnia Svelte 4 (`export let`, `$:`, `on:click`, `<slot>`); w Svelte 5: `$props()`, `$state`,
  `$derived`, `$effect`, atrybuty `onclick`, snippety zamiast slotów.

## Problem

Bez propsów powstaje wiele niemal identycznych duplikatów komponentów (`SubmitButton.tsx`, `CancelButton.tsx` itd.) z zahardkodowanymi wartościami wewnątrz. Testowanie staje się trudne, bo nie da się podać innych danych z zewnątrz — trzeba edytować sam komponent.

## Rozwiązanie

Przekazuj dane z zewnątrz przez propsy, zamiast wkodowywać je w komponent. Propsy mogą być stringami, liczbami, obiektami, tablicami, funkcjami (callbackami). Ustawiaj sensowne wartości domyślne i używaj TypeScript, żeby kontrakt komponentu był jawny i sprawdzany statycznie.

## Przykłady kodu

### React — Basic Props

```javascript
function Button({ label, onClick, disabled = false, variant = 'primary', size = 'medium', icon = null }) {
  return (
    <button
      className={`btn btn-${variant} btn-${size}`}
      onClick={onClick}
      disabled={disabled}
    >
      {icon && <span className="btn-icon">{icon}</span>}
      {label}
    </button>
  );
}

<Button label="Submit" onClick={handleSubmit} />
<Button label="Cancel" onClick={handleCancel} variant="secondary" />
<Button label="Delete" onClick={handleDelete} variant="danger" disabled={loading} />
```

### Vue

```vue
<script setup>
const props = defineProps({
  label: { type: String, required: true },
  disabled: { type: Boolean, default: false },
  variant: { type: String, default: 'primary' },
  size: { type: String, default: 'medium' }
});
const emit = defineEmits(['click']);
</script>

<template>
  <button
    :class="`btn btn-${variant} btn-${size}`"
    :disabled="disabled"
    @click="emit('click')"
  >
    {{ label }}
  </button>
</template>
```

### Svelte

```svelte
<script>
  export let label;
  export let disabled = false;
  export let variant = 'primary';
  export let size = 'medium';
</script>

<button class={`btn btn-${variant} btn-${size}`} {disabled} on:click>
  {label}
</button>
```

### Web Components

```javascript
class Button extends HTMLElement {
  static get observedAttributes() { return ['label', 'disabled', 'variant']; }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._onClick = null;
  }

  connectedCallback() {
    this.render();
    this.shadowRoot.querySelector('button').addEventListener('click', () => {
      if (this._onClick) this._onClick();
      this.dispatchEvent(new CustomEvent('button-click'));
    });
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue !== newValue) this.render();
  }

  set onClick(handler) { this._onClick = handler; }

  render() {
    const label = this.getAttribute('label') || 'Button';
    const disabled = this.hasAttribute('disabled');
    const variant = this.getAttribute('variant') || 'primary';
    const button = document.createElement('button');
    button.className = `btn btn-${variant}`;
    button.disabled = disabled;
    button.textContent = label; // attribute values are untrusted text
    this.shadowRoot.replaceChildren(button);
  }
}
customElements.define('custom-button', Button);
```

### Props spreading

```javascript
function Card({ title, children, className, ...rest }) {
  return (
    <div className={`card ${className || ''}`} {...rest}>
      <h2>{title}</h2>
      <div className="card-content">{children}</div>
    </div>
  );
}

<Card title="User Profile" className="profile-card" data-testid="profile-card">
  <UserDetails />
</Card>
```

### TypeScript props

```typescript
interface ButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
}

function Button({ label, onClick, disabled = false, variant = 'primary' }: ButtonProps) {
  return (
    <button className={`btn btn-${variant}`} onClick={onClick} disabled={disabled}>
      {label}
    </button>
  );
}
```

### Props z children

```javascript
function Card({ title, footer, children }) {
  return (
    <div className="card">
      {title && <div className="card-header"><h3>{title}</h3></div>}
      <div className="card-body">{children}</div>
      {footer && <div className="card-footer">{footer}</div>}
    </div>
  );
}

<Card title="User Profile" footer={<Button label="Save" />}>
  <UserForm />
</Card>
```

## Zalety

- Jeden komponent, nieskończona liczba konfiguracji/zastosowań.
- Testowanie staje się proste — podajesz różne propsy, sprawdzasz różne wyjścia.
- Komponenty da się ponownie użyć w różnych projektach bez modyfikacji.
- Kompatybilność z narzędziami typu Storybook (każda kombinacja propsów = osobna „story”).
- TypeScript łapie błędy typów propsów na etapie kompilacji, nie w runtime.
- Logika konfiguracji jest scentralizowana w jednym miejscu (definicji propsów), nie rozproszona po kopiach komponentu.

## Wady / tradeoffs

- „Eksplozja propsów” — komponent z czasem może wymagać wielu, wielu właściwości.
- Warunkowa logika renderowania w zależności od kombinacji propsów kumuluje się.
- Prop drilling — przekazywanie danych przez wiele warstw komponentów pośrednich, które sam ich nie używają.
- Wartości domyślne mogą maskować błędy (brakujący, wymagany prop przechodzi niezauważony).
- Boolowskie propsy (`disabled`, `active`, `loading`...) w dużej liczbie są trudne do czytania w wywołaniu komponentu.
- Spreading propsów (`{...rest}`) gubi precyzyjne typowanie tego, co faktycznie jest przekazywane.
- Atrybuty Web Components obsługują natywnie tylko stringi — złożone dane (obiekty, funkcje) wymagają właściwości JS (`set onClick`), nie atrybutów HTML.
- Duża liczba propsów/kombinacji oznacza eksponencjalną liczbę scenariuszy do przetestowania.

## Powiązane wzorce

- [ARIA Roles and Attributes](fe-web-platform/references/accessibility/aria-roles-and-attributes.md) — Accessibility.
- [Semantic HTML](fe-web-platform/references/accessibility/semantic-html.md) — Fundamentals.
- HTML Attributes — MDN.
- Passing Props — React docs.
- Props — Vue docs.
- Props — Svelte docs.

## Kiedy używać / kiedy NIE używać

Używaj propsów do każdej wartości, która może się różnić między użyciami komponentu — to jest dosłownie podstawa architektury komponentowej (patrz „Component-Driven Architecture” w `../principles.md`), nie opcjonalna technika.

Gdy liczba propsów zaczyna rosnąć bez końca (10+, wiele boolowskich flag kombinowanych ze sobą) — to sygnał, że komponent robi za wiele naraz; rozważ rozbicie na mniejsze komponenty (patrz [Single Responsibility](../fundamentals/single-responsibility.md)) albo grupowanie powiązanych propsów w jeden obiekt konfiguracyjny, zamiast dodawać kolejny płaski prop.
