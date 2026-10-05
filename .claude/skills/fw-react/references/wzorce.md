# Wzorce React 19 — przykłady

> **Spis treści:** 1. Wartość wyliczana zamiast stanu i efektu · 2. Reset stanu przez `key` · 3. `useEffectEvent` — efekt nie reaguje na wartość, którą… · 4. Formularz z `useActionState` i odrzuceniem biznesowym · 5. Pobieranie w efekcie bez wyścigu · 6. Maszyna stanów w `useReducer` · 7. Odpowiedniki dla React 18

Przykłady sprawdzone kompilatorem TypeScript (`tsc --noEmit`, `strict`) z typami `react` 19.3. Każdy pokazuje
najpierw błąd, potem poprawkę.

## 1. Wartość wyliczana zamiast stanu i efektu
Błąd: dodatkowy render i chwila, w której `total` nie pasuje do `items`.
```tsx
const [total, setTotal] = useState(0);
useEffect(() => { setTotal(items.reduce((s, i) => s + i.price * i.qty, 0)); }, [items]);
```
Poprawka: wylicz podczas renderowania. Gdy wyliczenie jest kosztowne, a kompilator nie jest włączony — `useMemo`.
```tsx
type Item = { price: number; qty: number };

export function CartTotal({ items }: { items: Item[] }) {
  const total = items.reduce((s, i) => s + i.price * i.qty, 0);
  return <p>{total}</p>;
}
```

## 2. Reset stanu przez `key`
Błąd: efekt czyszczący stan po zmianie `userId` — przez jeden render widać stare dane.
Poprawka: rodzic nadaje `key`; nowa wartość `key` to nowy komponent z czystym stanem.
```tsx
import { useState } from 'react';

function NoteForm() {
  const [note, setNote] = useState('');
  return <input value={note} onChange={e => setNote(e.target.value)} />;
}

export function Profile({ userId }: { userId: string }) {
  return <NoteForm key={userId} />;
}
```
Reset tylko części stanu: porównaj poprzednią wartość podczas renderowania (wzorzec `prevUserId` z react.dev), nie w efekcie.

## 3. `useEffectEvent` — efekt nie reaguje na wartość, którą tylko czyta
Błąd: `theme` w zależnościach — zmiana motywu zrywa i odnawia połączenie.
Poprawka (19.2+): logika „przy zdarzeniu połącz się, pokaż powiadomienie w aktualnym motywie” idzie do Effect Event.
```tsx
import { useEffect, useEffectEvent } from 'react';

type Conn = { on(ev: 'connected', cb: () => void): void; disconnect(): void };
declare function connect(roomId: string): Conn;
declare function notify(msg: string, theme: 'light' | 'dark'): void;

export function ChatRoom({ roomId, theme }: { roomId: string; theme: 'light' | 'dark' }) {
  const onConnected = useEffectEvent(() => notify('Połączono', theme));
  useEffect(() => {
    const c = connect(roomId);
    c.on('connected', () => onConnected());
    return () => c.disconnect();
  }, [roomId]);   // onConnected nie trafia do zależności
  return null;
}
```
Zasady: Effect Event wołasz tylko z efektów, nie przekazujesz go do innych komponentów ani hooków.

## 4. Formularz z `useActionState` i odrzuceniem biznesowym
```tsx
import { useActionState } from 'react';

type State = { status: 'idle' } | { status: 'ok'; id: string } | { status: 'rejected'; reason: string };
declare function reserveRoom(roomId: string, slot: string): Promise<{ ok: true; id: string } | { ok: false; reason: string }>;

async function reserve(_prev: State, form: FormData): Promise<State> {
  const r = await reserveRoom(String(form.get('room')), String(form.get('slot')));
  return r.ok ? { status: 'ok', id: r.id } : { status: 'rejected', reason: r.reason };
}

export function ReserveForm() {
  const [state, action, pending] = useActionState(reserve, { status: 'idle' } as State);
  return (
    <form action={action}>
      <input name="room" required />
      <input name="slot" required />
      <button disabled={pending}>Zarezerwuj</button>
      {state.status === 'rejected' && <p role="alert">{state.reason}</p>}
    </form>
  );
}
```
W Next.js funkcja `reserve` może być Server Action — wtedy autoryzacja i walidacja wejścia w niej samej (fw-nextjs).

## 5. Pobieranie w efekcie bez wyścigu
Tylko gdy nie ma frameworka ani biblioteki zapytań. Spóźniona odpowiedź dla starego filtra jest ignorowana,
a żądanie przerwane.
```tsx
import { useEffect, useState } from 'react';

export function Results({ query }: { query: string }) {
  const [rows, setRows] = useState<string[]>([]);
  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: ctrl.signal })
      .then(r => r.json() as Promise<string[]>)
      .then(setRows)
      .catch(e => { if ((e as Error).name !== 'AbortError') throw e; });
    return () => ctrl.abort();
  }, [query]);
  return <ul>{rows.map(r => <li key={r}>{r}</li>)}</ul>;
}
```

## 6. Maszyna stanów w `useReducer`
```tsx
import { useReducer } from 'react';

type S = { kind: 'free' } | { kind: 'held'; by: string } | { kind: 'booked'; by: string };
type E = { type: 'hold'; by: string } | { type: 'confirm' } | { type: 'release' };

export function slot(s: S, e: E): S {
  switch (e.type) {
    case 'hold': return s.kind === 'free' ? { kind: 'held', by: e.by } : s;
    case 'confirm': return s.kind === 'held' ? { kind: 'booked', by: s.by } : s;
    case 'release': return s.kind === 'held' ? { kind: 'free' } : s;
  }
}

export function Slot() {
  const [s, dispatch] = useReducer(slot, { kind: 'free' });
  return <button onClick={() => dispatch({ type: 'hold', by: 'ja' })}>{s.kind}</button>;
}
```
Reducer testujesz jako czystą funkcję: `expect(slot({ kind: 'free' }, { type: 'confirm' })).toEqual({ kind: 'free' })`.

## 7. Odpowiedniki dla React 18
| React 19 | React 18 |
|---|---|
| `ref` jako prop | `forwardRef((props, ref) => …)` |
| `useActionState` / `<form action>` | `onSubmit` + `useState` dla wyniku i `useTransition` dla oczekiwania |
| `useOptimistic` | lokalny stan zmieniany przed żądaniem i cofany po błędzie |
| `useEffectEvent` (19.2) | `useRef` z najnowszą wartością aktualizowaną w efekcie (wzorzec „latest ref”) |
| `use(promise)` | biblioteka zapytań albo efekt z sprzątaniem (punkt 5) |
| `act` z `react` | `act` z `react-dom/test-utils` |
| React Compiler | działa też z 17 i 18 (pakiet `react-compiler-runtime`) |
