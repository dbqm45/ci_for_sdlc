# Prompt Input

> **Spis treści:** Metadane · TLDR · Uwagi (stan 2026, poprawki względem źródła) · Problem · Rozwiązanie · Przykłady kodu · Zalety · Wady / tradeoffs · Powiązane wzorce · Kiedy używać / kiedy NIE używać

Źródło: frontendpatterns.dev/prompt-input.

## Metadane

- **Kategoria:** AI chat UI (u źródła: Components)
- **Poziom:** Intermediate
- **Przykłady:** React, Vue, Svelte, Native web
- **Data aktualizacji:** June 29, 2026
- **Autor:** Den Odell

## TLDR

„A chat composer is a textarea, not a text field: it grows with its content, sends on Enter but adds a newline on Shift+Enter, respects IME composition, and turns into a stop button while the model is replying.”

## Uwagi (stan 2026, poprawki względem źródła)

- `field-sizing: content` — Chromium od 2024; w pozostałych silnikach sprawdź wsparcie (Baseline) i zostaw JS-owy
  auto-grow jako fallback (`@supports not (field-sizing: content)`).
- Sprawdzanie IME: w React `e.nativeEvent.isComposing`; w innych — `e.isComposing` (fallback `e.keyCode === 229` tylko
  dla starych Safari). Dodaj też obsługę `compositionend`, jeśli wysyłasz przy końcu kompozycji.
- Pole potrzebuje dostępnej nazwy (`<label>` lub `aria-label`), sam `placeholder` nią nie jest — fe-web-platform
  (`.claude/skills/fe-web-platform/references/accessibility/accessible-forms.md`).
- Przykłady Svelte używają składni Svelte 4 (`export let`, `$:`, `on:click`, `createEventDispatcher`). W Svelte 5
  odpowiednio: `let { … } = $props()`, `$derived`/`$effect`, atrybuty `onclick`, callback props zamiast dispatchera.
- Angular (fw-angular): stan wątku w `signal<Message[]>` + `computed`, strumień przez `HttpClient` z
  `observe: 'events', reportProgress: true` albo `fetch` w serwisie; `@for (m of messages(); track m.id)`.

## Problem

Naiwny input tekstowy w interfejsie czatu/AI ma cztery typowe problemy:
1. Użytkownik nie może pisać wielolinijkowo bez przewijania niewidocznego tekstu.
2. Enter wysyła niedokończoną wiadomość zamiast dodać nową linię.
3. Przy kompozycji IME (japoński, chiński, koreański) Enter potwierdzający znaki wysyła wiadomość przedwcześnie.
4. Przycisk Send zostaje aktywny podczas generowania odpowiedzi, co pozwala na kolizję promptów (dwa żądania naraz).

## Rozwiązanie

- Użyj `<textarea>`, nie `<input>`.
- Auto-grow elementu do maksymalnej wysokości, potem scroll.
- Enter wysyła; Shift+Enter (lub Ctrl/Cmd+Enter) dodaje nową linię.
- Ignoruj Enter podczas aktywnej kompozycji IME (`event.isComposing` albo `event.keyCode === 229`).
- Przycisk zmienia się z Send na Stop podczas generowania odpowiedzi.
- Przycinaj (`trim`) białe znaki przed wysłaniem.
- Wyczyść pole i zresetuj wysokość po wysłaniu.

## Przykłady kodu

### React

```javascript
function PromptInput({ onSend, busy }) {
  const [value, setValue] = useState('');
  const ref = useRef(null);

  const grow = (el) => {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  };

  const submit = () => {
    const text = value.trim();
    if (!text || busy) return;
    onSend(text);
    setValue('');
    ref.current.style.height = 'auto';
  };

  const onKeyDown = (e) => {
    // Enter sends; Shift+Enter is a newline; ignore Enter mid-IME-composition
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <textarea
      ref={ref}
      rows={1}
      aria-label="Message the assistant"
      value={value}
      placeholder="Message the assistant…"
      onChange={(e) => { setValue(e.target.value); grow(e.target); }}
      onKeyDown={onKeyDown}
    />
  );
}
```

### Vue

```javascript
<script setup>
import { ref } from 'vue';

const props = defineProps({ busy: Boolean });
const emit = defineEmits(['send']);
const value = ref('');
const el = ref(null);

function grow() {
  el.value.style.height = 'auto';
  el.value.style.height = Math.min(el.value.scrollHeight, 200) + 'px';
}

function submit() {
  const text = value.value.trim();
  if (!text || props.busy) return;
  emit('send', text);
  value.value = '';
  el.value.style.height = 'auto';
}

function onKeyDown(e) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    submit();
  }
}
</script>

<template>
  <textarea
    ref="el"
    rows="1"
    v-model="value"
    placeholder="Message the assistant…"
    @input="grow"
    @keydown="onKeyDown"
  />
</template>
```

