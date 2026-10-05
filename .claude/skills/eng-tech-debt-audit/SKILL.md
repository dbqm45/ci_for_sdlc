---
name: eng-tech-debt-audit
description: Użyj przy audycie długu technicznego repo lub modułu — wymiary, ustalenia z plik:linia, waga, wysiłek, priorytety.
metadata:
  katalog: "Użyj przy audycie długu technicznego repozytorium lub modułu — orientacja (rozmiar × częstość zmian), dziewięć wymiarów długu, tabela ustaleń z plik:linia, waga i wysiłek, priorytet, szybkie wygrane, „wygląda źle, ale jest w porządku”, ponowny audyt. Nie do pojedynczej refaktoryzacji (eng-behavior-preserving-refactoring) ani przeglądu jednego PR (eng-design-principles)."
---

# Audyt długu technicznego

Audyt, z którym zespół coś zrobi: każde ustalenie wskazuje plik i linię, ma wagę, wysiłek i propozycję, a wynik zostaje
w repozytorium i da się go porównać przy następnym audycie. Audyt niczego nie przepisuje — tylko ustala i proponuje.

## Procedura
1. **Orientacja (obowiązkowa, przed oceną).**
   - README, manifesty (`package.json`, `pom.xml`, `nx.json`), ADR-y, mapa modułów (eng-codebase-mapping).
   - Historia: `git log --oneline -200` i zmiany z ostatnich 6 miesięcy (`git log --since=6.months --stat`).
   - **Gorące punkty:** 20 największych plików i 20 najczęściej zmienianych — ich część wspólna to zwykle miejsce,
     gdzie dług kosztuje najwięcej.
   - Zapisz 1–2 akapity modelu architektury, jak go rozumiesz. Rozbieżność z README to już ustalenie.
   - Pokaż człowiekowi plan audytu (zakres, moduły, narzędzia), zanim zaczniesz.
2. **Ocena w dziewięciu wymiarach** (tabela niżej). Narzędzia uruchamiasz tylko te, które projekt już ma albo na które
   człowiek się zgodzi — bez globalnych instalacji.
3. **Scal i oceń:** usuń duplikaty, nadaj wagę i wysiłek, policz priorytet.
4. **Raport** `docs/project/07-review/<data>-dlug-techniczny.md` (core-project-record).

| Wymiar | Czego szukasz | Narzędzia (TS / Java / Nx) |
|---|---|---|
| rozpad architektury | cykle, łamanie warstw i granic modułów, pliki > 500 linii, logika powielona w 3+ miejscach, nieużywane abstrakcje, martwy kod | `madge --circular`, `knip`, `nx graph`, lint granic modułów Nx; jdeps, ArchUnit |
| niespójność | kilka sposobów na to samo (HTTP, stan, błędy, nazwy) | przegląd wzorców |
| typy i kontrakty | `any`, `as`, niewalidowane granice, kontrakty API bez schematu | `tsc --noEmit` (strict), lint |
| testy | często zmieniane pliki bez testów, testy sprawdzające implementację, niestabilne testy | pokrycie, historia CI (qa-regression) |
| zależności i konfiguracja | znane CVE, nieużywane paczki, rozrost zmiennych środowiskowych | `npm audit`, `depcheck`/`knip`; OWASP dependency-check |
| wydajność | N+1, blokujące I/O, zbędne renderowanie | be-database, fe-architecture |
| błędy i obserwowalność | połykane wyjątki, brak logów i metryk na ścieżkach krytycznych | ops-observability |
| bezpieczeństwo | sekrety, brak autoryzacji per zasób, niebezpieczne wzorce | be-auth-security, ops-supply-chain-security |
| dokumentacja | README i ADR niezgodne z kodem | core-tech-docs |

## Ocena i priorytet
- **Waga:** krytyczna / wysoka / średnia / niska — według skutku (dane, bezpieczeństwo, awaria, spowolnienie zespołu).
- **Wysiłek:** S (godziny) / M (dni) / L (tygodnie).
- **Priorytet (propozycja fabryki):** waga (4/3/2/1) × częstość zmian pliku (zmiany w 6 mies., min. 1) ÷ wysiłek (1/2/4).
  Dług w kodzie, którego nikt nie dotyka, może poczekać; dług w gorącym punkcie spowalnia każdą zmianę.
- Długu nie wymyślasz, żeby wypełnić tabelę: brak ustaleń w wymiarze = „nic istotnego”.

## Raport
1. Podsumowanie (≤ 10 punktów) i model architektury.
2. Tabela: ID · wymiar · plik:linia · waga · wysiłek · priorytet · opis · propozycja.
3. Top 5 ze szkicem zmiany (diff w skrócie, bez wykonywania).
4. **Szybkie wygrane:** wysiłek S przy wadze co najmniej średniej.
5. **Wygląda źle, ale jest w porządku** — obowiązkowo: rzeczy celowe (z uzasadnieniem), żeby nikt ich nie „naprawiał”.
6. Pytania do zespołu (gdy brakuje kontekstu, pytasz zamiast zgadywać).

## Duże repozytoria i ponowny audyt
- Ponad ~50 tys. linii lub więcej niż 5 modułów: jeden wykonawca na moduł (każdy z tą samą procedurą), potem scalanie
  i wspólny ranking.
- Ponowny audyt porównuje z poprzednim raportem: ustalenia oznaczasz jako ROZWIĄZANE, NOWE albo ZMIENIONE.
- Świadome skróty w kodzie znakuj komentarzem `debt: <ograniczenie>, <kiedy wrócić>`; audyt zbiera je do tabeli,
  a znacznik bez warunku powrotu jest osobnym ustaleniem.

## Przykład
**Sytuacja:** „Audyt `apps/shop-api` przed sprintem sprzątania — od czego zacząć?”
**Wynik** (po orientacji i planie pokazanym człowiekowi):

| ID | plik:linia | Waga | Wysiłek | Zmiany | Priorytet |
|---|---|---|---|---|---|
| D2 | `src/billing/invoice.ts:88` (VAT bez testów) | wysoka | M | 25 | 3×25÷2 = 37,5 |
| D3 | `src/payments/webhook.ts:42` (`catch {}`) | krytyczna | S | 6 | 4×6÷1 = 24 |

Szybka wygrana: D3. „Wygląda źle, ale OK”: dwa `retry.ts` — celowo (ADR-007).
Więcej przykładów: `references/przyklady.md`.

## Checklista
- [ ] orientacja i model architektury przed oceną; plan pokazany człowiekowi
- [ ] każde ustalenie z plik:linia, wagą, wysiłkiem i propozycją
- [ ] priorytet uwzględnia częstość zmian; szybkie wygrane wypisane
- [ ] sekcja „wygląda źle, ale jest w porządku”
- [ ] raport w docs/project/07-review/, porównanie z poprzednim

## Źródła inspiracji
[tech-debt-skill](https://github.com/ksimback/tech-debt-skill) (orientacja przez rozmiar i historię zmian, wymiary
długu, tabela ustaleń, sekcja rzeczy celowych, podział na moduły, ponowny audyt) i
[ponytail](https://github.com/DietrichGebert/ponytail) (znaczniki świadomych skrótów z warunkiem powrotu) — opisane
własnymi słowami; formuła priorytetu i narzędzia Java/Nx dodane w fabryce.
