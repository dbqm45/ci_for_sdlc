---
name: core-skill-authoring
description: Użyj przy dodaniu lub zmianie skilla — najpierw scenariusze ewaluacji, potem zwięzła treść z przykładami, bramka, audyt.
metadata:
  katalog: "Użyj, gdy dodajesz nowy skill do fabryki, zmieniasz istniejący, skill się nie uruchamia albo trzeba udowodnić, że skill coś wnosi — kolejność pracy od scenariuszy ewaluacji, punkt odniesienia bez skilla, reguły opisu i struktury, bramka jakości factory/skill_gate.py, ewaluacja na modelach i rejestr wyników. Nie do łączenia istniejących skilli w jednym zadaniu (core-skill-composition) ani testów kodu aplikacji (eng-testing)."
  slowa: "nowy skill, dodaj skill, napisz skill, zmień skill, skill się nie uruchamia, model nie wczytuje skilla, ewaluacja skilla, scenariusze, bramka jakości, skill_gate, czy skill działa, baseline"
---

# Dodawanie i zmiana skilla — najpierw dowód, potem treść

Skill jest gotowy dopiero wtedy, gdy zmierzono, że:
- model go wczytuje przy właściwym pytaniu i nie wczytuje przy cudzym;
- odpowiedź z nim jest lepsza niż bez niego.

Sama treść SKILL.md niczego nie dowodzi.

## Procedura
1. **Luka.** Daj modelowi 2–3 prawdziwe zadania z obszaru skilla **bez skilla**. Zapisz, czego brakuje: wiedzy,
   kroków, formatu albo granic. Jeśli model radzi sobie dobrze, skill nie jest potrzebny.
2. **Szkielet.** `python3 factory/build.py new-skill <prefiks-nazwa> "<pełny opis z granicami>"` tworzy SKILL.md
   i szkielet scenariuszy `tests/skill_evals/<nazwa>.json` (w projekcie: `.claude/tests/skill_evals/`). Prefiks
   wybierz z wymiarów w `factory/config.yaml → facets`.
3. **Scenariusze przed treścią** (≥3):
   - **2× `trigger`** — pytania z luki z kroku 1, zadane słowami człowieka, a nie opisu skilla. Do tego `checks.all`:
     ≥2 grupy wyrażeń sprawdzających wiedzę, której model nie ma bez skilla; `none` dla typowego błędu.
   - **1× `no-trigger`** z polem `neighbor` — pytanie z pogranicza, które należy do sąsiedniego skilla. Pilnuje granic.
   - Format i przykłady: `tests/skill_evals/README.md`.
4. **Punkt odniesienia (opcjonalnie, płatnie):** `run_skill_evals.py --skills <nazwa> --models sonnet --baseline`
   pokazuje, ile treści zalicza model bez skilli fabryki.
5. **Minimalna treść**, która zamyka luki:
   - **jeden skill, jedno zadanie** — opis wymieniający kilka niezależnych zadań to sygnał do podziału;
   - procedura (kroki, kolejność, punkty decyzji, format wyniku), a nie wykład; zakładaj, że model jest bystry —
     pisz tylko to, czego nie wie;
   - **przykłady ważniejsze niż reguły:** sekcja `## Przykład` (wejście → wynik, konkretne nazwy i liczby),
     kolejne w `<skill>/references/przyklady.md`;
   - **kod tam, gdzie pasuje:** sortowanie, parsowanie, liczenie, walidacja → skrypt w `scripts/` (deterministyczny,
     tańszy, jego treść nie zajmuje kontekstu); napisz, czy skrypt uruchomić, czy przeczytać; obsługuje błędy sam,
     bez „magicznych” stałych; łączenie z siecią deklarujesz linią „Sieć: …” w SKILL.md;
   - SKILL.md do ~300 linii (Anthropic: poniżej 500), część zasad mieści się na ekranie telefonu; szczegóły
     w `references/` — **jeden poziom od SKILL.md** (każdy plik wymieniony w SKILL.md, plik z innego skilla pełną
     ścieżką `.claude/skills/<skill>/…`), spis treści w plikach dłuższych niż 100 linii;
   - jedno określenie na jedno pojęcie w całym skillu; ścieżki z ukośnikiem `/`;
   - do innych skilli odsyłaj po nazwie, nie kopiuj ich treści;
   - fakty zewnętrzne ze źródłem i datą (core-grounding), na końcu sekcja **Źródła**.
6. **Opis i wyszukiwanie:**
   - `description` ≤170 znaków jako **reguła wyboru**: „Użyj, gdy/przy <sytuacja> — <kluczowe pojęcia>.”, bez „: ”
     (psuje YAML). Tylko to model widzi na starcie; pole `metadata` Claude Code pomija. Nie „Pomaga z dokumentami”.
   - `metadata.katalog`: pełny opis z granicami („Nie do … (skill)”).
   - `metadata.slowa`: słowa, którymi ludzie opisują problem. Indeksuje je hook `skill_hint`.
   - Nie używaj pola `paths`, bo ukrywa skill przed modelem.
   - Skill uruchamiany tylko ręcznie: `disable-model-invocation: true` i scenariusze wyłącznie `no-trigger`.
