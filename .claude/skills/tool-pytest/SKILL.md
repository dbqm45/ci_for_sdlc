---
name: tool-pytest
description: Użyj przy testach w pytest 8–9 — fixtures, parametrize, tmp_path, monkeypatch, konfiguracja TOML, asyncio, Hypothesis.
metadata:
  katalog: "Użyj przy testach w pytest (8–9.1) — struktura testów i conftest.py, fixtures (zakresy, yield, fabryki), parametrize z pytest.param i ids, tmp_path, monkeypatch, caplog, pytest.raises(match=), subtesty, konfiguracja [tool.pytest] i strict = true, import-mode importlib, testy asyncio (pytest-asyncio, asyncio_mode), testy właściwości (Hypothesis), pokrycie (pytest-cov) i testy mutacyjne (mutmut), migracja 8→9. Nie do strategii testów niezależnej od narzędzia (eng-testing), projektu przypadków (qa-test-design) ani testów w JS/TS (tool-vitest, tool-jest)."
  slowa: "pytest, conftest, fixture, parametrize, tmp_path, monkeypatch, pytest.raises, pytest-asyncio, asyncio_mode, Hypothesis, pytest-cov, mutmut, test_*.py, tests/"
---

# pytest

**Najpierw sprawdź wersję** (`uv.lock`, `[dependency-groups]` w `pyproject.toml` lub `pip show pytest`) i sekcję
konfiguracji. Zasady TDD i dobór rodzaju testu: eng-testing; kod produkcyjny piszesz po czerwonym teście
(hook `tdd_guard`).

## Konfiguracja
- **pytest 9:** natywny TOML w `pyproject.toml` w sekcji **`[tool.pytest]`** (listy i liczby jako typy TOML) albo
  w pliku `pytest.toml`. Stara sekcja `[tool.pytest.ini_options]` (wartości jako napisy INI) dalej działa;
  przy przejściu na 9 przenieś ją do `[tool.pytest]` i zamień napisy na listy (`addopts = ["-ra"]`).
- **`strict = true`** (9.0) włącza `strict_config`, `strict_markers`, `strict_parametrization_ids` i `strict_xfail`:
  literówka w markerze lub opcji jest błędem, a `xfail`, który przechodzi, oblewa test. Tryb ścisły dokłada
  w przyszłych wersjach nowe opcje, więc włączaj go przy zablokowanej wersji pytest (lockfile).
- Nowy projekt: `addopts = ["--import-mode=importlib"]`, `testpaths = ["tests"]`, układ `src/` (pytest testuje
  zainstalowany pakiet, a nie przypadkowo katalog roboczy).
- Instalacja jako zależność deweloperska: `uv add --dev pytest` (trafia do `[dependency-groups]`), uruchomienie
  `uv run pytest`.

```toml
[tool.pytest]
minversion = "9.0"
strict = true
testpaths = ["tests"]
addopts = ["-ra", "--import-mode=importlib"]
markers = ["slow: wolne testy, poza szybkim zestawem"]
```

## Zasady
1. **Nazwy:** pliki `test_*.py`, funkcje `test_<zachowanie>_<warunek>`; jedna oczekiwana zmiana zachowania na test.
   Zwykły `assert` (pytest pokazuje różnice), bez `self.assertEqual`.
2. **Fixtures zamiast setUp:**
   - zależność deklarujesz parametrem;
   - sprzątanie robisz po `yield`;
   - zakres domyślnie `function`, szerszy (`module`, `session`) tylko dla zasobów kosztownych i niemodyfikowanych;
   - wspólne fixtures trzymasz w `conftest.py` na najniższym wspólnym poziomie katalogów;
   - fabryka (fixture zwracający funkcję) służy do tworzenia wielu obiektów z wariantami.
3. **Wbudowane fixtures:**
   - `tmp_path` (zamiast `tempfile`), `monkeypatch` (zmienne środowiskowe, atrybuty), `caplog`, `capsys`;
   - pliki tworzysz tylko w `tmp_path`, nigdy w repo.
4. **Tabele przypadków:** `@pytest.mark.parametrize("kwota, rabat", [...])` zamiast kopii testu; czytelne nazwy
   przez `pytest.param(..., id="próg-200")` lub `ids=`; brzegi klas równoważności z qa-test-design.
