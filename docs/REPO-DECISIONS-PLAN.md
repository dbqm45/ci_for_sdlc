# Decyzje dla ustaleń zmian z repo i gotowość zmiany (PRB-16, PRB-17)

Stan: 2026-11-01, zrobione (PR w toku). Zgłoszenia z przebiegu lokalnego (pdi `docs/przebieg-lokalny.md`, krok 3
„Gotowość”): zmiana z repo stała jako `not_ready` przez ostrzeżenia DES-001 i STORY-001, a odpowiedzieć na nie nie
było gdzie, więc reguły wyłączono ręcznie w `~/.sdlc/ci-data/settings.json`.

## Decyzje właściciela (2026-11-01)
- **PRB-17 — bez blokad = `ready`.** Zmiana jest `not_ready` tylko wtedy, gdy któraś historyjka ma blokujące
  ustalenie; ostrzeżenia (`needs_attention`) jej nie wstrzymują — tak jak nie wstrzymują zatwierdzenia samej
  historyjki ani zatwierdzenia z pdi (`gate.decided` zatwierdza historyjki bez blokad). Otwarte pytania dalej idą do
  pdi w `open_questions`. Bez ustawienia w polityce.
- **PRB-16 — decyzje w repo, w `decisions.md`.** Decyzja dla ustalenia zmiany z repo jest wpisem w
  `docs/project/changes/CHG-n/decisions.md` (format tf, `decision_record.py decision add`) z nowym polem
  `ustalenie`. Przechodzi review w PR razem ze zmianą, więc bramka w PR i serwer widzą to samo.

## Format wpisu
```markdown
## Błędy płatności pokazują kontakt do wsparcia      ← odpowiedź
- ref: CHG-12/D3
- id: DEC-41                                          ← opcjonalnie: numer z pdi
- wyslano: tak
- kiedy: 2026-10-30
- kto: Ann
- rodzaj: product
- dlaczego: Ustalone ze wsparciem na refinemencie.    ← notatka
- zrodlo: claude-cli
- szkic: human
- ustalenie: DES-001:TSK-1                            ← id ustalenia (reguła:element[:szczegół])
- skutek: resolve                                     ← opcjonalnie: resolve | accept_risk | dismiss | confirm
```
Element ustalenia musi należeć do tej zmiany (CHG-n albo jej cięcie). Wpis bez `kto`, ze złą datą albo skutkiem,
o cudzym elemencie lub ze złym id to problem pliku z numerem linii: wpis jest pomijany, a bramka pada jak przy innym
błędzie pliku. Późniejszy wpis dla tego samego ustalenia zastępuje wcześniejszy. Wpisy bez `ustalenie` (inne decyzje
zmiany) i wzór w komentarzu HTML z szablonu tf są pomijane.

## Elementy
- `packages/core/src/connectors/repo-decisions.ts`: `parseRepoDecisions()` → decyzje (`id: repo:<ref>`,
  `questionId: q:<ustalenie>`, dowód z plikiem i linią) i problemy.
- `readRepoChanges()` czyta opcjonalny `decisions.md` każdej zmiany; `ProjectContext.decisions`.
- `server/src/engine.ts`: `withRepoDecisions()` — decyzja z repo zastępuje zapisaną na to samo pytanie.
- `changeReadiness()` (core, `pdi.ts`): `not_ready` tylko przy historyjce `not_ready`.
- tf: `decision_record.py decision add … --finding DES-001:TSK-1 [--effect accept_risk]` i sprawdzenie pól w `check`
  (osobny PR w tf).

## Testy
`packages/core/test/repo-decisions.test.ts` (RD-01…04), `packages/core/test/pdi.test.ts` (PRB-17),
`packages/server/test/gate.test.ts` (GATE-13: decyzja w `decisions.md` przepuszcza bramkę, zły wpis ją zatrzymuje),
`packages/server/test/repo-decisions.test.ts` (RDS-01).