7. **Wpięcie:** dopisz skill do roli (`factory/roles/*.yaml`) albo persony i uruchom `python3 factory/build.py`.
8. **Bramka jakości** (bezpłatna, obowiązkowa): `python3 factory/skill_gate.py <nazwa>`. Sprawdza:
   - strukturę;
   - scenariusze;
   - czy hook podpowiada skill przy jego pytaniach, a przy pytaniu sąsiada nie stawia go na pierwszym miejscu;
   - **regresję podpowiedzi wszystkich skilli** (nowy skill nie może podkradać pytań innym);
   - polszczyznę;
   - odwołania;
   - **audyt** (`factory/skill_audit.py`): bezpieczeństwo i zalecenia Anthropic (reguła wyboru w opisie, przykłady,
     istniejące pliki, deklaracja sieci) — wysoka i średnia waga blokują bramkę.

   Wynik i odcisk treści trafiają do rejestru. `build.py check` ostrzega, gdy skill zmieniono po bramce.
9. **Ewaluacja na modelu** (płatna, **za zgodą człowieka**, ~$0,10–0,30 na scenariusz i model):
   `python3 factory/skill_gate.py <nazwa> --model haiku,sonnet --budget 2`.
   - Muszą przejść wszystkie scenariusze. Haiku sprawdza, czy instrukcje wystarczą słabszemu modelowi, a Sonnet,
     czy są zwięzłe.
   - Dodaj `opus` dla skilli, których używają agenci na tierze deep.
   - Raport trafia do `docs/evals/` (w projekcie `.claude/logs/evals/`).
10. **Zapis:** wpis w CHANGELOG (co, wynik bramki i ewaluacji z kosztem).

## Zmiana istniejącego skilla
- Ten sam cykl w skrócie:
  1. dopisz scenariusz, który odtwarza problem;
  2. sprawdź, że **nie przechodzi** (`run_skill_evals.py --skills <nazwa>` lub krok 3 bramki);
  3. popraw treść;
  4. bramka, a przy zmianie treści merytorycznej także ewaluacja na modelu.
- **Wiedzy nie usuwasz przy porządkach.** Przenosisz ją do `references/` i zostawiasz odnośnik.
- Hook `skill_change_guard` przypomina o bramce po każdej edycji skilla, a na koniec sesji wymienia skille bez
  zaliczonej bramki.

## Diagnoza: skill się nie uruchamia
| Objaw | Przyczyna | Poprawka |
|---|---|---|
| bramka krok 3: hook nie podpowiada | słowa użytkownika ≠ słowa opisu | `metadata.slowa`, opis bliżej języka pytań; `skill_hint.py --explain "<pytanie>"` |
| hook podpowiada, model ignoruje | ogólny temat, model „wie sam” | w opisie konkretna luka („procedura…”, „pułapki wersji…”), scenariusz z tą luką |
| skill uruchamia się przy cudzych pytaniach | za szeroki opis | granice w `metadata.katalog`, `no-trigger` z sąsiadem, zawężony opis |
| „Unknown skill” | pole `paths` | usuń `paths` |
| treść nie przechodzi, choć skill wczytany | instrukcja za ogólna albo za długa | konkretne kroki i przykłady; szczegóły do `references/` |
| model nie sięga po skill mimo podpowiedzi | opis-hasło bez „kiedy” | opis jako reguła wyboru „Użyj, gdy …” |

## Checklista
- [ ] luka zmierzona bez skilla; scenariusze (2× trigger, 1× no-trigger z sąsiadem) napisane przed treścią
- [ ] description jako reguła wyboru „Użyj, gdy/przy …” (≤170 znaków), katalog z granicami, `metadata.slowa`, bez `paths`
- [ ] jedno zadanie; sekcja `## Przykład`; skrypty dla operacji deterministycznych; sieć zadeklarowana
- [ ] SKILL.md zwięzły, `references/` jeden poziom od SKILL.md ze spisem treści, źródła z datą
- [ ] `python3 factory/skill_gate.py <nazwa>` przechodzi (także regresja wszystkich skilli)
- [ ] ewaluacja na haiku i sonnet zaliczona (za zgodą człowieka), wynik i koszt w CHANGELOG

## Źródła
- Anthropic: „Skill authoring best practices” (platform.claude.com, stan na 2026-10-03):
  - ewaluacje przed dokumentacją;
  - punkt odniesienia bez skilla;
  - minimalne instrukcje;
  - test na Haiku, Sonnecie i Opusie;
  - treść poniżej 500 linii;
  - obserwacja, jak model korzysta ze skilla.
  - opis w trzeciej osobie z „co” i „kiedy”, odwołania jeden poziom od SKILL.md, spis treści przy > 100 liniach,
    skrypty zamiast generowanego kodu, przykłady zamiast abstrakcji (stan na 2026-10-04).
- Anthropic: „Agent Skills — overview”, sekcja „Security considerations” (zaufane źródła, audyt wszystkich plików,
  ryzyko zewnętrznych adresów) i Claude Code „Skills” (lista opisów w 1% okna kontekstu, `allowed-tools` bez bramki
  zaufania, polecenia wstawiane w treść i wykonywane przy wczytaniu), dostęp 2026-10-04.
- Wyniki ewaluacji fabryki (`docs/evals/2026-10-02-*`): bez podpowiedzi modele rzadko wczytują skille, a pole `paths`
  ukrywa skill.

Opisane własnymi słowami.
