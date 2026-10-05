# Stop Generation

> **Spis treści:** Metadane · TLDR · Uwagi (stan 2026, poprawki względem źródła) · Problem · Rozwiązanie · Przykłady kodu · Zalety · Wady / tradeoffs · Powiązane wzorce · Kiedy używać / kiedy NIE używać

Źródło: frontendpatterns.dev/stop-generation.

## Metadane

- **Kategoria:** AI chat UI (u źródła: Resilience)
- **Poziom:** Intermediate
- **Przykłady:** React, Vue, Svelte, Native web
- **Data aktualizacji:** 2 lipca 2026
- **Autor:** Den Odell

## TLDR

„Give users a stop button that aborts the fetch with an AbortController, keeps whatever text
already streamed in, and lets the server know to stop generating.”

**Uwaga kontekstowa:** ten wzorzec dotyczy specyficznie interfejsów AI/chat ze streamowanymi
odpowiedziami — zbudowany bezpośrednio na `streaming-response.md`.

## Uwagi (stan 2026, poprawki względem źródła)

- **Po stronie serwera Node reaguj na `res.on('close')`, nie `req.on('close')`** — od Node 16 zdarzenie `close` na
  `req` odpala się po odczytaniu body żądania, a nie przy rozłączeniu klienta, więc generacja byłaby przerywana od razu
  (albo wcale). Poprawiono w przykładzie Express.
- Chroń się przed „starym” kontrolerem: po zakończeniu sprawdzaj, czy `controllerRef.current === controller`, zanim
  zmienisz status — inaczej abort poprzedniej generacji nadpisze stan nowej. Poprawiono w przykładzie React.
- Sprawdzaj `res.ok` przed odczytem strumienia; `AbortError` rozpoznawaj po `err.name === 'AbortError'`
  (przy `AbortSignal.timeout()` przychodzi `TimeoutError` — to już błąd, nie „stopped”).
- Przykłady Svelte używają składni Svelte 4 (`export let`, `$:`, `on:click`). W Svelte 5: `$props()`, `$state`,
  `$derived`, atrybuty `onclick`.

## Problem

Model źle interpretuje pytanie i generuje odpowiedź, która idzie w złym kierunku. Użytkownik
obserwuje ten proces w czasie rzeczywistym, ale nie ma sposobu, żeby go zatrzymać. Nawet gdy
przycisk „Stop” istnieje, bywa fasadą — żądanie sieciowe zostaje otwarte, tokeny są dalej generowane
i rozliczane (billing), mimo że użytkownik myśli, że proces został zatrzymany.

## Rozwiązanie

Stwórz `AbortController` przy starcie generacji i przekaż jego `signal` do `fetch`. Przechowuj
kontroler w referencji podczas streamowania. Po kliknięciu „Stop” wywołaj `controller.abort()`, co
odrzuca aktywny fetch i przerywa pętlę odczytu strumienia. Przechwyć wynikowy `AbortError` i
potraktuj go jako **normalny wynik** (`status: 'stopped'`), nie błąd.

Krytyczne: **zachowaj tokeny, które już przyszły** — abort powinien oznaczyć wiadomość jako
„stopped” i zostawić jej częściową zawartość widoczną, nie wymazać jej. Zamień przycisk „Wyślij” na
„Stop” podczas streamowania i z powrotem po zakończeniu.

## Przykłady kodu

### Wiring the Abort — React

```javascript
function useGeneration() {
  const [text, setText] = useState('');
  const [status, setStatus] = useState('idle'); // idle | streaming | stopped | error
  const controllerRef = useRef(null);

  const start = async (prompt) => {
    controllerRef.current?.abort(); // one generation at a time
    const controller = new AbortController();
    controllerRef.current = controller;
    const isCurrent = () => controllerRef.current === controller;
    setText('');
    setStatus('streaming');

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (isCurrent()) setText(prev => prev + decoder.decode(value, { stream: true }));
      }
      if (isCurrent()) setStatus('complete');
    } catch (err) {
      // Abort is an expected outcome, not an error
      if (isCurrent()) setStatus(err.name === 'AbortError' ? 'stopped' : 'error');
    }
  };

  const stop = () => controllerRef.current?.abort();

  return { text, status, start, stop };
}
```

### Wiring the Abort — Vue

```vue
<script setup>
import { ref } from 'vue';

const text = ref('');
const status = ref('idle');
let controller = null;

async function start(prompt) {
  controller = new AbortController();
  text.value = '';
  status.value = 'streaming';

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ prompt }),
      signal: controller.signal,
    });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      text.value += decoder.decode(value, { stream: true });
    }
    status.value = 'complete';
  } catch (err) {
    status.value = err.name === 'AbortError' ? 'stopped' : 'error';
  }
}

function stop() { controller?.abort(); }
defineExpose({ text, status, start, stop });
</script>
```

### Wiring the Abort — Svelte

