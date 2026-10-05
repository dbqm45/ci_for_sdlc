# Output Encoding

> **Spis treści:** Metadane · TLDR · Uwagi (stan 2026, poprawki względem źródła) · Problem · Rozwiązanie · Przykłady kodu · Zalety · Wady / tradeoffs · Powiązane wzorce · Kiedy używać / kiedy NIE używać

Źródło: frontendpatterns.dev/output-encoding.

## Metadane

Kategoria: Security. Poziom: Advanced. Frameworki: React, Vue, Svelte, Native Web. Autor: Den Odell.
Data aktualizacji: 17 czerwca 2026.

## TLDR

Output encoding zapewnia, że dane użytkownika renderują się jako inertny tekst, kodując je dla
dokładnego kontekstu, w którym lądują — polegaj na auto-escape frameworku dla typowych przypadków,
traktuj każdy escape hatch jako świadomą decyzję wspieraną sanityzacją.

## Uwagi (stan 2026, poprawki względem źródła)

- Angular: interpolacja `{{ }}` i wiązania właściwości escapują/sanityzują automatycznie; escape hatch to
  `bypassSecurityTrustHtml` — fw-angular.
- **Wiązania URL** (`href={authorUrl}`) nie chronią przed `javascript:` we wszystkich frameworkach (React tylko
  ostrzega) — waliduj schemat (`new URL(u).protocol` ∈ `http:`/`https:`), zanim zbindujesz URL od użytkownika.
- Kontekst `<script>` z `JSON.stringify` jest bezpieczny tylko po dodatkowym escapowaniu `<` (np. `\u003c`), bo
  `</script>` w danych zamyka blok — lepiej przekazuj dane przez `data-*` lub `<script type="application/json">`
  czytany przez `textContent`.

## Problem

Aplikacja przechowuje dane wejściowe użytkownika (np. nazwę profilu) bez kodowania. Gdy ta
zawartość trafia do DOM-u w nieodpowiednim kontekście, może być interpretowana jako kod wykonalny
zamiast tekstu — np. `<img src=x onerror="fetch(...)">` jest parsowane jako element HTML, a
handler `onerror` uruchamia się automatycznie. Stored XSS pojawia się wielokrotnie, dla każdego
użytkownika oglądającego stronę.

Różne konteksty niosą różne zagrożenia:
- w treści HTML: `<` otwiera tag,
- w atrybutach: `"` przerywa cudzysłów,
- w skryptach inline: `</script>` kończy blok,
- w URL-ach: `&` i `#` zmieniają strukturę zapytania.

## Rozwiązanie

Koduj dane użytkownika dla konkretnego kontekstu docelowego **przed** renderowaniem:

1. **Kontekst HTML body:** `<` → `&lt;`, `>` → `&gt;`, `&` → `&amp;`.
2. **Kontekst atrybutów:** dodatkowo koduj cudzysłowy.
3. **Kontekst JavaScript:** użyj `JSON.stringify` zamiast konkatenacji.
4. **Kontekst URL:** stosuj `encodeURIComponent`.

Nowoczesne frameworki (React, Vue, Svelte) kodują domyślnie interpolacje tekstowe i wiązania
atrybutów. „Escape hatches” (`dangerouslySetInnerHTML`, `v-html`, `{@html}`, `innerHTML`) omijają
kodowanie całkowicie — używaj ich wyłącznie z zaufanym HTML-em, wcześniej oczyszczonym przez
DOMPurify.

## Przykłady kodu

### React

```javascript
function Comment({ body, authorUrl }) {
  // Safe: React escapes interpolated text and attribute values by default.
  // A body of "<script>alert(1)</script>" renders as visible text.
  return (
    <article>
      <a href={authorUrl}>Author</a>
      <p>{body}</p>
    </article>
  );
}

// Unsafe: dangerouslySetInnerHTML skips all encoding.
// Only use with sanitized HTML from a trusted source.
function RichComment({ trustedHtml }) {
  return <p dangerouslySetInnerHTML={{ __html: trustedHtml }} />;
}
```

### Vue

```javascript
<script setup>
defineProps({ body: String, authorUrl: String, trustedHtml: String });
</script>

<template>
  <!-- Safe: mustache interpolation and :attr bindings auto-escape. -->
  <article>
    <a :href="authorUrl">Author</a>
    <p>{{ body }}</p>
  </article>

  <!-- Unsafe: v-html injects raw markup with no encoding.
       Only bind sanitized, trusted HTML here. -->
  <p v-html="trustedHtml" />
</template>
```

### Svelte

