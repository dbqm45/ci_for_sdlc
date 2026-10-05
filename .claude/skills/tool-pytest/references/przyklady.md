# Przykłady pytest 9

> **Spis treści:** 1. Tabela przypadków · 2. Test właściwości · 3. `tmp_path` i `monkeypatch` · 4. Fixture-fabryka i fake repozytorium · 5. Test asyncio z limitem czasu · 6. Subtesty

Uruchomione 2026-10-03: pytest 9.1.1, pytest-asyncio 1.4.0, hypothesis 6.168.3, CPython 3.14.8, z konfiguracją
z SKILL.md (`strict = true`, `--import-mode=importlib`, `asyncio_mode = "auto"`) i kodem w `src/shop/`.

## 1. Tabela przypadków
Kod: `discount(amount: Decimal) -> Decimal` — 5% od 200 zł, 10% od 1000 zł.
```python
# tests/test_discount.py
from decimal import Decimal

import pytest

from shop.discount import discount


@pytest.mark.parametrize(
    ("amount", "expected"),
    [
        pytest.param("199.99", "0.00", id="tuż-pod-progiem-200"),
        pytest.param("200.00", "10.00", id="próg-200"),
        pytest.param("999.99", "50.00", id="tuż-pod-progiem-1000"),
        pytest.param("1000.00", "100.00", id="próg-1000"),
    ],
)
def test_discount_thresholds(amount: str, expected: str) -> None:
    assert discount(Decimal(amount)) == Decimal(expected)
```
Wartości brzegowe po obu stronach progu (qa-test-design). `id` widać w raporcie i w `-k "próg-200"`.

## 2. Test właściwości
```python
# tests/test_discount_properties.py
from decimal import Decimal

from hypothesis import example, given
from hypothesis import strategies as st

from shop.discount import discount

amounts = st.decimals(min_value=0, max_value=1_000_000, places=2)


@given(amounts)
@example(Decimal("1000.00"))
def test_discount_never_exceeds_ten_percent(amount: Decimal) -> None:
    assert Decimal(0) <= discount(amount) <= amount * Decimal("0.10") + Decimal("0.005")
```
Niezmiennik zamiast pojedynczych przykładów; przypadek znaleziony przez Hypothesis utrwalasz w `@example`.

## 3. `tmp_path` i `monkeypatch`
```python
# tests/test_export.py
from pathlib import Path

import pytest

from shop.export import export_report


def test_export_uses_name_from_env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("REPORT_NAME", "maj.csv")
    path = export_report(["a", "b"], tmp_path)
    assert path == tmp_path / "maj.csv"
    assert path.read_text(encoding="utf-8") == "a\nb"
```
`monkeypatch` cofa zmianę zmiennej po teście; `tmp_path` to osobny katalog dla każdego testu.

## 4. Fixture-fabryka i fake repozytorium
```python
# tests/conftest.py
from collections.abc import Callable
from dataclasses import dataclass, field

import pytest


@dataclass
class Order:
    id: str
    owner: str
    lines: list[tuple[str, int]] = field(default_factory=list)


class InMemoryOrders:
    """Fake portu repozytorium — prawdziwe zachowanie, bez bazy."""

    def __init__(self) -> None:
        self.saved: dict[str, Order] = {}

    def save(self, order: Order) -> None:
        self.saved[order.id] = order

    def of_owner(self, owner: str) -> list[Order]:
        return [o for o in self.saved.values() if o.owner == owner]


@pytest.fixture
def orders() -> InMemoryOrders:
    return InMemoryOrders()


@pytest.fixture
def make_order(orders: InMemoryOrders) -> Callable[..., Order]:
    counter = 0

    def make(owner: str = "ola", **kw: object) -> Order:
        nonlocal counter
        counter += 1
        order = Order(id=f"o{counter}", owner=owner, **kw)  # type: ignore[arg-type]
        orders.save(order)
        return order

    return make
```
```python
# tests/test_orders.py
def test_owner_sees_only_own_orders(orders, make_order) -> None:
    mine = make_order(owner="ola")
    make_order(owner="jan")
    assert orders.of_owner("ola") == [mine]
```
**Nie importuj z `conftest.py`** (`from conftest import …`): przy `--import-mode=importlib` kończy się to
`ModuleNotFoundError` (sprawdzone). Testy dostają obiekty przez fixtures; gdy klasy pomocnicze są potrzebne
w adnotacjach lub w wielu miejscach, umieść je w osobnym pakiecie testowym instalowanym w środowisku
deweloperskim albo w `src/<pakiet>/testing.py`.

## 5. Test asyncio z limitem czasu
```python
# tests/test_notify.py
import asyncio

import pytest

from shop.notify import first_event


async def test_returns_first_event() -> None:
    q: asyncio.Queue[str] = asyncio.Queue()
    q.put_nowait("RoomReserved")
    assert await first_event(q, limit_s=1) == "RoomReserved"


async def test_times_out_without_event() -> None:
    with pytest.raises(TimeoutError):
        await first_event(asyncio.Queue(), limit_s=0.01)
```
Przy `asyncio_mode = "auto"` funkcje `async def` są testami asyncio bez markera.

## 6. Subtesty
```python
# tests/test_codes.py
import pytest

CODES = {"PLN": 2, "EUR": 2, "JPY": 0}


def test_currency_minor_units(subtests: pytest.Subtests) -> None:
    for code, digits in CODES.items():
        with subtests.test(code=code):
            assert digits in (0, 2)
```
Każda porażka w pętli jest raportowana osobno; dla prostych tabel wybierz `parametrize`.
