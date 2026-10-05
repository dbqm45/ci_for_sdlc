# Accessible Forms

> **Spis treści:** Metadane · TLDR · Uwagi (stan 2026, poprawki względem źródła) · Problem · Rozwiązanie · Przykłady kodu · Zalety · Wady / tradeoffs · Powiązane wzorce · Kiedy używać / kiedy NIE używać

Źródło: frontendpatterns.dev/accessible-forms (Den Odell, aktualizacja 17 października 2025).

## Metadane

- **Kategoria:** Accessibility
- **Poziom:** Beginner
- **Format:** Native web examples

## TLDR

„Connect inputs to labels, use ARIA for dynamic validation, and ensure keyboard operability to
create forms that work for everyone.”

## Uwagi (stan 2026, poprawki względem źródła)

- Używaj natywnego `required` zamiast (albo zamiast dublowania) `aria-required`; atrybut natywny daje też walidację
  przeglądarki. Gwiazdkę oznacz `aria-hidden="true"` — `aria-label` na zwykłym `<span>` nie jest odczytywany
  (rola generic nie przyjmuje nazwy w ARIA 1.2). Poprawiono przykład.
- `aria-invalid` ustawiaj dopiero po interakcji/próbie wysyłki (nie na świeżym formularzu). Po nieudanej wysyłce
  przenieś fokus na pierwsze błędne pole lub podsumowanie błędów (focus-management.md).
- Dla etykiet w komponentach generuj stabilne ID (React `useId`, Angular — pole z `inject(…)`/licznik, Vue 3.5 `useId`)
  — zgodne między SSR a klientem.
- Walidacja formatu e-maila regexem to tylko UX; `type="email"` + walidacja serwera. Formularze w Angularze:
  Signal Forms / reactive forms — fw-angular.

## Problem

Trzy główne problemy dostępnościowe formularzy:

1. **Nieoznaczone pola wejściowe** — użytkownicy czytników ekranu nie wiedzą, co wpisać, gdy pola
   nie mają etykiet.
2. **Niewidoczne błędy walidacji** — błędy pokazywane jako czerwony tekst przy polu są całkowicie
   niewidoczne dla czytników ekranu.
3. **Problemy nawigacji klawiatury** — niespójna kolejność Tab, niewidoczne wskaźniki fokusu,
   niedostępne przyciski dla użytkowników klawiatury.

## Rozwiązanie

- **Etykiety** — `<label for="...">` powiązany z `id` pola wejściowego.
- **Ogłaszanie błędów** — `role="alert"` na komunikacie błędu, `aria-invalid="true"` na polu,
  powiązanie przez `aria-describedby`.
- **Grupowanie** — `<fieldset>` + `<legend>` dla powiązanych pól (np. grupy radio).
- **Kolejność DOM** — kolejność w DOM musi odpowiadać kolejności wizualnej (Tab idzie po DOM, nie po
  CSS).

## Przykłady kodu

### Podstawowy formularz z etykietami i błędami

```html
<form>
  <label for="email">Email address</label>
  <input
    id="email"
    type="email"
    aria-describedby="email-error email-hint"
    aria-invalid="true"
    required
  />
  <div id="email-hint">We'll never share your email</div>
  <div id="email-error" role="alert">Please enter a valid email address</div>

  <label for="username">
    Username <span aria-hidden="true">*</span>
  </label>
  <input id="username" type="text" required />

  <fieldset>
    <legend>Newsletter frequency</legend>
    <label><input type="radio" name="frequency" value="daily" /> Daily</label>
    <label><input type="radio" name="frequency" value="weekly" checked /> Weekly</label>
    <label><input type="radio" name="frequency" value="monthly" /> Monthly</label>
  </fieldset>

  <label>
    <input type="checkbox" aria-describedby="terms-error" />
    I agree to the terms and conditions
  </label>
  <div id="terms-error" role="alert"></div>

  <button type="submit">Create account</button>
</form>
```

### Dynamiczne ogłaszanie błędów walidacji

