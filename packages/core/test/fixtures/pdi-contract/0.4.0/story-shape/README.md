# Zestaw wzorcowy: kształt historyjki i kryteriów akceptacji

Wspólny wzorzec dla reguł STORY-001…003 i AC-001…004 ([plan G1/G2 §4.2](../../../docs/plan-g1-g2.md#42-nowe-reguły-ci_for_sdlc)).
Testy tf (`requirements_lint.py`) i ci_for_sdlc (`story-shape.test.ts`) przechodzą po tych samych plikach
z przypiętą wersją kontraktu; wynik ma się zgadzać z `expected.json`.

| Plik | Zawartość |
|---|---|
| `stories.json` | 44 historyjki (PL i EN) w postaci jak z Jiry: `title`, `description`, surowe `acceptance_criteria`, opcjonalnie `story_points` |
| `expected.json` | domyślna polityka, definicje reguł i dla każdej historyjki: `fire` (reguły, które mają zadziałać), `scenarios` (liczba jednostek AC po grupowaniu), opcjonalnie `policy` (nadpisanie dla tego przypadku) |
| `vocabulary.json` | wspólne słownictwo: słowa kluczowe Gherkina EN i PL, wzorce EARS, słabe wyniki, słowa warstw, spójniki akcji, terminy implementacyjne |
| `*.schema.json` | schematy powyższych plików (`contract.errors("story_shape_stories", …)`, `"story_shape_expected"`) |

## Jak oznaczono przypadki

- **Jednostka AC:** scenariusz GWT (od `Given/Zakładając` albo — bez warunków — od `When/Gdy` do końca bloku `Then/Wtedy`
  z kolejnymi `And/Oraz`, `But/Ale`), zdanie EARS albo punkt wolnego tekstu. Pusta linia rozdziela scenariusze;
  scenariusz może być zapisany w jednej linii.
- **Akcja** to czasownik z obiektem z `When/Gdy` po normalizacji („doda kartę z poprawnymi danymi” i „doda kartę
  z nieważną datą” to ta sama akcja: dodać kartę). Warianty danych należą do `Given`, nie do akcji.
- **Akcja główna scenariusza** to pierwsza akcja `When/Gdy`. STORY-001 i STORY-002 liczą różne akcje główne
  w historyjce; dodatkowe akcje w tym samym scenariuszu łapie AC-004, nie STORY-001.
- `And/Oraz` bezpośrednio po `When/Gdy` to druga akcja (AC-004); po `Given` i `Then` — nie.
- **AC-001** nie działa, gdy historyjka nie ma AC (to `REQ-001` ci_for_sdlc) ani przy polityce `acFormat: any|off`.
  Przy domyślnej polityce `gwt` zdanie EARS i wolny tekst łamią regułę.
- **AC-002, AC-003, STORY-003** opierają się na słowniku; test w pdi pilnuje, że etykiety zgadzają się ze słownikiem
  (AC-002 i AC-003 — w treści AC, STORY-003 — w tytule). Kategoria „interfejs” z tf (spinner, toast, modal) nie
  należy do AC-003.
- Tłumienie AC-002 tam, gdzie zadziałało `REQ-003` ci_for_sdlc, nie jest częścią wzorca — to zasada wyświetlania
  w ci_for_sdlc.
- Przypadki brzegowe: 6 scenariuszy (bez STORY-002) i 7 (STORY-002); estymata 12 (bez) i 13 (STORY-002).

## Zmiany zestawu

Nowy przypadek albo zmiana etykiety to zmiana kontraktu (wersja minor). Najpierw dopisz przypadek, potem uzgodnij
etykietę z definicją reguły; jeśli przypadek pokazuje lukę w słowniku, popraw `vocabulary.json`, a nie etykietę.