```svelte
<script>
  let text = '';
  let status = 'idle';
  let controller = null;

  export async function start(prompt) {
    controller = new AbortController();
    text = '';
    status = 'streaming';

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        body: JSON.stringify({ prompt }),
        signal: controller.signal,
      });
      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
      }
      status = 'complete';
    } catch (err) {
      status = err.name === 'AbortError' ? 'stopped' : 'error';
    }
  }

  export const stop = () => controller?.abort();
</script>
```

### Wiring the Abort — Web Components

```javascript
class Generation extends HTMLElement {
  #controller = null;

  async start(prompt) {
    this.#controller = new AbortController();
    this.textContent = '';

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        body: JSON.stringify({ prompt }),
        signal: this.#controller.signal,
      });
      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        this.textContent += decoder.decode(value, { stream: true });
      }
      this.dataset.status = 'complete';
    } catch (err) {
      this.dataset.status = err.name === 'AbortError' ? 'stopped' : 'error';
    }
  }

  stop() { this.#controller?.abort(); }
}
customElements.define('ai-generation', Generation);
```

### The Stop Control

```javascript
function GenerationControls({ status, onStop }) {
  if (status !== 'streaming') return null;
  return (
    <button type="button" className="stop" onClick={onStop} aria-label="Stop generating">
      <StopIcon aria-hidden="true" /> Stop generating
    </button>
  );
}
```

### Keeping the Partial Answer

```javascript
function AssistantMessage({ text, status, onRegenerate }) {
  return (
    <article data-status={status}>
      <div className="content">{text}</div>
      {status === 'stopped' && (
        <footer className="stopped-note">
          <span>Stopped.</span>
          <button onClick={onRegenerate}>Regenerate</button>
        </footer>
      )}
    </article>
  );
}
```

### Stopping the Work on the Server

```javascript
// Express handler proxying a streaming model API
app.post('/api/chat', async (req, res) => {
  const upstream = new AbortController();

  // When the browser aborts, the response socket closes — stop generating too.
  // (Not req.on('close'): since Node 16 it fires once the request body is read.)
  res.on('close', () => { if (!res.writableEnded) upstream.abort(); });

  const modelStream = await model.chat({ messages: req.body.messages, signal: upstream.signal });
  for await (const chunk of modelStream) {
    res.write(chunk);
  }
  res.end();
});
```

## Zalety

- Użytkownik może wyjść z odpowiedzi idącej w złym kierunku, zamiast czekać na jej koniec.
- Wdrożenie abortu też po stronie serwera realnie zatrzymuje generowanie tokenów — nie płacisz za
  tokeny, których nikt już nie przeczyta.
- Zachowanie częściowego tekstu robi zatrzymanie **nieniszczącym** dla dotychczasowej odpowiedzi.
- Buduje się bezpośrednio na infrastrukturze `Streaming Response` — nie jest osobnym systemem.
- Jasna kontrola „Stop” daje użytkownikowi realne poczucie kontroli nad interfejsem.

## Wady / tradeoffs

- **Abort fetch po stronie klienta nie zatrzymuje samodzielnie generacji po stronie serwera** —
  obsługa zamknięcia połączenia (`res.on('close', ...)`) to łatwy do zapomnienia, ale krytyczny
  szczegół; bez niego serwer (i billing) działa dalej mimo „zatrzymanej” odpowiedzi w UI.
- `AbortError` przychodzi jako odrzucona Promise — bez rozpoznania go jako oczekiwanego wyniku,
  normalny stop wygląda jak błąd aplikacji.
- Wyścig (race condition) na granicy: użytkownik klika stop dokładnie w momencie, gdy przychodzi
  ostatni token.
- Częściowe odpowiedzi mogą być mylące, jeśli są ucięte w środku zdania/myśli.
- Czyszczenie referencji kontrolera ma znaczenie — nieaktualny, „stary” kontroler może przerwać
  niewłaściwe, już nieaktualne żądanie.

## Powiązane wzorce

- [Streaming Response](streaming-response.md) — ai-chat-ui
- [Response Regeneration](response-regeneration.md) — ai-chat-ui
- [Prompt Input](prompt-input.md)
- [Message Thread](message-thread.md)
- [AbortController (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/AbortController)
- [AbortSignal (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal)
- [Aborting a fetch (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch#aborting_a_fetch)

## Kiedy używać / kiedy NIE używać

Wymagane w każdym UI streamującym odpowiedzi modelu językowego — koszt per token i długość
generacji uzasadniają dania użytkownikowi realnej kontroli przerwania. **Nie ma sensu** poza tym
kontekstem: dla zwykłego, krótkiego `fetch()` po dane (nie-streamowane, szybkie) wystarczy zwykłe
`AbortController` przy odmontowaniu komponentu (cleanup), bez dedykowanego przycisku „Stop” w UI —
ten wzorzec jako *widoczna funkcja UI* ma sens tam, gdzie operacja jest długa i widoczna dla
użytkownika w czasie rzeczywistym.
