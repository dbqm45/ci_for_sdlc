# Focus Trap

> **Spis treści:** Metadane · TLDR · Uwagi (stan 2026, poprawki względem źródła) · Problem · Rozwiązanie · Przykłady kodu · Zalety · Wady / tradeoffs · Powiązane wzorce · Kiedy używać / kiedy NIE używać

Źródło: frontendpatterns.dev/focus-trap (Den Odell, aktualizacja 7 października 2025).

## Metadane

- **Kategoria:** Accessibility
- **Poziom:** Beginner
- **Przykłady:** Vue, Native web (React w przykładach kodu też się pojawia)

## TLDR

„Trap keyboard focus inside modals and dialogs by cycling Tab through interactive elements and
preventing escape to background content.”

## Uwagi (stan 2026, poprawki względem źródła)

- **Pierwszy wybór 2026: `<dialog>` z `showModal()`** — przeglądarka sama robi tło inertnym (także dla czytników),
  obsługuje Escape (`cancel`) i przywraca fokus. Ręczny trap tylko dla niestandardowych nakładek.
- Atrybut `inert` wystarcza sam — ukrywa też przed technologiami wspomagającymi; dokładanie `aria-hidden="true"`
  na tym samym kontenerze jest zbędne.
- Selektor „fokusowalnych” z przykładów pomija m.in. `[contenteditable]`, `summary`, `audio[controls]` i nie
  wyklucza `disabled`/ukrytych — biblioteki (`focus-trap`, `tabbable`, Angular CDK `cdkTrapFocus`) robią to poprawnie.
- `focus-trap-react` od v10: element-dziecko musi przyjmować ref; opcja `active`/`paused` do zagnieżdżeń.

## Problem

Użytkownicy klawiatury, naciskając Tab, mogą opuścić modal i trafić do zawartości w tle — mimo że
wizualnie tło jest zaciemnione/przysłonięte. Czytniki ekranu dodatkowo „głoszą” tę tłową zawartość,
tworząc niezgodność między tym, co widać (tylko modal), a tym, co jest faktycznie dostępne dla
technologii wspomagających (cała strona).

## Rozwiązanie

Przechwycić `Tab` i `Shift+Tab`, żeby cyklicznie kierować fokus między pierwszym a ostatnim
interaktywnym elementem modala. Implementacja wymaga:
- znalezienia wszystkich fokusowalnych elementów wewnątrz modala,
- śledzenia, który jest pierwszy, a który ostatni,
- nasłuchiwania `Tab`, żeby przekierować fokus na granicach,
- dodania `aria-modal="true"`,
- rozważenia atrybutu `inert` dla treści w tle,
- zapewnienia oczywistego wyjścia (`Escape`, widoczny przycisk „Close”).

## Przykłady kodu

### Podstawowa implementacja — React

```javascript
function Modal({ children, onClose }) {
  const modalRef = useRef();

  useEffect(() => {
    if (!modalRef.current) return;

    const focusableElements = modalRef.current.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    const trapFocus = (e) => {
      if (e.key === 'Tab') {
        if (e.shiftKey && document.activeElement === firstElement) {
          lastElement.focus();
          e.preventDefault();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          firstElement.focus();
          e.preventDefault();
        }
      }
      if (e.key === 'Escape') onClose();
    };

    modalRef.current.addEventListener('keydown', trapFocus);
    firstElement?.focus();

    return () => modalRef.current?.removeEventListener('keydown', trapFocus);
  }, [onClose]);

  return (
    <div ref={modalRef} role="dialog" aria-modal="true">
      {children}
    </div>
  );
}
```

### Podstawowa implementacja — Vue

```vue
<template>
  <div v-if="isOpen" ref="modalRef" role="dialog" aria-modal="true" @keydown="handleKeydown">
    <h2 ref="firstFocusable" tabindex="-1">Modal Title</h2>
    <slot />
    <button @click="$emit('close')">Close</button>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';

const props = defineProps(['isOpen']);
const emit = defineEmits(['close']);
const modalRef = ref(null);
const firstFocusable = ref(null);

const handleKeydown = (e) => {
  if (e.key === 'Escape') { emit('close'); return; }
  if (e.key !== 'Tab') return;

  const focusable = modalRef.value.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  const first = focusable[0], last = focusable[focusable.length - 1];

  if (e.shiftKey && document.activeElement === first) {
    last.focus(); e.preventDefault();
  } else if (!e.shiftKey && document.activeElement === last) {
    first.focus(); e.preventDefault();
  }
};

watch(() => props.isOpen, (isOpen) => { if (isOpen) firstFocusable.value?.focus(); });
</script>
```

### Podstawowa implementacja — Web Components

