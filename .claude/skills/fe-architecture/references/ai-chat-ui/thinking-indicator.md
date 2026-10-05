# Thinking Indicator

> **Spis treści:** Metadane · TLDR · Uwagi (stan 2026, poprawki względem źródła) · Problem · Rozwiązanie · Przykłady kodu · Zalety · Wady / tradeoffs · Powiązane wzorce · Kiedy używać / kiedy NIE używać

Źródło: frontendpatterns.dev/thinking-indicator.

## Metadane

- **Kategoria:** AI chat UI (u źródła: Resilience)
- **Poziom:** Beginner
- **Przykłady:** React, Vue, Svelte, Native web
- **Data aktualizacji:** 28 czerwca 2026
- **Autor:** Den Odell

## TLDR

„The one to three seconds between sending a prompt and the first token is the most anxious moment
of an AI interaction. Fill it with a thinking state that appears instantly, is announced to
assistive tech, respects reduced motion, and disappears the moment real text arrives.”

## Uwagi (stan 2026, poprawki względem źródła)

- `.sr-only`: właściwość `clip` jest przestarzała — używaj `clip-path: inset(50%)` + `white-space: nowrap`
  (poprawione w CSS niżej).
- Jeśli wskaźnik siedzi wewnątrz wątku z `role="log"` (message-thread.md), nie dawaj mu własnego `role="status"`
  — zagnieżdżone live regiony dają podwójne ogłoszenia. Wystarczy tekst dla czytnika w slocie wiadomości.
- Etykiety etapów dla agentów bierz z realnych zdarzeń serwera (np. zdarzenia SSE typu `status`), nigdy z timera.
- Przykłady Svelte używają składni Svelte 4 (`export let`, `$:`, `on:click`). W Svelte 5: `$props()`, `$state`,
  `$derived`, atrybuty `onclick`.

## Problem

Użytkownik czeka 1–3 sekundy na pierwszą odpowiedź modelu bez żadnej informacji zwrotnej, co
sugeruje, że żądanie nie powiodło się — prowadzi to do ponownego wysłania tego samego promptu.
Generyczny spinner nie komunikuje precyzyjnie „asystent komponuje odpowiedź”. Wskaźniki bywają
wyłącznie wizualne, pozostawiając użytkowników czytników ekranu bez żadnej informacji.

## Rozwiązanie

Umieść wskaźnik myślenia natychmiast w slocie wiadomości asystenta (patrz Message Thread), bez
czekania na jakąkolwiek odpowiedź sieciową. Stylizuj go jako odrębny element (animowane kropki,
pulsujący awatar), który komunikuje „asystent komponuje odpowiedź”, nie generyczne ładowanie. Gdy
przychodzi pierwszy token przez `streaming-response.md`, wskaźnik zamienia się w rzeczywistą treść.

Zapewnij dostępność: renderuj wewnątrz `polite` live region z ukrytym dla oka tekstem „Assistant is
thinking…”. Pod `prefers-reduced-motion` daj statyczną wersję bez animacji. Dla agentów wykonujących
pracę przed odpowiedzią — aktualizuj etykietę etapu („Searching the docs…”, „Writing…”).

## Przykłady kodu

### The Indicator — React

```javascript
function ThinkingIndicator({ label = 'Assistant is thinking' }) {
  return (
    <div className="thinking" role="status" aria-live="polite">
      <span className="sr-only">{label}…</span>
      <span className="dots" aria-hidden="true">
        <span /><span /><span />
      </span>
    </div>
  );
}
```

### The Indicator — Vue

```vue
<template>
  <div class="thinking" role="status" aria-live="polite">
    <span class="sr-only">{{ label }}…</span>
    <span class="dots" aria-hidden="true"><span /><span /><span /></span>
  </div>
</template>

<script setup>
defineProps({ label: { type: String, default: 'Assistant is thinking' } });
</script>
```

### The Indicator — Svelte

```svelte
<script>
  export let label = 'Assistant is thinking';
</script>

<div class="thinking" role="status" aria-live="polite">
  <span class="sr-only">{label}…</span>
  <span class="dots" aria-hidden="true"><span></span><span></span><span></span></span>
</div>
```

### The Indicator — Web Components

```javascript
class ThinkingIndicator extends HTMLElement {
  connectedCallback() {
    const label = this.getAttribute('label') || 'Assistant is thinking';
    this.setAttribute('role', 'status');
    this.setAttribute('aria-live', 'polite');
    const sr = document.createElement('span');
    sr.className = 'sr-only';
    sr.textContent = `${label}…`; // textContent: the label is never parsed as HTML
    const dots = document.createElement('span');
    dots.className = 'dots';
    dots.setAttribute('aria-hidden', 'true');
    dots.append(...Array.from({ length: 3 }, () => document.createElement('span')));
    this.replaceChildren(sr, dots);
  }
}
customElements.define('thinking-indicator', ThinkingIndicator);
```

