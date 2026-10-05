---
name: lang-python
description: Użyj przy kodzie Python 3.11–3.15 — typy i mypy, pyproject i uv, ruff, dataclass i Decimal, wyjątki czy wynik.
metadata:
  katalog: "Użyj przy pisaniu i przeglądzie kodu Python (3.11–3.15) — typowanie (składnia generyków 3.12, X | None, Protocol, mypy/pyright), struktura projektu (pyproject.toml, src layout, uv, lockfile, grupy zależności), ruff, niezmienność (dataclass frozen), pieniądze w Decimal, obsługa błędów i odrzucenia jako wynik, match, asyncio — oraz przy wyrażaniu pojęć domenowych idiomami Pythona. Nie do testów w pytest (tool-pytest), analizy danych i statystyki (data-analysis) ani potoków danych (data-engineering)."
  slowa: "Python, pyproject, pyproject.toml, uv, ruff, mypy, pyright, typowanie w Pythonie, dataclass, Decimal, TypeVar, asyncio, venv, pip, requirements.txt, FastAPI, Django, .py"
---

# Python

**Najpierw sprawdź wersję** projektu: `requires-python` w `pyproject.toml` (zakres wspierany) i `.python-version`
(interpreter do pracy, uv/pyenv). Nie używaj składni nowszej niż dolna granica `requires-python` — tabela
„Zależne od wersji”.

## Zasady języka
1. **Typy wszędzie na granicach modułów**, sprawdzane w CI (`mypy --strict` albo pyright):
   - `X | None` zamiast `Optional[X]`;
   - wbudowane generyki (`list[int]`, `dict[str, Decimal]`);
   - od 3.12 składnia generyków bez `TypeVar`: `class Result[T, E]: …`, `def first[T](xs: list[T]) -> T`,
     aliasy `type Money = Decimal`;
   - `Protocol` zamiast dziedziczenia dla portów, `@override` (3.12) przy nadpisywaniu;
   - `Any` tylko na granicy z nietypowanym kodem.
2. **Niezmienność domyślnie:**
   - `@dataclass(frozen=True, slots=True)` dla wartości, krotki i `frozenset` w polach;
   - modyfikacja przez `dataclasses.replace`;
   - nie używaj mutowalnych wartości domyślnych (`def f(xs=[])`, pole `list` bez `field(default_factory=list)`).
3. **Pieniądze i ilości w `Decimal`** z kontekstem lub jawnym `quantize(Decimal('0.01'), ROUND_HALF_EVEN)`, nigdy
   `float`. `Decimal` tworzysz z `str` lub `int`, nie z `float`.
4. **Błędy:**
   - wyjątki są dla błędów programistycznych i infrastruktury;
   - **odrzucenie biznesowe** (sala zajęta, limit przekroczony) zwracasz jako wynik (wariant `Rejected`)
     albo jako własny wyjątek domenowy z nazwą w języku biznesu — nigdy jako ogólny `ValueError` łapany w API;
   - nie łap gołego `except:` ani `except Exception: pass`;
   - przy ponownym rzuceniu dodaj kontekst: `raise X from e`.
5. **Warianty:** `match` po klasach (`case Reserved(slot=s):`) i wyczerpujące sprawdzenie przez `assert_never` w gałęzi
   `case _`; enumy przez `enum.StrEnum` (3.11).
6. **Struktura projektu:**
   - `pyproject.toml` z tabelą `[project]` (`requires-python`, `dependencies`) i `[build-system]`;
   - **src layout** (`src/<pakiet>/`);
   - zależności deweloperskie w **`[dependency-groups]`** (PEP 735; `uv add --dev pytest`);
   - **uv** do środowiska, lockfile `uv.lock` w repo, `uv sync --locked` w CI, `uv run` do poleceń;
   - eksport do standardu `pylock.toml` (PEP 751) przez `uv export`, gdy wymaga go inne narzędzie;
   - bez instalowania pakietów globalnie i bez `sudo pip`.
7. **Lint i format:** `ruff check` (z regułami m.in. `B`, `UP`, `SIM`, `S`) i `ruff format` zamiast black/isort/flake8.
   Reguła `UP` podpowiada składnię zgodną z `requires-python`.
8. **Asynchroniczność:**
   - `asyncio.TaskGroup` (3.11) zamiast luźnych `create_task`;
   - limit czasu przez `asyncio.timeout()`;
   - nie wołasz blokujących funkcji w pętli zdarzeń — `asyncio.to_thread` dla wywołań synchronicznych.
9. **Bezpieczeństwo:**
   - zapytania SQL z parametrami;
   - `subprocess` z listą argumentów, bez `shell=True` z danymi z zewnątrz;
   - bez `pickle` i `yaml.load` dla danych z zewnątrz (`yaml.safe_load`);
   - sekrety ze zmiennych środowiskowych;
   - `secrets`, nie `random`, do tokenów.
10. **Pliki tekstowe:** zawsze `encoding="utf-8"` w `open()` (od 3.15 domyślne, ale kod ma działać na dolnej
    granicy `requires-python`).

Przetestowane przykłady (Money, Result, agregat rezerwacji z maszyną stanów i zdarzeniami, port repozytorium jako
`Protocol`, wariant 3.11 bez składni generyków 3.12): `references/domain-building-blocks.md`.

