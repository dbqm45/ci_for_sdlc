# Przykłady refaktoryzacji z dowodem zachowania

## 1. Bogaty agregat → decider
**Sytuacja:** „Przepisz agregat `Reservation` na decider, żeby reguły dało się testować bez bazy. Zachowanie ma zostać
takie samo”. Testy domenowe (14) są zielone, ORM zapisuje zmienione encje sam.

**Jak:**
1. **Warunek wstępny:** 14 testów zielonych — to punkt odniesienia.
2. **Kontrakt** w `docs/project/06-delivery/03-behavior-contract.md`: scenariusze, sygnatura
   `ReservationService.confirm(id, at)`, zdarzenie `ReservationConfirmed` bez nowych pól, **rodzaj odrzucenia** (wyjątek
   `ReservationExpired`), granica spójności: jeden agregat na transakcję, pole `version`.
3. **Podnieś** (`test(reservation): …`): scenariusze + DSL, sterownik aplikacyjny wołający istniejącą fasadę;
   rejestr asercji dla każdej przepisanej asercji.
4. **Zamień** (`refactor(reservation): …`): `decide` obok starego agregatu, powłoka *wczytaj → decyduj → zapisz jawnie →
   publikuj* (przepis z `idioms.md`), fasada przepięta.
5. **Obniż:** sterownik domenowy na `decide`, stary agregat usunięty.

**Wynik** — rdzeń po zmianie (warunki odrzucenia przeniesione dosłownie, czas jako parametr komendy):
```ts
type State = { readonly id: string; readonly status: "pending" | "confirmed"; readonly expiresAt: Date; readonly version: number };
type Confirm = { readonly kind: "confirm"; readonly at: Date };
type ReservationConfirmed = { readonly type: "ReservationConfirmed"; readonly reservationId: string; readonly at: Date };

class ReservationExpired extends Error {}

export function decide(state: State, cmd: Confirm): { state: State; events: ReservationConfirmed[] } {
  if (state.status === "confirmed") return { state, events: [] }; // jak w starym agregacie: idempotentnie, bez zdarzenia
  if (cmd.at > state.expiresAt) throw new ReservationExpired(state.id); // rodzaj odrzucenia bez zmian
  return {
    state: { ...state, status: "confirmed" },
    events: [{ type: "ReservationConfirmed", reservationId: state.id, at: cmd.at }],
  };
}
```
Rejestr asercji (fragment):

| Asercja oryginalna | Asercja w DSL | Czego już nie rozróżnia | Dlaczego to akceptowalne |
|---|---|---|---|
| `expect(res.getStatus()).toBe(Status.CONFIRMED)` | `thenReservationIsConfirmed()` | wewnętrznego enuma | status widać przez fasadę w DTO |

Podsumowanie: 3 commity (podnieś, zamień, obniż), luka pokrycia — ścieżka anulowania bez testu (tryb oszczędny).

## 2. Legacy bez testów i ukryty defekt
**Sytuacja:** „Uporządkuj `late_fee()` — 60 linii zagnieżdżonych `if`, nikt nie wie, co robi. Testów brak”.

**Jak:**
1. **Warunek wstępny niespełniony** → najpierw testy charakteryzujące (qa-spec-first-testing), oznaczone jako takie.
2. Kontrakt: wejście `days_late`, `is_member`, wynik `int` w groszach, brak wyjątków dla `days_late <= 0` (zwraca 0).
3. Refaktoryzacja na tabelę progów; testy charakteryzujące bez zmian zielone.
4. **Pułapka „ukryty defekt”:** dla `days_late == 30` stary kod zwraca stawkę niższego progu (`<` zamiast `<=`).
   Nie poprawiasz go po cichu — testy charakteryzujące utrwalają też błędy, więc zgłaszasz rozbieżność człowiekowi.

**Wynik:**
```python
# po zmianie — zachowanie identyczne, łącznie z progiem 30 (zgłoszone jako możliwy defekt)
_RATES = [(7, 100), (30, 250)]  # (do ilu dni wyłącznie, grosze za dzień)
_MAX_RATE = 500


def late_fee(days_late: int, is_member: bool) -> int:
    if days_late <= 0:
        return 0
    rate = next((r for limit, r in _RATES if days_late < limit), _MAX_RATE)
    fee = days_late * rate
    return fee // 2 if is_member else fee
```
Wpis w podsumowaniu: „wykryty ukryty defekt: 30 dni liczone stawką 500 zamiast 250 — zachowane; decyzja w `decisions.md`”.

## 3. Czerwony test po przepięciu fasady
**Sytuacja:** po kroku „zamień” scenariusz „potwierdzona rezerwacja blokuje termin” jest czerwony.

**Jak:**
1. Czerwony test = siatka zadziałała; testu **nie** edytujesz.
2. Sprawdzasz pułapkę **niejawnego utrwalania**: stary agregat zapisywał ORM sam, nowa powłoka nie woła `save`.
3. Poprawiasz okablowanie powłoki (jawny zapis w tej samej transakcji), scenariusz wraca do zielonego.
4. Gdyby nie dało się zazielenić bez edycji testu — `git` do stanu po kroku „podnieś” i zgłoszenie.

**Wynik** — poprawka w powłoce, nie w teście:
```ts
interface Repo { load(id: string): Promise<State>; save(s: State, expectedVersion: number): Promise<void> }
interface Bus { publish(e: ReservationConfirmed[]): Promise<void> }
declare function inTransaction<T>(fn: () => Promise<T>): Promise<T>;

export async function confirm(repo: Repo, bus: Bus, id: string, at: Date): Promise<void> {
  const events = await inTransaction(async () => {
    const before = await repo.load(id);
    const { state, events } = decide(before, { kind: "confirm", at });
    await repo.save(state, before.version); // brakowało: ORM nie zapisze już niezmiennego stanu sam
    return events;
  });
  await bus.publish(events);
}
```