### Animated Dots, With a Reduced-Motion Fallback

```css
.sr-only {
  position: absolute; width: 1px; height: 1px;
  padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0;
}

.dots { display: inline-flex; gap: 0.25rem; }
.dots span {
  width: 0.5rem; height: 0.5rem; border-radius: 50%;
  background: currentColor; opacity: 0.4;
  animation: blink 1.4s infinite both;
}
.dots span:nth-child(2) { animation-delay: 0.2s; }
.dots span:nth-child(3) { animation-delay: 0.4s; }

@keyframes blink { 0%, 80%, 100% { opacity: 0.4; } 40% { opacity: 1; } }

@media (prefers-reduced-motion: reduce) {
  .dots span { animation: none; opacity: 0.7; }
}
```

### Swapping Thinking for Streamed Text

```javascript
function AssistantMessage({ content, status }) {
  // Empty + streaming = still thinking; any content = show the text
  if (status === 'streaming' && content.length === 0) {
    return <ThinkingIndicator />;
  }
  return <div className="content" aria-busy={status === 'streaming'}>{content}</div>;
}
```

### Phase-Aware Status for Agents

```javascript
function AgentStatus({ phase }) {
  // phase updates arrive from the server: 'thinking' | 'searching' | 'writing'
  const label = {
    thinking: 'Thinking',
    searching: 'Searching the docs',
    writing: 'Writing the answer',
  }[phase] ?? 'Working';

  return (
    <div className="thinking" role="status" aria-live="polite">
      <span className="sr-only">{label}…</span>
      <span aria-hidden="true">{label}<Dots /></span>
    </div>
  );
}
```

## Zalety

- Eliminuje martwy czas przed pierwszym tokenem, zapobiegając przedwczesnemu ponowieniu wysyłki.
- Dedykowany wskaźnik komunikuje „asystent komponuje” znacznie jaśniej niż generyczny spinner.
- Live region daje użytkownikom czytników ekranu informację audialną zamiast ciszy.
- To naturalny, pusty stan wiadomości streamującej — prawie żaden dodatkowy koszt implementacyjny.
- Status zależny od etapu (dla agentów) zamienia długie czekanie w widoczny, konkretny postęp.

## Wady / tradeoffs

- Animowany wskaźnik bez rzeczywistych informacji o postępie może z czasem wydawać się fasadą przy
  dłuższym czekaniu; etykiety etapów pomagają, ale tylko jeśli są **prawdziwe**.
- Ogłoszenia live region wymagają umiaru — wskaźnik myślenia plus napływające tokeny mogą wywołać
  podwójne, nadmiarowe ogłoszenia bez odpowiedniej ostrożności.
- Fałszywe etykiety etapów („Analyzing…”, gdy nic realnie się nie analizuje) niszczą zaufanie
  użytkownika do interfejsu.
- Animacja wymaga fallbacku `prefers-reduced-motion` — łatwo o tym zapomnieć.
- Przejście ze wskaźnika do pierwszego tokenu może migać, jeśli nie obsłużysz go w tym samym slocie
  DOM (patrz `AssistantMessage` wyżej — warunek na tym samym miejscu, nie osobne elementy).

## Powiązane wzorce

- [Streaming Response](streaming-response.md) — ai-chat-ui
- [Message Thread](message-thread.md)
- [Loading State](../resilience/loading-state.md) — Resilience
- Live Regions — fe-web-platform/references/accessibility/live-regions.md
- [ARIA live regions (MDN)](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/ARIA_Live_Regions)
- [prefers-reduced-motion (MDN)](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)
- [Progress Indicators (NN Group)](https://www.nngroup.com/articles/progress-indicators/)

## Kiedy używać / kiedy NIE używać

Używaj **zawsze** w interfejsach czatu/AI dla okna między wysłaniem promptu a pierwszym tokenem —
to minimalny koszt o dużym wpływie na postrzeganą wiarygodność. **Nie** wprowadzaj etykiet etapów
(„Searching…”, „Writing…”), jeśli backend faktycznie nie raportuje takich etapów — statyczny,
uczciwy wskaźnik „Thinking…” jest lepszy niż zmyślone, nieprawdziwe etapy, które prędzej czy później
zdemaskują się jako fasada.
