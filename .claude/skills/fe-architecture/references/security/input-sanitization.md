# Input Sanitization

> **Spis treści:** Metadane · TLDR · Uwagi (stan 2026, poprawki względem źródła) · Problem · Rozwiązanie · Przykłady kodu · Zalety · Wady / tradeoffs · Powiązane wzorce · Kiedy używać / kiedy NIE używać

Źródło: frontendpatterns.dev/input-sanitization.

## Metadane

Kategoria: Security. Poziom: Advanced. Przykłady: React, Vue, Svelte, Native web. Autor: Den Odell.
Data aktualizacji: 16 czerwca 2026.

## TLDR

Czyść i waliduj niezaufane dane użytkownika na granicy, zanim je wyrenderujesz albo przetworzysz —
używając allow-list i sprawdzonego sanitizera, żeby złośliwy markup stał się nieszkodliwym tekstem
zamiast wykonywalnym kodem.

## Uwagi (stan 2026, poprawki względem źródła)

- **Sanitizer API** (`element.setHTML(input)`, `Sanitizer`) wchodzi do przeglądarek w 2025–2026 — gdy dostępne u
  Twoich użytkowników, zastępuje bibliotekę; do tego czasu DOMPurify (utrzymuj aktualną wersję).
- Angular sanityzuje `[innerHTML]` automatycznie (`DomSanitizer`); `bypassSecurityTrust*` to escape hatch wymagający
  przeglądu — fw-angular.
- Walidacja formatu po stronie klienta to UX, nie bezpieczeństwo — decyduje walidacja serwera (be-auth-security).
  SQL injection to problem backendu (parametryzowane zapytania), wspomniany tu tylko dla pełności.
- Przykłady Svelte w składni Svelte 4 (`export let`, `$:`); w Svelte 5 `$props()`/`$derived`.

## Problem

Dane wejściowe od użytkownika, np. `<script>` w nazwie profilu, mogą wykonać złośliwy kod, gdy są
renderowane przez `innerHTML`. Wektory ataku wykraczają poza `<script>` — obejmują handlery `onerror`
na obrazach, adresy `javascript:` w linkach, elementy SVG i wzorce SQL injection. Podstawowy
problem: niezaufane dane przekazane do interpreterów (parserów HTML, silników SQL) wykonują się bez
walidacji.

## Rozwiązanie

Stosuj allow-listy, nie deny-listy. Dla czystego tekstu — `textContent` zamiast parsowania HTML.
Dla realnie potrzebnego rich text — sprawdzone, utrzymywane biblioteki jak DOMPurify, nie
własnoręcznie pisany regex. Sanityzuj na granicach wejścia, waliduj względem schematów,
parametryzuj zapytania do bazy danych i dokładaj Content Security Policy jako defense-in-depth.

## Przykłady kodu

### Sanityzacja rich text przed renderem — React

```javascript
import DOMPurify from 'dompurify';

function Comment({ html }) {
  // Sanitize untrusted HTML, then opt in to raw rendering.
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'ul', 'ol', 'li'],
    ALLOWED_ATTR: ['href']
  });

  return <div dangerouslySetInnerHTML={{ __html: clean }} />;
}
```

### Sanityzacja rich text przed renderem — Vue

```javascript
<script setup>
import { computed } from 'vue';
import DOMPurify from 'dompurify';

const props = defineProps({ html: String });

// Sanitize before binding with v-html, never bind raw input.
const clean = computed(() =>
  DOMPurify.sanitize(props.html, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'ul', 'ol', 'li'],
    ALLOWED_ATTR: ['href']
  })
);
</script>

<template>
  <div v-html="clean" />
</template>
```

### Sanityzacja rich text przed renderem — Svelte

```javascript
<script>
  import DOMPurify from 'dompurify';

  export let html = '';

  // {@html} renders raw markup, so sanitize first.
  $: clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'ul', 'ol', 'li'],
    ALLOWED_ATTR: ['href']
  });
</script>

<div>{@html clean}</div>
```

### Sanityzacja rich text przed renderem — Web Components

```javascript
import DOMPurify from 'dompurify';

class UserComment extends HTMLElement {
  set html(value) {
    // Sanitize untrusted markup before assigning to innerHTML.
    this.innerHTML = DOMPurify.sanitize(value, {
      ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'ul', 'ol', 'li'],
      ALLOWED_ATTR: ['href']
    });
  }
}

customElements.define('user-comment', UserComment);
```

