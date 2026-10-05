# Live Regions

> **Spis treści:** Metadane · TLDR · Uwagi (stan 2026, poprawki względem źródła) · Problem · Rozwiązanie · Przykłady kodu · Zalety · Wady / tradeoffs · Powiązane wzorce · Kiedy używać / kiedy NIE używać

Źródło: frontendpatterns.dev/live-regions (Den Odell, aktualizacja 7 października 2025).

## Metadane

- **Kategoria:** Accessibility
- **Poziom:** Beginner
- **Przykłady:** React, Vue, Native web

## TLDR

„Announce dynamic content changes to screen readers using ARIA live regions, choosing politeness
levels based on urgency.”

## Uwagi (stan 2026, poprawki względem źródła)

- `.sr-only`: `clip` jest przestarzałe — użyj `clip-path: inset(50%)` (poprawiono CSS).
- `role="alert"` już implikuje `aria-live="assertive"` (i `aria-atomic="true"`), `role="status"` — `polite`; nie
  dubluj atrybutów. Region musi istnieć w DOM przed zmianą treści — renderuj go zawsze, zmieniaj tylko tekst.
- W przykładzie odliczania `setAnnouncement` było wywoływane wewnątrz funkcji aktualizującej `setSeconds` (efekt
  uboczny w updaterze — w StrictMode wykona się dwukrotnie). Poprawiono: ogłoszenia liczone z wartości w efekcie.
- `useCallback(debounce(...), [])` — lint nie widzi zależności; stabilną funkcję debounce trzymaj w `useMemo`/`useRef`.
- Angular: `LiveAnnouncer` z CDK (`announce(msg, 'polite')`) — fw-angular. Specyfikacja: WAI-ARIA 1.2.

## Problem

Dynamiczne zmiany na stronie (toast notifications, komunikaty walidacji, wskaźniki autosave) nie są
słyszalne dla użytkowników czytników ekranu. Gdy strona się nie przeładowuje, czytnik ekranu nie ma
wbudowanego powodu, by ogłaszać nowo wstrzykniętą treść — musi zostać do tego jawnie
poinstruowany.

## Rozwiązanie

Oznacz regiony strony atrybutem `aria-live`, żeby poinformować czytniki ekranu o automatycznym
ogłaszaniu zmian treści:
- `aria-live="polite"` — aktualizacje nieurgentne (np. „Item added to cart”), czeka, aż czytnik
  skończy aktualną wypowiedź.
- `aria-live="assertive"` — pilne wiadomości (np. błędy), przerywa natychmiast.
- `role="status"` — skrót równoważny `aria-live="polite"`.
- `role="alert"` — skrót równoważny `aria-live="assertive"`.

**Kluczowy wymóg:** kontener live region musi istnieć w DOM **przed** wstrzyknięciem do niego
treści — dodanie samego kontenera i treści w tym samym momencie może nie zostać wykryte.

## Przykłady kodu

### Podstawowe live regions — HTML

```html
<!-- Polite: waits for current announcement to finish -->
<div aria-live="polite" aria-atomic="true" class="status-message"></div>

<!-- Assertive: interrupts immediately -->
<div aria-live="assertive" aria-atomic="true" class="error-message"></div>
```

### Podstawowe live regions — React

```javascript
function NotificationSystem() {
  const [message, setMessage] = useState('');

  const showSuccess = (text) => {
    setMessage(text);
    setTimeout(() => setMessage(''), 3000);
  };

  return (
    <>
      <button onClick={() => showSuccess('Item added to cart')}>Add to Cart</button>
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {message}
      </div>
    </>
  );
}
```

### Podstawowe live regions — Vue

```vue
<template>
  <button @click="addItem">Add to Cart</button>
  <div role="status" aria-live="polite" aria-atomic="true" class="sr-only">
    {{ statusMessage }}
  </div>
</template>

<script setup>
import { ref } from 'vue';
const statusMessage = ref('');

const addItem = () => {
  statusMessage.value = 'Item added to cart';
  setTimeout(() => statusMessage.value = '', 3000);
};
</script>
```

### Ogłaszanie błędów walidacji formularza

```javascript
function SignupForm() {
  const [errors, setErrors] = useState({});
  const [errorMessage, setErrorMessage] = useState('');

  const validateForm = (formData) => {
    const newErrors = {};
    if (!formData.email) newErrors.email = 'Email is required';
    if (!formData.password) newErrors.password = 'Password is required';
    setErrors(newErrors);

    const count = Object.keys(newErrors).length;
    setErrorMessage(count > 0 ? `Form has ${count} error${count > 1 ? 's' : ''}` : '');
    return count === 0;
  };

  return (
    <form onSubmit={handleSubmit}>
      <div role="alert" className="sr-only">{errorMessage}</div>
      <div>
        <label htmlFor="email">Email</label>
        <input id="email" type="email" aria-invalid={!!errors.email} />
        {errors.email && <p>{errors.email}</p>}
      </div>
      <button type="submit">Sign Up</button>
    </form>
  );
}
```

### Ogłaszanie stanu ładowania

```javascript
function DataLoader({ userId }) {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('');

  const loadData = async () => {
    setStatus('Loading...');
    try {
      setData(await fetchUser(userId));
      setStatus('Data loaded');
    } catch {
      setStatus('Failed to load');
    }
  };

  return (
    <>
      <button onClick={loadData}>Load Data</button>
      <div role="status" aria-live="polite" className="sr-only">{status}</div>
      {data && <UserProfile user={data} />}
    </>
  );
}
```

### Wskaźnik postępu

