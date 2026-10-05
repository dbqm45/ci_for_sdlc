# Focus Management

> **Spis treści:** Metadane · TLDR · Uwagi (stan 2026, poprawki względem źródła) · Problem · Rozwiązanie · Przykłady kodu · Zalety · Wady / tradeoffs · Powiązane wzorce · Kiedy używać / kiedy NIE używać

Źródło: frontendpatterns.dev/focus-management (Den Odell, aktualizacja 2 października 2025).

## Metadane

- **Kategoria:** Accessibility
- **Poziom:** Beginner
- **Przykłady:** React, Vue

## TLDR

„Move focus programmatically after route changes, modal opens, and dynamic content updates so
keyboard users always know where they are.”

## Uwagi (stan 2026, poprawki względem źródła)

- **Natywny `<dialog>` + `showModal()`** sam przenosi fokus do dialogu (lub elementu z `autofocus`), blokuje tło
  (top layer, reszta strony inert), zamyka się Escape i przywraca fokus po zamknięciu — preferuj go zamiast
  ręcznego zarządzania z przykładów (focus-trap.md).
- Po nawigacji SPA: fokus na `<h1>` nowego widoku (`tabindex="-1"`) + aktualizacja `document.title`; routery
  czasem robią to same (Angular/React Router nie — trzeba dodać).
- Przykład „usunięcie z listy” używa `setTimeout(…, 0)` — w React 19 czytelniej: `flushSync` albo efekt po
  aktualizacji listy; w Angularze `afterNextRender`.
- Kolory skip linku i obramowania fokusu bierz z tokenów (fe-css); wskaźnik fokusu z kontrastem ≥ 3:1 (1.4.11),
  niezasłonięty przez przyklejone nagłówki (2.4.11, WCAG 2.2) — wcag-levels.md.
- Przykład „Focus trap wewnątrz dialogu” ma pełną wersję w focus-trap.md.

## Problem

- Otwarcie modala nie przenosi fokusu — użytkownik zostaje na przycisku pod nakładką.
- Nawigacja na nową stronę (SPA) zostawia fokus na klikniętym linku — trzeba przejść przez 30+
  elementów, żeby dotrzeć do nowej treści.
- Usunięcie elementu z listy gubi fokus albo przeskakuje do paska adresu przeglądarki.
- Rozwinięcie akordeonu zostawia fokus na triggerze, nie na nowo pokazanej treści.

## Rozwiązanie

Zasada podstawowa: **przenieś fokus programowo**, gdy interfejs zmienia się w sposób wpływający na
następną interakcję użytkownika.

**Kluczowe praktyki:**
- Otwarcie modala → przenieś fokus do niego.
- Zamknięcie modala → przywróć fokus na element, który go otworzył.
- Nawigacja SPA → skieruj fokus na nagłówek nowej strony.
- Usunięcie elementu z listy → przenieś fokus na następny element (albo poprzedni, jeśli usunięty był
  ostatni).
- Ważne powiadomienia → rozważ przeniesienie fokusu (albo live region — patrz `live-regions.md`).

**Podejście techniczne:** `element.focus()` do programowego przenoszenia; `tabindex="-1"` na
elementach, które mają być fokusowalne programowo, ale nie przez Tab (nagłówki, kontenery);
zapamiętanie wcześniej fokusowanego elementu przed otwarciem nakładki.

## Przykłady kodu

### Zarządzanie fokusem w modalu — Web Components

```javascript
class Modal extends HTMLElement {
  constructor() {
    super();
    this.previouslyFocusedElement = null;
  }

  set open(value) {
    this._open = value;
    if (value) {
      this.previouslyFocusedElement = document.activeElement;
      this.render();
      this.querySelector('[role="dialog"]')?.focus();
    } else {
      this.previouslyFocusedElement?.focus();
      this.previouslyFocusedElement = null;
    }
  }

  render() {
    if (this._open) {
      this.innerHTML = `
        <div role="dialog" aria-modal="true" tabindex="-1">
          <h2>Modal Title</h2>
          <button class="close">Close</button>
        </div>
      `;
      this.querySelector('.close').addEventListener('click', () => {
        this.open = false;
      });
    }
  }
}
customElements.define('modal-dialog', Modal);
```

### Zarządzanie fokusem w modalu — React

```javascript
import { useEffect, useRef } from 'react';

function Modal({ isOpen, onClose, children }) {
  const dialogRef = useRef(null);
  const previousFocusRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement;
      dialogRef.current?.focus();
    } else {
      previousFocusRef.current?.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div role="dialog" aria-modal="true" ref={dialogRef} tabIndex={-1}>
      {children}
      <button onClick={onClose}>Close</button>
    </div>
  );
}
```

### Zarządzanie fokusem w modalu — Vue

```vue
<script setup>
import { ref, watch, nextTick } from 'vue';

const isModalOpen = ref(false);
const modalRef = ref(null);
let previouslyFocusedElement = null;

const openModal = () => {
  previouslyFocusedElement = document.activeElement;
  isModalOpen.value = true;
};

const closeModal = () => {
  isModalOpen.value = false;
  previouslyFocusedElement?.focus();
};

watch(isModalOpen, async (isOpen) => {
  if (isOpen) {
    await nextTick();
    modalRef.value?.focus();
  }
});
</script>

<template>
  <button @click="openModal">Open Modal</button>
  <div v-if="isModalOpen" ref="modalRef" role="dialog" tabindex="-1">
    <button @click="closeModal">Close</button>
  </div>
</template>
```

