# ARIA Roles and Attributes

> **Spis treści:** Metadane · TLDR · Uwagi (stan 2026, poprawki względem źródła) · Problem · Rozwiązanie · Przykłady kodu · Kiedy ARIA jest niepotrzebna · Zalety · Wady / tradeoffs · Powiązane wzorce · Kiedy używać / kiedy NIE używać

Źródło: frontendpatterns.dev/aria-roles-and-attributes (Den Odell, aktualizacja 17 października 2025).

## Metadane

- **Kategoria:** Accessibility
- **Poziom:** Beginner
- **Format:** Native web

## TLDR

„Add ARIA attributes only when native HTML falls short. Use roles to identify custom widgets,
states to communicate changes, and properties to describe relationships.”

## Uwagi (stan 2026, poprawki względem źródła)

- **Combobox wg ARIA 1.2**: `role="combobox"` jest na samym `<input>` (z `aria-expanded`, `aria-controls`,
  `aria-activedescendant`), nie na opakowującym `<div>` — wzorzec z opakowaniem pochodzi z przestarzałego ARIA 1.1.
  Poprawiono przykład.
- `role="menu"` jest dla menu aplikacyjnych (jak w programach desktopowych) z nawigacją strzałkami; dla menu
  nawigacyjnego strony użyj przycisku z `aria-expanded` + zwykłej listy linków (wzorzec „disclosure”).
- Ukrywanie: atrybut `hidden` (lub `display: none`) ukrywa i przed okiem, i przed czytnikiem — nie łącz ręcznie
  `aria-hidden` + `style.display`. Nowe natywne mechanizmy zamiast ARIA: `<dialog>`, `popover` + `popovertarget`,
  `<details name>` (akordeon wykluczający), `<search>`, customizable `<select>` (Chromium, `appearance: base-select`).
- Landmarki: natywne `<header>`, `<nav>`, `<main>`, `<aside>`, `<footer>` zamiast `role="banner"` itd. — role tylko
  przy legacy markup.
- Specyfikacja: WAI-ARIA 1.2 (rekomendacja W3C), 1.3 w przygotowaniu.

## Problem

Niestandardowe komponenty (dropdown, panele tabulacji, combobox) zbudowane z `<div>` i CSS są
niewidoczne dla czytników ekranu — brak informacji o typie widżetu, jego zaznaczeniu czy zmianach
stanu. Podstawowy problem: HTML nie ma natywnych elementów dla wszystkich interaktywnych wzorców UI,
jakie faktycznie się buduje.

## Rozwiązanie

Atrybuty ARIA komunikują to, czego HTML nie wyraża natywnie:
- **Stan** — `aria-expanded`, `aria-selected`, `aria-checked`.
- **Typ widżetu** — `role="menu"`, `role="tab"` itd.
- **Relacje/opisy** — `aria-label`, `aria-describedby`, `aria-controls`.

**Kluczowa zasada:** ARIA to ostateczność, nie pierwszy wybór — elementy natywne (`<button>`,
`<dialog>`, `<details>`) mają wbudowaną semantykę i **nie potrzebują** dodatkowych roles.

## Przykłady kodu

### Dropdown menu

```html
<button
  aria-expanded="false"
  aria-controls="dropdown-menu"
  aria-haspopup="menu"
  aria-label="User settings"
>
  Settings
</button>

<ul id="dropdown-menu" role="menu" aria-hidden="true">
  <li role="menuitem">Profile</li>
  <li role="menuitem">Settings</li>
  <li role="separator"></li>
  <li role="menuitem">Logout</li>
</ul>
```

### Interfejs zakładek (tabs) z ARIA

```html
<div role="tablist" aria-label="Account settings">
  <button role="tab" aria-selected="true" aria-controls="profile-panel" id="profile-tab" tabindex="0">
    Profile
  </button>
  <button role="tab" aria-selected="false" aria-controls="security-panel" id="security-tab" tabindex="-1">
    Security
  </button>
</div>

<div role="tabpanel" id="profile-panel" aria-labelledby="profile-tab" tabindex="0">
  <!-- Profile content -->
</div>

<div role="tabpanel" id="security-panel" aria-labelledby="security-tab" tabindex="0" hidden>
  <!-- Security content -->
</div>
```

### Live region dla dynamicznych aktualizacji

```html
<div role="status" aria-live="polite" aria-atomic="true" id="status-message">
  <!-- Updates announced without stealing focus -->
</div>

<script>
function updateStatus(message) {
  document.getElementById('status-message').textContent = message;
}
</script>
```

### Custom combobox

