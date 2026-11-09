# Lokalny przebieg zamkniętej bety

Stan: 2026-11-09. Pozycja z `TODO.md` („Lokalny przebieg całej bety przed pierwszym zespołem”). Cały flow bety —
zgłoszenie, zatwierdzenie, zaproszenie, ankiety, przypomnienia, wstrzymanie, koniec — da się przejść lokalnie
w kilka minut, bez Atlassiana, bez Resend i bez czekania tygodniami. Jak beta działa: [`BETA-ENROLLMENT-PLAN.md`](BETA-ENROLLMENT-PLAN.md);
uruchomienie na serwerze: [`SETUP-BETA.md`](SETUP-BETA.md).

## 1. Uruchomienie

```bash
npm run local -- --beta            # http://localhost:4317
npm run local -- --beta --port 4400
```

Skrypt ustawia `CI_BETA_LOCAL=1`, `CI_AUTH_MODE=accounts`, `HOST=127.0.0.1`, operatora `operator@quorum.local` (pierwszy
Owner i operator) i osobny katalog danych `.ci-data-beta-local/` (żeby zacząć od nowa: zatrzymaj aplikację i usuń
ten katalog). Kluczy Atlassiana ani Resend nie potrzeba.

Tryb lokalny daje trzy rzeczy, których serwer produkcyjny nie ma:
- **logowanie dowolną osobą** (`#/dev/login`): Olga Operator, Bea Beta (kontakt i Owner zespołu), Ben Beta (członek)
  albo dowolne imię i e-mail. Obowiązują te same zasady co przy prawdziwym logowaniu: nowa osoba potrzebuje zaproszenia,
  a link z maila zaproszenia prowadzi na tę stronę z zaproszeniem w adresie;
- **skrzynkę maili** (`#/dev/mail`): każdy mail, który serwer wysłałby przez Resend, z klikalnymi linkami;
- **przesuwany zegar**: pasek „Local beta” u góry każdej strony (*+1 day*, *+3 days*, *+7 days*); po każdym
  przesunięciu serwer uruchamia zadanie bety (przypomnienia, wstrzymanie, koniec). Sesje w tym trybie nie wygasają.

**Jeśli zamiast ekranu logowania widać „Could not load analysis: Log in first.”**, przeglądarka dostała stary build
interfejsu (sprzed logowania kontami). Od 2026-11-09 `npm start` przebudowuje interfejs sam, gdy jego źródła są nowsze
niż build (`scripts/ensure-web.mjs`); ze starszą wersją uruchom raz `npm run build` i odśwież stronę bez cache.

**Bezpieczeństwo:** serwer odmawia startu z `CI_BETA_LOCAL=1`, jeśli `NODE_ENV=production`, `CI_PUBLIC_URL` nie jest
na `localhost`/`127.0.0.1`, `HOST` nie jest loopbackiem albo tryb to nie `accounts`
(`packages/server/src/beta-local.ts`, `localBetaMode()`). Trasy `/api/dev/*` istnieją tylko w tym trybie.

## 2. Test automatyczny

`npm run test:e2e:beta-local` (`playwright.beta-local.config.ts`, `e2e/beta-local/beta-flow.spec.ts`) przechodzi
scenariusz z §3 do wznowienia po zaległej ankiecie na świeżym serwerze w trybie lokalnym. Uruchamia się w CI
(`.github/workflows/ci.yml`, „E2E beta flow”). Bez ponowień: beta i zegar idą tylko do przodu, więc ponowienie na tym
samym serwerze nie ma sensu — każde uruchomienie dostaje nowy serwer i katalog danych.

## 3. Scenariusz do przejścia ręcznie

