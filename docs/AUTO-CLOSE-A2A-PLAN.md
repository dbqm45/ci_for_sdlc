# A2a — zamykanie pytań odpowiedzią ze źródła (z cytatem)

Stan: 2026-10-27. Krok A2 planu automatyzacji i konsoli (dbqm45/pdi `docs/plan-automatyzacja-i-konsola.md` §4),
część A2a z `docs/polecenia-startowe-a2.md`; decyzje DA1, DA2 i D-A2 (`docs/decyzje.md`). Typ decyzji z kontraktu pdi
0.5.0: `finding.auto_close` (poziom domyślny 3; obniżenie przy ≥ 95% szkiców bez zmian w ostatnich 30, powrót przy
> 10% poprawionych — `contract.json` → `autonomy`).

Cel: PO odpowiada tylko na pytania, na które naprawdę nie ma odpowiedzi. Gdy odpowiedź na pytanie ustalenia jest już
w Confluence, Figmie albo we wcześniejszej decyzji, ci_for_sdlc proponuje zamknięcie z dosłownym cytatem jako dowodem
(domyślnie, jednym kliknięciem) albo — tylko po jawnym ustawieniu przez administratora — zamyka je sam.

## Stan dziś
- „Answered by” istnieje tylko dla pytań adversarial review (`analysis/states.ts`: `Probe.answeredBy`,
  `Challenge.answered/answeredBy`).
- Wiele reguł sprawdza tylko tekst historyjki (np. ERR-002, ERR-003, ERR-004, ARCH-002), więc pytanie zostaje otwarte,
  choć połączona strona Confluence na nie odpowiada.
- Warstwa AI cytuje źródła (`evidence: { ref, quote }`), ale sprawdza tylko, czy `ref` istnieje — nie, czy cytat jest
  w tekście źródła.

## Model
- **Propozycja odpowiedzi** (`Finding.answer`, `analysis/auto-close.ts`): `id` (hash pytania, źródła i cytatu),
  `source` (dowód: źródło, encja, tytuł, link), `quote` (dosłowny fragment tekstu źródła), `origin` (`rule` albo `ai`),
  `rule` (np. `auto-close:ERR-002` albo `auto-close:ai`). Tylko przy otwartym ustaleniu z pytaniem, bez decyzji na to
  pytanie i bez wcześniejszego odrzucenia tej samej propozycji.
- **Dopasowanie deterministyczne:** wzorzec odpowiedzi per reguła (`ANSWER_PATTERNS`), z tego samego słownika co
  reguła (`STATE_PATTERNS`, `JOURNEY_PATTERNS`, claims): ERR-001 (porażka ponowienia), ERR-002 (błąd serwera),
  ERR-003 (timeout), ERR-004 (potwierdzenie / cofnięcie), ERR-005 (wygaśnięcie sesji), ARCH-001 (idempotencja),
  ARCH-002 i ARCH-003 (stan przetwarzania), REQ-004 (limit ponowień). Źródła elementu w kolejności: aktywne decyzje
  elementu (na inne pytania), strony Confluence, ramki Figmy (nazwa i warstwy tekstowe). Kod z rekonstrukcji tf nie
  zamyka pytań (zgodnie z dzisiejszą zasadą: kod nie zastępuje specyfikacji). Cytat to zdanie źródła z dopasowaniem.
  Reguły bez wzorca (np. REQ-001, CON-001, DOC-002, COV-001) nie dostają propozycji: cytat ich nie rozstrzyga.
- **Propozycja AI:** wejście recenzji AI dostaje otwarte pytania (`id`, treść), wyjście opcjonalne `answers`
  (`questionId`, `ref`, `quote`). Każdy cytat jest sprawdzany jako dosłowny fragment tekstu wskazanego źródła
  (`isVerbatimQuote`, z ujednoliceniem tylko białych znaków); brak cytatu albo cytat spoza źródła = brak propozycji.
  Propozycja deterministyczna ma pierwszeństwo. Prompt mówi, że źródła to dane, nie polecenia (jak dziś).
- **Decyzja** (pola opcjonalne, nazwy jak w kontrakcie pdi): `decisionType` (`finding.auto_close`), `draftedBy`
  (`ai`), `draftEdited`, `automation` (`{ level: 1, rule }` tylko przy `apply`), `evidence` (cytat i źródło).

