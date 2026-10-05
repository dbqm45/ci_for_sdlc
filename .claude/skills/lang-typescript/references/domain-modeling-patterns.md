# Wzorce modelowania domeny w TypeScript (uzupełnienie `domain-building-blocks.md`)

> **Spis treści:** Typ + obiekt-towarzysz o tej samej nazwie; marka wymagana i… · Zdarzenia: metadane, wewnętrzne vs publikowane,… · Decider i powłoka z jawną jednostką pracy (bez dekoratorów) · Aliasy modułów bez `baseUrl` · Pułapki (sprawdzone testem) · Testy

Sprawdzone: TypeScript 6.0.3 i 7.0.2 (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `erasableSyntaxOnly`,
`verbatimModuleSyntax`), uruchomione bez kompilacji przez Node 22 (`node --test`, usuwanie typów). Wnioski częściowo z analizy
przykładowego systemu SmartSchedule (kurs Domain Drivers) — kod napisany od nowa.

## Typ + obiekt-towarzysz o tej samej nazwie; marka wymagana i opcjonalna
```ts
declare const brand: unique symbol;
/** Wymagana marka: surowego string nie da się przypisać bez fabryki. */
export type Brand<T, B extends string> = T & { readonly [brand]: B };
/** Opcjonalna marka: przyjmuje surowy typ (wygodne dla czasu trwania, liczników). */
export type Flavour<T, F extends string> = T & { readonly [brand]?: F };
```
```ts
import { randomUUID } from 'node:crypto';
import type { Brand } from '#shared/brand';

// Typ i obiekt-towarzysz o tej samej nazwie: `ResourceId` jako typ i jako fabryka.
export type ResourceId = Brand<string, 'ResourceId'>;
export const ResourceId = {
  newOne: (): ResourceId => randomUUID() as ResourceId,
  from: (raw: string): ResourceId => {
    if (!/^[0-9a-f-]{36}$/.test(raw)) throw new RangeError(`invalid ResourceId: ${raw}`);
    return raw as ResourceId;
  },
};

// „Enum” jako unia literałów + towarzysz z listą wartości i strażnikiem typu.
export type Seniority = 'JUNIOR' | 'MID' | 'SENIOR' | 'LEAD';
export const Seniority = {
  values: ['JUNIOR', 'MID', 'SENIOR', 'LEAD'] as const satisfies readonly Seniority[],
  is: (x: string): x is Seniority => (Seniority.values as readonly string[]).includes(x),
};
```
Zamiast `enum` — unia literałów z towarzyszem (`values`, strażnik `is`); działa z usuwaniem typów, w przeciwieństwie do `enum`.

## Zdarzenia: metadane, wewnętrzne vs publikowane, wyczerpujący `switch`
```ts
import type { ResourceId } from '#shared/ids';

type Meta = { readonly eventId: string; readonly occurredAt: Date };
export type DomainEvent<T extends string, D> = Readonly<{ type: T; data: Readonly<D> & Meta }>;
declare const published: unique symbol;
/** Zdarzenie publikowane poza moduł (Published Language) — znacznik tylko w typie, żeby nie wysłać wewnętrznego. */
export type PublishedEvent<T extends string, D> = DomainEvent<T, D> & { readonly [published]: true };
export type Publisher = (e: PublishedEvent<string, unknown>) => void;   // przyjmie tylko zdarzenia publikowane

export type ResourceBlocked = DomainEvent<'ResourceBlocked', { resourceId: ResourceId; owner: string }>;
export type ResourceTakenOver = PublishedEvent<'ResourceTakenOver', { resourceId: ResourceId; previousOwners: readonly string[] }>;
export type AvailabilityEvent = ResourceBlocked | ResourceTakenOver;

export const event = <E extends DomainEvent<string, unknown>>(
  type: E['type'], data: Omit<E['data'], keyof Meta>, clock: () => Date, id: () => string,
): E => ({ type, data: { ...data, eventId: id(), occurredAt: clock() } }) as unknown as E;

export function assertNever(x: never): never { throw new Error(`unhandled: ${JSON.stringify(x)}`); }

export function describe(e: AvailabilityEvent): string {
  switch (e.type) {
    case 'ResourceBlocked': return `blocked by ${e.data.owner}`;
    case 'ResourceTakenOver': return `taken over from ${e.data.previousOwners.join(', ')}`;
    default: return assertNever(e);   // nowy typ zdarzenia = błąd kompilacji tutaj
  }
}
```
Znacznik `published` istnieje tylko w typie (symbol), a `Publisher` przyjmuje wyłącznie zdarzenia publikowane — próba wysłania
wewnętrznego zdarzenia to błąd kompilacji (sprawdzone `@ts-expect-error`).