### Escaping HTML bez biblioteki

```javascript
function escapeHTML(input) {
  const el = document.createElement('div');
  // textContent treats input as literal text, escaping < > & " automatically.
  el.textContent = input;
  return el.innerHTML;
}

escapeHTML('<img src=x onerror=alert(1)>');
// => "&lt;img src=x onerror=alert(1)&gt;"  (inert text, never executes)
```

### Walidacja formatów za pomocą allow-list

```javascript
const RULES = {
  username: /^[a-zA-Z0-9_-]{3,20}$/,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
};

function validate(field, value) {
  const pattern = RULES[field];
  if (!pattern || !pattern.test(value)) {
    throw new Error(`Invalid ${field}`);
  }
  return value;
}

validate('username', 'jane_doe-42');         // ok
validate('username', '<script>alert(1)</script>'); // throws: Invalid username
```

## Zalety

- Neutralizuje stored i reflected XSS, zamieniając złośliwy markup na inertny tekst przed
  parsowaniem HTML.
- Allow-listy pozostają odporne na nowe wzorce ataków, bo Ty definiujesz dozwoloną zawartość.
- Utrzymywane sanitizery pokrywają nietypowe wektory (SVG, mutation XSS, adresy `javascript:`),
  które własne filtry przeoczają.
- Walidacja formatu zatrzymuje błędne dane wcześnie, zapobiegając problemom bezpieczeństwa i
  błędom wyświetlania.
- Parametryzowane zapytania eliminują SQL injection, zachowując czytelność kodu.
- Naturalnie łączy się z output encoding i strict CSP dla warstwowej ochrony.
- Jeden punkt sanityzacji pozwala traktować dane jako zaufane dalej w przepływie.

## Wady / tradeoffs

- Nadmiernie agresywna sanityzacja usuwa legalną zawartość, frustrując użytkowników.
- Allow-listy wymagają utrzymania; zapomniany tag powoduje zgłoszenia supportowe.
- Sanityzacja rich text jest trudna; własne regexy często zawierają obejścia (bypasses).
- Nawet dobre sanitizery dostają łatki bezpieczeństwa; przypięcie starej wersji tworzy ryzyko.
- Sanityzacja to nie to samo co kodowanie — wyczyszczone dane wciąż potrzebują kodowania
  kontekstowego przy wypisywaniu (patrz `output-encoding.md`).
- Sanityzacja tylko po stronie klienta jest niewystarczająca; walidacja server-side pozostaje
  konieczna.
- Widoczna modyfikacja wejścia po wysłaniu formularza dezorientuje użytkowników nieświadomych
  sanityzacji.
- Ponowne użycie sanityzowanych danych w innym kontekście (zapytania, komendy shell) wymaga
  ponownej oceny — sanityzacja jest kontekstowa, nie uniwersalna.
- Przetwarzanie dużych dokumentów dodaje wymierny narzut parsowania.

## Powiązane wzorce

- Output Encoding — Security (`output-encoding.md`)
- Trusted Types — Security (`trusted-types.md`)
- Zewnętrzne: [Input Validation Cheat Sheet — OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html),
  [XSS Prevention — OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html),
  [DOMPurify — GitHub](https://github.com/cure53/DOMPurify)

## Kiedy używać / kiedy NIE używać

Sanityzuj **każde** wejście od użytkownika, które trafi do renderu HTML, zapytania do bazy albo
innego interpretera — to nie jest opcjonalne przy jakiejkolwiek treści generowanej przez
użytkownika. Dla zwykłego tekstu (imię, komentarz bez formatowania) wystarczy `textContent`/
walidacja formatu — **nie sięgaj po DOMPurify**, jeśli nie potrzebujesz faktycznie renderować HTML;
to niepotrzebny koszt (bundle + narzut parsowania) dla przypadku, który rozwiązuje prostsze
escapowanie (zasada YAGNI, `../principles.md`). DOMPurify/pełna sanityzacja rich text jest
uzasadniona tylko, gdy realnie potrzebujesz przyjąć ograniczony HTML od użytkownika (edytor WYSIWYG,
komentarze z formatowaniem).
