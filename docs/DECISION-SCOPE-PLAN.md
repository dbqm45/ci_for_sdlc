# PR rusza obszar przyjętej decyzji (`applies_to`)

Stan: 2026-11-24. Pozycja z `TODO.md` („Reguła: PR rusza obszar przyjętej decyzji”). Zależy od `applies_to`
w kontrakcie 0.22.0 (`decision-record.md` §4a) i od kopii decyzji suity (D9, [PDI-D9-PLAN.md](PDI-D9-PLAN.md)).

## Cel
Dwa poprawne PR-y razem odwracają decyzję, bo drugi autor (albo agent) jej nie znał. Bramka na PR pokazuje
decyzje suity, których `applies_to` obejmuje pliki zmienione w PR, z uzasadnieniem i założeniami nośnymi, i pyta:
„Czy ten PR zmienia decyzję X?” (nie / tak — z decyzją zastępującą / nie wiem).

## Ustalenia
1. **Kopia decyzji suity** (`@ci/core` `suiteDecisionOf`) zapisuje też `appliesTo` (`paths`, `components`
   w kształcie kontraktu), `reviewBy` i założenia nośne (`statement`, `invalidatedIf`).
2. **`pathMatches(pattern, path)`** wg §4a, sprawdzane na przypadkach kontraktu
   (`test/fixtures/pdi-contract/0.22.0/applies-to-cases.json`). **`decisionsTouched(decisions, files, today)`**:
   obowiązujące (`recorded`) decyzje z dopasowanymi plikami, `reviewDue`, gdy minął `reviewBy`.
3. **Bramka** (`npm run analyze -- --repo . --base <ref>`): pliki PR-a z `git diff base...HEAD` (jak dla skanu
   bezpieczeństwa); gdy jest `CI_SUITE_DECISIONS_CMD`, najpierw odświeża kopię. Sekcja raportu „Decisions this pull
   request touches” z pytaniem; w GitHub Actions ostrzeżenie na pierwszym pasującym pliku każdej decyzji i tabela
   w podsumowaniu kroku; minięty `reviewBy` — „review date passed: reconsider”. **Nie zmienia kodu wyjścia** (wersja 1:
   informuje); blokowanie przy „tak” bez decyzji zastępującej — po odczycie odpowiedzi z opisu PR (następny krok).
   Nieczytelna baza PR-a: jedna linia ostrzeżenia, bez porażki (porażkę daje już skan, gdy jest).
4. **Szablon PR** `.github/pull_request_template.md` z sekcją „Wpływ na decyzje” w ci_for_sdlc i pdi; w tf po
   angielsku („Decision impact”).

## Kolejność (TDD)
1. Testy (czerwone): `packages/core/test/suite-decisions.test.ts` (SD-06…SD-09: kopia z `applies_to`, przypadki
   kontraktu, wybór decyzji dla plików, `reviewBy`), `packages/server/test/gate.test.ts` (GATE-20…GATE-22: sekcja,
   adnotacje i podsumowanie; bez `--base` nic; kod wyjścia bez zmian).
2. Kod; bramki: `npm test`, `npm run test:coverage`, `npm run typecheck`, `npm run build`, `npm run contract:check`,
   `npm run lint:commit`.