| # | Krok | Oczekiwany wynik |
|---|---|---|
| 1 | Otwórz aplikację, zaloguj się jako **Olga Operator** | pasek „Local beta”; w menu *Beta operator* |
| 2 | `#/beta`: wypełnij formularz jako Bea (`bea@beta.local`), zaznacz trzy zgody, wyślij | „Thank you”; w skrzynce: potwierdzenie dla Bei i „new application” dla operatora |
| 3 | Wyślij formularz bez jednej zgody albo z e-mailem bez domeny | lista problemów nad przyciskiem, nic nie wysłane |
| 4 | *Beta operator* → *Approve* (identyfikator przestrzeni podpowiedziany z nazwy zespołu) | link zaproszenia pokazany raz; w skrzynce mail „your invitation” z tym linkiem |
| 5 | W skrzynce otwórz zaproszenie, kliknij link, wybierz **Bea Beta** | przestrzeń zespołu; znaczek „Beta: 56 days left”; baner „The entry survey is due…”; *Analyze now* wyłączony; mail „the entry survey is open” |
| 6 | Spróbuj użyć tego samego linku jako inna osoba | odmowa: zaproszenie jest jednorazowe i dla e-maila Bei |
| 7 | *Fill in* → ankieta wejściowa; wyślij bez wymaganych odpowiedzi, potem pełną | najpierw zaznaczone braki, potem „Thank you”; *Analyze now* aktywny |
| 8 | *Settings → Members*: zaproś członka, zaloguj się linkiem jako **Ben Beta** | Ben w przestrzeni zespołu, nie widzi przestrzeni operatora |
| 9 | *+7 days* ×2 | mail „the two-week survey is open”; baner z terminem |
| 10 | *+3 days* ×2 | maile „due …” i „overdue”; baner „Analyses pause on … without it.” |
| 11 | *+3 days* ×2 | „Beta paused” na czerwono, baner z powodem, *Analyze now* wyłączony; maile „analyses are paused” (zespół) i „… is paused” (operator) |
| 12 | Jako operator: *No pause for…* (np. 5 dni) | zespół wraca od razu (stan „Survey overdue”), wpis w historii |
| 13 | Jako Bea: wypełnij zaległą ankietę | analizy wracają; przy następnym przesunięciu zegara mail „analyses resumed” |
| 14 | *Beta surveys* → *Switch measurement off*, potem *on* | operator widzi „The team switched measurement off” w *Usage* |
| 15 | Jako operator: *Usage*, *Answers (JSON)*, *Extend…* | miary tydzień po tygodniu; plik z odpowiedziami; nowa data końca |
| 16 | Przesuń zegar do końca bety (8 tygodni od dołączenia) | „Beta ended”; tylko odczyt; mail z ankietą końcową; ankieta końcowa otwarta |

## 4. Wnioski z pierwszego przejścia (2026-11-09)

Przejście automatem (Playwright, zrzuty ekranu) całego scenariusza do kroku 16.

**Poprawione w tym PR:**
1. Logowanie lokalne wysyłało opis osoby razem z imieniem i e-mailem — serwer słusznie odrzucał nieznane pole (422).
2. Baner ankiety liczył dni zegarem przeglądarki zamiast przesuniętego zegara serwera („due in 18 days” przy ankiecie
   po terminie). W trybie lokalnym teksty bety biorą „teraz” z serwera (`betaNow()`).
3. Strony trybu lokalnego (`#/dev/login`, `#/dev/mail`) nie otwierały się w przestrzeni innej niż `default`, bo aplikacja
   przepisuje adres na `#/w/<przestrzeń>/dev/…`.
4. Przełączenie osoby z sesji zespołu wstrzymanego kończyło się 403 (blokada wstrzymania obejmowała `/api/dev/*`).
5. Mail „the entry survey is open” szedł dopiero przy najbliższym godzinnym przebiegu zadania, a nie zaraz po
   dołączeniu Ownera. Teraz zadanie bety rusza od razu po dołączeniu (w tle; zamknięcie serwera na nie czeka).

**Poprawione po przejściu (2026-11-09, osobny PR):**
1. **Przestrzeń zespołu z danymi demo:** zespół bety, którego przestrzeń wciąż pokazuje projekt demo, widzi baner
   „This workspace shows sample data…”; Owner i Admin dostają przycisk *Connect Jira* (do *Settings*), pozostali
   prośbę do Admina (`sampleDataNotice()`).
2. **Ekran logowania** prowadzi do formularza bety („Apply for the closed beta”), gdy zgłoszenia są otwarte.
3. **Język:** interfejs, maile i ankiety zostają po angielsku (decyzja właściciela 2026-11-09).
4. **„Findings without a reaction after 14 days”** w *Usage* pokazuje liczby („12 of 12 — no decisions yet”,
   „3 of 12 (25%)”), a nie samo 100% (`unreactedCount`, `shownOver14Days` w raporcie).
5. Każda nowa strona otwiera się od góry (także przegląd po wysłaniu ankiety); aplikacja nie wysyła zapytań, dopóki
   serwer nie powie, kto jest zalogowany (koniec 401 z `/api/workspaces` przed logowaniem).

**Ograniczenia samego trybu lokalnego:**
- Czasy względne w nagłówku („Last analysis: just now”) liczą się zegarem przeglądarki, więc po przesunięciu zegara
  bywają nieprawdziwe.
- Przy skoku zegara o kilka dni naraz ostrzeżenie „analyses pause on …” może zostać pominięte (zadanie widzi od razu
  stan po wstrzymaniu). Na serwerze zadanie działa co godzinę, więc ostrzeżenie idzie dzień przed wstrzymaniem;
  w trybie lokalnym przesuwaj zegar o dzień, żeby je zobaczyć.
- Zegar idzie tylko do przodu; żeby zacząć od nowa, usuń `.ci-data-beta-local/` i uruchom ponownie.
