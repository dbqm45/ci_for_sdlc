# Message Thread

> **Spis treści:** Metadane · TLDR · Uwagi (stan 2026, poprawki względem źródła) · Problem · Rozwiązanie · Przykłady kodu · Zalety · Wady / tradeoffs · Powiązane wzorce · Kiedy używać / kiedy NIE używać

Źródło: frontendpatterns.dev/message-thread („Structuring an AI Conversation Transcript”).

## Metadane

- **Kategoria:** AI chat UI (u źródła: Components)
- **Poziom:** Intermediate
- **Przykłady:** React, Vue, Svelte, Native web
- **Data aktualizacji:** June 30, 2026
- **Autor:** Den Odell

## TLDR

„Represent a conversation as an ordered array of messages, each with a stable id, a role, content, and its own status.”

## Uwagi (stan 2026, poprawki względem źródła)

- **Treść od modelu jest niezaufana** (prompt injection może przemycić HTML/JS). Renderuj ją jako tekst
  (interpolacja frameworka, `textContent`) albo przez parser markdown + sanitizer (DOMPurify / Sanitizer API) —
  nigdy przez surowe `innerHTML`. Przykład Web Components niżej został poprawiony z `innerHTML` na DOM API.
- Nie zagnieżdżaj live regionów: `role="log"` na wątku już ogłasza dopisane węzły (polite). Podczas streamowania
  ustaw `aria-busy="true"` na wiadomości asystenta i zdejmij je po zakończeniu — inaczej czytnik ogłasza każdy token.
  Przykład „ogłaszaj raz” niżej stosuj zamiast `aria-live` na kontenerze, nie razem z nim.
- Przykłady Svelte używają składni Svelte 4 (`export let`, `$:`, `on:click`, `createEventDispatcher`). W Svelte 5
  odpowiednio: `let { … } = $props()`, `$derived`/`$effect`, atrybuty `onclick`, callback props zamiast dispatchera.
- Angular (fw-angular): stan wątku w `signal<Message[]>` + `computed`, strumień przez `HttpClient` z
  `observe: 'events', reportProgress: true` albo `fetch` w serwisie; `@for (m of messages(); track m.id)`.

## Problem

Częsty błąd: przechowywanie konwersacji jako dwóch osobnych stringów (ostatni prompt użytkownika + ostatnia odpowiedź asystenta) albo umieszczenie flag typu `isStreaming`/`error` na szczycie całego komponentu. To powoduje wyciek stanu między wiadomościami — błąd jednej odpowiedzi wpływa na cały wątek. Cytat ze strony: „A conversation is a list of turns, each authored by someone, each in some state of completion.”

## Rozwiązanie

Przechowuj konwersację jako uporządkowaną tablicę obiektów wiadomości, każdy z:
- stabilnym `id`,
- `role` (`user`, `assistant`, `system`),
- `content`,
- `status` (`streaming`, `complete`, `stopped`, `error`).

## Przykłady kodu

### Model konwersacji (reducer)

```javascript
function conversationReducer(messages, action) {
  switch (action.type) {
    case 'send':
      return [
        ...messages,
        { id: crypto.randomUUID(), role: 'user', content: action.text, status: 'complete' },
        { id: action.replyId, role: 'assistant', content: '', status: 'streaming' },
      ];

    case 'token': // append a streamed chunk to one assistant message
      return messages.map(m =>
        m.id === action.id ? { ...m, content: m.content + action.chunk } : m
      );

    case 'finish': // 'complete' | 'stopped' | 'error'
      return messages.map(m =>
        m.id === action.id ? { ...m, status: action.status } : m
      );

    default:
      return messages;
  }
}
```

### Renderowanie transkryptu — React

```jsx
function MessageThread({ messages }) {
  return (
    <div className="thread" role="log" aria-live="polite" aria-label="Conversation">
      {messages.map(m => (
        <article key={m.id} className={`message message--${m.role}`} data-status={m.status}>
          <span className="role">{m.role === 'user' ? 'You' : 'Assistant'}</span>
          <div className="content">
            {m.content || (m.status === 'streaming' && <ThinkingIndicator />)}
          </div>
          {m.status === 'error' && <RetryButton id={m.id} />}
        </article>
      ))}
    </div>
  );
}
```

### Vue

```vue
<template>
  <div class="thread" role="log" aria-live="polite" aria-label="Conversation">
    <article
      v-for="m in messages"
      :key="m.id"
      :class="`message message--${m.role}`"
      :data-status="m.status"
    >
      <span class="role">{{ m.role === 'user' ? 'You' : 'Assistant' }}</span>
      <div class="content">
        <template v-if="m.content">{{ m.content }}</template>
        <ThinkingIndicator v-else-if="m.status === 'streaming'" />
      </div>
      <RetryButton v-if="m.status === 'error'" :id="m.id" />
    </article>
  </div>
</template>

<script setup>
defineProps({ messages: Array });
</script>
```