```javascript
class FocusTrapDialog extends HTMLElement {
  connectedCallback() {
    this.attachShadow({ mode: 'open' });
    this.render();
    this.setupFocusTrap();
  }

  setupFocusTrap() {
    const selector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

    this.addEventListener('keydown', (e) => {
      const focusable = this.shadowRoot.querySelectorAll(selector);
      const first = focusable[0], last = focusable[focusable.length - 1];

      if (e.key === 'Tab') {
        if (e.shiftKey && document.activeElement === first) {
          last.focus(); e.preventDefault();
        } else if (!e.shiftKey && document.activeElement === last) {
          first.focus(); e.preventDefault();
        }
      }
      if (e.key === 'Escape') this.close();
    });

    this.shadowRoot.querySelector(selector)?.focus();
  }

  close() { this.dispatchEvent(new CustomEvent('close')); }

  render() {
    this.shadowRoot.innerHTML = `
      <div role="dialog" aria-modal="true">
        <h2>Dialog Title</h2>
        <slot></slot>
        <button id="close-btn">Close</button>
      </div>
    `;
    this.shadowRoot.getElementById('close-btn').addEventListener('click', () => this.close());
  }
}

customElements.define('focus-trap-dialog', FocusTrapDialog);
```

### Focus trap z `inert` na tle

```javascript
function Modal({ isOpen, onClose, children }) {
  const previousFocusRef = useRef();

  useEffect(() => {
    const mainContent = document.querySelector('#root');
    if (isOpen) {
      previousFocusRef.current = document.activeElement;
      mainContent?.setAttribute('inert', '');
      mainContent?.setAttribute('aria-hidden', 'true');
    } else {
      mainContent?.removeAttribute('inert');
      mainContent?.removeAttribute('aria-hidden');
      previousFocusRef.current?.focus();
    }
    return () => {
      mainContent?.removeAttribute('inert');
      mainContent?.removeAttribute('aria-hidden');
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <FocusTrap>
      <div role="dialog" aria-modal="true">
        <h2>Modal Title</h2>
        {children}
        <button onClick={onClose}>Close</button>
      </div>
    </FocusTrap>
  );
}
```

### Użycie biblioteki `focus-trap-react`

```javascript
import FocusTrap from 'focus-trap-react';

function Modal({ isOpen, onClose, children }) {
  if (!isOpen) return null;

  return (
    <FocusTrap focusTrapOptions={{
      initialFocus: '#modal-title',
      escapeDeactivates: true,
      returnFocusOnDeactivate: true
    }}>
      <div role="dialog" aria-modal="true">
        <h2 id="modal-title">Modal Title</h2>
        {children}
        <button onClick={onClose}>Close</button>
      </div>
    </FocusTrap>
  );
}
```

**Uwaga ze źródła o zagnieżdżonych modalach:** „For nested modals like confirmation dialogs inside
settings panels, set `active={false}` on the parent trap when the child opens to transfer focus
control.”

## Zalety

- Zachowanie klawiatury odpowiada zachowaniu wizualnemu (co widać jako niedostępne, jest też
  niedostępne dla Tab).
- Użytkownicy nie mogą przypadkowo aktywować ukrytej zawartości w tle.
- To jest wymóg WCAG dla modalnych dialogów, nie opcjonalne udoskonalenie.
- Użytkownicy pozostają zorientowani w kontekście modala, nie „gubią się” w treści pod nim.

## Wady / tradeoffs

- Śledzenie fokusowalnych elementów jest złożone — elementy disabled, `tabindex="-1"`, elementy
  ukryte, zwinięte kontenery wszystkie wymagają uwzględnienia.
- Dynamiczna zawartość łamie trap, gdy elementy pojawiają się/znikają po jego ustawieniu.
- Zagnieżdżone modale wymagają starannej koordynacji (patrz uwaga o `active={false}` wyżej).
- Wirtualne kursory czytników ekranu mogą czasem „uciec” z trapu mimo prawidłowej implementacji.
- Atrybut `inert` ma już pełne wsparcie w przeglądarkach i jest **preferowanym** sposobem blokowania
  tła — prostszy niż ręczne zarządzanie `aria-hidden` + focus trap równocześnie.
- Biblioteki (np. `focus-trap-react`) dodają wagę do bundla.
- Testowanie wymaga realnej technologii wspomagającej, nie tylko testów jednostkowych.

## Powiązane wzorce

- [Focus Management](focus-management.md) — Accessibility
- [Keyboard Navigation](keyboard-navigation.md) — Accessibility
- [ARIA Roles and Attributes](aria-roles-and-attributes.md) — Accessibility
- [Focus Trap Pattern — W3C APG](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
- [focus-trap Library — GitHub](https://github.com/focus-trap/focus-trap)
- [Modal Dialog Accessibility — W3C](https://www.w3.org/WAI/ARIA/apg/patterns/dialogmodal/)

## Kiedy używać / kiedy NIE używać

Używaj **zawsze** przy modalach/dialogach blokujących resztę strony — to wymóg WCAG, nie
opcja. Jeśli przeglądarki docelowe wspierają atrybut `inert` (dziś praktycznie wszystkie nowoczesne)
— **preferuj `inert` na kontenerze tła** nad ręcznym pisaniem focus trapu od zera; to prostszy,
natywny mechanizm robiący to samo z mniejszym ryzykiem błędu (mniej kodu do utrzymania = mniej
miejsc na bug, zgodnie z KISS — eng-design-principles). Pisz własny trap ręcznie tylko, gdy
potrzebujesz zachowania, którego `inert` nie daje (np. subtelnie inny zakres blokady), albo gdy
wsparcie przeglądarek docelowych tego wymaga.