### Fokus po zmianie trasy (React Router)

```javascript
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

function App() {
  const location = useLocation();
  const mainContentRef = useRef(null);

  useEffect(() => {
    mainContentRef.current?.focus();
  }, [location.pathname]);

  return (
    <main>
      <h1 ref={mainContentRef} tabIndex={-1}>
        {getPageTitle(location.pathname)}
      </h1>
      <Routes>{/* routes */}</Routes>
    </main>
  );
}
```

### Skip link

```html
<a href="#main-content" class="skip-link">Skip to main content</a>
<nav><!-- Navigation --></nav>
<main id="main-content" tabindex="-1"><!-- Content --></main>

<style>
  .skip-link {
    position: absolute;
    top: -40px;
    left: 0;
    padding: 8px;
    background: #000;
    color: white;
  }
  .skip-link:focus { top: 0; }
</style>
```

### Fokus po usunięciu elementu z listy

```javascript
function TodoList({ items, onDelete }) {
  const itemRefs = useRef({});

  const handleDelete = (id, index) => {
    onDelete(id);
    const nextIndex = index < items.length - 1 ? index : index - 1;
    const nextItem = items[nextIndex];
    if (nextItem) {
      setTimeout(() => itemRefs.current[nextItem.id]?.focus(), 0);
    }
  };

  return (
    <ul>
      {items.map((item, index) => (
        <li key={item.id} ref={el => itemRefs.current[item.id] = el} tabIndex={-1}>
          {item.text}
          <button onClick={() => handleDelete(item.id, index)}>Delete</button>
        </li>
      ))}
    </ul>
  );
}
```

### Focus trap wewnątrz dialogu

```javascript
function Dialog({ children }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const handleTab = (e) => {
      if (e.key !== 'Tab') return;

      const focusable = dialogRef.current.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        last.focus();
        e.preventDefault();
      } else if (!e.shiftKey && document.activeElement === last) {
        first.focus();
        e.preventDefault();
      }
    };

    document.addEventListener('keydown', handleTab);
    return () => document.removeEventListener('keydown', handleTab);
  }, []);

  return <div role="dialog" ref={dialogRef}>{children}</div>;
}
```

### Stylowanie widocznego fokusu

```css
*:focus-visible {
  outline: 2px solid #0066cc;
  outline-offset: 2px;
}
```

## Zalety

- Użytkownicy klawiatury pozostają zorientowani — logiczne przeniesienie fokusu.
- Zgodność z WCAG 2.4.3 (Focus Order) — to nie jest opcjonalne wymaganie.
- Czytniki ekranu ogłaszają zawartość, gdy fokus się do niej przenosi.
- Modale stają się realnie użyteczne dla użytkowników klawiatury.
- Konsystentne wzorce budują „mięśniową pamięć” u użytkowników korzystających z wielu podobnych
  aplikacji.

## Wady / tradeoffs

- **Nieprawidłowe umieszczenie fokusu jest gorsze niż jego brak** — dezorientuje bardziej niż
  pozostawienie domyślnego zachowania.
- Określenie „prawidłowego” celu fokusu wymaga starannego przemyślenia dla każdego przypadku.
- Asynchroniczne aktualizacje DOM komplikują proces — element, do którego chcesz przenieść fokus,
  może jeszcze nie istnieć w momencie wywołania `.focus()`.
- `tabindex="-1"` na nagłówkach/kontenerach myli programistów nieznających tego wzorca.
- Różne czytniki ekranu (NVDA, JAWS, VoiceOver) ogłaszają zmiany fokusu w subtelnie różny sposób.
- Wskaźniki fokusu wymagają balansu — zbyt subtelne zawodzą użytkowników słabowidzących.
- Nawigacja wstecz/naprzód przeglądarki **nie powinna** przenosić fokusu, jeśli zawartość się nie
  zmieniła.
- Zbyt agresywne zarządzanie fokusem (przenoszenie go za często/bez potrzeby) jest irytujące.

## Powiązane wzorce

- [Keyboard Navigation](keyboard-navigation.md) — Accessibility
- [Focus Trap](focus-trap.md) — Accessibility
- [Accessible Forms](accessible-forms.md) — Accessibility
- [Focus Management — MDN](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/focus)
- [Managing Focus — WAI-ARIA — W3C](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/)
- [Accessible Focus Indicators — W3C](https://www.w3.org/WAI/WCAG21/Understanding/focus-visible.html)

## Kiedy używać / kiedy NIE używać

Stosuj **zawsze**, gdy Twój UI ma modale, SPA-routing, listy z usuwaniem elementów albo dynamicznie
pokazywaną treść (akordeony) — to nie jest opcjonalny „dodatek”, to wymóg WCAG 2.4.3. Uważaj na
przesadę: nie przenoś fokusu przy **każdej** zmianie DOM (np. przy nawigacji wstecz/naprzód
przeglądarki bez realnej zmiany treści) — nadmiarowe, nieuzasadnione przenoszenie fokusu jest samo w
sobie wadą dostępności (patrz „Wady” wyżej), nie tylko brak zarządzania fokusem.