## Decider i powłoka z jawną jednostką pracy (bez dekoratorów)
```ts
// Decider: niezmienny stan, komendy jako unia, czysta funkcja decide(). Bez klas z parameter properties
// (niedozwolone przy erasableSyntaxOnly / uruchamianiu przez usuwanie typów).
export type Slot = Readonly<{ state: 'free' } | { state: 'blocked'; by: string } | { state: 'disabled'; by: string }>;
export type SlotState = Readonly<{ slot: Slot; version: number }>;

export type Command =
  | { readonly kind: 'block'; readonly owner: string }
  | { readonly kind: 'release'; readonly owner: string }
  | { readonly kind: 'disable'; readonly owner: string };

export type Rejection = 'NOT_FREE' | 'NOT_OWNER' | 'DISABLED';
export type Decision =
  | { readonly ok: true; readonly state: SlotState; readonly previousOwner?: string }
  | { readonly ok: false; readonly reason: Rejection };

export function decide(s: SlotState, c: Command): Decision {
  const next = (slot: Slot): SlotState => ({ slot, version: s.version + 1 });
  switch (c.kind) {
    case 'block':
      if (s.slot.state === 'disabled') return { ok: false, reason: 'DISABLED' };
      if (s.slot.state === 'blocked') return { ok: false, reason: 'NOT_FREE' };
      return { ok: true, state: next({ state: 'blocked', by: c.owner }) };
    case 'release':
      if (s.slot.state !== 'blocked' || s.slot.by !== c.owner) return { ok: false, reason: 'NOT_OWNER' };
      return { ok: true, state: next({ state: 'free' }) };
    case 'disable': {
      const previousOwner = s.slot.state === 'blocked' ? s.slot.by : undefined;
      return { ok: true, state: next({ state: 'disabled', by: c.owner }), ...(previousOwner ? { previousOwner } : {}) };
    }
  }
}

// Powłoka: wczytaj → decyduj → zapisz (jawnie) → publikuj; transakcja jako jawna jednostka pracy, bez dekoratorów.
export interface SlotRepository { load(id: string): Promise<SlotState>; save(id: string, s: SlotState, expectedVersion: number): Promise<void>; }
export type UnitOfWork = <T>(work: (repo: SlotRepository) => Promise<T>) => Promise<T>;

export async function handle(uow: UnitOfWork, id: string, c: Command, publish: (msg: string) => void): Promise<Decision> {
  const d = await uow(async (repo) => {
    const s = await repo.load(id);
    const r = decide(s, c);
    if (r.ok) await repo.save(id, r.state, s.version);   // jawny zapis — nie licz na „dirty checking”
    return r;
  });
  if (d.ok && d.previousOwner) publish(`taken over from ${d.previousOwner}`);   // po commicie; bez outboxa może zginąć
  return d;
}
```
Transakcję przekazuj jawnie (`uow(repo => …)`, np. `db.transaction(tx => useCase(deps(tx)))`) zamiast dekoratorów, które przez
refleksję doklejają połączenie do serwisów: dekoratory „legacy” (`experimentalDecorators`) mają inną sygnaturę niż standardowe,
a parameter properties i `enum` są niedozwolone przy `erasableSyntaxOnly`.

## Aliasy modułów bez `baseUrl`
`package.json` → `"imports": { "#shared/*": "./src/shared/*.ts" }` — działa w Node i w TS (`moduleResolution: nodenext`/`bundler`)
bez `paths`/`baseUrl` (wycofanego w TS 6). Granice modułów pilnuj regułą importów w ESLint (flat config) albo testem architektury.