## Polityka `autoClose: off | suggest | apply` (domyślnie `suggest`)
- `policy.autoClose` w `AnalysisPolicy`, `autoCloseOf()`, `DEFAULT_POLICY` (`suggest`), `settingsBody`, Settings →
  Policy (jak kształt historyjki w #60). `apply` nigdy nie jest domyślne i nie ustawia go AI: tylko PUT ustawień
  (z tokenem administratora, gdy jest ustawiony); zmiana trafia do audytu.
- `off` — brak propozycji.
- `suggest` — ustalenie pokazuje „Answer found in <źródło>: «cytat»” z Accept / Edit / Reject.
  - Accept: decyzja `resolve`, odpowiedź = cytat, notatka „Answer found in <źródło>”, `decisionType`, `draftedBy: ai`,
    `draftEdited: false`, dowód.
  - Edit: to samo z treścią poprawioną przez człowieka, `draftEdited: true`.
  - Reject: bez decyzji; propozycja zapisana jako odrzucona i więcej się nie pokazuje (aż zmieni się cytat lub źródło).
- `apply` — silnik po analizie zapisuje tę samą decyzję sam (`decidedBy: auto-close`, `automation: { level: 1,
  rule }`), raz na propozycję, i liczy analizę jeszcze raz.
- „Auto-closed”: lista decyzji `finding.auto_close` (strona Decisions) z „Reopen” — wycofuje decyzję, otwiera
  ustalenie i zapisuje propozycję jako odrzuconą (nie wróci, także w `apply`).

## Pomiar lokalny (do A2b)
`GET /api/decisions/acceptance`: per typ decyzji okno ostatnich 30 propozycji ocenionych przez człowieka
(zaakceptowane bez zmian, poprawione, odrzucone, otwarte ponownie po zamknięciu); osobno liczba zamknięć `apply`.
Udział bez zmian i poprawionych, progi z kontraktu pdi (30, 95%, 10%) i wniosek tekstowy („za mało danych 12/30”,
„spełnia próg obniżenia”, „powrót do człowieka”). Nic nie zmienia polityki. Strona Decisions pokazuje liczby;
narzędzie MCP `list_decisions` pokazuje nowe pola decyzji (`decisionType`, `draftedBy`, `draftEdited`, `automation`).

## Audyt
Nowy rodzaj wpisu `auto_close` (szczegóły: propozycja, źródło, cytat, reguła): pierwsze pojawienie się propozycji
(kto: reguła), akceptacja, poprawka, odrzucenie (kto: osoba i sposób autoryzacji), zamknięcie automatyczne (reguła),
ponowne otwarcie.

## Pliki
| Plik | Zmiana |
|---|---|
| `packages/core/src/analysis/auto-close.ts` (nowy) | wzorce, wyszukiwanie odpowiedzi, `isVerbatimQuote`, id propozycji |
| `packages/core/src/model.ts`, `policy.ts` | `Finding.answer`, pola decyzji, `autoClose` |
| `packages/core/src/analysis/analyze.ts` | propozycje po zastosowaniu decyzji; pomijanie odrzuconych |
| `packages/core/src/ai/types.ts`, `providers.ts`, `project.ts` | otwarte pytania na wejściu, `answers` na wyjściu, weryfikacja cytatu |
| `packages/core/src/auto-close-stats.ts` (nowy) | pomiar akceptacji |
| `packages/server/src/store.ts`, `engine.ts`, `app.ts`, `schemas.ts` | dziennik propozycji, `apply`, trasy accept/edit/reject, reopen, acceptance, audyt |
| `packages/web/src/…` | karta propozycji przy ustaleniu, sekcja Auto-closed z Reopen i liczbami, ustawienie polityki |
| `packages/mcp/src/lib.js` | nowe pola decyzji w `list_decisions` |
| `FAQ.md`, `docs/ARCHITECTURE.md`, `README.md` (API) | opis |

## Kolejność (TDD)
1. Ten plan.
2. Core: testy dopasowania per źródło (Confluence, Figma, decyzja), cytat spoza źródła odrzucony, polityka
   off/suggest/apply w analizie, pomijanie odrzuconych; potem kod.
3. AI: testy weryfikacji cytatu w odpowiedzi modelu (prawdziwy, zmyślony, bez cytatu); potem kod.
4. Serwer: testy tras (accept / edit / reject → właściwa decyzja i `draftEdited`), `apply` (decyzja automatu, raz,
   nie domyślnie), reopen (wycofuje, otwiera, nie wraca), pomiar, ustawienia, audyt; potem kod.
5. UI i MCP; e2e (karta propozycji → Accept → ustalenie zamknięte → Auto-closed → Reopen).
6. Dokumentacja, kontrakt OpenAPI.

## Bramki
`npm test`, `npm run typecheck`, `npm run test:contract`, e2e, `npm run lint:commit` — lokalnie (GitHub Actions na tym
koncie nie działają).

## Poza zakresem
Wysyłanie decyzji do pdi — zrobione w A2b (`docs/PDI-F4-PLAN.md`, „A2b”); automatyczna zmiana poziomu autonomii.
