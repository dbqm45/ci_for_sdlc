# Semantic HTML

> **Spis treści:** Metadane · TLDR · Uwagi (stan 2026, poprawki względem źródła) · Problem · Rozwiązanie · Przykłady kodu · Zalety · Wady / tradeoffs · Powiązane wzorce · Kiedy używać / kiedy NIE używać

Źródło: frontendpatterns.dev/semantic-html.

## Metadane

- **Kategoria:** Fundamentals
- **Poziom:** Beginner
- **Przykłady:** Native web
- **Data aktualizacji:** October 2, 2025
- **Autor:** Den Odell

## TLDR

„Use HTML elements for their intended purpose to get accessibility, keyboard support, and SEO benefits without extra code.”

## Uwagi (stan 2026, poprawki względem źródła)

- Nowsze elementy natywne zastępujące własne widżety: `<dialog>` (modal), atrybut `popover` (menu, tooltip bez JS
  pozycjonowania — z CSS anchor positioning), `<details name="…">` (akordeon wykluczający), `<search>` (landmark
  wyszukiwania), `<output>`/`<meter>`/`<progress>` dla wyników i wskaźników.
- W komponentach nagłówek nie zna swojego poziomu — przekazuj poziom jako wejście (`level`) albo projektuj sekcje tak,
  by strona ustalała hierarchię.
- `<button>` w formularzu ma domyślnie `type="submit"` — zawsze ustawiaj `type` jawnie.

## Problem

Strona złożona wyłącznie z `<div>` uniemożliwia użytkownikom czytników ekranu nawigację przez punkty orientacyjne (landmarks). Elementy `<div>` stylizowane jako przyciski nie działają z klawiaturą i nie są ogłaszane przez czytniki ekranu jako interaktywne — wymagają odtworzenia od zera funkcjonalności, którą natywny element ma za darmo.

## Rozwiązanie

Używaj elementów HTML zgodnie z ich zamierzonym przeznaczeniem: `<button>` dla akcji, `<a>` dla linków, `<nav>` dla nawigacji, `<main>` dla głównej treści, `<header>`/`<footer>` dla sekcji nagłówka/stopki, `<article>` dla samodzielnych treści, `<aside>` dla treści pomocniczej, `<h1>`–`<h6>` dla hierarchii nagłówków, `<table>` dla danych tabelarycznych, `<form>` z powiązanym `<label>` dla pól wejściowych.

## Przykłady kodu

### Semantyczna struktura dokumentu

```html
<body>
  <header>
    <h1>Site Title</h1>
    <nav aria-label="Primary">
      <ul>
        <li><a href="/">Home</a></li>
        <li><a href="/about">About</a></li>
      </ul>
    </nav>
  </header>

  <main>
    <article>
      <header>
        <h2>Article Title</h2>
        <time datetime="2026-01-01">January 1, 2026</time>
      </header>
      <p>Introduction paragraph...</p>
      <h3>First Section</h3>
      <p>Section content...</p>
      <figure>
        <img src="chart.png" alt="Sales data visualization">
        <figcaption>Q4 2025 Sales Performance</figcaption>
      </figure>
      <aside>
        <h4>Related Information</h4>
        <p>Additional context...</p>
      </aside>
    </article>
  </main>

  <aside aria-label="Sidebar">
    <h2>Popular Posts</h2>
    <ul>
      <li><a href="/post-1">First Post</a></li>
    </ul>
  </aside>

  <footer>
    <p>&copy; 2026 Company Name</p>
    <nav aria-label="Footer">
      <a href="/privacy">Privacy</a>
      <a href="/terms">Terms</a>
    </nav>
  </footer>
</body>
```

### Semantyczne elementy interaktywne

```html
<!-- Div button requires extensive ARIA and JavaScript -->
<div role="button" tabindex="0" onclick="handleClick()"
     onkeydown="handleKeyPress(event)">Submit</div>

<!-- Semantic button works automatically -->
<button type="submit">Submit</button>

<!-- Div link breaks keyboard nav and right-click -->
<div class="link" onclick="navigate('/page')">Go to page</div>

<!-- Semantic link has full browser features -->
<a href="/page">Go to page</a>
```