## Pojęcia domenowe w Pythonie
| Pojęcie (słownik) | Idiom w Pythonie |
|---|---|
| **obiekt wartości** | `@dataclass(frozen=True, slots=True)` z walidacją w `__post_init__`; operacje zwracają nowy obiekt |
| **identyfikator / encja** | `NewType('RoomId', str)` albo zamrożona dataclass zamiast gołego `str`; encja = klasa z tożsamością i zachowaniem, równość po ID |
| **warianty** | unia zamrożonych dataclass (`type Outcome = Reserved \| Rejected`) i `match` z `assert_never` |
| **wynik operacji** | `type Result[T] = Ok[T] \| Rejected` (warianty jak wyżej) albo zdarzenia sukcesu/odrzucenia zwracane z metody |
| **agregat** | klasa z prywatnym stanem (`_slots`), metody biznesowe zamiast setterów, `version` do blokady optymistycznej, lista zdarzeń oddawana przez `pull_events()` |
| **maszyna stanów** | stan jako unia dataclass lub `StrEnum`; przejścia w `match` z warunkami `if` w `case` |
| **zdarzenie** | zamrożona dataclass z nazwą w czasie przeszłym (`RoomReserved`) i polem `occurred_at: datetime` (strefa UTC) |
| **polityka** | `Protocol` z jedną metodą albo funkcja `Callable[[...], ...]` wstrzykiwana do agregatu lub serwisu |
| **specyfikacja** | funkcja-predykat z nazwą z języka biznesu; złożenia przez `all()`/`any()` |
| **repozytorium / port** | `Protocol` w pakiecie domeny operujący na agregatach; adapter (SQLAlchemy, psycopg) w infrastrukturze |
| **read model** | osobna zamrożona dataclass lub `TypedDict` + zapytanie SQL omijające agregat |
| **moduł** | pakiet z publicznym `__init__.py` (`__all__`); nazwy wewnętrzne z `_`; granice pilnowane testem importów (np. import-linter) |

## Zależne od wersji
| Wersja | Status (2026-10-03) | Zmiany istotne dla tego skilla |
|---|---|---|
| 3.10 | koniec wsparcia 2026-10 | `match`, `X \| Y` w typach |
| 3.11 | tylko poprawki bezpieczeństwa | `TaskGroup`, `asyncio.timeout`, `ExceptionGroup`/`except*`, `StrEnum`, `Self`, `tomllib`; szybszy interpreter |
| 3.12 | tylko poprawki bezpieczeństwa | **składnia generyków** `def f[T]`, `class C[T]`, instrukcja `type`; `@override`; f-stringi bez ograniczeń cudzysłowów; usunięte `distutils`; `datetime.utcnow()` wycofane — używaj `datetime.now(UTC)` |
| 3.13 | tylko poprawki bezpieczeństwa | nowy REPL; `warnings.deprecated`; domyślne wartości parametrów typu, `TypeIs`, `ReadOnly`; eksperymentalnie wersja bez GIL i JIT; usunięte stare moduły (PEP 594: `cgi`, `crypt`, `telnetlib` i inne) |
| 3.14 | poprawki błędów (aktualnie 3.14.8) | **leniwe adnotacje** (PEP 649/749, moduł `annotationlib`) — odwołania do typów zdefiniowanych niżej działają bez cudzysłowów; **t-stringi** (`t"…"`, PEP 750) do bezpiecznego składania SQL/HTML; `except A, B:` bez nawiasów; `compression.zstd`; `concurrent.interpreters`; wersja bez GIL oficjalnie wspierana; `uuid.uuid7()` |
| 3.15 | release candidate; wydanie planowane na 2026-10-09 (PEP 790) | **UTF-8 domyślnie** (PEP 686); `lazy import` (PEP 810); wbudowane `frozendict` i `sentinel`; rozpakowanie w wyrażeniach listowych; moduł `profiling` (profiler próbkujący) |

Projekt na wersji nowszej niż w tabeli → `detect_stack.py` zgłosi `SKILL_OUTDATED`; zaktualizuj skill wg
core-stack-sync. Interpretera ani zależności nie podnosisz bez prośby człowieka.

## Checklista
- [ ] wersja z `requires-python` sprawdzona; brak składni nowszej niż dolna granica
- [ ] `ruff check`, `ruff format --check` i `mypy --strict` (lub pyright) bez błędów
- [ ] brak `float` dla kwot, brak mutowalnych wartości domyślnych
- [ ] odrzucenia biznesowe jako wynik albo wyjątek domenowy, nie `ValueError`
- [ ] `uv.lock` aktualny; zależności deweloperskie w `[dependency-groups]`
- [ ] testy domeny w pytest bez bazy i frameworka (tool-pytest)

## Źródła
- docs.python.org/3/whatsnew/ (3.11–3.14) i docs.python.org/3.15/whatsnew/3.15.html — dostęp 2026-10-03
- devguide.python.org/versions/ (status gałęzi), PEP 745 (3.14), PEP 790 (3.15)
- packaging.python.org: Writing your pyproject.toml, Dependency groups (PEP 735), pylock.toml (PEP 751)
- PyPI (2026-10-03): uv 0.12.22, ruff 0.16.10, mypy 2.4.0