5. **Wyjątki:** `with pytest.raises(RoomTaken, match="zajęt"):` — zawsze konkretny typ, nie `Exception`.
   Odrzucenia zwracane jako wynik sprawdzasz zwykłym `assert result == Rejected(...)`.
6. **Dublery:**
   - najpierw **fake** (np. repozytorium w pamięci implementujące `Protocol`), potem stub;
   - `unittest.mock` tylko na granicy systemu (HTTP, zegar, kolejka);
   - z `mock.patch` używasz `autospec=True`;
   - nie mockujesz typów, które posiadasz.
7. **Czas i losowość:** zegar wstrzykiwany do kodu (`Callable[[], datetime]`) zamiast patchowania `datetime`; ziarno
   losowości jawne.
8. **asyncio:** `pytest-asyncio` 1.x:
   - domyślny `asyncio_mode = "strict"` wymaga `@pytest.mark.asyncio`;
   - `asyncio_mode = "auto"` jest zalecany w projektach tylko na asyncio;
   - ustaw jawnie `asyncio_default_fixture_loop_scope = "function"`;
   - testów nie usypiasz `sleep` — czekasz na zdarzenie z limitem (`asyncio.timeout`).
9. **Wiele asercji w jednym teście:** subtesty (wbudowane od 9.0, fixture `subtests`, `with subtests.test(i=i):`),
   gdy chcesz zobaczyć wszystkie porażki pętli, a parametrize nie pasuje.
10. **Testy właściwości:** Hypothesis (`@given(st.decimals(...))`) dla niezmienników (np. suma rabatów ≤ cena);
    znalezione przykłady utrwal przez `@example`.
11. **Jakość zestawu:**
    - `pytest-cov` (`--cov=src --cov-branch`) pokazuje niepokryte gałęzie, ale nie mówi, czy testy coś sprawdzają;
    - to mierzy **mutmut** na module domeny (qa-spec-first-testing);
    - testy niestabilne naprawiasz albo przenosisz do kwarantanny z terminem (qa-regression);
    - nie dodajesz `@pytest.mark.flaky`.

Przykłady (fixture-fabryka, parametrize z `pytest.param`, `tmp_path`, `monkeypatch`, fake repozytorium, test
asyncio, Hypothesis, subtesty) uruchomione na pytest 9.1.1: `references/przyklady.md`.

## Zależne od wersji
| Wersja | Zmiany istotne dla tego skilla |
|---|---|
| 8.x | `tmp_path`, `pytest.param`, `--import-mode=importlib`; konfiguracja tylko w `[tool.pytest.ini_options]` (napisy INI); 8.4 (2025-06) kończy wsparcie Pythona 3.8 |
| 9.0 (2025-11) | **natywny TOML `[tool.pytest]`** i plik `pytest.toml`; **`strict = true`**; **subtesty wbudowane**; ostrzeżenia `PytestRemovedIn9Warning` stają się błędami; koniec wsparcia Pythona 3.9 |
| 9.1 (2026-06) | wsparcie Pythona 3.15; `pytest.register_fixture()`; `--max-warnings`; aktualnie 9.1.1 |

Wtyczki (PyPI, 2026-10-03): pytest-asyncio 1.4.0, pytest-cov 7.1.0, hypothesis 6.168.3, mutmut 3.8.0 — wszystkie
wymagają Pythona ≥3.10. Wersji w projekcie nie podnosisz bez prośby człowieka (core-stack-sync).

## Checklista
- [ ] test napisany przed kodem i widziany na czerwono (komunikat porażki sprawdza właściwą rzecz)
- [ ] konfiguracja w `[tool.pytest]` lub `[tool.pytest.ini_options]`, markery zadeklarowane, `strict` przy zablokowanej wersji
- [ ] brak kopii testów różniących się danymi — `parametrize` z czytelnymi `id`
- [ ] brak plików poza `tmp_path`, brak `sleep` w testach
- [ ] dublery tylko na granicach; fake dla portów domeny

## Źródła
- docs.pytest.org (dokumentacja i changelog z paczki źródłowej pytest 9.1.1: doc/en/reference/customize.rst,
  doc/en/reference/reference.rst — `strict`, how-to/subtests.rst, explanation/goodpractices.rst) — dostęp 2026-10-03
- pytest-asyncio 1.4.0: docs/reference/configuration.rst, docs/concepts.rst
- PyPI (2026-10-03): pytest 9.1.1 (2026-06-19), pytest-asyncio, pytest-cov, hypothesis, mutmut