```html
<!-- ARIA 1.2: role="combobox" lives on the input itself -->
<label for="country" id="combo-label">Choose a country</label>
<input id="country" type="text" role="combobox" aria-expanded="false"
       aria-autocomplete="list" aria-controls="country-list" aria-activedescendant="" />
<ul role="listbox" id="country-list" aria-labelledby="combo-label" hidden>
  <li role="option" id="opt-1">United States</li>
  <li role="option" id="opt-2">Canada</li>
</ul>
```

### Dynamiczne aktualizacje stanu (JS)

```javascript
function toggleDropdown(button) {
  const menu = document.getElementById(button.getAttribute('aria-controls'));
  const isExpanded = button.getAttribute('aria-expanded') === 'true';

  button.setAttribute('aria-expanded', !isExpanded);
  menu.setAttribute('aria-hidden', isExpanded);
  menu.style.display = isExpanded ? 'none' : 'block';
}

function selectTab(tab) {
  const tablist = tab.closest('[role="tablist"]');

  tablist.querySelectorAll('[role="tab"]').forEach(t => {
    t.setAttribute('aria-selected', 'false');
    t.setAttribute('tabindex', '-1');
  });

  tab.setAttribute('aria-selected', 'true');
  tab.setAttribute('tabindex', '0');

  const panel = document.getElementById(tab.getAttribute('aria-controls'));
  document.querySelectorAll('[role="tabpanel"]').forEach(p => p.hidden = true);
  panel.hidden = false;
}
```

### Landmark roles

```html
<div role="banner"><!-- header --></div>
<div role="navigation" aria-label="Main"><!-- nav links --></div>
<div role="main"><!-- primary content --></div>
<div role="complementary"><!-- sidebar --></div>
<div role="contentinfo"><!-- footer --></div>
```

### Toggle button

```html
<button aria-pressed="false" aria-label="Enable dark mode" onclick="toggleDarkMode(this)">
  <span aria-hidden="true">🌙</span>
</button>

<script>
function toggleDarkMode(button) {
  const isPressed = button.getAttribute('aria-pressed') === 'true';
  button.setAttribute('aria-pressed', !isPressed);
  button.setAttribute('aria-label', isPressed ? 'Enable dark mode' : 'Disable dark mode');
}
</script>
```

## Kiedy ARIA jest niepotrzebna

Natywne elementy HTML (`<button>`, `<nav>`, `<dialog>`, `<select>`) mają już właściwą semantykę —
dodawanie do nich ról ARIA jest zbędne, a czasem szkodliwe (redundancja może zmylić czytnik ekranu).

## Zalety

- Niestandardowe widżety stają się użyteczne dla czytników ekranu.
- Zmiany stanu są ogłaszane automatycznie.
- Złożone komponenty (combobox, tree view, accordion) stają się dostępne.
- Relacje między elementami stają się jednoznaczne dzięki `aria-controls`/`aria-describedby`.

## Wady / tradeoffs

- **Nieprawidłowa ARIA pogarsza dostępność** bardziej niż jej brak.
- Specyfikacja jest złożona, ze ścisłymi wymogami relacji rodzic-dziecko (np. `role="tab"` musi być
  dzieckiem `role="tablist"`).
- Łatwo przesadzić — redundantne role na elementach, które już mają natywną semantykę.
- ARIA **nie dodaje zachowania** — sama rola/atrybut bez odpowiadającego JS to fasada bez funkcji.
- Testy automatyczne wykrywają tylko błędy składniowe, nie sensowność użycia.
- `aria-hidden="true"` ukrywa element **i całe jego potomstwo** — łatwo przypadkiem ukryć więcej niż
  zamierzone.
- Dynamiczne aktualizacje mogą nie zostać ogłoszone bez odpowiednich live regions.

## Powiązane wzorce

- [Semantic HTML](semantic-html.md) — Fundamentals
- [Keyboard Navigation](keyboard-navigation.md) — Accessibility
- [Accessible Forms](accessible-forms.md) — Accessibility
- [ARIA in HTML — W3C](https://www.w3.org/TR/html-aria/)
- [WAI-ARIA Overview — MDN](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA)
- [ARIA Authoring Practices Guide — W3C](https://www.w3.org/WAI/ARIA/apg/)

## Kiedy używać / kiedy NIE używać

Użyj ARIA **tylko wtedy, gdy budujesz niestandardowy widżet, którego natywny HTML nie wyraża**
(custom dropdown, tab panel, combobox). Jeśli możesz użyć `<button>`, `<details>`, `<dialog>`,
`<select>` — użyj ich i **nie dodawaj ARIA na wierzch** — to jest klasyczny przypadek YAGNI/KISS (eng-design-principles): natywny element już rozwiązuje problem, dokładanie roles „na wszelki
wypadek” tylko zwiększa ryzyko błędu przy zerowej korzyści. Zanim dodasz atrybut ARIA, zapytaj: „czy
istnieje natywny element HTML, który już to robi?” — jeśli tak, ARIA jest tu niepotrzebna.