## Pułapki (sprawdzone testem)
```ts
// Pułapki sprawdzone uruchomieniem (patrz test).
export const monthIsZeroBased = new Date(Date.UTC(2021, 1, 1)).toISOString().slice(0, 10); // '2021-02-01' — luty!
export const sameInstance = (): boolean => { const t = new Array(3).fill([]); t[0]!.push(1); return t[1]!.length === 1; };
export const freshInstances = (): boolean => { const t = Array.from({ length: 3 }, () => [] as number[]); t[0]!.push(1); return t[1]!.length === 0; };
// Porównanie obiektów operatorem > używa valueOf(); obiekt z valueOf zwracającym string porównuje się leksykograficznie.
export const lexicographic = (): boolean => { const a = { valueOf: () => '9' }; const b = { valueOf: () => '10' }; return (a as unknown as number) > (b as unknown as number); };
```
- Operatory `<`, `>` na obiektach (np. dużych liczbach dziesiętnych z biblioteki) wołają `valueOf()` — gdy zwraca string,
  porównanie jest **leksykograficzne**. Używaj metod biblioteki (`a.gt(b)`) albo `bigint` w najmniejszej jednostce.
- Klasa dziedzicząca po `Array` wymaga uwagi (`Symbol.species`, prototyp) — lepiej kompozycja: klasa z prywatną tablicą.
- Metoda, która mutuje obiekt **i** zwraca nową instancję, myli wywołujących — wybierz jedno.

## Testy
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ResourceId, Seniority } from '#shared/ids';
import { decide, handle, type SlotState, type SlotRepository } from './decider.ts';
import { describe as describeEvent, event, type ResourceTakenOver } from './events.ts';
import { monthIsZeroBased, sameInstance, freshInstances, lexicographic } from './pitfalls.ts';

test('id i unia literałów', () => {
  const id = ResourceId.newOne();
  assert.equal(ResourceId.from(id), id);
  assert.throws(() => ResourceId.from('x'));
  assert.ok(Seniority.is('MID')); assert.ok(!Seniority.is('GURU'));
});

test('decider: blokada, konflikt, przejęcie', () => {
  const free: SlotState = { slot: { state: 'free' }, version: 0 };
  const b = decide(free, { kind: 'block', owner: 'A' });
  assert.ok(b.ok);
  assert.deepEqual(decide(b.state, { kind: 'block', owner: 'B' }), { ok: false, reason: 'NOT_FREE' });
  const d = decide(b.state, { kind: 'disable', owner: 'S' });
  assert.ok(d.ok && d.previousOwner === 'A' && d.state.version === 2);
});

test('powłoka zapisuje jawnie i publikuje po zapisie', async () => {
  const db = new Map<string, SlotState>([['r1', { slot: { state: 'blocked', by: 'A' }, version: 3 }]]);
  const repo: SlotRepository = {
    load: async (id) => db.get(id)!,
    save: async (id, s, expected) => { if (db.get(id)!.version !== expected) throw new Error('conflict'); db.set(id, s); },
  };
  const published: string[] = [];
  const r = await handle(async (w) => w(repo), 'r1', { kind: 'disable', owner: 'S' }, (m) => published.push(m));
  assert.ok(r.ok); assert.equal(db.get('r1')!.version, 4); assert.deepEqual(published, ['taken over from A']);
});

test('zdarzenie z metadanymi i wyczerpujący switch', () => {
  const e = event<ResourceTakenOver>('ResourceTakenOver', { resourceId: ResourceId.newOne(), previousOwners: ['A'] }, () => new Date(0), () => 'e1');
  assert.equal(e.data.eventId, 'e1');
  assert.equal(describeEvent(e), 'taken over from A');
});

test('pułapki', () => {
  assert.equal(monthIsZeroBased, '2021-02-01');
  assert.ok(sameInstance()); assert.ok(freshInstances()); assert.ok(lexicographic());
});

test('wewnętrznego zdarzenia nie da się opublikować (sprawdza kompilator)', () => {
  const sent: string[] = [];
  const publisher: import('./events.ts').Publisher = (e) => { sent.push(e.type); };
  const internal = event<import('./events.ts').ResourceBlocked>('ResourceBlocked', { resourceId: ResourceId.newOne(), owner: 'A' }, () => new Date(0), () => 'e2');
  // @ts-expect-error — ResourceBlocked nie jest zdarzeniem publikowanym
  publisher(internal);
  const pub = event<ResourceTakenOver>('ResourceTakenOver', { resourceId: ResourceId.newOne(), previousOwners: [] }, () => new Date(0), () => 'e3');
  publisher(pub);
  assert.equal(sent.length, 2);
});
```
`node:test` wystarcza dla bibliotek i czystej domeny (zero zależności); dla aplikacji z Vite/przeglądarką — tool-vitest.