### Svelte

```svelte
<script>
  export let messages = [];
</script>

<div class="thread" role="log" aria-live="polite" aria-label="Conversation">
  {#each messages as m (m.id)}
    <article class="message message--{m.role}" data-status={m.status}>
      <span class="role">{m.role === 'user' ? 'You' : 'Assistant'}</span>
      <div class="content">
        {#if m.content}{m.content}
        {:else if m.status === 'streaming'}<ThinkingIndicator />{/if}
      </div>
      {#if m.status === 'error'}<RetryButton id={m.id} />{/if}
    </article>
  {/each}
</div>
```

### Web Components

```javascript
class MessageThread extends HTMLElement {
  set messages(list) {
    this.setAttribute('role', 'log');
    // DOM API zamiast innerHTML: treść modelu/użytkownika nigdy nie jest parsowana jako HTML
    this.replaceChildren(...list.map(m => {
      const article = document.createElement('article');
      article.className = `message message--${m.role}`;
      article.dataset.status = m.status;
      article.setAttribute('aria-busy', String(m.status === 'streaming'));
      const role = document.createElement('span');
      role.className = 'role';
      role.textContent = m.role === 'user' ? 'You' : 'Assistant';
      const content = document.createElement('div');
      content.className = 'content';
      content.textContent = m.content || (m.status === 'streaming' ? '…' : '');
      article.append(role, content);
      return article;
    }));
  }
}
customElements.define('message-thread', MessageThread);
```

### Stylowanie tur wizualnie i semantycznie

```css
.message { display: grid; gap: 0.25rem; padding: 0.75rem 1rem; }
.message--user { justify-items: end; }
.message--user .content { background: var(--accent); color: var(--on-accent); border-radius: 1rem 1rem 0 1rem; }
.message--assistant .content { background: var(--surface); border-radius: 1rem 1rem 1rem 0; }
.message[data-status="error"] { outline: 1px solid var(--danger); }
.message[data-status="stopped"] .content::after { content: " (stopped)"; opacity: 0.6; }
```

### Ogłaszanie nowej tury tylko raz (nie per token)

```jsx
function AssistantMessage({ message }) {
  const done = message.status !== 'streaming';
  return (
    <div
      className="content"
      // Only announce once the turn is complete, not on every token
      aria-live={done ? 'polite' : 'off'}
    >
      {message.content}
    </div>
  );
}
```

## Zalety

- „Streaming, stopping, and errors scope to a single turn” — błąd/streaming jednej wiadomości nie wpływa na resztę wątku.
- Stabilne `id` umożliwiają ponowne wykorzystanie węzłów DOM (kluczowanie list).
- Historia, edycja, branching i regeneracja stają się prostymi operacjami na tablicy (map/filter), nie na dwóch osobnych stringach.
- Rola `log` + `aria-live` czynią konwersację dostępną dla technologii wspomagających.
- Znormalizowana tablica jest łatwa do zserializowania i przetestowania.

## Wady / tradeoffs

- Wymaga dyscypliny, żeby nie „przeciekał” stan z powrotem na poziom pojedynczego komponentu (top-level flags).
- Live regiony per-wiadomość wymagają ostrożnej obsługi ogłoszeń (patrz przykład „ogłaszaj raz, nie per token”).
- Długie wątki ostatecznie wymagają wirtualizacji listy, co komplikuje logikę przewijania.
- Bogata zawartość wewnątrz wiadomości (markdown, kod, obrazy) to osobny problem renderowania, nie rozwiązany przez sam model danych.
- Generowanie stabilnych `id` (`crypto.randomUUID()`) dodaje niewielką, ale dodatkową ceremonię.

## Powiązane wzorce

- [Streaming Response](streaming-response.md) — ai-chat-ui.
- [Prompt Input](prompt-input.md) — ai-chat-ui.
- [Response Regeneration](response-regeneration.md) — ai-chat-ui.
- [Thinking Indicator](thinking-indicator.md) — ai-chat-ui.
- The `log` role — MDN.
- Normalizing State Shape — Redux docs.
- List rendering keys — React docs.

## Kiedy używać / kiedy NIE używać

Używaj tego modelu zawsze, gdy budujesz UI konwersacyjne/czatowe (z AI albo między ludźmi) — nawet prosty MVP korzysta na tym, bo dodanie streamingu/retry/regeneracji później do „dwóch stringów” wymaga przepisania całego stanu, a do tablicy wiadomości — tylko dodania pola `status`.

Nie wprowadzaj tego dla prostego, jednorazowego komunikatu (np. jeden toast/alert) — to jest wzorzec dla **wątku** wielu tur, nie dla pojedynczej wiadomości bez historii.
