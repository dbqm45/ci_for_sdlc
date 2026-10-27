# F4 w ci_for_sdlc — gotowość i „Approve for implementation” przez pdi

Stan: 2026-10-26, zrobione (PR w toku). Strony pdi (dbqm45/pdi#16) i tf (dbqm45/tf#79) są gotowe. Ten krok domyka F4 z planu jednego flow
(pdi `docs/plan-jeden-flow-sdlc.md` §6: „ci_for_sdlc: pytania i zatwierdzenia przez pdi, decyzje z ID z pdi”).

## Decyzje właściciela (2026-10-26)
- **Zmiana ↔ historyjki:** historyjka (story, bug) z etykietą `change:CHG-12` należy do zmiany `CHG-12`. Prefiks jest
  w ustawieniach (`integrations.jira.changeLabelPrefix`, domyślnie `change:`), jak `release:` dla linii wydania (DG4).
  Konektor repo (F2) później może dać to samo bez etykiet.
- **Decyzja z pdi dociera webhookiem:** pdi po decyzji na bramce `approve-for-implementation` wysyła podpisane
  `gate.decided` do ci_for_sdlc (osobny mały PR w pdi), a ci_for_sdlc zatwierdza historyjki zmiany.

## Przepływ
1. Po każdej analizie ci_for_sdlc liczy gotowość każdej zmiany z jej historyjek:
   - `drift` — któraś historyjka była zatwierdzona, a ma ustalenie z dryfu (`origin: drift`): baseline się rozjechał;
   - `ready` — wszystkie historyjki zmiany są `ready`;
   - `not_ready` — w pozostałych przypadkach;
   - `open_questions` — liczba otwartych pytań (wyzwań bez odpowiedzi) w historyjkach zmiany.
2. Gdy gotowość zmiany jest inna niż ostatnio wysłana (albo zmiana pojawia się pierwszy raz), do kolejki trafia
   `readiness.changed` (kontrakt pdi 0.4.0). Dostawa: `POST $PDI_EVENTS_URL/events/ci_for_sdlc` z nagłówkami
   `X-PDI-Timestamp`, `X-PDI-Event`, `X-PDI-Signature: v1=<hex HMAC-SHA256(PDI_SIGNING_SECRET, "<ts>.<body>")>` —
   tak, jak przyjmuje `pdi-receiver`. Bez 2xx zdarzenie zostaje w kolejce i jest ponawiane po 1, 2, 4… minutach (do
   godziny), najwyżej 10 razy. W pdi `ready` otwiera bramkę „Approve for implementation”.
3. pdi po decyzji wysyła `gate.decided` na `POST /api/webhooks/pdi` (ten sam podpis; trasa poza strażnikiem tokenu
   admina, jak inne webhooki, ale z obowiązkowym podpisem i oknem czasu 5 minut, a bez `PDI_SIGNING_SECRET` — 404).
   Dla `gate: approve-for-implementation` i `outcome: approved` ci_for_sdlc zatwierdza każdą historyjkę zmiany,
   która nie ma blokujących ustaleń (bez wymuszania — wymuszenie zostaje decyzją człowieka w ci_for_sdlc), zapisuje
   w zatwierdzeniu numer decyzji pdi (`decision: DEC-n`) i wpis w audycie. Odpowiedź: `{ approved, skipped }`.
   Inne bramki i wyniki są przyjmowane i tylko zapisywane w audycie. To samo zdarzenie drugi raz (to samo `id`) nic
   nie zmienia.

4. **Prośba o zatwierdzenie zmiany niegotowej (`gate.requested`, 2026-10-27).** Zmiana gotowa trafia do skrzynki pdi
   sama, z `readiness.changed: ready`. Dla zmiany niegotowej (albo z dryfem) człowiek klika na stronie jej historyjki
   **Ask pdi to approve CHG-n** (`POST /api/changes/:change/request-approval`, z opcjonalnym powodem). ci_for_sdlc
   wysyła wtedy `gate.requested` (kontrakt 0.7.0) dla bramki `approve-for-implementation`:
   - `summary` mówi, kto prosi i co jest niegotowe;
   - `artifact` wymienia historyjki zmiany, a `url` prowadzi do pierwszej z nich;
   - `questions` to to, co blokuje historyjki niegotowe (`KLUCZ: tekst`, najwyżej 20): blokujące ustalenia,
     pytania otwartych ustaleń i pytania wyzwań bez odpowiedzi.

   Decyzja właściciela: przycisk jest ręczny, bo gotowe zmiany idą automatycznie i pozycje w skrzynce się nie
   dublują. Zatwierdzenie z pdi działa jak w punkcie 3: tylko historyjki bez blokujących ustaleń.

   Prośbę dla zmiany gotowej serwer odrzuca (409), podobnie bez połączenia z pdi (409); nieznana zmiana to 404.
   `GET /api/changes` zwraca zmiany z gotowością i ostatnią prośbą (`requested: { at, by, event }`). Prośby, tak jak
   decyzje z A2b, nie znikają po 10 próbach, a odpowiedź 400 z pdi oznacza je jako nieudane, bez ponowień.

## Elementy
- `packages/core/src/pdi.ts` (czyste): `changeKeyOf()`, `changeReadiness()`, `readinessEvents()` (porównanie
  z ostatnio wysłanym stanem), `readinessEnvelope()`, `parseGateDecided()` (sprawdzenie pól zdarzenia z zewnątrz).
- `packages/server/src/pdi.ts`: podpis, kolejka w `pdi-outbox.json` i stan w `pdi-state.json` (Store), dostawa
  z ponowieniami (podstawiany `fetch` w testach), odbiór `gate.decided`.
- `engine.ts`/`app.ts`: kolejkowanie po analizie, minutowy timer dostawy, trasa `POST /api/webhooks/pdi`,
  `GET /api/pdi` (stan: zmiany, kolejka, konfiguracja bez sekretu).
- Ustawienia: `changeLabelPrefix` w schemacie i w Settings → Jira (pole obok prefiksu linii wydania).
- `Approval.decision` (numer decyzji pdi) pokazany przy zatwierdzeniu.
- Dokumentacja: README (zmienne `PDI_EVENTS_URL`, `PDI_SIGNING_SECRET`), ROADMAP/BACKLOG.

## Testy (najpierw czerwone)
`packages/core/test/pdi.test.ts`: etykieta i prefiks, gotowość zmiany (ready, not_ready, drift, pytania, tylko
story/bug), zdarzenia tylko przy zmianie stanu, koperta zgodna z przykładem kontraktu, odrzucenie złego
`gate.decided`. `packages/server/test/pdi.test.ts`: kolejka po analizie (projekt demo z etykietami), dostawa
z podpisem sprawdzonym po stronie odbiorcy, ponowienie po błędzie, `POST /api/webhooks/pdi` (zły i stary podpis 401,
brak sekretu 404, zatwierdzenie historyjek bez blokad, pominięcie zablokowanych, numer DEC w zatwierdzeniu i audycie,
duplikat, inna bramka bez zmian).

## Wynik (2026-10-26)
- `packages/core/test/pdi.test.ts` 16/16 i `packages/server/test/pdi.test.ts` 9/9, najpierw czerwone; `npm test`
  (core 453, server 127, web 26, sandbox 64) i `npm run typecheck` zielone; kontrakt OpenAPI zaktualizowany
  (`test:contract:update`: pole `changeLabelPrefix`, trasa `GET /api/pdi`).
- Po stronie pdi zostaje wysyłka `gate.decided` do ci_for_sdlc (osobny PR w pdi).

## A2b — decyzje `finding.auto_close` w rejestrze pdi (2026-10-27)

Krok A2b planu automatyzacji (pdi `docs/polecenia-startowe-a2.md`, „A2b — polecenie”; decyzja D-A2): decyzje z A2a
trafiają do rejestru pdi, żeby licznik akceptacji z A3 je liczył. Człowiek decyduje w ci_for_sdlc, pdi tylko zapisuje;
drogi zwrotnej nie ma poza numerem `DEC` w odpowiedzi. Kontrakt pdi 0.7.0: zdarzenie `decision.recorded`
(`$defs.decision_recorded`), odbiornik w pdi zrobiony (`docs/plan-a2b-pdi.md`).

### Zdarzenie
Każdy krok A2a z decyzją typu `finding.auto_close` kolejkuje jedno `decision.recorded` w istniejącej kolejce
(`PdiLink`: ten sam adres, podpis i ponowienia), `contract_version` 0.7.0, `source: ci_for_sdlc`:

| Krok | `decided_by` | `draft_edited` | `automation` | inne |
|---|---|---|---|---|
| Accept | osoba | `false` | — | |
| Edit | osoba | `true` | — | odpowiedź osoby w `statement` |
| Reject | osoba | `true` | — | bez decyzji lokalnej |
| Reopen | osoba | `true` | — | `supersedes`: `DEC` zamykanej decyzji |
| `apply` | `ci_for_sdlc` | — | `{ level: 1, rule }` | |

Wspólne: `decision_type: finding.auto_close`, `drafted_by: ai`, `ref` = `<klucz elementu>/<id ustalenia>`,
`url` = strona elementu z kotwicą ustalenia (`<CI_PUBLIC_URL>/#/item/<klucz>/<id ustalenia>`), `evidence` = dosłowny
cytat i adres źródła, `change` = klucz z etykiety `change:CHG-n`, gdy element ją ma. Budowa treści jest czysta
(`decisionRecordedEvent()` w `packages/core/src/pdi.ts`) i sprawdzana schematem z kopii kontraktu.

### Numer DEC i kolejka
- Odpowiedź pdi `{"status": "recorded" | "duplicate", "decision": "DEC-n"}`: numer zapisany przy decyzji lokalnej
  (`Decision.pdiDecision`) i przy zdarzeniu w dzienniku A2a; UI pokazuje go obok decyzji, a decyzja bez numeru jest
  oznaczona „not in pdi”, gdy połączenie z pdi jest włączone.
- Reopen czeka w kolejce, aż zamykana decyzja dostanie numer (nie zużywa prób); potem wysyła się z `supersedes`.
- Zdarzenia decyzji nie są usuwane po `MAX_ATTEMPTS` (to ślad audytu): zostają w kolejce z odstępem do godziny,
  widoczne w `GET /api/pdi`. `readiness.changed` zachowuje się jak dotąd.
- 400 z powodem (typ spoza listy nadawcy, typ chroniony z `automation`, `supersedes` innego `ref`): zdarzenie zostaje
  w kolejce jako `failed` z powodem z odpowiedzi (`error`), bez ponowień; wpis w audycie.

### Pliki
`packages/core/src/pdi.ts` (`PDI_DECISION_CONTRACT_VERSION`, `decisionRecordedEvent`), `packages/core/src/model.ts`
(`pdiDecision`), `packages/server/src/pdi.ts` (kolejkowanie, wysyłka, numer DEC, oczekiwanie, 400), `auto-close.ts`,
`engine.ts`, `app.ts` (podłączenie kroków A2a), `store.ts` (pola wpisu kolejki), `packages/web` (DEC / „not in pdi”,
kotwica ustalenia), kopia schematu `packages/core/test/fixtures/pdi-contract/0.7.0/event.schema.json`.

### Testy (najpierw czerwone)
- `packages/core/test/pdi.test.ts`: treść dla Accept, Edit, Reject, Reopen i `apply` zgodna ze schematem 0.7.0
  (Ajv 2020); `automation` bez `draft_edited`; `change` tylko z etykiety.
- `packages/server/test/pdi.test.ts`: kroki A2a kolejkują zdarzenia; numer DEC zapisany z odpowiedzi (także
  `duplicate`); Reopen czeka na numer oryginału; 400 bez ponowień, z powodem; zdarzenia decyzji nie znikają po
  `MAX_ATTEMPTS`; nic się nie kolejkuje bez połączenia z pdi.

Poza zakresem: odczyt polityki autonomii z pdi (poziom zostaje ustawieniem administratora w ci_for_sdlc).
