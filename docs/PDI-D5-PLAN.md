# D5 w ci_for_sdlc — wszystkie decyzje DI Definition w indeksie decyzji suity (pdi)

Stan: 2026-11-23. Krok D5 planu budowy suity (dbqm45/pdi, `docs/plan-budowy-suity.md` §3a). Dziś do pdi idą tylko
kroki A2a (`finding.auto_close`: przyjęcie, edycja, odrzucenie, ponowne otwarcie odpowiedzi znalezionej w źródle,
automat `apply`; A2b w `docs/PDI-F4-PLAN.md`), z kontraktem 0.7.0 i bez pochodzenia. Decyzje człowieka zapisane przez
`POST /decisions` (rozstrzygnięcie pytania, przyjęcie ryzyka, odrzucenie znaleziska, potwierdzenie) i ich wycofanie
(`DELETE /decisions/:id`) zostają tylko tutaj.

## Cel
Każda decyzja DI Definition o znalezisku trafia do rejestru pdi jako `decision.recorded` z polem `origin`
(kontrakt 0.16.0+, wysyłamy 0.17.0 — wersję przypiętą w pdi). Indeks suity zna wszystkie decyzje, a pdi rozpoznaje
kolejne wersje tej samej decyzji po kluczu pochodzenia.

## Ustalenia
1. **Pochodzenie** każdej decyzji wysyłanej stąd (także A2b): `{app: "ci_for_sdlc", scope: <przestrzeń>,
   local_id: "<KEY>/<findingId>", url?}`. `scope` to identyfikator przestrzeni (`default` dla domyślnej), `local_id` to
   znalezisko, którego dotyczy decyzja (jak `ref` bez prefiksu przestrzeni, najwyżej 200 znaków), `url` to strona
   znaleziska, gdy `CI_PUBLIC_URL` jest https. Wszystkie decyzje o jednym znalezisku to wersje jednej decyzji w pdi:
   kolejna zastępuje poprzednią (pdi §8: klucz app + scope + local_id).
2. **Typy decyzji człowieka** (`decision_type`): `finding.resolve` (rozstrzygnięcie pytania, `kind: product`),
   `finding.accept_risk`, `finding.dismiss`, `finding.confirm` (`kind: triage`), `finding.withdraw` (wycofanie).
   `statement` opisuje decyzję jednym zdaniem z pytaniem i odpowiedzią; `why` to powód zmiany albo notatka.
   `drafted_by: human` (albo `ai` z `draft_edited`, gdy decyzja ma szkic AI), `evidence` z dowodów decyzji, `change`
   z etykiety `change:` historyjki, jak w A2b.
3. **Kolejna wersja** pytania (nowa odpowiedź z powodem) to nowe zdarzenie; gdy poprzednia wersja ma już DEC z pdi,
   zdarzenie podaje `supersedes` (potrzebne, gdy poprzednią zapisano przed D5, bez `origin`).
4. **Wycofanie** idzie do pdi tylko wtedy, gdy wycofana decyzja tam jest albo czeka w kolejce; czeka na jej DEC
   i zastępuje ją (jak ponowne otwarcie w A2b). Decyzji sprzed D5, której pdi nie zna, wycofanie nie wysyła.
5. **A2b** zostaje jak było, z dwiema zmianami: `origin` w każdym zdarzeniu i `contract_version` 0.17.0.
   `gate.requested` zostaje przy 0.7.0.
6. **Kolejka i dostawa** bez zmian (`PdiLink`: podpis, ponowienia, 400 bez ponowień, DEC zapisany na decyzji).
   Bez skonfigurowanego pdi nic się nie zmienia.

## Pliki
| Plik | Zmiana |
|---|---|
| `scripts/pdi-contract.json`, `packages/core/test/fixtures/pdi-contract/0.17.0/` | zestaw kontraktu 0.17.0 (schemat zdarzeń, przykład) |
| `packages/core/src/pdi.ts` | `pdiOrigin`, `origin` w A2b, `humanDecisionEvent`, wersje kontraktu |
| `packages/server/src/pdi.ts` | `PdiLink.enqueueHumanDecision`, `enqueueWithdrawal` |
| `packages/server/src/workspaces.ts`, `app.ts`, `routes-workspace.ts` | ujście decyzji człowieka, wywołania w `POST`/`DELETE /decisions` |
| `packages/core/test/pdi.test.ts`, `packages/server/test/…` | testy (najpierw, czerwone) |

## Kolejność (TDD)
1. Testy core (czerwone): zdarzenia człowieka dla czterech skutków i wycofania przechodzą schemat 0.17.0, mają
   `origin`, typ, `kind`, `supersedes`; A2b ma `origin` i 0.17.0; przykład pdi 0.17.0 przechodzi skopiowany schemat.
2. Testy serwera (czerwone): `POST /decisions` kolejkuje zdarzenie i zapisuje DEC z odpowiedzi pdi; druga wersja
   podaje `supersedes`; `DELETE` decyzji znanej pdi wysyła wycofanie po jej DEC; decyzji nieznanej — nic.
3. Kod, potem bramki: `npm test`, `npm run typecheck`, `npm run lint`, `npm run contract:check`.
