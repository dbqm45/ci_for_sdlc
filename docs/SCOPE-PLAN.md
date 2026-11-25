# DV5 — zakres poza celem (Scope Inflation Detector)

Stan: 2026-11-25. Krok DV5 z planu budowy suity (dbqm45/pdi `docs/plan-budowy-suity.md` §3d).

## Cel
Zmiana rośnie poza swój cel: cięcie w `plan.md` robi to, co intencja wprost wyłącza („## Out of scope” /
„## Poza zakresem” w `intent.md`). Ustalenie pokazuje to przed bramką, zanim powstanie niepotrzebny kod.

## Ustalenia
1. **Konektor repo** (`connectors/repo.ts`): punkty sekcji „Out of scope” / „Poza zakresem” / „Poza zakresem zmiany”
   intencji trafiają do `repo.outOfScope` zmiany (epic) i każdego jej cięcia (`RepoFacts.outOfScope`).
2. **Reguła SCOPE-001** (`analysis/scope.ts`, dla historyjek z repozytorium): cięcie, którego wartość albo
   weryfikacja pokrywa się z punktem spoza zakresu (słowa treści, ≥ 4 litery, rdzeń z pierwszych 6 liter; punkt
   z jednym słowem treści — to słowo, z dwoma i więcej — co najmniej dwa i co najmniej połowa), dostaje ostrzeżenie
   `GAP` w wymiarze `requirements` z dowodem (plik i linia cięcia) i pytaniem: usunąć cięcie / poprawić intencję
   (zakres się zmienił) / to nie jest poza zakresem (w notatce dlaczego). Nie blokuje.
3. Dokumentacja: `docs/REPO-CHANGES.md` (tabela reguł). Zestaw demonstracyjny (strażnik pokrycia reguł): fikstura
   `test/fixtures/repo-changes` dostaje sekcję poza zakresem i cięcie, które w nią trafia.
4. Poza zakresem: porównanie z historyjkami z Jiry i ich zmianami (następny krok, po danych z D8).

## Kolejność (TDD)
1. Testy (czerwone): `packages/core/test/scope.test.ts` (SC-01…), `repo.test.ts` (odczyt sekcji); strażnik pokrycia.
2. Kod; bramki: `npm test`, `npm run test:coverage`, `npm run typecheck`, `npm run build`, `npm run lint:commit`.
