---
name: core-stack-sync
description: Użyj na starcie pracy i przy niezgodności wersji — odczyt stacku projektu i dopasowanie skilli, bez podnoszenia zależności.
metadata:
  katalog: "Użyj na początku pracy w istniejącym projekcie i gdy hook zgłosi niezgodność wersji — odczytanie stacku (package.json, lockfile, pom.xml, build.gradle), porównanie z wersjami, na których oparte są skille, i aktualizacja skilli (nie projektu) do wersji z projektu. Nie do podnoszenia zależności projektu (to osobne zadanie na prośbę użytkownika)."
  slowa: "podnieść wersję, kompatybilność wersji, na jakich wersjach polegać, zakres obsługiwanych wersji, peerDependencies, jakie wersje mamy w projekcie, niezgodność wersji"
---

# Synchronizacja skilli ze stackiem projektu

Skille technologiczne (`lang-*`, `fw-*`, `tool-*`) opisują konkretny zakres wersji zapisany w `skill.meta.json`
(`min_supported` … `based_on`). Projekt może być nowszy albo starszy — wtedy skill trzeba zaktualizować
albo stosować go ostrożnie.

## 1. Odczytaj stack
```bash
python3 .claude/hooks/detect_stack.py            # raport tekstowy
python3 .claude/hooks/detect_stack.py --json     # dla dalszego przetwarzania
python3 .claude/hooks/detect_stack.py --latest   # + najnowsze wersje z rejestru npm
```
Kolejność źródeł wersji: zainstalowana (`node_modules`) → lockfile → zakres w `package.json`; Java: `pom.xml`,
`build.gradle(.kts)`, `.java-version`. Hook `SessionStart` robi to automatycznie i odzywa się tylko wtedy, gdy jest coś do zrobienia.
Monorepo (Nx, workspaces): wersje z głównego `package.json`; gdy projekty mają własne `package.json`, uruchom skrypt dla każdego.

## 2. Zdecyduj według statusu
| Status | Znaczenie | Co robisz |
|---|---|---|
| `OK` | wersja projektu w zakresie skilla | pracujesz; z sekcji „Zależne od wersji” bierzesz tylko to, co dostępne w wersji projektu |
| `SKILL_OUTDATED` | projekt nowszy niż `based_on` | **aktualizujesz skill** (krok 3), zanim na nim oprzesz decyzje |
| `PROJECT_OLDER` | projekt starszy niż `min_supported` | **nie cofasz skilla**; dopisujesz do „Zależne od wersji” wiersze dla wersji projektu (co jest niedostępne i czym to zastąpić) i stosujesz tylko te funkcje |
| `MISSING_SKILL` | technologia bez skilla | proponujesz utworzenie: `python3 factory/build.py new-skill fw-react "…"` (dostaje tabelę słownika) i wypełnienie wg kroku 3 |
| ograniczenie ✗ | np. Angular 22 wymaga TypeScript 6.0.x | nie zalecasz wersji spoza zakresu (np. TS 7 w projekcie z Angularem 22); zgłaszasz niezgodność użytkownikowi |

## 3. Aktualizacja skilla (dla każdego `SKILL_OUTDATED`)
1. **Źródła pierwotne** z `skill.meta.json → sources` + informacje o wydaniach każdej wersji głównej między `based_on`
   a wersją projektu (release notes, oficjalny blog, przewodnik aktualizacji). Blogi osób trzecich tylko pomocniczo.
2. **Zbierz zmiany istotne dla skilla:** nowe stabilne API, zmienione wartości domyślne, wycofane (deprecated) i usunięte
   elementy, nowe wymagania (wersje języka, Node, JDK), zmiany idiomów. Pomiń rzeczy eksperymentalne albo oznacz je wprost.
3. **Edytuj SKILL.md:**
   - „Konwencje / Zasady” — nowe domyślne podejście (np. nowy sposób na formularze, domyślna strategia detekcji zmian);
   - „Pojęcia domenowe w …” — tylko gdy zmienił się idiom dla pojęcia ze słownika;
   - „Zależne od wersji” — dopisz wiersze dla nowych wersji (co od której wersji, co wycofane, czym zastąpić).
     Treść ogólna ma pozostać prawdziwa dla całego zakresu `min_supported … based_on`.
4. **Zaktualizuj przykłady w `references/`** i — jeśli to możliwe — zweryfikuj je kompilatorem/testami tej wersji
   w katalogu tymczasowym (np. `npm i` konkretnych wersji w scratchpadzie, nie w projekcie użytkownika).
5. **Zaktualizuj `skill.meta.json`:** `based_on`, ewentualnie `min_supported`, `verified` (data), `verified_with`, `constraints`
   (np. `"22": {"lang-typescript": ">=6.0 <6.1"}`), `sources`.
6. **Sprawdź skille powiązane** — ograniczenia (`constraints`) i zależności (`skill_requires` w `factory/config.yaml`),
   np. nowa wersja frameworka może wymagać aktualizacji skilla języka.
7. `python3 factory/build.py check` → pokaż użytkownikowi diff → commit wg core-conventional-commits,
   np. `docs(skills): update fw-angular to Angular 22`.

## Zasady
- Skille są współdzielone między projektami: aktualizacja poszerza zakres (`based_on` w górę), a nie „przełącza” skill na
  jeden projekt. Informacje dla starszych wersji zostają w „Zależne od wersji”.
- **Nigdy nie podnoś zależności projektu** w ramach tej procedury. Aktualizacja projektu (`ng update`, `nx migrate`,
  zmiana JDK) to osobne zadanie, wykonywane tylko na prośbę użytkownika.
- Gdy nie masz dostępu do źródeł (brak sieci), zaznacz w raporcie, że skill nie został zweryfikowany dla danej wersji,
  i pracuj ostrożnie, trzymając się funkcji wspólnych dla obu wersji.
- Rejestr technologii do wykrywania: `references/technologies.json` (dopisz nową technologię, żeby była raportowana).
