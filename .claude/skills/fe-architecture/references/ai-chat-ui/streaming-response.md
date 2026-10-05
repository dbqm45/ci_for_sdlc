# Streaming Response

> **Spis treści:** Metadane · TLDR · Uwagi (stan 2026, poprawki względem źródła) · Problem · Rozwiązanie · Przykłady kodu · Zalety · Wady / tradeoffs · Powiązane wzorce · Kiedy używać / kiedy NIE używać

Źródło: frontendpatterns.dev/streaming-response.

## Metadane

- **Kategoria:** AI chat UI (u źródła: Resilience)
- **Poziom:** Advanced
- **Przykłady:** React, Vue, Svelte, Native web
- **Data aktualizacji:** 28 czerwca 2026
- **Autor:** Den Odell

## TLDR

Odczytuj odpowiedź modelu jako strumień i dołączaj każdy fragment do interfejsu w miarę jego
przybycia, żeby użytkownik obserwował formowanie się odpowiedzi, zamiast patrzeć na wskaźnik
ładowania przez dziesięć sekund.

## Uwagi (stan 2026, poprawki względem źródła)

- Przed czytaniem strumienia sprawdź `response.ok` (4xx/5xx też mają body) i ustaw `Content-Type: application/json`.
  Po pętli wywołaj `decoder.decode()` bez argumentów, żeby opróżnić bufor dekodera. Poprawiono w przykładzie React.
- Parser SSE: ramka może mieć **kilka** linii `data:` (łącz je `\n`), a separatorem bywa `\r\n\r\n`. Format delty
  (`choices[0].delta.content`) jest specyficzny dla dostawcy — mapuj go w jednym adapterze, nie w komponencie.
  Gdy serwer jest Twój i to zwykły GET, rozważ natywne `EventSource` (ale nie obsługuje POST ani nagłówków).
- **Markdown z modelu renderuj przez sanitizer** (DOMPurify / Sanitizer API) albo parser, który nie przepuszcza
  surowego HTML — odpowiedź modelu to niezaufane dane (security/input-sanitization.md, security/output-encoding.md).
- Aktualizacja stanu na każdy chunk może obciążać render przy szybkich strumieniach — buforuj tokeny i wypychaj je
  raz na klatkę (`requestAnimationFrame`) — patrz fe-web-platform (`.claude/skills/fe-web-platform/references/core-web-vitals.md`, INP).
- Framework-agnostycznie: logikę odczytu strumienia trzymaj w zwykłej funkcji/async generatorze (jak `parseSSE`),
  a komponent (React hook, Vue composable, serwis Angular z `signal`) tylko dopisuje tokeny do stanu.
- Przykłady Svelte używają składni Svelte 4 (`export let`, `$:`, `on:click`). W Svelte 5: `$props()`, `$state`,
  `$derived`, atrybuty `onclick`.

## Problem

Użytkownik zadaje pytanie asystentowi i czeka. Aplikacja robi `await response.json()`, więc nic nie
pojawia się na ekranie, aż ostatni token zostanie wygenerowany — dziesięć sekund pustej przestrzeni,
potem ściana tekstu na raz. Interfejs wydaje się zepsuty, nawet jeśli backend jest szybki, bo
użytkownik nie ma żadnego dowodu, że coś się dzieje.

## Rozwiązanie

Zażądaj odpowiedzi strumieniowanej i czytaj treść w miarę jej przybycia, nie czekając na cały
payload. Większość API zwraca surowy strumień tekstu albo Server-Sent Events, gdzie każdy fragment
zawiera niewielką deltę odpowiedzi. Pobierz reader z `response.body`, dekoduj każdy fragment,
wyodrębnij delty i dołącz je do wyświetlanej wiadomości — to samo mutowanie stanu widoku aktualizuje
UI na każdym fragmencie, bez dodatkowego mechanizmu.

Dwa szczegóły łatwe do przegapienia: dekoduj przez strumieniowy `TextDecoder` (`{ stream: true }`),
żeby znak, którego bajty wypadły na granicy dwóch fragmentów, nie wyszedł zniekształcony; przekaż
sygnał `AbortController` przez `fetch`, żeby strumień mógł być anulowany (patrz `stop-generation.md`).

## Przykłady kodu

### Reading the Stream — React

```javascript
function useStreamingReply() {
  const [text, setText] = useState('');
  const [streaming, setStreaming] = useState(false);

  const send = async (prompt, signal) => {
    setText('');
    setStreaming(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
        signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        // stream: true keeps multi-byte characters intact across chunks
        const chunk = decoder.decode(value, { stream: true });
        setText(prev => prev + chunk);
      }
      const tail = decoder.decode(); // flush
      if (tail) setText(prev => prev + tail);
    } finally {
      setStreaming(false);
    }
  };

  return { text, streaming, send };
}
```

### Reading the Stream — Vue

```vue
<script setup>
import { ref } from 'vue';

const text = ref('');
const streaming = ref(false);

async function send(prompt, signal) {
  text.value = '';
  streaming.value = true;

  const response = await fetch('/api/chat', {
    method: 'POST',
    body: JSON.stringify({ prompt }),
    signal,
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      text.value += decoder.decode(value, { stream: true });
    }
  } finally {
    streaming.value = false;
  }
}

defineExpose({ text, streaming, send });
</script>

<template>
  <div class="reply">{{ text }}</div>
</template>
```

### Reading the Stream — Svelte

