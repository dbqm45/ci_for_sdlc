# Klocki domenowe w Pythonie — przykłady

> **Spis treści:** 1. Money · 2. Result · 3. Zdarzenia · 4. Agregat rezerwacji sali · 5. Port repozytorium i adapter w pamięci · 6. Wariant dla Pythona 3.11

Kod sprawdzony 2026-10-03:
- wariant 3.12+ (sekcje 1–5) uruchomiony na CPython 3.14 i sprawdzony `mypy --strict` (mypy 2.4.0) oraz `ruff check`;
- wariant 3.11 (sekcja 6) uruchomiony na CPython 3.11.

## 1. Money
```python
from __future__ import annotations

from dataclasses import dataclass
from decimal import ROUND_HALF_EVEN, Decimal

CENT = Decimal("0.01")


@dataclass(frozen=True, slots=True)
class Money:
    amount: Decimal
    currency: str

    def __post_init__(self) -> None:
        if len(self.currency) != 3:
            raise ValueError(f"kod waluty ISO 4217: {self.currency!r}")
        object.__setattr__(self, "amount", self.amount.quantize(CENT, ROUND_HALF_EVEN))

    @classmethod
    def of(cls, amount: str | int, currency: str) -> Money:
        return cls(Decimal(amount), currency)

    def __add__(self, other: Money) -> Money:
        if other.currency != self.currency:
            raise ValueError("różne waluty")
        return Money(self.amount + other.amount, self.currency)
```
`ValueError` jest tu poprawny: zła waluta to błąd programisty, nie odrzucenie biznesowe.

## 2. Result
```python
from dataclasses import dataclass
from typing import assert_never


@dataclass(frozen=True, slots=True)
class Ok[T]:
    value: T


@dataclass(frozen=True, slots=True)
class Rejected:
    reason: str


type Result[T] = Ok[T] | Rejected


def message(r: Result[str]) -> str:
    match r:
        case Ok(value=v):
            return f"Zarezerwowano: {v}"
        case Rejected(reason=why):
            return f"Odrzucono: {why}"
        case _:
            assert_never(r)
```
Dodanie trzeciego wariantu bez nowej gałęzi `case` → mypy zgłasza błąd w `assert_never`.

## 3. Zdarzenia
```python
from dataclasses import dataclass
from datetime import UTC, datetime


@dataclass(frozen=True, slots=True)
class SlotHeld:
    room: str
    slot: str
    by: str
    occurred_at: datetime


@dataclass(frozen=True, slots=True)
class SlotBooked:
    room: str
    slot: str
    by: str
    occurred_at: datetime


type RoomEvent = SlotHeld | SlotBooked


def now() -> datetime:
    return datetime.now(UTC)
```

## 4. Agregat rezerwacji sali
```python
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Free:
    pass


@dataclass(frozen=True, slots=True)
class Held:
    by: str


@dataclass(frozen=True, slots=True)
class Booked:
    by: str


type SlotState = Free | Held | Booked


class RoomSchedule:
    """Agregat: granica spójności = jedna sala; zmiany tylko przez metody biznesowe."""

    def __init__(self, room: str, version: int = 0) -> None:
        self.room = room
        self.version = version
        self._slots: dict[str, SlotState] = {}
        self._events: list[RoomEvent] = []

    def hold(self, slot: str, by: str) -> Result[str]:
        match self._slots.get(slot, Free()):
            case Free():
                self._slots[slot] = Held(by)
                self._events.append(SlotHeld(self.room, slot, by, now()))
                return Ok(slot)
            case Held(by=other) | Booked(by=other) if other != by:
                return Rejected("termin zajęty")
            case _:
                return Ok(slot)   # ponowienie przez tę samą osobę — idempotentnie

    def confirm(self, slot: str, by: str) -> Result[str]:
        match self._slots.get(slot, Free()):
            case Held(by=holder) if holder == by:
                self._slots[slot] = Booked(by)
                self._events.append(SlotBooked(self.room, slot, by, now()))
                return Ok(slot)
            case Booked(by=holder) if holder == by:
                return Ok(slot)
            case _:
                return Rejected("najpierw wstępna rezerwacja")

    def pull_events(self) -> list[RoomEvent]:
        events, self._events = self._events, []
        return events
```

## 5. Port repozytorium i adapter w pamięci
```python
from typing import Protocol


class ConcurrencyConflict(Exception):
    """Ktoś zapisał agregat wcześniej — ponów komendę na świeżym stanie."""


class RoomSchedules(Protocol):
    def get(self, room: str) -> RoomSchedule: ...
    def save(self, schedule: RoomSchedule) -> None: ...


class InMemoryRoomSchedules:
    def __init__(self) -> None:
        self._data: dict[str, RoomSchedule] = {}

    def get(self, room: str) -> RoomSchedule:
        return self._data.get(room) or RoomSchedule(room)

    def save(self, schedule: RoomSchedule) -> None:
        stored = self._data.get(schedule.room)
        if stored is not None and stored is not schedule:
            if stored.version != schedule.version:
                raise ConcurrencyConflict(schedule.room)
        schedule.version += 1
        self._data[schedule.room] = schedule


def reserve(repo: RoomSchedules, room: str, slot: str, by: str) -> Result[str]:
    schedule = repo.get(room)
    result = schedule.hold(slot, by)
    if isinstance(result, Ok):
        repo.save(schedule)
    return result
```
Adapter SQL implementuje ten sam `Protocol` i sprawdza wersję w `UPDATE … WHERE version = :expected`.
Test domeny w pytest używa `InMemoryRoomSchedules` (tool-pytest).

## 6. Wariant dla Pythona 3.11
Bez instrukcji `type` i bez `class Ok[T]`: generyk przez `TypeVar`, alias przez `TypeAlias`, `assert_never`
z `typing` (3.11 je ma).
```python
from dataclasses import dataclass
from typing import Generic, TypeAlias, TypeVar, Union, assert_never

T = TypeVar("T")


@dataclass(frozen=True)
class Ok(Generic[T]):
    value: T


@dataclass(frozen=True)
class Rejected:
    reason: str


Result: TypeAlias = Union[Ok[T], Rejected]


def message(r: "Result[str]") -> str:
    if isinstance(r, Ok):
        return f"Zarezerwowano: {r.value}"
    if isinstance(r, Rejected):
        return f"Odrzucono: {r.reason}"
    assert_never(r)
```
W 3.11 `match` też działa; `slots=True` w dataclass i `datetime.UTC` są dostępne od 3.10 i 3.11.
