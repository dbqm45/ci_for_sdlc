# Adaptery domeny w Angularze — przetestowane

Wersja dla **Angular 22**: skompilowana `ngc` 22.2 (TypeScript 6.0, `strictTemplates`). Import `../domain/archetypes`
to kod z `lang-typescript/references/domain-building-blocks.md` (warstwa domeny bez zależności od Angulara).

```ts
import { Component, LOCALE_ID, Pipe, PipeTransform, Service, computed, inject, input, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse, httpResource } from '@angular/common/http';
import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { FormField, form, validate } from '@angular/forms/signals';
import { firstValueFrom } from 'rxjs';
import {
  BlockRequestState, CalendarView, FeatureType, Money, Party, TimeSlot, displayName, validateFeature,
} from '../domain/archetypes';

// ── Pipe: formatowanie Money w jednym miejscu (standalone domyślnie od v19) ─────
@Pipe({ name: 'money' })
export class MoneyPipe implements PipeTransform {
  private readonly locale = inject(LOCALE_ID);

  transform(value: Money | null | undefined): string {
    if (!value) return '';
    // Number() wystarcza do WYŚWIETLENIA; obliczenia zawsze na Money (bigint).
    return new Intl.NumberFormat(this.locale, { style: 'currency', currency: value.currency })
      .format(Number(value.minor) / 100);
  }
}

// ── Signal Forms (stabilne od v22): walidacja z ograniczeń cechy produktu (dane z API) ─
@Component({
  selector: 'app-feature-field',
  imports: [FormField],
  template: `
    <label>
      {{ feature().name }}
      <input [formField]="field.value" [attr.aria-invalid]="field.value().invalid()" />
    </label>
    @for (error of field.value().errors(); track error.kind) {
      <small role="alert">{{ error.message }}</small>
    }
  `,
})
export class FeatureFieldComponent {
  readonly feature = input.required<FeatureType>();
  protected readonly model = signal({ value: '' });
  protected readonly field = form(this.model, (path) => {
    validate(path.value, ({ value }) => {
      const message = validateFeature(this.feature(), value());
      return message ? { kind: 'feature', message } : null;
    });
  });
}

// ── Reactive Forms (v14+): ta sama reguła domenowa jako ValidatorFn — dla istniejących formularzy ─
export function featureValidator(feature: FeatureType): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const error = validateFeature(feature, String(control.value ?? ''));
    return error ? { feature: error } : null;
  };
}

// ── Krawędź: DTO z API → read model domeny ───────────────────────────────────
interface CalendarDto {
  resourceId: string;
  free: { from: string; to: string }[];
  taken: Record<string, { from: string; to: string }[]>;
}

const toSlot = (s: { from: string; to: string }): TimeSlot => ({ from: new Date(s.from), to: new Date(s.to) });

export function toCalendarView(dto: CalendarDto): CalendarView {
  return {
    resourceId: dto.resourceId,
    free: dto.free.map(toSlot),
    taken: new Map(Object.entries(dto.taken).map(([owner, slots]) => [owner, slots.map(toSlot)])),
  };
}

// ── Store dostępności (v22: @Service + httpResource) ─────────────────────────
@Service()
export class ResourceAvailabilityStore {
  private readonly http = inject(HttpClient);
  private readonly resourceId = signal<string | undefined>(undefined);
  private readonly _request = signal<BlockRequestState>({ kind: 'idle' });

  /** Read model: przeładowuje się sam przy zmianie resourceId; status: idle/loading/resolved/error. */
  readonly calendar = httpResource<CalendarView>(
    () => {
      const id = this.resourceId();
      return id ? `/api/availability/${id}/calendar` : undefined;
    },
    { parse: (raw) => toCalendarView(raw as CalendarDto) },
  );
  readonly request = this._request.asReadonly();
  readonly isPending = computed(() => this._request().kind === 'pending');

  select(resourceId: string): void {
    this.resourceId.set(resourceId);
  }

  /** Komenda: bez optymistycznej aktualizacji — to zasób, o który się konkuruje; 409 to normalny wynik. */
  async block(resourceId: string, slot: TimeSlot): Promise<void> {
    this._request.set({ kind: 'pending', slot });
    try {
      await firstValueFrom(this.http.post(`/api/availability/${resourceId}/blocks`, {
        from: slot.from.toISOString(),
        to: slot.to.toISOString(),
      }));
      this._request.set({ kind: 'blocked', slot });
    } catch (err) {
      const reason = err instanceof HttpErrorResponse && err.status === 409
        ? 'Termin został właśnie zajęty'
        : 'Nie udało się zablokować terminu';
      this._request.set({ kind: 'rejected', slot, reason });
    } finally {
      this.calendar.reload();
    }
  }
}

// ── Komponent wariantów Party (OnPush domyślnie od v22) ──────────────────────
@Component({
  selector: 'app-party-card',
  template: `
    <h3>{{ name() }}</h3>
    @switch (party().kind) {
      @case ('person') { <span class="badge">Osoba</span> }
      @case ('organization') { <span class="badge">Organizacja</span> }
    }
    <ul>
      @for (role of party().roles; track role) { <li>{{ role }}</li> }
    </ul>
  `,
})
export class PartyCardComponent {
  readonly party = input.required<Party>();
  readonly name = computed(() => displayName(this.party()));
}
```

## Starsze wersje (sprawdź wersję projektu)
| W kodzie v22 | Angular 19–21 | Angular 17–18 |
|---|---|---|
| `@Service()` | `@Injectable({ providedIn: 'root' })` | jak obok |
| `httpResource(..., { parse })` | eksperymentalne w 19–21 — w kodzie produkcyjnym raczej serwis z `HttpClient` + `signal`/`toSignal` | serwis z `HttpClient` + `toSignal` |
| Signal Forms (`form`, `validate`, `[formField]`) | 21: eksperymentalne; ≤20: brak → `featureValidator` (Reactive Forms) | `featureValidator` |
| brak `standalone: true` | ≥19 jak obok | **dopisz** `standalone: true` |
| OnPush domyślnie | dopisz `changeDetection: ChangeDetectionStrategy.OnPush` | jak obok |

Wariant sprzed v22 (Reactive Forms, `@Injectable`, `HttpClient` + signals) był skompilowany `ngc` 19 ze `strictTemplates`.

## Jak z tego korzystać
- **Formularz cech produktu** (archetyp Product): dla każdej cechy z API typu produktu `<app-feature-field [feature]="f" />`
  (Signal Forms) albo `new FormControl('', { nonNullable: true, validators: featureValidator(f) })` (Reactive Forms).
  Nowa cecha w backendzie = zero zmian w kodzie formularza.
- **Kwota w formularzu** (Money): w kontrolce string wpisany przez użytkownika, konwersja `Money.of(...)` przy wysyłce;
  przy wielu formularzach z kwotą — własna kontrolka (`FormValueControl` / `ControlValueAccessor`).
- **Rezerwacja** (Availability): `store.select(id)` ładuje kalendarz (`store.calendar.value()`, `.isLoading()`, `.error()`);
  przycisk zablokowany przy `store.isPending()`; `request().kind === 'rejected'` → komunikat w regionie `aria-live`.
  Bez optymistycznego „zarezerwowano”; po komendzie `calendar.reload()`.
- **Konfigurator**: `computed(() => optionStates(all, picked(), rules))` — opcje z `disabledBecause` wyszarzone z podpowiedzią.
- **NgRx / SignalStore**: te same funkcje domenowe w reducerach/`computed` — domena nie zależy od biblioteki stanu.