```javascript
function validateEmail(input) {
  const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value);
  const errorEl = document.getElementById(`${input.id}-error`);

  input.setAttribute('aria-invalid', !isValid);
  errorEl.textContent = isValid ? '' : 'Please enter a valid email address';
}

document.getElementById('email').addEventListener('blur', function() {
  validateEmail(this);
});
```

### Komunikat sukcesu na poziomie formularza

```html
<div role="status" aria-live="polite" aria-atomic="true" id="form-status"></div>

<script>
function handleFormSubmit(event) {
  event.preventDefault();
  document.getElementById('form-status').textContent =
    'Account created successfully. Redirecting...';
  setTimeout(() => { window.location.href = '/dashboard'; }, 2000);
}
</script>
```

### Wielokrotne odniesienia opisów (`aria-describedby` z kilkoma ID)

```html
<label for="password">Password</label>
<input
  id="password"
  type="password"
  aria-describedby="password-hint password-requirements password-error"
/>
<div id="password-hint">Choose a strong password</div>
<div id="password-requirements">At least 8 characters, one uppercase, one number</div>
<div id="password-error" role="alert"></div>
```

## Zalety

- Użytkownicy czytników ekranu wiedzą dokładnie, co wpisać w każde pole.
- Błędy są ogłaszane, nie tylko wyświetlane wizualnie.
- Wzrost wskaźników uzupełniania formularzy (completion rate).
- Zgodność z WCAG staje się realnie osiągalna.
- Prawidłowe etykiety i natychmiastowy feedback poprawiają doświadczenie wszystkich użytkowników,
  nie tylko korzystających z technologii wspomagających.

## Wady / tradeoffs

- Kod HTML staje się bardziej rozbudowany — etykiety, ID, wielokrotne referencje `aria-describedby`.
- „Wrong ARIA is worse than no ARIA” — błędnie dobrane atrybuty mogą wprowadzić czytnik ekranu w
  błąd bardziej niż ich brak.
- Automatyczne narzędzia (linters/audytory) wykrywają tylko oczywiste problemy — wymagane są testy z
  realnym czytnikiem ekranu (NVDA, JAWS, VoiceOver).
- Frameworki CSS mogą kolidować z wymaganą strukturą HTML, oczekując innych wzorców znakowania.
- Nadmiar ogłoszeń przez live region przytłacza użytkownika.
- Niektóre frameworki JS łamią powiązania `label`/`input`, generując dynamiczne ID bez synchronizacji.

## Powiązane wzorce

- [ARIA Roles and Attributes](aria-roles-and-attributes.md) — Accessibility
- [Semantic HTML](semantic-html.md) — Fundamentals
- [Focus Management](focus-management.md) — Accessibility
- [Creating Accessible Forms — W3C](https://www.w3.org/WAI/tutorials/forms/)
- [Form Validation — MDN](https://developer.mozilla.org/en-US/docs/Learn/Forms/Form_validation)
- [ARIA Form Properties — MDN](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Attributes)

## Kiedy używać / kiedy NIE używać

Stosuj te praktyki **domyślnie, w każdym formularzu produkcyjnym** — to nie jest opcjonalny wzorzec
„dla dużych projektów”, to minimum dostępności wymagane przez WCAG i realnie wpływające na
completion rate. Jedyna uzasadniona redukcja zakresu: prototyp/wewnętrzny narzędzie bez realnych
użytkowników z niepełnosprawnościami — nawet wtedy podstawowe `<label>`+`for`/`id` kosztuje tyle
samo, co jego brak, więc nie ma powodu z niego rezygnować (zasada KISS działa tu na korzyść
dostępności, nie przeciw niej — semantyczny HTML jest *prostszy* niż odtwarzanie etykietowania w JS).
Uważaj tylko na przesadzenie z ARIA (patrz „Wrong ARIA is worse than no ARIA” wyżej) — dodawaj
atrybuty ARIA tam, gdzie natywny HTML faktycznie nie wystarcza, nie mechanicznie do wszystkiego.
