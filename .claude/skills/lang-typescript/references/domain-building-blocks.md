# Pojęcia domenowe w TypeScript — przetestowane implementacje

Sprawdzone kompilatorem TypeScript 5.9, 6.0 i 7.0 (`strict`, `noUncheckedIndexedAccess`; w 6.0+ z jawnym `rootDir`) i testami. Bez zależności od frameworka —
w projekcie rozbij na pliki wg komentarzy `=====` i umieść w warstwie domeny (np. `src/domain/` lub `shared/domain/`).
Przykłady pochodzą z archetypów (ddd-archetypes): Money/Quantity, Party, Availability, Product, Configurator.

```ts
// ===== money.ts =====
export type Currency = 'PLN' | 'EUR' | 'USD';

/** Kwota w najmniejszej jednostce (grosze) jako bigint — bez błędów liczb zmiennoprzecinkowych. */
export class Money {
  private constructor(readonly minor: bigint, readonly currency: Currency) {}

  /** Money.of('12.50', 'PLN'); przyjmuje też przecinek dziesiętny. */
  static of(amount: string, currency: Currency): Money {
    const m = /^(-)?(\d+)(?:[.,](\d{1,2}))?$/.exec(amount.trim());
    if (!m) throw new Error(`Nieprawidłowa kwota: "${amount}"`);
    const [, sign, int = '0', frac = ''] = m;
    const minor = BigInt(int) * 100n + BigInt(frac.padEnd(2, '0'));
    return new Money(sign ? -minor : minor, currency);
  }

  static fromMinor(minor: bigint, currency: Currency): Money {
    return new Money(minor, currency);
  }

  static zero(currency: Currency): Money {
    return new Money(0n, currency);
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.minor + other.minor, this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.minor - other.minor, this.currency);
  }

  negate(): Money {
    return new Money(-this.minor, this.currency);
  }

  isZero(): boolean {
    return this.minor === 0n;
  }

  isNegative(): boolean {
    return this.minor < 0n;
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.minor === other.minor;
  }

  /** Dzieli kwotę na `parts` części tak, by suma się zgadzała (np. raty). */
  allocate(parts: number): Money[] {
    if (!Number.isInteger(parts) || parts <= 0) throw new Error('Liczba części musi być dodatnią liczbą całkowitą');
    const n = BigInt(parts);
    const base = this.minor / n;
    const remainder = this.minor % n; // ten sam znak co kwota
    const step = remainder < 0n ? -1n : 1n;
    const extra = remainder < 0n ? -remainder : remainder;
    return Array.from({ length: parts }, (_, i) =>
      new Money(base + (BigInt(i) < extra ? step : 0n), this.currency));
  }

  /** '12.50' — do wysyłki do API (nigdy nie wysyłaj float). */
  toDecimalString(): string {
    const abs = this.minor < 0n ? -this.minor : this.minor;
    const int = abs / 100n;
    const frac = (abs % 100n).toString().padStart(2, '0');
    return `${this.minor < 0n ? '-' : ''}${int}.${frac}`;
  }

  private assertSameCurrency(other: Money): void {
    if (other.currency !== this.currency) {
      throw new Error(`Różne waluty: ${this.currency} i ${other.currency}`);
    }
  }
}

// ===== quantity.ts =====
export interface Unit {
  readonly symbol: string;
  readonly name: string;
}

export const Units = {
  pieces: { symbol: 'szt.', name: 'sztuki' },
  kilograms: { symbol: 'kg', name: 'kilogramy' },
  hours: { symbol: 'h', name: 'godziny' },
} as const satisfies Record<string, Unit>;

/** Ilość z jednostką; wartość jako skalowana liczba całkowita (3 miejsca po przecinku). */
export class Quantity {
  private static readonly SCALE = 1000n;

  private constructor(readonly scaled: bigint, readonly unit: Unit) {}

  static of(value: string, unit: Unit): Quantity {
    const m = /^(\d+)(?:[.,](\d{1,3}))?$/.exec(value.trim());
    if (!m) throw new Error(`Nieprawidłowa ilość: "${value}"`);
    const [, int = '0', frac = ''] = m;
    return new Quantity(BigInt(int) * Quantity.SCALE + BigInt(frac.padEnd(3, '0')), unit);
  }

  add(other: Quantity): Quantity {
    if (other.unit.symbol !== this.unit.symbol) {
      throw new Error(`Nie można dodać ${other.unit.symbol} do ${this.unit.symbol}`);
    }
    return new Quantity(this.scaled + other.scaled, this.unit);
  }

  toString(): string {
    const int = this.scaled / Quantity.SCALE;
    const frac = (this.scaled % Quantity.SCALE).toString().padStart(3, '0').replace(/0+$/, '');
    return `${int}${frac ? ',' + frac : ''} ${this.unit.symbol}`;
  }
}

// ===== party.ts =====
export type PartyId = string & { readonly __brand: 'PartyId' };

export interface RegisteredIdentifier {
  readonly type: string; // np. 'NIP', 'PESEL'
  readonly value: string;
}

interface PartyBase {
  readonly id: PartyId;
  readonly roles: readonly string[];
  readonly identifiers: readonly RegisteredIdentifier[];
}

export interface Person extends PartyBase {
  readonly kind: 'person';
  readonly firstName: string;
  readonly lastName: string;
}

export interface Organization extends PartyBase {
  readonly kind: 'organization';
  readonly name: string;
  readonly parent?: PartyId; // jednostka organizacyjna
}

export type Party = Person | Organization;

export function assertNever(x: never): never {
  throw new Error(`Nieobsłużony wariant: ${JSON.stringify(x)}`);
}

export function displayName(party: Party): string {
  switch (party.kind) {
    case 'person':
      return `${party.firstName} ${party.lastName}`;
    case 'organization':
      return party.name;
    default:
      return assertNever(party);
  }
}

export const hasRole = (party: Party, role: string): boolean => party.roles.includes(role);

// ===== availability.ts =====
export interface TimeSlot {
  readonly from: Date;
  readonly to: Date; // wyłącznie: [from, to)
}

export const overlaps = (a: TimeSlot, b: TimeSlot): boolean => a.from < b.to && b.from < a.to;

/** Read model z backendu: właściciel → przedziały; `null` = wolne. */
export interface CalendarView {
  readonly resourceId: string;
  readonly free: readonly TimeSlot[];
  readonly taken: ReadonlyMap<string, readonly TimeSlot[]>;
}

/** Podpowiedź dla UI (np. wyszarzenie), NIE decyzja — decyduje backend. */
export function looksFree(calendar: CalendarView, wanted: TimeSlot): boolean {
  return calendar.free.some(slot => slot.from <= wanted.from && wanted.to <= slot.to);
}

export type BlockRequestState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'pending'; readonly slot: TimeSlot }
  | { readonly kind: 'blocked'; readonly slot: TimeSlot }
  | { readonly kind: 'rejected'; readonly slot: TimeSlot; readonly reason: string };

// ===== product-features.ts =====
export type FeatureConstraint =
  | { readonly type: 'ALLOWED_VALUES'; readonly values: readonly string[] }
  | { readonly type: 'NUMERIC_RANGE'; readonly min: number; readonly max: number }
  | { readonly type: 'DATE_RANGE'; readonly from: string; readonly to: string } // ISO yyyy-mm-dd
  | { readonly type: 'REGEX'; readonly pattern: string }
  | { readonly type: 'UNCONSTRAINED' };

export interface FeatureType {
  readonly name: string;
  readonly mandatory: boolean;
  readonly constraint: FeatureConstraint;
}

/** Zwraca komunikat błędu albo null. Te same ograniczenia, które zwraca API typu produktu. */
export function validateFeature(feature: FeatureType, raw: string): string | null {
  const value = raw.trim();
  if (!value) return feature.mandatory ? `${feature.name}: pole wymagane` : null;
  const c = feature.constraint;
  switch (c.type) {
    case 'ALLOWED_VALUES':
      return c.values.includes(value) ? null : `${feature.name}: dozwolone ${c.values.join(', ')}`;
    case 'NUMERIC_RANGE': {
      const n = Number(value);
      return Number.isInteger(n) && n >= c.min && n <= c.max ? null : `${feature.name}: liczba ${c.min}–${c.max}`;
    }
    case 'DATE_RANGE':
      return /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= c.from && value <= c.to
        ? null
        : `${feature.name}: data ${c.from} – ${c.to}`;
    case 'REGEX':
      return new RegExp(`^(?:${c.pattern})$`).test(value) ? null : `${feature.name}: nieprawidłowy format`;
    case 'UNCONSTRAINED':
      return null;
    default:
      return assertNever(c);
  }
}

// ===== configurator.ts =====
export type ConfigRule =
  | { readonly type: 'NOT_TOGETHER'; readonly options: readonly string[] }
  | { readonly type: 'REQUIRES_ONE_OF'; readonly ifPicked: string; readonly oneOf: readonly string[] }
  | { readonly type: 'EXCLUDES_IF'; readonly ifPicked: string; readonly excluded: readonly string[] };

export interface OptionState {
  readonly option: string;
  readonly disabledBecause?: string; // wyjaśnienie dla użytkownika
}

/** Szybka podpowiedź w UI. Ostateczną poprawność (pełne reguły, solver) sprawdza backend. */
export function optionStates(all: readonly string[], picked: ReadonlySet<string>, rules: readonly ConfigRule[]): OptionState[] {
  return all.map(option => {
    if (picked.has(option)) return { option };
    for (const rule of rules) {
      if (rule.type === 'NOT_TOGETHER' && rule.options.includes(option)) {
        const clash = rule.options.find(o => o !== option && picked.has(o));
        if (clash) return { option, disabledBecause: `nie łączy się z: ${clash}` };
      }
      if (rule.type === 'EXCLUDES_IF' && picked.has(rule.ifPicked) && rule.excluded.includes(option)) {
        return { option, disabledBecause: `wykluczone przez: ${rule.ifPicked}` };
      }
    }
    return { option };
  });
}

export function missingRequirements(picked: ReadonlySet<string>, rules: readonly ConfigRule[]): string[] {
  return rules
    .filter((r): r is Extract<ConfigRule, { type: 'REQUIRES_ONE_OF' }> => r.type === 'REQUIRES_ONE_OF')
    .filter(r => picked.has(r.ifPicked) && !r.oneOf.some(o => picked.has(o)))
    .map(r => `${r.ifPicked} wymaga jednej z: ${r.oneOf.join(', ')}`);
}

// ===== result.ts — wynik operacji =====
export type Result<E, T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export const success = <T>(value: T): Result<never, T> => ({ ok: true, value });
export const failure = <E>(error: E): Result<E, never> => ({ ok: false, error });

// ===== resource-availability.ts — agregat (archetyp Availability, wariant segmentu) =====
export type OwnerId = string & { readonly __brand: 'OwnerId' };

/** Maszyna stanów blokady: wolny → zablokowany / wyłączony. */
export type Blockade =
  | { readonly state: 'free' }
  | { readonly state: 'blocked'; readonly by: OwnerId }
  | { readonly state: 'disabled'; readonly by: OwnerId };

/** Zdarzenia domenowe — czas przeszły, niezmienne. */
export type AvailabilityEvent =
  | { readonly type: 'ResourceBlocked'; readonly resourceId: string; readonly by: OwnerId }
  | { readonly type: 'ResourceReleased'; readonly resourceId: string; readonly by: OwnerId }
  | { readonly type: 'ResourceDisabled'; readonly resourceId: string; readonly by: OwnerId };

export type Rejection = 'ALREADY_TAKEN' | 'DISABLED' | 'NOT_OWNER';

/** Agregat: stan prywatny, zmiany tylko metodami biznesowymi, wynik zamiast wyjątków. */
export class ResourceAvailability {
  private blockade: Blockade = { state: 'free' };
  private readonly pending: AvailabilityEvent[] = [];

  constructor(readonly resourceId: string, readonly segment: TimeSlot) {}

  block(requester: OwnerId): Result<Rejection, AvailabilityEvent> {
    if (this.blockade.state === 'disabled') return failure('DISABLED');
    if (this.blockade.state === 'blocked' && this.blockade.by !== requester) return failure('ALREADY_TAKEN');
    this.blockade = { state: 'blocked', by: requester };
    return success(this.record({ type: 'ResourceBlocked', resourceId: this.resourceId, by: requester }));
  }

  release(requester: OwnerId): Result<Rejection, AvailabilityEvent> {
    if (this.blockade.state === 'disabled') return failure('DISABLED');
    if (this.blockade.state === 'blocked' && this.blockade.by !== requester) return failure('NOT_OWNER');
    this.blockade = { state: 'free' };
    return success(this.record({ type: 'ResourceReleased', resourceId: this.resourceId, by: requester }));
  }

  disable(requester: OwnerId): Result<never, AvailabilityEvent> {
    this.blockade = { state: 'disabled', by: requester };
    return success(this.record({ type: 'ResourceDisabled', resourceId: this.resourceId, by: requester }));
  }

  pullEvents(): AvailabilityEvent[] {
    return this.pending.splice(0);
  }

  private record(event: AvailabilityEvent): AvailabilityEvent {
    this.pending.push(event);
    return event;
  }
}

/** Repozytorium jako port — implementacja (HTTP, IndexedDB, pamięć) poza domeną. */
export interface ResourceAvailabilityRepository {
  load(resourceId: string, segment: TimeSlot): Promise<ResourceAvailability>;
  save(availability: ResourceAvailability): Promise<void>;
}
```