### Svelte

```javascript
<script>
  export let busy = false;
  let value = '';
  let el;

  function grow() {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  }

  function submit() {
    const text = value.trim();
    if (!text || busy) return;
    dispatch('send', text);
    value = '';
    el.style.height = 'auto';
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      submit();
    }
  }

  import { createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher();
</script>

<textarea
  bind:this={el}
  bind:value
  rows="1"
  placeholder="Message the assistant…"
  on:input={grow}
  on:keydown={onKeyDown}
/>
```

### Web Components

```javascript
class PromptInput extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `<textarea rows="1" placeholder="Message the assistant…"></textarea>`;
    const el = this.querySelector('textarea');

    el.addEventListener('input', () => {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 200) + 'px';
    });

    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        const text = el.value.trim();
        if (!text || this.hasAttribute('busy')) return;
        this.dispatchEvent(new CustomEvent('send', { detail: text }));
        el.value = '';
        el.style.height = 'auto';
      }
    });
  }
}
customElements.define('prompt-input', PromptInput);
```

### Send albo Stop, nigdy oba naraz

```javascript
function Composer({ busy, canSend, onSend, onStop }) {
  return (
    <form className="composer" onSubmit={(e) => { e.preventDefault(); onSend(); }}>
      <textarea /* …as above… */ />
      {busy ? (
        <button type="button" onClick={onStop} aria-label="Stop generating">
          <StopIcon /> Stop
        </button>
      ) : (
        <button type="submit" disabled={!canSend} aria-label="Send message">
          <SendIcon /> Send
        </button>
      )}
    </form>
  );
}
```

### Auto-grow tylko przez CSS

```css
.composer textarea {
  field-sizing: content;   /* grows with content where supported */
  min-height: 2.5rem;
  max-height: 12rem;       /* then it scrolls */
  resize: none;
  overflow-y: auto;
}
```

### Baseline bez JavaScriptu

```html
<form action="/chat" method="post" class="composer">
  <textarea name="prompt" rows="1" required placeholder="Message the assistant…"></textarea>
  <button type="submit">Send</button>
</form>
```

## Zalety

- Wielolinijkowe prompty działają naturalnie, bez przewijania niewidocznego tekstu.
- Enter-to-send z Shift+Enter dla nowej linii odpowiada konwencji znanej z innych aplikacji czatowych.
- Respektowanie kompozycji IME zapobiega przypadkowemu wysłaniu wiadomości przez użytkowników piszących po japońsku, chińsku, koreańsku i innych językach wymagających IME.
- Zamiana Send na Stop podczas generowania jasno komunikuje aktualny stan systemu.
- Auto-grow utrzymuje cały szkic widoczny; opakowanie w `<form>` daje działającą linię bazową jeszcze przed załadowaniem JavaScriptu (Progressive Enhancement).

## Wady / tradeoffs

- Obsługa klawiatury ma wiele edge case’ów (IME, potwierdzenie autouzupełnienia, klawiatury mobilne) — wymaga testów na rzeczywistych urządzeniach, nie tylko w desktopowej przeglądarce.
- Enter-to-send może zaskoczyć część użytkowników oczekujących Enter = nowa linia — konwencja jest powszechna w czatach, ale wymaga odkrywalnego UI (np. podpowiedzi „Shift+Enter for new line”).
- JavaScriptowy auto-grow wymusza reflow przy każdym naciśnięciu klawisza; CSS `field-sizing` jest czystszy, ale nie wszędzie wspierany.
- Na małych ekranach rosnący textarea konkuruje z klawiaturą ekranową o miejsce — potrzebny sensowny limit wysokości.
- Przełączanie stanu busy/idle na przycisku dodaje stan, który musi być zsynchronizowany z rzeczywistym przebiegiem generowania odpowiedzi.

## Powiązane wzorce

- [Message Thread](message-thread.md) — ai-chat-ui.
- [Stop Generation](stop-generation.md) — ai-chat-ui.
- [Streaming Response](streaming-response.md) — ai-chat-ui.
- `<textarea>` — MDN.
- `KeyboardEvent.isComposing` — MDN.
- `field-sizing` — MDN.

## Kiedy używać / kiedy NIE używać

Używaj tego wzorca zawsze, gdy budujesz pole wejściowe dla interfejsu czatu/AI — edge case’y (IME, multiline, busy state) są realne i regularnie zgłaszane przez użytkowników, nie teoretyczne.

Dla zwykłego, jednoliniowego pola formularza (np. wyszukiwarka, e-mail) to jest nadmiarowe — zwykły `<input type="text">` bez auto-grow/IME-handling wystarczy; nie kopiuj tej złożoności tam, gdzie nie ma multiline treści do wpisania.
