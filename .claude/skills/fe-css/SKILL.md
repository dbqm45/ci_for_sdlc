---
name: fe-css
description: Użyj przy stylowaniu — layout flex/grid, responsywność, design tokens, motywy, animacje, izolacja (CSS Modules, @scope, @layer).
metadata:
  katalog: "Użyj przy stylowaniu komponentów, layoutach (flex/grid), responsywności, design tokenach, motywach jasny/ciemny, animacjach i izolacji stylów (CSS Modules, scoped, @scope, @layer). Nie do logiki JavaScript (fe-web-platform) ani struktury komponentów (fe-architecture)."
---

# CSS

## Tokeny przede wszystkim
- Kolory, odstępy, promienie, typografia wyłącznie z tokenów (CSS custom properties lub theme projektu).
- Zakaz „magicznych” wartości (`#3a7bd5`, `13px`) w komponentach. Brakuje tokenu → dodaj token.
- Tryb ciemny: nadpisujesz tokeny, nie style komponentów (`color-scheme` + `light-dark()` lub `[data-theme]`).

## Layout
- Grid dla układów 2D, flex dla 1D. `gap` zamiast marginesów między dziećmi.
- Mobile-first: style bazowe dla wąskiego ekranu, `@media (min-width: …)` rozszerza.
- Preferuj container queries dla komponentów wielokrotnego użytku.
- Jednostki: `rem` dla typografii i odstępów, `%`/`fr`/`min()`/`clamp()` dla szerokości.
- Właściwości logiczne (`margin-inline-start`, `padding-block`, `inset-inline`) zamiast `left/right` — układ gotowy na RTL (fe-web-platform, i18n).

## Architektura
- Trzymaj się podejścia repo (CSS Modules / Tailwind / styled / enkapsulacja frameworka). Nie wprowadzaj drugiego.
- Izolacja: CSS Modules, `scoped` (Vue), enkapsulacja Angulara, Shadow DOM albo natywne `@scope`; kolejność warstw przez `@layer` (reset → tokens → components → utilities).
- Niska specyficzność: klasy, bez ID i `!important` (wyjątek: utility nadpisujące).
- Style komponentu obok komponentu.

## Dostępność
- Kontrast tekstu ≥ 4.5:1 (duży tekst ≥ 3:1).
- Widoczny `:focus-visible` — nigdy `outline: none` bez zamiennika.
- `prefers-reduced-motion`: wyłącz lub skróć animacje.
- Cele dotykowe ≥ 44×44 px (minimum WCAG 2.2 AA: 24×24).
- Nie przekazuj znaczenia samym kolorem; szanuj `forced-colors` (tryb wysokiego kontrastu).

## Wydajność
- Animuj `transform` i `opacity`, nie `width/height/top/left`.
- `content-visibility: auto` dla długich sekcji poza ekranem.

## References
- `references/css-modules-and-scoped-styles.md` — CSS Modules, `scoped`, `:global`, `composes`, typy, konfiguracja build, odpowiedniki we frameworkach i `@scope`. Czytaj przy wyborze lub konfiguracji izolacji stylów.

- `references/przeglad-ui.md` — kolejność ważności, progi (kontrast, cele dotyku, CLS, typografia), lista przed oddaniem UI, dokument główny systemu projektowego z nadpisaniami. Czytaj przy przeglądzie lub oddawaniu ekranu.

## Checklista
- [ ] brak twardych kolorów/odstępów
- [ ] działa od 320 px szerokości bez poziomego scrolla
- [ ] focus widoczny, reduced-motion obsłużone
- [ ] motyw ciemny sprawdzony
