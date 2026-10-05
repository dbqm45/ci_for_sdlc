# Bank dowodów (`docs/project/02-domain/corpus.md`)

## Zasady
- **Domyślnie włączaj.** Bank ma być kompletny względem treści merytorycznej źródeł; wyłączaj tylko to, co nie niesie
  informacji: przywitania, wypełniacze, potakiwanie, komentarze o samym spotkaniu, legendę tablicy.
- **Dosłownie i w języku źródła** — bez parafrazy, bez tłumaczenia; skróty oznaczaj `[…]`.
- **Każdy cytat ma lokalizację**, po której człowiek odnajdzie go w źródle.
- Źródło już ustrukturyzowane (np. opis tablicy `*.es.md`) wchodzi do banku w całości, krok po kroku.
- **Odpowiedzi człowieka** z rozmowy to pełnoprawne źródło (`user-answers.md`, lokalizacja = id pytania).
- Cytat przegrany w rozstrzygniętej sprzeczności **zostaje** z dopiskiem `[zastąpiony przez C3 → D-007]`.

## Lokalizacje
| Źródło | Format |
|---|---|
| tekst z numerami linii | `L42-45` |
| dokument z sekcjami | `§ nazwa sekcji` |
| PDF | `s12 ¶3` |
| opis tablicy | `tor: Klient / krok 7` |
| JSON/YAML | ścieżka `$.orders[2].status` |
| odpowiedź człowieka | `Q4` / `C2` |

## Siła cytatu
- **Mocny:** zawiera regułę, liczbę, próg, decyzję, krok procesu, problem („boli nas…”), termin lub odpowiedzialność („to robi dział X”).
- **Wzmianka:** samo pojęcie bez treści. Wzmianka potwierdza istnienie pojęcia, ale **nie** liczy się do progu obszaru.

## Format
```markdown
---
artifact: corpus
phase: domain
…
---
# Bank dowodów
Źródła: 3 · cytatów: 87 · aktualizacja: 2026-09-27

## S1 — wywiad-z-prezesem.md (transkrypcja, pl)
- **E1** > „Kierownik projektu sam wybiera ludzi, ale często nie wie, kto jest wolny.” — L12-13
- **E2** > „Kara za opóźnienie to 2% wartości kontraktu za tydzień.” — L40 [mocny: liczba]
```

## Weryfikacja (tanio, bez LLM)
Każdy cytat musi dać się odnaleźć w źródle — sprawdza to `python3 .claude/hooks/project_record.py evidence` (także progi obszarów). Brak → cytat usuń albo oznacz `[niezweryfikowany]`
i nie licz go do progów. Przy materiałach > ~150 KB twórz bank **per źródło w osobnych podagentach** i scalaj pliki —
po kompresji kontekstu model potrafi „cytować” linie, których już nie widzi.
