# Keyboard Navigation

> **Spis treści:** Metadane · TLDR · Uwagi (stan 2026, poprawki względem źródła) · Problem · Rozwiązanie · Przykłady kodu · Zalety · Wady / tradeoffs · Powiązane wzorce · Kiedy używać / kiedy NIE używać

Źródło: frontendpatterns.dev/keyboard-navigation (Den Odell).

## Metadane

- **Kategoria:** Accessibility
- **Poziom:** Beginner
- **Przykłady:** Native web

## TLDR

„Make all interactive elements reachable and operable via keyboard using logical tab order, arrow
key patterns, and standard shortcuts.”

## Uwagi (stan 2026, poprawki względem źródła)

- **Nie zeruj `*:focus { outline: none; }`** — przeglądarki same pokazują pierścień tylko dla `:focus-visible`;
  globalne zerowanie `:focus` odbiera fokus programowy (np. nagłówki po nawigacji). Wystarczy styl
  `:focus-visible`. Poprawiono CSS.
- Przykład dropdownu to szkic — pełny listbox/combobox wymaga `aria-activedescendant` z ID opcji, Home/End,
  type-ahead. Zanim napiszesz własny: natywny `<select>` (w Chromium stylowalny przez `appearance: base-select`)
  albo biblioteka headless (Radix, React Aria, Angular Aria/CDK `ListKeyManager`).
- Skróty: `e.key` zależy od układu i Shift (`'s'` vs `'S'`) — porównuj `e.key.toLowerCase()` albo `e.code` dla
  pozycji klawisza; nie przechwytuj skrótów w polach tekstowych bez potrzeby. Ujawnij skróty (`aria-keyshortcuts`,
  pomoc „?”).

## Problem

Niestandardowe komponenty UI budowane z `<div>` i CSS często zawodzą pod kątem dostępności
klawiaturowej: elementy nie są domyślnie fokusowalne, standardowe interakcje klawiszowe
(Enter, strzałki) nie działają, użytkownicy zostają „uwięzieni” w modalach bez metody wyjścia przez
klawiaturę. Menu zależne od hover całkowicie wykluczają użytkowników klawiatury, a niestandardowe
implementacje często łamią ustalone konwencje interakcji.

## Rozwiązanie

Elementy interaktywne muszą być osiągalne przez Tab i obsługiwalne wyłącznie klawiaturą. Semantyczne
elementy HTML (`<button>`, `<a>`, `<input>`) dają to automatycznie. Dla niestandardowych widżetów —
stosuj wzorce WAI-ARIA: strzałki nawigują po listach, Enter/Space aktywują elementy, Escape zamyka
nakładki. Używaj `tabindex="0"` dla fokusowalności, dodawaj handlery `keydown`, utrzymuj widoczne
wskaźniki fokusu (`:focus-visible`) i zawsze dawaj klawiaturowe alternatywy dla funkcji zależnych od
myszy.

## Przykłady kodu

### Dropdown z nawigacją klawiaturową

```javascript
function Dropdown({ items, onSelect }) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const handleKeyDown = (e) => {
    if (!isOpen && (e.key === ' ' || e.key === 'Enter')) {
      setIsOpen(true);
      e.preventDefault();
      return;
    }
    if (isOpen) {
      if (e.key === 'ArrowDown') {
        setSelectedIndex((prev) => Math.min(prev + 1, items.length - 1));
      } else if (e.key === 'ArrowUp') {
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter' || e.key === ' ') {
        onSelect(items[selectedIndex]);
        setIsOpen(false);
      } else if (e.key === 'Escape') {
        setIsOpen(false);
      }
      e.preventDefault();
    }
  };

  return (
    <div
      role="combobox"
      aria-expanded={isOpen}
      aria-haspopup="listbox"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <div className="dropdown-trigger">{items[selectedIndex].label}</div>
      {isOpen && (
        <ul role="listbox">
          {items.map((item, index) => (
            <li key={item.id} role="option" aria-selected={index === selectedIndex}>
              {item.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

### Panel zakładek z roving tabindex

```javascript
function TabPanel({ tabs }) {
  const [activeTab, setActiveTab] = useState(0);

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowRight') setActiveTab((activeTab + 1) % tabs.length);
    else if (e.key === 'ArrowLeft') setActiveTab((activeTab - 1 + tabs.length) % tabs.length);
    else if (e.key === 'Home') setActiveTab(0);
    else if (e.key === 'End') setActiveTab(tabs.length - 1);
    else return;
    e.preventDefault();
  };

  return (
    <div>
      <div role="tablist">
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === index}
            tabIndex={activeTab === index ? 0 : -1}
            onClick={() => setActiveTab(index)}
            onKeyDown={handleKeyDown}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.map((tab, index) => (
        <div key={tab.id} role="tabpanel" hidden={activeTab !== index} tabIndex={0}>
          {tab.content}
        </div>
      ))}
    </div>
  );
}
```

### Modal z obsługą klawiatury (Escape)

```javascript
function Modal({ isOpen, onClose, children }) {
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
    >
      <h2>Modal Title</h2>
      <div>{children}</div>
      <button onClick={onClose}>Close</button>
    </div>
  );
}
```

### Skróty klawiaturowe

```javascript
function Editor() {
  const handleKeyDown = (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key === 's') { handleSave(); e.preventDefault(); }
    if (mod && e.key === 'z' && !e.shiftKey) { handleUndo(); e.preventDefault(); }
    if (mod && e.key === 'z' && e.shiftKey) { handleRedo(); e.preventDefault(); }
  };

  return (
    <div onKeyDown={handleKeyDown}>
      <textarea placeholder="Press Ctrl+S to save" />
    </div>
  );
}
```

### Skip links

```javascript
function Layout({ children }) {
  return (
    <>
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <nav>{/* Navigation links */}</nav>
      <main id="main-content" tabIndex={-1}>{children}</main>
    </>
  );
}
```

### Wskaźniki fokusu

```css
/* No global *:focus { outline: none } — browsers already limit the ring to :focus-visible */
:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }

@media (prefers-contrast: high) {
  *:focus-visible { outline: 3px solid currentColor; }
}
```

## Zalety

- Technologie wspomagające zależą od interfejsu klawiaturowego — działająca nawigacja klawiaturą
  zapewnia też kompatybilność z czytnikami ekranu.
- Zaawansowani użytkownicy operują szybciej klawiaturą niż myszą.
- „WCAG Level A requires keyboard operability, making this a legal requirement in many
  jurisdictions.”
- Niepełnosprawności motoryczne, RSI, tymczasowe urazy uniemożliwiają wielu osobom użycie myszy.
- Utrzymanie fokusu klawiaturowego eliminuje przełączanie mysz/klawiatura, szczególnie przy
  wprowadzaniu danych.

## Wady / tradeoffs

- Niestandardowe widżety wymagają rozbudowanej implementacji — semantyczny HTML daje wsparcie
  klawiaturowe automatycznie, stylowane `<div>` wymagają ręcznych handlerów.
- Wzorce WAI-ARIA są złożone — poprawny listbox potrzebuje Home, End, PageUp, PageDown, wyszukiwania
  „type-ahead” i obsługi trybu wyboru.
- Własne skróty klawiaturowe mogą kolidować z domyślnymi skrótami przeglądarki; `preventDefault()`
  usuwa natywną funkcjonalność.
- Przechwytywanie strzałek może dezorientować użytkowników oczekujących scrollowania — wymaga
  ostrożnego zarządzania propagacją zdarzeń.
- Utrzymanie roving tabindex robi się trudne przy dynamicznych listach (zarządzanie `tabindex="0"`
  vs `-1`).
- Skróty klawiaturowe są niewidoczne bez dokumentacji/wskazówek — użytkownik nie wie, że istnieją.
- Klawiatury międzynarodowe (AZERTY, Dvorak) mają inaczej rozmieszczone klawisze niż QWERTY, co robi
  niektóre skróty niewygodnymi lub niedostępnymi.
- Widoczność wskaźnika fokusu bywa źródłem napięcia projektowego — wskaźniki zgodne z dostępnością
  często wykraczają poza preferencje wizualne projektanta.
- Testowanie nawigacji klawiaturowej wymaga manualnej interakcji — automatyczne skanery nie oceniają
  jakości faktycznego doświadczenia użytkownika.

## Powiązane wzorce

- [Focus Management](focus-management.md) — Accessibility
- [Focus Trap](focus-trap.md) — Accessibility
- [ARIA Roles and Attributes](aria-roles-and-attributes.md) — Accessibility
- [Keyboard Navigation — MDN](https://developer.mozilla.org/en-US/docs/Web/Accessibility/Keyboard-navigable_JavaScript_widgets)
- [Keyboard Accessibility — W3C](https://www.w3.org/WAI/WCAG21/Understanding/keyboard.html)
- [WAI-ARIA Keyboard Patterns — W3C](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/)

## Kiedy używać / kiedy NIE używać

Zawsze, gdy budujesz **jakikolwiek** interaktywny element — to nie jest opcjonalne ulepszenie, WCAG
Level A wymaga obsługi klawiaturowej i jest to wymóg prawny w wielu jurysdykcjach. Domyślnie sięgaj
po natywne elementy (`<button>`, `<a>`, `<select>`) — dają to za darmo, bez pisania jednego handlera
`keydown`. Pisz własną logikę klawiaturową (strzałki, roving tabindex) tylko dla widżetów, których
natywny HTML nie obsługuje (custom combobox, tab panel) — nie odtwarzaj ręcznie zachowania, które
`<select>`/`<button>` już mają wbudowane.
