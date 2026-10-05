---
name: core-conventional-commits
description: Użyj przy commit message i tytule PR (Conventional Commits) — typy, zakres, BREAKING CHANGE, bump SemVer, changelog.
metadata:
  katalog: "Użyj przy pisaniu, przeglądzie i parsowaniu commit message oraz tytułów PR wg Conventional Commits 1.0.0 — typy, zakres, !, BREAKING CHANGE, stopki, revert, bump SemVer, changelog z historii (nx release). Nie do strategii gałęzi i PR (core-git-workflow) ani treści CHANGELOG pisanego ręcznie (core-tech-docs)."
  slowa: "komunikat commita, commit message, wiadomość commita, opis commita, tytuł PR, BREAKING CHANGE, feat, fix, chore, commitlint, narzędzie do wydań, semantic-release, release-please"
---

# Conventional Commits 1.0.0

## Format
```
<typ>[(<zakres>)][!]: <opis>

[treść — dlaczego, nie co; akapity oddzielone pustą linią]

[stopki: Token: wartość  lub  Token #wartość]
```
- **Typ** obowiązkowy; **zakres** opcjonalny, w nawiasie — część kodu.
- **Opis** zaraz po `: `; w trybie rozkazującym, **po angielsku**, bez kropki, ≤ 72 znaki.
- **Treść** po jednej pustej linii; **stopki** po kolejnej pustej linii. Tokeny stopek z łącznikami zamiast spacji
  (`Reviewed-by`, `Refs`); wyjątek: `BREAKING CHANGE`.
- Wielkość liter nie ma znaczenia dla narzędzi, **z wyjątkiem** `BREAKING CHANGE` (zawsze wielkimi; `BREAKING-CHANGE`
  to synonim). W repo trzymaj jedną konwencję (u nas: typ małymi literami).

## Typy
| typ | kiedy | SemVer |
|---|---|---|
| `feat` | nowa funkcjonalność dla użytkownika (MUST) | MINOR |
| `fix` | poprawka błędu (MUST) | PATCH |
| `perf` | poprawa wydajności bez zmiany zachowania | PATCH* |
| `refactor` | zmiana struktury bez zmiany zachowania | — |
| `test` | tylko testy | — |
| `docs` | tylko dokumentacja | — |
| `style` | formatowanie bez wpływu na znaczenie | — |
| `build` | system budowania, zależności | — |
| `ci` | konfiguracja CI | — |
| `chore` | pozostałe prace utrzymaniowe | — |
| `revert` | wycofanie commita(ów) | zależnie od wycofanego |

\* zależnie od konfiguracji narzędzia do wydań. Spec wymaga tylko `feat` i `fix`; pozostałe typy to konwencja
(`@commitlint/config-conventional`) — lista jest otwarta, trzymaj się przyjętej w repo.

## Zakres
- Zakres spójny z architekturą: w monorepo Nx — **nazwa projektu Nx** (lub wartość tagu `scope:`), poza Nx — moduł
  lub kontekst DDD. Nigdy nazwisko autora.
- Przed pierwszym commitem w cudzym repo sprawdź `git log` — jeśli repo nadało zakresowi inne znaczenie (np. klucz
  zadania), trzymaj się go.

## Breaking changes
- `!` przed dwukropkiem: `feat(api)!: remove v1 endpoints` — stopka wtedy opcjonalna, a opis mówi o zmianie.
- albo stopka: `BREAKING CHANGE: <co i jak migrować>`.
- Każdy breaking change oznacza **MAJOR**, niezależnie od typu. We wczesnej fazie projektu też oznaczaj (FAQ spec).

## SemVer, changelog, nx release
| Commity od ostatniego wydania | Bump |
|---|---|
| tylko `fix` (i ew. `perf`) | PATCH |
| co najmniej jeden `feat` | MINOR |
| `!` lub `BREAKING CHANGE` w dowolnym | MAJOR |

`nx release` (tool-nx) wylicza wersję i changelog z historii (także per projekt, po zakresie/ścieżkach); podobnie
semantic-release, release-please. Walidacja: commitlint w hooku `commit-msg`. Dlatego format to **kontrakt**, nie estetyka.
Numer liczy `python3 .claude/skills/core-semver/scripts/semver.py next`. Zasady SemVer (faza 0.y.z, wersje
przedpremierowe, publiczne API, wycofywanie) opisuje core-semver.

## Zasady praktyczne
- Jeden commit = jedna logiczna zmiana; pasują dwa typy → dwa commity.
- Referencje do zadań w stopce (`Refs: PROJ-123`), nie w opisie.
- Przy squash merge tytuł PR = finalny commit, więc tytuł PR też w tym formacie; przy squashu maintainer może
  uporządkować komunikaty kontrybutorów.
- Revert: spec go nie definiuje — konwencja projektu (u nas typ `revert` + `Refs: <sha>`).

## Poprawianie złego typu
Spec sugeruje `git rebase -i` przed mergem — **tu niedostępne** (brak trybu interaktywnego). Zamiast tego:
- ostatni, **niewypchnięty** commit i użytkownik wyraźnie prosi → `git commit --amend`;
- głębiej w historii lub już opublikowane → nie przepisuj historii; zgłoś użytkownikowi (commit korygujący albo ręczny rebase);
- domyślnie: kolejna zmiana w nowym, poprawnie sklasyfikowanym commicie.

## Przykłady
```
feat(booking): block resource for selected time slot
fix(pricing): round partner discount to minor units
feat!: send an email to the customer when a product is shipped
refactor(availability)!: replace isReserved flag with blockade state

BREAKING CHANGE: ResourceDto.isReserved removed; read blockade.state instead.
```
```
fix: prevent racing of requests

Introduce a request id and a reference to latest request. Dismiss
incoming responses other than from latest request.

Reviewed-by: Z
Refs: #123
```
```
revert: let us never again speak of the noodle incident

Refs: 676104e, a215868
```

## Indeks references
- Czytaj `references/specyfikacja-i-faq.md`, gdy potrzebujesz dosłownego brzmienia 16 reguł (MUST/SHOULD/MAY), FAQ
  specyfikacji albo parsowania commitów (regex, polecenia `git log`).

## Checklista
- [ ] Typ dobrany wg tabeli; jeden commit = jedna zmiana.
- [ ] Zakres = nazwa projektu Nx / modułu (albo konwencja repo z `git log`).
- [ ] Opis po angielsku, tryb rozkazujący, bez kropki, ≤ 72 znaki.
- [ ] Breaking change oznaczony `!` lub `BREAKING CHANGE:` z instrukcją migracji.
- [ ] Referencje do zadań w stopkach.

Źródło: conventionalcommits.org/en/v1.0.0 (CC BY 3.0) — treść opisana własnymi słowami, cytaty reguł w references.
