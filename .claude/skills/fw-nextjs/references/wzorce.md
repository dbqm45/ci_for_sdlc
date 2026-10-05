# Wzorce Next.js 16 (App Router) — przykłady

> **Spis treści:** 1. Warstwa dostępu do danych (DAL) · 2. Server Action · 3. Odczyt cache'owany (Cache Components) · 4. Strona z `await params` i `<Suspense>` · 5. `proxy.ts` · 6. Odpowiedniki dla 14 i 15

Sprawdzone kompilatorem TypeScript (`tsc --noEmit`, `strict`) z typami `next` 16.3.8 i `react` 19.3. Moduły
`@/lib/*` w przykładach to deklaracje zastępcze (sesja, baza) — w projekcie podstaw własne.

## 1. Warstwa dostępu do danych (DAL)
```ts
// features/orders/server/dal.ts
import 'server-only';
import { cache } from 'react';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';

export type OrderDTO = { id: string; total: string; status: 'open' | 'paid' };

export const currentUser = cache(async () => {
  const s = await getSession();
  if (!s) throw new Error('UNAUTHENTICATED');
  return s.user;
});

export async function ordersOfCurrentUser(): Promise<OrderDTO[]> {
  const user = await currentUser();
  const rows = await db.order.findMany({ where: { ownerId: user.id } });
  return rows.map(r => ({ id: r.id, total: r.total.toFixed(2), status: r.status }));   // minimalne DTO
}
```
`cache` z Reacta deduplikuje sprawdzenie sesji w jednym żądaniu. DTO nie zawiera pól, których UI nie potrzebuje.

## 2. Server Action
```ts
// features/orders/server/actions.ts
'use server';
import { updateTag } from 'next/cache';
import { currentUser } from './dal';
import { db } from '@/lib/db';

export type DeleteResult = { ok: true } | { ok: false; reason: string };

export async function deleteOrder(_prev: DeleteResult | null, form: FormData): Promise<DeleteResult> {
  const user = await currentUser();                       // 1. sesja — w KAŻDEJ akcji
  const id = form.get('id');
  if (typeof id !== 'string' || id.length === 0) return { ok: false, reason: 'Brak identyfikatora' };   // 2. wejście
  const order = await db.order.findUnique({ where: { id } });
  if (!order || order.ownerId !== user.id) return { ok: false, reason: 'Nie znaleziono zamówienia' };   // 3. właściciel (IDOR)
  if (order.status === 'paid') return { ok: false, reason: 'Opłaconego zamówienia nie można usunąć' };    // 4. reguła
  await db.order.delete({ where: { id } });
  updateTag(`orders:${user.id}`);                         // 5. lista odświeżona od razu (read-your-writes)
  return { ok: true };
}
```
Ten sam komunikat dla „nie istnieje” i „cudze” nie zdradza istnienia cudzych zasobów. Test akcji: bez sesji,
cudze zamówienie, puste `id`, opłacone zamówienie, przypadek poprawny.

## 3. Odczyt cache'owany (Cache Components)
```ts
// features/products/server/queries.ts — wymaga cacheComponents: true w next.config.ts
import { cacheLife, cacheTag } from 'next/cache';
import { db } from '@/lib/db';

export async function productList() {
  'use cache';
  cacheLife('hours');
  cacheTag('products');
  const rows = await db.product.findMany();
  return rows.map(p => ({ id: p.id, name: p.name }));
}
```
Edycja w panelu: akcja zapisuje produkt i woła `updateTag('products')` — użytkownik od razu widzi zmianę.
Odświeżenie w tle (np. z webhooka w Route Handlerze): `revalidateTag('products', 'max')`. Funkcja z `'use cache'`
nie może czytać `cookies()` ani `headers()` — przekaż potrzebną wartość jako argument (staje się częścią klucza).

## 4. Strona z `await params` i `<Suspense>`
```tsx
// app/products/[id]/page.tsx
import { Suspense } from 'react';
import { notFound } from 'next/navigation';

declare function product(id: string): Promise<{ id: string; name: string } | null>;
declare function Reviews(props: { id: string }): Promise<React.ReactElement>;

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await product(id);
  if (!p) notFound();
  return (
    <main>
      <h1>{p.name}</h1>
      <Suspense fallback={<p>Ładowanie opinii…</p>}>
        <Reviews id={id} />
      </Suspense>
    </main>
  );
}
```
Po `next typegen` zamiast ręcznego typu: `PageProps<'/products/[id]'>`.

## 5. `proxy.ts`
```ts
// proxy.ts (katalog główny lub src/) — Next.js 16, środowisko Node.js
import { NextResponse, type NextRequest } from 'next/server';

export function proxy(req: NextRequest) {
  if (!req.cookies.get('session')) return NextResponse.redirect(new URL('/login', req.url));
  return NextResponse.next();
}

export const config = { matcher: ['/orders/:path*'] };
```
To tylko szybkie przekierowanie dla wygody. Właściwa autoryzacja jest w DAL i w każdej akcji (punkty 1–2).

## 6. Odpowiedniki dla 14 i 15
| Next.js 16 | 15 | 14 |
|---|---|---|
| `proxy.ts`, `export function proxy` | `middleware.ts`, `export function middleware` (Node.js od 15.5) | `middleware.ts` (Edge) |
| `await params` (obowiązkowe) | `await params` (dostęp synchroniczny z ostrzeżeniem) | `params` synchronicznie |
| `'use cache'` + `cacheTag` | `fetch(url, { next: { tags: ['products'] } })` albo `unstable_cache` | to samo; `fetch` cache'owany domyślnie |
| `updateTag(tag)` w akcji | `revalidateTag(tag)` | `revalidateTag(tag)` |
| `revalidateTag(tag, 'max')` | `revalidateTag(tag)` | `revalidateTag(tag)` |
| `refresh()` | `router.refresh()` w kliencie | `router.refresh()` w kliencie |
| `useActionState` | `useActionState` (React 19) | `useFormState` z `react-dom` |
