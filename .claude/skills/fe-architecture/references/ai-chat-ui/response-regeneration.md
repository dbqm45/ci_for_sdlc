# Response Regeneration

> **Spis treści:** Metadane · TLDR · Uwagi (stan 2026, poprawki względem źródła) · Problem · Rozwiązanie · Przykłady kodu · Zalety · Wady / tradeoffs · Powiązane wzorce · Kiedy używać / kiedy NIE używać

Źródło: frontendpatterns.dev/response-regeneration.

## Metadane

- **Kategoria:** AI chat UI (u źródła: Resilience)
- **Poziom:** Intermediate
- **Przykłady:** React, Vue, Svelte, Native web
- **Data aktualizacji:** 2 lipca 2026
- **Autor:** Den Odell

## TLDR

„Because a model gives a different answer each time, regenerating is a core action, not an error
path. Re-run the prompt, keep the earlier attempts as switchable variants, and let users compare
instead of losing the previous reply.”

**Uwaga kontekstowa:** ten wzorzec jest specyficzny dla interfejsów AI/chat (odpowiedzi modelu
językowego są niedeterministyczne) — nie ma odpowiednika w zwykłych, deterministycznych aplikacjach
CRUD, gdzie ten sam request zawsze daje tę samą odpowiedź.

## Uwagi (stan 2026, poprawki względem źródła)

- **Tokeny adresuj po `variantId`, nie po `activeVariant`** — jeśli użytkownik przełączy wariant w trakcie
  streamowania, tokeny trafiłyby do złej wersji. Poprawiono w reducerze niżej.
- `temperature` nie jest obsługiwane przez wszystkie modele (część modeli rozumujących je ignoruje lub odrzuca) —
  różnorodność zapewnij przez parametry danego API albo po prostu przez ponowne próbkowanie; sprawdź dokumentację
  dostawcy.
- Przykład Web Components poprawiony z `innerHTML` (treść modelu = niezaufane dane) na DOM API.
- Przykłady Svelte używają składni Svelte 4 (`export let`, `$:`, `on:click`). W Svelte 5: `$props()`, `$state`,
  `$derived`, atrybuty `onclick`.

## Problem

Użytkownik otrzymuje odpowiedź „prawie dobrą” i chce spróbować jeszcze raz. Złe implementacje: brak
opcji regeneracji wcale (użytkownik musi przepisać pytanie), albo przycisk regeneracji **nadpisuje**
poprzednią odpowiedź — jeśli nowa wersja jest gorsza, poprzednia, akceptowalna wersja jest już
utracona bezpowrotnie.

## Rozwiązanie

Regeneracja re-uruchamia to samo pytanie i przechowuje wynik **obok** poprzedniego, nie na jego
miejscu. Wiadomość asystenta ma listę wariantów + wskaźnik aktywnego wariantu; kontrolka „‹ 2 / 3 ›”
pozwala przełączać się między próbami — poprzednia odpowiedź nigdy nie jest utracona, tylko staje
się jedną z kilku opcji. Regeneracja wchodzi w ten sam cykl co oryginalna generacja: może
streamować, może być zatrzymana (patrz `stop-generation.md`), może failować i być powtórzona (patrz
`retry.md`) — różni się tylko tym, **gdzie** ląduje wynik.

## Przykłady kodu

### Modeling Variants (reducer)

```javascript
// Assistant turn with switchable attempts
// { id, role: 'assistant', variants: [{ id, content, status }], activeVariant: 0 }

function messageReducer(message, action) {
  switch (action.type) {
    case 'regenerate': // append a fresh, streaming variant and switch to it
      return {
        ...message,
        variants: [...message.variants, { id: action.variantId, content: '', status: 'streaming' }],
        activeVariant: message.variants.length,
      };

    case 'token': // target the variant that is streaming, not whichever one is on screen
      return {
        ...message,
        variants: message.variants.map(v =>
          v.id === action.variantId ? { ...v, content: v.content + action.chunk } : v
        ),
      };

    case 'finish': // 'complete' | 'stopped' | 'error'
      return {
        ...message,
        variants: message.variants.map(v =>
          v.id === action.variantId ? { ...v, status: action.status } : v
        ),
      };

    case 'switch': // page between attempts without losing any
      return { ...message, activeVariant: action.index };

    default:
      return message;
  }
}
```

### Regenerate and Switch Between Attempts — React

```javascript
function AssistantTurn({ message, onRegenerate, onSwitch }) {
  const { variants, activeVariant } = message;
  const active = variants[activeVariant];
  const many = variants.length > 1;

  return (
    <article className="assistant-turn">
      <div className="content">{active.content}</div>
      <footer className="actions">
        {many && (
          <div className="variant-pager" role="group" aria-label="Response versions">
            <button onClick={() => onSwitch(activeVariant - 1)} disabled={activeVariant === 0} aria-label="Previous version">‹</button>
            <span>{activeVariant + 1} / {variants.length}</span>
            <button onClick={() => onSwitch(activeVariant + 1)} disabled={activeVariant === variants.length - 1} aria-label="Next version">›</button>
          </div>
        )}
        <button onClick={onRegenerate} disabled={active.status === 'streaming'}>
          Regenerate
        </button>
      </footer>
    </article>
  );
}
```

### Regenerate and Switch Between Attempts — Vue

