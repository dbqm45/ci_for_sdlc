# Format raportu (`docs/project/02-domain/algorithms.md`)

Nagłówek artefaktu wg core-project-record (`artifact: algorithms`, `phase: domain`, `inputs: [areas.md, corpus.md]`).

## Na obszar
```markdown
## A2 — Planowanie etapów projektu
| Kandydat | Podstawa (tor) | Pewność | Cytaty |
|---|---|---|---|
| job-scheduling | językowy + strukturalny | wysoka | E12 S1 L40 „kara 2% za tydzień opóźnienia”; E30 S2 tor: PM/4 |
| topological-sort | strukturalny | średnia | E31 S2 tor: PM/2 |

**Mapowanie (job-scheduling):** węzeł = etap; krawędź = „etap B wymaga wyników A” (E31); waga = czas trwania etapu (E33);
termin = data z umowy (E12); zasoby współdzielone = krawędzie niejawne (E35).
**Warianty:** harmonogram z ograniczonymi zasobami → problem NP-trudny (E35: „ten sam specjalista w dwóch etapach”).
**Uzasadnienie pewności:** oba tory, różne cytaty, 4 elementy mapowania.
**Najlepszy kandydat:** job-scheduling.
```

## Na końcu
- **Uczciwe braki:** słowo/cytat → dlaczego katalog nie pasuje.
- **Obserwacje między obszarami:** konsolidacja / wspólne jądro / szew — z uzasadnieniem.
- TL;DR, Otwarte pytania, Przekazanie (dla ddd-strategic-analysis i arch-tech-selection).