```javascript
<script>
  export let body;
  export let authorUrl;
  export let trustedHtml;
</script>

<!-- Safe: {value} and attribute bindings are escaped automatically. -->
<article>
  <a href={authorUrl}>Author</a>
  <p>{body}</p>
</article>

<!-- Unsafe: {@html} renders raw markup with no encoding.
     Only use with sanitized, trusted HTML. -->
<p>{@html trustedHtml}</p>
```

### Web Components (Native)

```javascript
class CommentCard extends HTMLElement {
  set data({ body, authorUrl, trustedHtml }) {
    const article = document.createElement('article');
    const link = document.createElement('a');

    // Safe: textContent treats input as text, never markup.
    const p = document.createElement('p');
    p.textContent = body;

    // Safe: assign attributes via the DOM API, not string concatenation.
    link.href = authorUrl;
    link.textContent = 'Author';

    article.append(link, p);
    this.replaceChildren(article);

    // Unsafe: innerHTML parses input as HTML and executes handlers.
    // this.innerHTML = trustedHtml; // only with sanitized input
  }
}

customElements.define('comment-card', CommentCard);
```

### Helper context-aware

```javascript
// Escape for HTML body and attribute contexts.
// Replace & first so later replacements aren't double-encoded.
function encodeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// Build a safe link: escape the text for HTML, encode the query for URLs.
function searchLink(query) {
  const href = `/search?q=${encodeURIComponent(query)}`;
  return `<a href="${encodeHTML(href)}">${encodeHTML(query)}</a>`;
}

// JavaScript context: never concatenate raw input into code.
// JSON.stringify produces a safely quoted, escaped string literal.
function inlineScript(message) {
  return `<script>showToast(${JSON.stringify(message)})<\/script>`;
}
```

## Zalety

- Neutralizuje XSS na granicy renderowania — dane użytkownika są zawsze traktowane jako tekst.
- Działa jako ostatnia linia obrony, nawet gdy walidacja upstream zawiedzie.
- Auto-escape we frameworkach robi bezpieczną ścieżkę domyślną.
- Kodowanie kontekstowe pokrywa wszystkie powierzchnie (treść HTML, atrybuty, skrypty inline, URL-e).
- Zapobiega stored XSS — jeden niekodowany rekord nie wykonuje się wielokrotnie dla wielu
  odwiedzających.
- Integruje się z warstwami defense-in-depth, jak CSP i dedykowany sanitizer.
- Wbudowane API przeglądarki (`textContent`, `encodeURIComponent`) działają bez zależności.

## Wady / tradeoffs

- Prawidłowość zależy od kontekstu — kodowanie dla HTML w kontekście URL albo skryptu nie chroni.
- Podwójne kodowanie duplikuje dane: `<` staje się `&amp;lt;` i wyświetla się dosłownie.
- Ręcznie napisane kodery HTML mogą pomijać edge case'y (atrybuty bez cudzysłowów, adresy
  `javascript:`) — biblioteka jest bezpieczniejsza.
- Escape hatches (`dangerouslySetInnerHTML`, `v-html`, `{@html}`, `innerHTML`) niewidocznie omijają
  kodowanie.
- HTML z rzeczywistymi tagami wymaga dedykowanego sanitizera (DOMPurify), nie samego kodowania.
- Kodowanie nie zastępuje sanityzacji wejścia ani CSP — poleganie wyłącznie na nim pozostawia
  system kruchy.
- Przegląd dużych baz kodu w poszukiwaniu niedokodowanych pól jest żmudny.

## Powiązane wzorce

- Input Sanitization — Security (`input-sanitization.md`)
- Trusted Types — Security (`trusted-types.md`)
- Content Security Policy (CSP) — Security (`content-security-policy.md`)
- Zewnętrzne: [Output Encoding / XSS Prevention — OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html),
  [Character encodings in HTML — Wikipedia](https://en.wikipedia.org/wiki/Character_encodings_in_HTML),
  [XSS — OWASP](https://owasp.org/www-community/attacks/xss/)

## Kiedy używać / kiedy NIE używać

Jeśli używasz React/Vue/Svelte przez standardową interpolację (`{body}`, `{{ body }}`) — **auto-
escape frameworka już to robi za Ciebie**, nie musisz nic dodawać. Sprawdzaj świadomie wyłącznie
miejsca z escape hatchem (`dangerouslySetInnerHTML`, `v-html`, `{@html}`, `innerHTML`) — to jest
jedyne miejsce, gdzie ten wzorzec wymaga Twojej aktywnej uwagi, nie każda linijka renderu.