### Semantyczne elementy formularza

```html
<form>
  <label for="username">Username</label>
  <input id="username" type="text" required>

  <fieldset>
    <legend>Shipping Address</legend>
    <label for="street">Street</label>
    <input id="street" type="text">
    <label for="city">City</label>
    <input id="city" type="text">
  </fieldset>

  <button type="submit">Submit</button>
  <button type="button">Cancel</button>
</form>
```

### Semantyczna prezentacja danych

```html
<table>
  <caption>Monthly Sales Report</caption>
  <thead>
    <tr>
      <th scope="col">Month</th>
      <th scope="col">Revenue</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th scope="row">January</th>
      <td>$50,000</td>
    </tr>
  </tbody>
</table>

<details>
  <summary>Advanced Settings</summary>
  <p>Additional configuration options...</p>
</details>
```

## Zalety

- Czytniki ekranu automatycznie ogłaszają znaczenie elementów bez dodatkowego `role`/`aria-*`.
- Poprawa SEO dzięki rozpoznawalnej, semantycznej strukturze dokumentu.
- Domyślna obsługa klawiatury (Tab, Enter, Space) bez pisania własnego kodu.
- Zgodność z trybem czytania (reader mode) i funkcjami text-to-speech przeglądarki.
- Mniej kodu: jeden `<button>` zamiast dwudziestu linii ARIA + obsługi klawiatury dla `<div role="button">`.
- Kod samodokumentujący się — struktura dokumentu jest widoczna z samych nazw elementów.

## Wady / tradeoffs

- Wymaga nauczenia się wielu elementów HTML i ich poprawnego zastosowania (nie każdy programista je znajduje intuicyjnie).
- Domyślne style przeglądarki dla elementów semantycznych wymagają resetowania/nadpisania w CSS.
- Niektóre elementy mają nieintuicyjne reguły użycia (np. kiedy `<article>` a kiedy `<section>`).
- Hierarchia nagłówków (`<h1>`–`<h6>`) musi być sekwencyjna, co bywa niewygodne w komponentowej architekturze (komponent nie zawsze wie, na jakim poziomie hierarchii się znajdzie).
- Frameworki CSS/design systemy czasem zakładają strukturę oparte na `<div>`, co utrudnia „wstrzyknięcie” semantyki bez przepisania stylów.
- Retrofitting (dodanie semantyki do istniejącego, już napisanego kodu) jest czasochłonne.
- Poprawność semantyczna nie jest widoczna wizualnie w przeglądarce — błąd nie „wygląda” źle, mimo że łamie dostępność.

## Powiązane wzorce

- [ARIA Roles and Attributes](aria-roles-and-attributes.md) — Accessibility.
- [Accessible Forms](accessible-forms.md) — Accessibility.
- Semantic HTML — MDN.
- HTML5 Semantic Elements — W3Schools.
- Accessibility and Semantics — web.dev.

## Kiedy używać / kiedy NIE używać

Używaj semantycznego HTML **domyślnie i zawsze** — to jeden z fundamentów architektury frontendu („Accessibility as a Foundation”, fe-architecture `.claude/skills/fe-architecture/references/principles.md`), nie opcjonalna technika do rozważenia przy większych projektach. Koszt jest zerowy albo ujemny (mniej kodu niż odtwarzanie tego samego przez ARIA+JS na `<div>`), a zysk (dostępność, SEO, klawiatura) jest natychmiastowy.

Jedyny uzasadniony wyjątek: budowa **własnego, złożonego widgetu** (np. custom dropdown z unikalnym zachowaniem), dla którego natywny element nie istnieje — wtedy `<div>` + pełny zestaw `role`/`aria-*`/obsługa klawiatury jest właściwym narzędziem (patrz [ARIA Roles and Attributes](aria-roles-and-attributes.md)), ale to jest ostatnia opcja, nie pierwsza.
