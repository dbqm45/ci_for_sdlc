# Przykłady audytu długu technicznego

## 1. Audyt modułu z priorytetami i szybkimi wygranymi
**Sytuacja:** „Zrób audyt długu w `apps/shop-api` (NestJS, ok. 18 tys. linii). Mamy sprint na sprzątanie i chcemy
wiedzieć, od czego zacząć”.

**Jak:**
1. **Orientacja:** README, `package.json`, ADR-y, `git log --since=6.months --stat`; 20 największych i 20 najczęściej
   zmienianych plików — część wspólna: `order.service.ts`, `invoice.ts`. Model architektury w 2 akapitach;
   README opisuje kolejkę, której w kodzie nie ma → ustalenie (dokumentacja).
2. Plan (zakres, moduły, narzędzia: `madge --circular`, `knip`, `tsc --noEmit`, `npm audit` — tylko te, które projekt
   ma) pokazany człowiekowi przed oceną.
3. **Ocena w dziewięciu wymiarach**; wymiar bez ustaleń = „nic istotnego”.
4. **Priorytet** = waga (4/3/2/1) × zmiany w 6 mies. ÷ wysiłek (S=1, M=2, L=4).
5. Raport `docs/project/07-review/2026-10-04-dlug-techniczny.md`.

**Wynik** (fragment tabeli, posortowany po priorytecie):

| ID | Wymiar | plik:linia | Waga | Wysiłek | Zmiany | Priorytet | Opis | Propozycja |
|---|---|---|---|---|---|---|---|---|
| D2 | testy | `src/billing/invoice.ts:88` | wysoka | M | 25 | 3×25÷2 = **37,5** | naliczanie VAT bez testów, zmieniane co tydzień | testy charakteryzujące, potem przypadki brzegowe |
| D1 | rozpad architektury | `src/orders/order.service.ts:1` | wysoka | L | 38 | 3×38÷4 = **28,5** | 1240 linii, 4 odpowiedzialności | wydzielić wycenę i wysyłkę do osobnych usług |
| D3 | błędy i obserwowalność | `src/payments/webhook.ts:42` | krytyczna | S | 6 | 4×6÷1 = **24** | `catch {}` połyka błąd zapisu płatności | logować i zwracać 500, żeby dostawca ponowił |
| D4 | typy i kontrakty | `src/api/client.ts:17` | średnia | S | 12 | 2×12÷1 = **24** | odpowiedź API rzutowana `as any` | walidacja schematem na granicy |
| D5 | zależności | `package.json:31` | niska | S | 3 | 1×3÷1 = **3** | nieużywana paczka `moment` (`knip`) | usunąć |

**Szybkie wygrane** (S przy wadze co najmniej średniej): D3, D4.
**Wygląda źle, ale jest w porządku:** `src/shared/retry.ts` i `src/workers/retry.ts` są prawie identyczne — celowo,
workery wdraża się osobno i nie mogą zależeć od `shared` (ADR-007). Nie scalać.
**Pytania do zespołu:** czy kolejka z README jest planowana, czy porzucona?

## 2. Ponowny audyt i znaczniki `debt:`
**Sytuacja:** „Minął kwartał od audytu `shop-api`. Co się zmieniło?”

**Jak:**
1. Ta sama procedura, potem porównanie z raportem `2026-10-04-dlug-techniczny.md`.
2. Każde ustalenie dostaje status ROZWIĄZANE, NOWE albo ZMIENIONE.
3. Zebrane znaczniki `debt: <ograniczenie>, <kiedy wrócić>`; znacznik bez warunku powrotu to osobne ustalenie.

**Wynik:**

| ID | Status | plik:linia | Zmiana |
|---|---|---|---|
| D3 | ROZWIĄZANE | `src/payments/webhook.ts:42` | błąd logowany, odpowiedź 500 |
| D1 | ZMIENIONE | `src/orders/order.service.ts:1` | 1240 → 820 linii, waga wysoka → średnia |
| D6 | NOWE | `src/catalog/search.ts:15` | `// debt: brak paginacji` bez warunku powrotu — dopisać „gdy katalog > 1000 pozycji” |
| D7 | NOWE | `src/catalog/import.ts:60` | `// debt: import synchroniczny, wrócić przy imporcie > 5 MB` — znacznik poprawny, trafia do tabeli z priorytetem |