```javascript
function FileUpload() {
  const [progress, setProgress] = useState(0);
  const [announcement, setAnnouncement] = useState('');

  const updateProgress = (percent) => {
    setProgress(percent);
    if (percent % 25 === 0) setAnnouncement(`Upload ${percent}% complete`);
  };

  return (
    <>
      <div role="progressbar" aria-valuenow={progress} aria-valuemin="0" aria-valuemax="100">
        <div style={{ width: `${progress}%` }} />
      </div>
      <div role="status" aria-live="polite" className="sr-only">{announcement}</div>
    </>
  );
}
```

### Ogłoszenie licznika/odliczania

```javascript
function Countdown({ initialSeconds }) {
  const [seconds, setSeconds] = useState(initialSeconds);
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    const timer = setInterval(() => setSeconds(prev => Math.max(prev - 1, 0)), 1000);
    return () => clearInterval(timer);
  }, []);

  // Side effects derived from state — not inside the state updater
  useEffect(() => {
    if (seconds === 60) setAnnouncement('1 minute remaining');
    else if (seconds === 10) setAnnouncement('10 seconds remaining');
    else if (seconds === 0) setAnnouncement('Time expired');
  }, [seconds]);

  return (
    <>
      <div>{seconds} seconds</div>
      <div role="status" aria-live="assertive" className="sr-only">{announcement}</div>
    </>
  );
}
```

### Ogłoszenie wyników wyszukiwania

```javascript
function SearchResults() {
  const [results, setResults] = useState([]);
  const [announcement, setAnnouncement] = useState('');

  const search = async (query) => {
    setAnnouncement('Searching...');
    const data = await fetchResults(query);
    setResults(data);
    setAnnouncement(`${data.length} result${data.length !== 1 ? 's' : ''} found`);
  };

  return (
    <>
      <input type="search" onChange={(e) => search(e.target.value)} />
      <div role="status" aria-live="polite" className="sr-only">{announcement}</div>
      <ul>
        {results.map(r => <li key={r.id}>{r.title}</li>)}
      </ul>
    </>
  );
}
```

### Status autozapisu

```javascript
function Editor() {
  const [content, setContent] = useState('');
  const [saveStatus, setSaveStatus] = useState('');

  const autoSave = useCallback(
    debounce(async (text) => {
      setSaveStatus('Saving...');
      try {
        await saveContent(text);
        setSaveStatus('Draft saved');
        setTimeout(() => setSaveStatus(''), 2000);
      } catch {
        setSaveStatus('Failed to save');
      }
    }, 1000),
    []
  );

  return (
    <>
      <textarea value={content} onChange={(e) => { setContent(e.target.value); autoSave(e.target.value); }} />
      <div role="status" aria-live="polite">{saveStatus}</div>
    </>
  );
}
```

### Klasa „screen reader only”

```css
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}
```

## Zalety

- Czytniki ekranu ogłaszają zmiany treści, o których inaczej nie miałyby powodu wiedzieć.
- Wiadomości ogłaszane są automatycznie, bez dodatkowej interakcji użytkownika.
- Działa ze wszystkimi głównymi czytnikami ekranu (NVDA, JAWS, VoiceOver).
- Stany ładowania, kamienie milowe postępu i komunikaty ukończenia stają się słyszalne.
- Użytkownicy czytników ekranu otrzymują ten sam feedback co użytkownicy wzrokowi.

## Wady / tradeoffs

- Zbyt wiele ogłoszeń zamienia się w hałas audiowy — męczy i dezorientuje.
- Wybór poziomu grzeczności (`polite` vs `assertive`) ma realne znaczenie — źle dobrany psuje
  doświadczenie.
- Kontener live region **musi** istnieć w DOM przed zmianą treści.
- Szybkie, częste aktualizacje mogą przytłoczyć czytnik ekranu.
- Różne czytniki ekranu mają różne zachowania czasowe przy ogłoszeniach.
- Treść musi pozostać widoczna/obecna wystarczająco długo, żeby czytnik zdążył ją odczytać.
- `aria-atomic="true"` ogłasza **cały** region przy każdej zmianie; `false` ogłasza tylko zmienioną
  część — wybór wpływa na to, co użytkownik usłyszy.
- Testy automatyczne nie mogą zweryfikować, czy ogłoszenia są sensowne dla człowieka.

## Powiązane wzorce

- [ARIA Roles and Attributes](aria-roles-and-attributes.md)
- [Loading State](fe-architecture/references/resilience/loading-state.md)
- [Error Handling](fe-architecture/references/resilience/error-handling.md)
- [ARIA Live Regions — MDN](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/ARIA_Live_Regions)
- [aria-live Attribute — W3C](https://www.w3.org/TR/wai-aria-1.2/#aria-live)
- [Dynamic Content Accessibility — W3C](https://www.w3.org/WAI/ARIA/apg/practices/updating-content/)

## Kiedy używać / kiedy NIE używać

Używaj do **każdej** dynamicznej zmiany treści, o której użytkownik czytnika ekranu powinien się
dowiedzieć bez utraty swojej aktualnej pozycji fokusu (toast, wynik walidacji, status
zapisu/wyszukiwania). Domyślnie `polite` — `assertive` zarezerwuj **oszczędnie**, tylko dla
faktycznie krytycznych, wymagających natychmiastowej reakcji komunikatów (błąd blokujący dalsze
działanie); nadużycie `assertive` jest gorsze niż jego brak, bo przerywa użytkownikowi w trakcie
innej czynności. Nie stosuj live region dla treści, którą użytkownik i tak zobaczy przez przeniesienie
fokusu (patrz `focus-management.md`) — te dwa mechanizmy się czasem wykluczają: nie łącz obu na tę
samą zmianę bez konkretnego powodu.
