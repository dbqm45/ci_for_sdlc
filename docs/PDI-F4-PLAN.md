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