```svelte
<script>
  let text = '';
  let streaming = false;

  export async function send(prompt, signal) {
    text = '';
    streaming = true;

    const response = await fetch('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ prompt }),
      signal,
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
      }
    } finally {
      streaming = false;
    }
  }
</script>

<div class="reply">{text}</div>
```

### Reading the Stream — Web Components

```javascript
class StreamingReply extends HTMLElement {
  async send(prompt, signal) {
    this.textContent = '';

    const response = await fetch('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ prompt }),
      signal,
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      this.textContent += decoder.decode(value, { stream: true });
    }
  }
}
customElements.define('streaming-reply', StreamingReply);
```

### Parsing Server-Sent Events

```javascript
async function* parseSSE(response, signal) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // Frames are separated by a blank line; keep the trailing partial in the buffer
    const frames = buffer.split(/\r?\n\r?\n/);
    buffer = frames.pop();

    for (const frame of frames) {
      // A frame may carry several data: lines — join them
      const data = frame.split(/\r?\n/)
        .filter(l => l.startsWith('data:'))
        .map(l => l.slice(5).trimStart())
        .join('\n');
      if (!data) continue;

      if (data === '[DONE]') return;

      const token = JSON.parse(data).choices?.[0]?.delta?.content;
      if (token) yield token;
    }
  }
}

// Usage: for await (const token of parseSSE(response, signal)) append(token);
```

### Rendering Streaming Markdown

```javascript
function StreamingMarkdown({ text, streaming }) {
  const { safe, pending } = useMemo(() => {
    if (!streaming) return { safe: text, pending: '' };

    // If we're inside an unclosed code fence, render up to it as markdown
    // and show the rest as plain text until the closing ``` arrives.
    const fenceCount = (text.match(/```/g) || []).length;
    if (fenceCount % 2 === 1) {
      const lastFence = text.lastIndexOf('```');
      return { safe: text.slice(0, lastFence), pending: text.slice(lastFence) };
    }
    return { safe: text, pending: '' };
  }, [text, streaming]);

  // <Markdown> must not pass raw HTML through (or must sanitize it) — model output is untrusted
  return (
    <div className="markdown">
      <Markdown>{safe}</Markdown>
      {pending && <pre className="pending">{pending}</pre>}
    </div>
  );
}
```

### Staying Anchored to the Latest Text

```javascript
function useStickToBottom(ref, dep) {
  const pinned = useRef(true);

  useEffect(() => {
    const el = ref.current;
    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      pinned.current = distance < 40; // near the bottom = follow along
    };
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, [ref]);

  useEffect(() => {
    if (pinned.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [dep, ref]); // dep = the streaming text, so this runs on every chunk
}
```

## Zalety

- Interfejs wydaje się responsywny nawet na wolnym modelu — tekst pojawia się w ciągu sekundy i
  nigdy się nie zatrzymuje na dłużej.
- Subiektywny czas czekania jest krótszy — czytanie formującej się odpowiedzi wypełnia czas, który
  inaczej byłby „martwy”.
- Użytkownik może zacząć reagować na początek długiej odpowiedzi, zanim koniec się jeszcze
  wygeneruje.
- Porzucanie interakcji spada — jest stały dowód, że aplikacja działa, nie cisza odczytywana jako
  „zamrożenie”.
- Łączy się naturalnie z `Stop Generation` — masz już reader i sygnał przerwania pod ręką.

## Wady / tradeoffs

- Granice fragmentów **nie** pokrywają się ze znakami/tokenami/składnią markdown — naiwne
  dekodowanie/renderowanie widocznie psuje output (patrz obsługa `{ stream: true }` i niedomkniętych
  code-fence'ów w przykładach wyżej).
- Streamowany markdown jest naprawdę zawiły — niedomknięte code fence'y, tabele, listy wymagają
  specjalnej obsługi, żeby uniknąć migotania.
- Obsługa błędów jest trudniejsza — żądanie może zawiść **po tym**, jak użytkownik już zobaczył
  połowę odpowiedzi.
- Auto-scroll walczy z użytkownikiem, jeśli nie wykryjesz, że celowo przewinął się w górę, żeby
  przeczytać coś wcześniej (patrz `useStickToBottom`).
- Tracisz możliwość walidacji/post-processingu **całej** odpowiedzi przed pierwszym wyświetleniem
  czegokolwiek.
- Część infrastruktury sieciowej (niektóre proxy, warstwy kompresji) buforuje całą odpowiedź, zanim
  ją przekaże dalej — to całkowicie uniemożliwia streamowanie, niezależnie od kodu frontendu.

## Powiązane wzorce

- Thinking Indicator — ai-chat-ui (`thinking-indicator.md`)
- [Stop Generation](stop-generation.md) — ai-chat-ui
- [Message Thread](message-thread.md)
- [Loading State](../resilience/loading-state.md) — Resilience
- Streaming API Responses — OpenAI
- Streaming — Anthropic
- [Streams API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Streams_API)
- [Using Server-Sent Events (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)

## Kiedy używać / kiedy NIE używać

Sięgaj po streaming, gdy operacja generuje treść **przyrostowo** i trwa na tyle długo (>1-2s), że
brak informacji zwrotnej realnie szkodzi doświadczeniu — odpowiedzi modeli AI to typowy przypadek.
**Nie** streamuj krótkich, szybkich odpowiedzi (proste zapytanie do bazy danych trwające 100ms) —
narzut implementacyjny (parsowanie SSE, obsługa granic fragmentów, auto-scroll) nie ma tam żadnego
zysku percepcyjnego; zwykły `await response.json()` + `loading-state.md` jest prostsze i wystarczające.
