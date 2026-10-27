/**
 * Server-Sent Events over fetch (K1b, docs/READ-TOKEN-K1B-PLAN.md). EventSource cannot send an Authorization header,
 * and a token in the URL would end up in logs, so the UI reads /api/events with fetch and parses the stream itself.
 */

/** A feed for text chunks that calls `onEvent` for every complete event (`event` defaults to "message"). */
export function createSseParser(onEvent: (event: string, data: string) => void): (chunk: string) => void {
  let buffer = '';
  let event = '';
  let data: string[] = [];
  return (chunk) => {
    buffer += chunk;
    let nl: number;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).replace(/\r$/, '');
      buffer = buffer.slice(nl + 1);
      if (line === '') {
        if (data.length) onEvent(event || 'message', data.join('\n'));
        event = '';
        data = [];
      } else if (!line.startsWith(':')) {
        const colon = line.indexOf(':');
        const field = colon < 0 ? line : line.slice(0, colon);
        const value = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '');
        if (field === 'event') event = value;
        else if (field === 'data') data.push(value);
      }
    }
  };
}

export interface SubscribeOptions {
  fetchImpl?: (url: string, init: RequestInit) => Promise<Response>;
  /** The saved token, read on every (re)connection. */
  token: () => string;
  /** Wait before reconnecting after the stream ends or fails. */
  retryMs?: number;
}

/** Reads `url` as an event stream until the returned function is called, reconnecting after a pause. */
export function subscribeEvents(url: string, handlers: Record<string, (data: string) => void>, opts: SubscribeOptions): () => void {
  const fetchImpl = opts.fetchImpl ?? ((u, init) => fetch(u, init));
  const retryMs = opts.retryMs ?? 5000;
  const abort = new AbortController();
  const feed = createSseParser((event, data) => handlers[event]?.(data));

  void (async () => {
    while (!abort.signal.aborted) {
      try {
        const token = opts.token();
        const res = await fetchImpl(url, { headers: { accept: 'text/event-stream', ...(token && { authorization: `Bearer ${token}` }) }, signal: abort.signal });
        // A 401 waits for the token, which the first read of the page asks for; then the next attempt carries it.
        if (res.ok && res.body) {
          const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            feed(value);
          }
        }
      } catch {
        /* reconnect below */
      }
      if (!abort.signal.aborted) await new Promise((r) => setTimeout(r, retryMs));
    }
  })();
  return () => abort.abort();
}
