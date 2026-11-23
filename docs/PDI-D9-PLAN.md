# D9 w ci_for_sdlc — decyzje suity widoczne w DI Definition

Stan: 2026-11-23. Krok D9 planu budowy suity (dbqm45/pdi, `docs/plan-budowy-suity.md` §3a). Zależy od D5
(`docs/PDI-D5-PLAN.md`: decyzje DI Definition w indeksie pdi) i D7 w pdi (`pdi-records changes`: odczyt przyrostowy).
Odpowiednik w tf: D8 (`modes/mode-pdi/hooks/decision_cache.py`).

## Cel
Osoba rozstrzygająca znalezisko albo pytanie w DI Definition widzi decyzje podjęte gdzie indziej w suicie: bramki
w pdi, decyzje fabryki (tf) z repozytoriów, decyzje DI Release. Każda jest oznaczona jako pochodząca z suity,
z aplikacją, stanem (obowiązuje albo zastąpiona) i linkiem do oryginału. Kopia działa też wtedy, gdy pdi jest chwilowo
niedostępne, i widać, jak jest stara.

## Ustalenia
1. **Skąd dane:** polecenie `pdi-records changes` (pdi D7) z `CI_SUITE_DECISIONS_CMD` (np.
   `uv run --directory /srv/pdi pdi-records`), uruchamiane bez powłoki (`execFile`, argumenty rozdzielone jak
   w powłoce, bez rozwijania). Rejestr pdi leży dziś na maszynie właściciela; API HTTP przyjdzie z usługą pdi (DA4)
   i zastąpi polecenie za tym samym interfejsem pobierania (`fetchPage`). Bez zmiennej funkcja jest wyłączona.
2. **Kopia** należy do instalacji, jak połączenie z pdi: plik `suite-decisions.json` w magazynie przestrzeni
   `default` — znacznik `next`, chwila pobrania, ostatni błąd i decyzje (bez pliku Decision Record: id, treść,
   uzasadnienie, stan, `superseded_by`, aplikacja, zakres, typ, data, autor, CHG, link). Własne decyzje DI Definition
   (`origin.app: ci_for_sdlc`) są pomijane — są tutaj. Zastąpione zostają ze stanem `superseded`.
3. **Odświeżanie** przyrostowe (`--since <next>`, strony do `complete`, najwyżej 50 stron, limit czasu 20 s, jedno
   naraz): przy starcie serwera, co 15 min i na żądanie (`POST /api/suite-decisions/refresh`). Błąd polecenia albo
   czas → ostatnia kopia zostaje, stan mówi „nieaktualna” z jej wiekiem i powodem (bez treści wyjścia polecenia).
4. **Odczyt:** `GET /api/suite-decisions?change=CHG-12&q=słowa` — decyzje danej zmiany (`links.chg`) albo
   pasujące do słów (wszystkie fragmenty, bez wielkości liter, w treści, uzasadnieniu i identyfikatorach), obowiązujące
   najpierw, najwyżej 50; razem ze stanem kopii. Widoczność jak `/api/pdi`: pierwsza organizacja.
5. **UI:** na stronie historyjki sekcja „Suite decisions”: decyzje zmiany z etykiety `change:` i pole szukania;
   każda z odznaką aplikacji, stanem, linkiem; wiek kopii i ostrzeżenie, gdy nieaktualna. Bez konfiguracji sekcji nie ma.
6. **Poza zakresem:** decyzje suity jako źródło odpowiedzi AI (A2a) — osobny krok, gdy będzie wiadomo, jak często
   rozstrzygają pytania.

## Pliki
| Plik | Zmiana |
|---|---|
| `packages/core/src/suite-decisions.ts` (nowy) | scalanie strony z kopią, wybór i szukanie (czyste funkcje) |
| `packages/server/src/suite-decisions.ts` (nowy) | pobieranie poleceniem, odświeżanie, stan |
| `packages/server/src/store.ts`, `app.ts` | plik kopii; trasy, start i timer |
| `packages/web/src/api.ts`, `packages/web/src/pages/ItemPage.tsx` | sekcja „Suite decisions” |
| testy: `packages/core/test/suite-decisions.test.ts`, `packages/server/test/suite-decisions.test.ts` | najpierw, czerwone |

## Kolejność (TDD)
1. Testy core: scalanie (nowe, zmienione, zastąpione, własne pominięte, znacznik), wybór po CHG i po słowach.
2. Testy serwera z udawanym `pdi-records` (skrypt node): wyłączone bez zmiennej; pierwsze pobranie; drugie z `--since`;
   strony; błąd polecenia → stara kopia i stan nieaktualny; trasy z filtrem i widocznością.
3. Kod, UI, potem bramki: `npm test`, `npm run typecheck`, `npm run build`, `npm run contract:check`.