```vue
<template>
  <article class="assistant-turn">
    <div class="content">{{ active.content }}</div>
    <footer class="actions">
      <div v-if="variants.length > 1" class="variant-pager" role="group" aria-label="Response versions">
        <button @click="onSwitch(message.activeVariant - 1)" :disabled="message.activeVariant === 0">‹</button>
        <span>{{ message.activeVariant + 1 }} / {{ variants.length }}</span>
        <button @click="onSwitch(message.activeVariant + 1)" :disabled="message.activeVariant === variants.length - 1">›</button>
      </div>
      <button @click="onRegenerate" :disabled="active.status === 'streaming'">Regenerate</button>
    </footer>
  </article>
</template>

<script setup>
import { computed } from 'vue';
const props = defineProps({ message: Object });
defineEmits(['regenerate', 'switch']);
const variants = computed(() => props.message.variants);
const active = computed(() => variants.value[props.message.activeVariant]);
</script>
```

### Regenerate and Switch Between Attempts — Svelte

```svelte
<script>
  export let message;
  export let onRegenerate;
  export let onSwitch;
  $: variants = message.variants;
  $: active = variants[message.activeVariant];
</script>

<article class="assistant-turn">
  <div class="content">{active.content}</div>
  <footer class="actions">
    {#if variants.length > 1}
      <div class="variant-pager" role="group" aria-label="Response versions">
        <button on:click={() => onSwitch(message.activeVariant - 1)} disabled={message.activeVariant === 0}>‹</button>
        <span>{message.activeVariant + 1} / {variants.length}</span>
        <button on:click={() => onSwitch(message.activeVariant + 1)} disabled={message.activeVariant === variants.length - 1}>›</button>
      </div>
    {/if}
    <button on:click={onRegenerate} disabled={active.status === 'streaming'}>Regenerate</button>
  </footer>
</article>
```

### Regenerate — Web Components

```javascript
class AssistantTurn extends HTMLElement {
  set message(m) {
    const active = m.variants[m.activeVariant];
    const many = m.variants.length > 1;
    const content = document.createElement('div');
    content.className = 'content';
    content.textContent = active.content; // model output is untrusted — never innerHTML
    const footer = document.createElement('footer');
    footer.className = 'actions';
    if (many) {
      const pager = document.createElement('span');
      pager.textContent = `${m.activeVariant + 1} / ${m.variants.length}`;
      footer.append(pager);
    }
    const regen = document.createElement('button');
    regen.textContent = 'Regenerate';
    regen.onclick = () => this.dispatchEvent(new CustomEvent('regenerate'));
    footer.append(regen);
    this.replaceChildren(content, footer);
  }
}
customElements.define('assistant-turn', AssistantTurn);
```

### Nudging the Model to Differ

```javascript
function regenerate(messages, previousAttempts) {
  return model.chat({
    messages,
    // Push variety up as attempts accumulate so users don't get the same answer twice
    temperature: Math.min(0.7 + previousAttempts * 0.15, 1.2),
  });
}
```

### Edit-and-Resubmit Truncates the Thread

```javascript
function editAndResubmit(messages, editedId, newText) {
  const index = messages.findIndex(m => m.id === editedId);
  // Everything after the edited prompt is now stale
  const kept = messages.slice(0, index);
  return [...kept, { ...messages[index], content: newText }];
  // …then start a new generation from this truncated history
}
```

## Zalety

- Użytkownik może próbować uzyskać lepszą odpowiedź bez przepisywania pytania od zera.
- Przechowywanie prób jako wariantów robi regenerację **niedestruktywną** — poprzednia odpowiedź jest
  o jedno kliknięcie dalej, nie zgubiona.
- Paginator wariantów pozwala porównać wersje i wybrać preferowaną.
- Ponowne wykorzystanie istniejącej infrastruktury streamingu/stop/retry — regeneracja nie jest
  osobnym systemem.
- Edit-and-resubmit daje czysty sposób poprawienia **wejścia**, zamiast negocjowania z modelem nad
  samym wyjściem.

## Wady / tradeoffs

- Każdy zachowany wariant to pełna odpowiedź w pamięci/storage — koszt rośnie przy długich
  rozmowach z wieloma regeneracjami.
- Paginator wariantów dodaje UI i stan, który musi zostać spójny w trakcie streamowania **nowej**
  próby.
- Bez zwiększenia temperature/próbkowania regeneracja może dać praktycznie identyczną odpowiedź —
  funkcja wygląda wtedy jak zepsuta.
- Edit-and-resubmit musi obciąć kolejne tury rozmowy — to destruktywne, jeśli nie zbudujesz pełnego
  rozgałęzienia konwersacji (branching).
- Definicja „odpowiedzi” (do zapisu, eksportu, dalszego użycia) robi się niejednoznaczna, gdy jedna
  wiadomość ma wiele wariantów.

## Powiązane wzorce

- [Stop Generation](stop-generation.md) — ai-chat-ui
- [Message Thread](message-thread.md)
- [Streaming Response](streaming-response.md) — ai-chat-ui
- [Retry](../resilience/retry.md) — Resilience
- [Prompt Input](prompt-input.md)
- Temperature and sampling — OpenAI
- Regenerate response — wzorce ChatGPT
- Structuring Reducers — Redux

## Kiedy używać / kiedy NIE używać

Sięgaj po ten wzorzec **wyłącznie** w interfejsach generatywnego AI/chatu, gdzie ten sam prompt
realnie może dać inną odpowiedź. **Nie przenoś** tego mechanizmu do zwykłych, deterministycznych
operacji (np. „regeneruj raport”) — tam powtórzenie tej samej operacji daje ten sam wynik, a
kolekcja „wariantów” nie ma sensu i tylko komplikuje model danych bez żadnej korzyści.