## Testy (przypadki brzegowe)

```ts
import { ResourceAvailability, OwnerId, Money, Quantity, Units, displayName, missingRequirements, optionStates, overlaps, validateFeature, PartyId } from './domain/archetypes';

function eq(a: unknown, b: unknown, msg: string) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
}
eq(Money.of('12,50', 'PLN').add(Money.of('0.5', 'PLN')).toDecimalString(), '13.00', 'add');
eq(Money.of('-0.05', 'PLN').toDecimalString(), '-0.05', 'neg');
eq(Money.of('100', 'PLN').allocate(3).map(m => m.toDecimalString()), ['33.34', '33.33', '33.33'], 'alloc');
eq(Money.of('-100', 'PLN').allocate(3).map(m => m.toDecimalString()), ['-33.34', '-33.33', '-33.33'], 'alloc neg');
eq(Money.of('0.10', 'PLN').add(Money.of('0.20', 'PLN')).equals(Money.of('0.30', 'PLN')), true, 'float-safe');
let threw = false; try { Money.of('1', 'PLN').add(Money.of('1', 'EUR')); } catch { threw = true; } eq(threw, true, 'currency');
eq(Quantity.of('1,5', Units.kilograms).add(Quantity.of('0.25', Units.kilograms)).toString(), '1,75 kg', 'qty');
threw = false; try { Quantity.of('1', Units.kilograms).add(Quantity.of('1', Units.hours)); } catch { threw = true; } eq(threw, true, 'unit');
eq(displayName({ kind: 'organization', id: 'x' as PartyId, roles: [], identifiers: [], name: 'ACME' }), 'ACME', 'party');
const d = (h: number) => new Date(Date.UTC(2026, 0, 1, h));
eq(overlaps({ from: d(10), to: d(12) }, { from: d(11), to: d(13) }), true, 'overlap');
eq(overlaps({ from: d(10), to: d(12) }, { from: d(12), to: d(13) }), false, 'touch');
eq(validateFeature({ name: 'kolor', mandatory: true, constraint: { type: 'ALLOWED_VALUES', values: ['red'] } }, 'blue'), 'kolor: dozwolone red', 'feat');
eq(validateFeature({ name: 'rok', mandatory: false, constraint: { type: 'NUMERIC_RANGE', min: 2020, max: 2024 } }, '2022'), null, 'feat ok');
const rules = [
  { type: 'NOT_TOGETHER', options: ['diesel', 'hybrid'] },
  { type: 'REQUIRES_ONE_OF', ifPicked: 'towbar', oneOf: ['diesel', 'petrol'] },
  { type: 'EXCLUDES_IF', ifPicked: 'sport', excluded: ['towbar'] },
] as const;
eq(optionStates(['diesel', 'hybrid', 'towbar'], new Set(['diesel', 'sport']), rules),
  [{ option: 'diesel' }, { option: 'hybrid', disabledBecause: 'nie łączy się z: diesel' }, { option: 'towbar', disabledBecause: 'wykluczone przez: sport' }], 'config');
eq(missingRequirements(new Set(['towbar']), rules), ['towbar wymaga jednej z: diesel, petrol'], 'missing');
const seg = { from: d(10), to: d(11) };
const ra = new ResourceAvailability('car-1', seg);
const alice = 'alice' as OwnerId, bob = 'bob' as OwnerId;
eq(ra.block(alice).ok, true, 'block');
eq(ra.block(bob), { ok: false, error: 'ALREADY_TAKEN' }, 'taken');
eq(ra.release(bob), { ok: false, error: 'NOT_OWNER' }, 'not owner');
eq(ra.release(alice).ok, true, 'release');
ra.disable(bob);
eq(ra.block(bob), { ok: false, error: 'DISABLED' }, 'disabled blocks even disabler');
eq(ra.pullEvents().map(e => e.type), ['ResourceBlocked', 'ResourceReleased', 'ResourceDisabled'], 'events');
eq(ra.pullEvents().length, 0, 'events drained');
console.log('OK: all archetype TS tests passed');
```
