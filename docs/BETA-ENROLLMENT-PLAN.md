# Zapisy i uczestnictwo w becie (T10)

Stan: 2026-11-09, zrobione w trzech PR (opis niżej w „Zrobione”). Decyzje właściciela z 09.11: wstrzymanie po 7 dniach, automatycznie, maile przez Resend. Zadanie T10 z [`BETA-PLAN.md`](BETA-PLAN.md) §4. Cel: zespół zapisuje się sam, dostaje
betę na określony czas, a wypełnianie ankiet ([`BETA-SURVEYS.md`](BETA-SURVEYS.md)) i koniec bety pilnuje serwer,
nie właściciel w kalendarzu.
Uruchomienie na serwerze (zmienne, kolejność, sprawdzenie): [`SETUP-BETA.md`](SETUP-BETA.md).

## Jak to robią inni
Zamknięte bety produktów dla firm zwykle wyglądają tak: lista chętnych (formularz), ręczny wybór kilku zespołów,
jednorazowe zaproszenie przypisane do e-maila, konto z datą końca i licznikiem dni w aplikacji, ankiety w aplikacji
z przypomnieniami, a na końcu tryb tylko do odczytu, eksport i oferta. Brak ankiety rzadko odcina dostęp od razu:
najpierw przypomnienia, potem wstrzymanie tego, co kosztuje, bez usuwania danych. Lepiej niż kara działa nagroda
(zniżka po becie tylko dla zespołów, które wypełniły ankiety).

## Decyzje projektowe
- **Bez wspólnego „ukrytego” linku.** Link przekazany dalej przestaje mówić, kto się zapisał. Zamiast tego
  jednorazowe zaproszenie na jeden e-mail, ważne 7 dni, przechowywane jako skrót (jak dzisiejsze zaproszenia
  w `packages/server/src/accounts.ts`).
- **Ankiety w Quorum, nie w zewnętrznym formularzu.** Egzekwowanie wymaga pewnej wiedzy, czy ankieta jest
  wypełniona; ankieta w aplikacji daje ją bez webhooka i tokenów w ukrytych polach. Pytania z `BETA-SURVEYS.md`
  jako plik JSON w repo (wersjonowany), odpowiedzi w bazie. Narzędzie analityki (§8 planu) zostaje tylko do
  pomiaru użycia.
- **Stopniowe wstrzymanie, nigdy usunięcie za brak ankiety.** Wstrzymanie zatrzymuje analizy i AI; odczyt,
  decyzje już podjęte i eksport zostają. Wypełnienie zaległej ankiety przywraca dostęp od razu.
- **Człowiek przed wstrzymaniem.** Dzień przed wstrzymaniem operator dostaje powiadomienie i może przedłużyć termin
  (urlop, zmiana w zespole).

## Model
`BetaEnrollment` — jeden dokument na organizację (globalny, poza przestrzeniami, jak lista przestrzeni):

| Pole | Znaczenie |
|---|---|
| `id`, `org`, `contactEmail`, `contactName` | zgłoszenie (z formularza A) |
| `status` | `applied`, `rejected`, `invited`, `active`, `overdue`, `paused`, `ended` |
| `consents` | trzy zgody z formularza A z datą |
| `workspace` | przestrzeń utworzona przy przyjęciu zaproszenia |
| `startedAt`, `endsAt` | start po ankiecie wejściowej; `endsAt` = start + `BETA_WEEKS` (domyślnie 8) |
| `surveys[]` | `{ kind: entry \| biweekly \| exit, dueAt, answeredAt?, remindedAt[] }` |
| `extensions[]` | przedłużenia przez operatora: `{ by, days, reason, at }` |
| `history[]` | zmiany statusu z datą i przyczyną (audyt) |

Stany i przejścia:

| Z | Do | Kiedy |
|---|---|---|
| — | `applied` | formularz zgłoszenia wysłany (publiczna strona, limit zapytań, CAPTCHA albo pole-pułapka) |
| `applied` | `invited` / `rejected` | operator zatwierdza albo odrzuca; przy zatwierdzeniu mail z zaproszeniem |
| `invited` | `active` | logowanie przez Atlassiana z e-mailem z zaproszenia, utworzenie przestrzeni (zespół jest jej adminem), ankieta wejściowa; analiza zablokowana do jej wypełnienia |
| `active` | `overdue` | minął `dueAt` ankiety dwutygodniowej bez odpowiedzi |
| `overdue` | `active` | ankieta wypełniona |
| `overdue` | `paused` | `PAUSE_AFTER_DAYS` (domyślnie 7) po terminie albo dwie zaległe ankiety |
| `paused` | `active` | ankieta wypełniona albo przedłużenie przez operatora |
| `active` / `overdue` / `paused` | `ended` | minął `endsAt` (plus przedłużenia) |
| `ended` | — | ankieta końcowa dostępna, tylko odczyt i eksport; dane usuwane po `DATA_KEEP_DAYS` (domyślnie 30) przez T7, chyba że zespół przejdzie na płatny plan |

Zaproszenie nieprzyjęte w 7 dni wygasa; operator może wysłać nowe.

## Co widzi zespół
- Licznik w panelu bocznym: „Beta: 23 dni do końca”.
- Ankieta do wypełnienia: baner w przestrzeni i modal przy logowaniu (raz dziennie, do zamknięcia).
- `overdue`: baner z datą wstrzymania; od trzeciego dnia ostrzegawczy kolor.
- `paused`: komunikat „Analizy wstrzymane do wypełnienia ankiety” z przyciskiem do ankiety; reszta tylko do odczytu.
- `ended`: „Beta zakończona”, eksport danych, ankieta końcowa, oferta.

## Zadanie codzienne
Raz dziennie (pod blokadą doradczą, jak migracje) serwer przechodzi po uczestnikach bety:
1. wylicza status z dat i odpowiedzi (funkcja czysta `judgeEnrollment(enrollment, now)`, testowana tabelą
   przypadków);
2. wysyła przypomnienia: w dniu terminu, po 3 dniach, dzień przed wstrzymaniem; każde raz (`remindedAt`);
3. dzień przed wstrzymaniem powiadamia operatora (mail i lista w panelu);
4. zapisuje zmianę statusu w `history` i w audycie przestrzeni.
Blokada analiz w `paused` i `ended` jest sprawdzana w trasie analizy i w harmonogramie, nie tylko w UI.

## Panel operatora
Rola `operator` instancji (zmienna `CI_OPERATOR_EMAILS`, nie rola w przestrzeni). Strona `#/operator`:
zgłoszenia (zatwierdź, odrzuć), uczestnicy (status, dni do końca, ankiety wypełnione i zaległe, zgodność odpowiedzi
sprawdzających z pomiarem z `BETA-SURVEYS.md` E), akcje „przedłuż o N dni”, „wstrzymaj”, „zakończ”, „wyślij
zaproszenie ponownie”. Każda akcja w audycie.

## Maile
Dostawca transakcyjny z DPA i regionem UE (np. Postmark albo Resend; sprawdzić aktualne warunki). Szablony:
zgłoszenie przyjęte, zaproszenie, ankieta do wypełnienia, przypomnienie, ostrzeżenie przed wstrzymaniem,
wstrzymanie, koniec bety, powiadomienie operatora. Bez treści historyjek; linki do aplikacji. Klucz dostawcy tylko
w zmiennej środowiskowej. Bez skonfigurowanego dostawcy maile trafiają do logu (tryb lokalny i testy).

## Kolejność (3 PR)
1. **Zgłoszenia i zaproszenia:** publiczny formularz, `BetaEnrollment`, panel operatora (zatwierdzanie), zaproszenie
   tworzące przestrzeń, licznik dni.
2. **Ankiety w aplikacji:** pytania z JSON, formularz w UI, zapis odpowiedzi, ankieta wejściowa blokująca analizę,
   terminy ankiet dwutygodniowych.
3. **Zadanie codzienne i maile:** `judgeEnrollment()`, przypomnienia, `overdue`/`paused`/`ended`, blokada analiz,
   powiadomienia operatora, akcje przedłużenia.

## Zrobione: PR 1 (2026-11-09)
Warunek: wiele organizacji na jednej instalacji (`docs/ORGANIZATIONS-PLAN.md`, osobny PR przed tym).
- `packages/server/src/beta.ts`: `BetaEnrollments` w `_platform` (`beta-enrollments.json`), statusy `applied`,
  `rejected`, `invited`, `active`, `ended`; `statusAt()` i `daysLeft()` (czyste, liczone od `now`).
- **Formularz** `#/beta` (bez logowania) → `POST /api/beta/apply`: trzy zgody wymagane (`const: true`, inaczej 422),
  pole-pułapka `website`, 5 zgłoszeń na adres IP na godzinę (429 z `Retry-After`), najwyżej 200 czekających (503),
  ten sam e-mail z otwartym zgłoszeniem nic nie zapisuje; odpowiedź zawsze `202 { received: true }`. Strażnik
  przepuszcza tę jedną trasę bez sesji i tokenu (z kontrolą `Origin`). `GET /api/beta` (publiczne): `{ open, weeks }`.
  `CI_BETA_APPLICATIONS=closed` zamyka zgłoszenia (410), `CI_BETA_WEEKS` (domyślnie 8) ustala długość bety.
  Działa tylko w trybie `accounts`.
- **Operator** (`CI_OPERATOR_EMAILS` albo token administratora), strona `#/operator` (*Beta operator* w menu):
  `GET /api/beta/enrollments`; `POST …/:id/approve { workspace: { id, name? }, orgName? }` otwiera organizację
  z przestrzenią i zaproszeniem Ownera na e-mail z formularza (link pokazany raz); `POST …/:id/reject { note? }`;
  `POST …/:id/reinvite` (nowy link, stary przestaje działać). Każda akcja w audycie pierwszej organizacji.
- **Start bety:** gdy zaproszony Owner dołącza, status `active`, `startedAt` = teraz, `endsAt` = + `CI_BETA_WEEKS`
  tygodni; wpis w audycie przestrzeni zespołu. `GET /api/auth/me` → `beta: { status, startedAt, endsAt, daysLeft }`,
  a w nagłówku aplikacji znaczek „Beta: N days left” / „Beta ended”. Po `endsAt` status to `ended` od razu w odczycie;
  zapisze go zadanie codzienne (PR 3).
- Różnice wobec planu wyżej: `active` zaczyna się już przy dołączeniu Ownera (ankieta wejściowa przyjdzie w PR 2
  i wtedy zablokuje analizę do jej wypełnienia); maili jeszcze nie ma, operator przekazuje link sam.
- Ograniczenie: limit na adres IP bierze `req.ip`; za proxy bez `trustProxy` (do ustawienia przy hostingu, T1) jest
  to adres proxy, więc limit 5/h działa wtedy na całą instalację.
- Testy: `packages/server/test/beta.test.ts` (BETA-01–14), `packages/web/test/beta.test.ts` (BUI-01–04).

## Zrobione: PR 2 (2026-11-09) — ankiety w aplikacji
- Pytania z `BETA-SURVEYS.md` B–D jako dane w `packages/server/src/beta-surveys.ts` (`SURVEYS`, po angielsku jak cały
  interfejs, z `version`; typy: wybór, wielokrotny wybór, skala 1–5, liczba z „nie wiem”, tekst, kwota). Pytania
  sprawdzające mają `check: true`. Sprawdzanie odpowiedzi: `answerProblems()` (każdy problem osobno), zapis:
  `cleanAnswers()`.
- Harmonogram `surveySchedule(startedAt, endsAt)`: wejściowa od razu (termin 3 dni), dwutygodniowa co 14 dni przed
  ostatnim tygodniem (termin 5 dni po otwarciu), końcowa tydzień przed końcem (termin tydzień po końcu). Pytanie
  kontrolne (BETA-SURVEYS.md C) jest w każdej dwutygodniowej, nie co drugą.
- `GET /api/beta/surveys` (osoba z zespołu bety): ankiety ze stanem `upcoming`/`open`/`answered`, otwarte z pytaniami.
  `POST /api/beta/surveys/:id/answers { answers }`: raz na osobę (409), inne osoby zespołu mogą dodać swoje; przed
  otwarciem 409, nieznana 404, błędy 422 z listą. Odpowiedzi w logu `beta-survey-answers` w `_platform`, w zapisie
  uczestnictwa `surveys[id] = { answeredAt, by[] }`; wpis w audycie przestrzeni zespołu.
- **Ankieta wejściowa przed analizą:** dopóki jej nie ma, `POST …/analyze`, `…/items/:key/ai-review`
  i `…/connections/atlassian/start` odpowiadają 403 (przeglądanie działa). `GET /api/auth/me` → `beta.entrySurveyDone`
  i `beta.surveyDue`.
- UI: baner „The … survey is due …” z przyciskiem *Fill in*, strona `#/survey` (lista) i `#/survey/<id>` (formularz),
  *Beta surveys* w menu, *Analyze now* wyłączony z podpowiedzią do czasu ankiety wejściowej.
- Operator: podgląd ankiet *Preview surveys* (`#/operator/surveys`, `GET /api/beta/survey-definitions`), bez wysyłania.
- Operator: `GET /api/beta/enrollments` z `surveySlots`, kolumna „Surveys” (odpowiedziane z otwartych, zaległe)
  i *Answers (JSON)* (`GET /api/beta/enrollments/:id/answers`).
- Testy: `packages/server/test/beta-surveys.test.ts` (SV-01–09), `packages/web/test/beta.test.ts` (BUI-05–08).

## Zrobione: PR 3 (2026-11-09) — zadanie, wstrzymanie, koniec bety i maile
- Reguły (czyste, `packages/server/src/beta-lifecycle.ts`): `judgeEnrollment()` daje `active`, `overdue` (ankieta po
  terminie; `pauseOn`), `paused` (ankieta `CI_BETA_PAUSE_AFTER_DAYS` = 7 dni po terminie albo dwie po terminie, po
  ewentualnej łasce operatora; `reason`) i `ended` (od `endsAt`). Każdy odczyt ocenia tak samo jak zadanie, więc zespół
  widzi stan od razu. `dueReminders()`: przypomnienia przy otwarciu ankiety, w dniu przed terminem, 3 dni po terminie
  i dzień przed wstrzymaniem; najwyżej jedno na ankietę, a po spóźnionym przebiegu tylko najnowsze (wcześniejsze
  oznaczone jako pominięte).
- Zadanie (`beta-job.ts`, `runBetaJob()`): co godzinę (oraz od razu po zmianie operatora), wyłączane
  `CI_BETA_JOB=off`. Zapisuje zmianę statusu w historii i audycie przestrzeni zespołu, wstrzymuje analizy z harmonogramu
  i webhooków źródeł (`engine.hold`) zespołu `paused` lub `ended`, wysyła maile; nieudany mail próbuje ponownie przy
  następnym przebiegu, zmiana statusu zapisuje się mimo to.
- **Wstrzymanie:** zespół `paused` i `ended` czyta wszystko, odpowiada na ankiety i się wylogowuje; każda inna zmiana
  (analiza, decyzje, ustawienia, zaproszenia) dostaje 403 z wyjaśnieniem. Odpowiedź na zaległą ankietę wznawia od razu.
- **Operator:** `POST /api/beta/enrollments/:id/grace { days ≤ 30, reason? }` (*No pause for…*: bez wstrzymania do
  daty; wstrzymany zespół wraca od razu) i `…/extend { days ≤ 60, reason? }` (*Extend…*: przesuwa koniec bety;
  zakończona wraca, póki nowy koniec jest przed nami). Obie w historii i audycie.
- **Maile** (`mailer.ts`): Resend z `RESEND_API_KEY` i `CI_MAIL_FROM`, `Idempotency-Key` z kluczem przypomnienia; bez
  klucza tylko wpis w logu (kto i temat, nigdy treść z linkiem). Wysyłane: potwierdzenie zgłoszenia (zespół)
  i nowe zgłoszenie (operator), zaproszenie z linkiem (też po *New invitation link*), przypomnienia, ostrzeżenie przed
  wstrzymaniem (zespół i operator), wstrzymanie (zespół i operator), wznowienie, koniec bety z ankietą końcową. Maile
  do zespołu idą na e-mail kontaktowy z formularza; treść po angielsku, jak aplikacja.
- UI: baner mówi, kiedy analizy się wstrzymają albo dlaczego są wstrzymane (czerwony), znaczek „Beta paused”, przycisk
  analizy wyłączony z powodem; panel operatora pokazuje datę i powód wstrzymania oraz *No pause for…* i *Extend…*.
- Testy: `packages/server/test/beta-lifecycle.test.ts` (LC-01–10), `packages/web/test/beta.test.ts` (BUI-09–10).

## Testy (najpierw czerwone)
- `judgeEnrollment()`: tabela przypadków na granicach (termin dziś, dzień 6/7 po terminie, dwie zaległe, przedłużenie,
  koniec bety w dniu terminu ankiety), stały zegar.
- Trasy: zgłoszenie bez zgód 422, limit zapytań; zaproszenie jednorazowe, wygasłe, na inny e-mail (odrzucone);
  analiza w `paused` 403 z kodem `beta_paused`; operator vs zwykły admin (403).
- Zadanie codzienne: każde przypomnienie wysłane raz; operator powiadomiony przed wstrzymaniem.
- Postgres i pliki: oba backendy (jak `postgres.test.ts`).
- UI: licznik, banery, ankieta, panel operatora.

## Decyzje właściciela
1. `PAUSE_AFTER_DAYS` (rekomendacja 7) i czy dwie zaległe ankiety wstrzymują od razu.
2. Wstrzymanie automatyczne czy dopiero po potwierdzeniu przez operatora (rekomendacja: automatyczne, z
   powiadomieniem dzień wcześniej).
3. `BETA_WEEKS` (rekomendacja 8) i `DATA_KEEP_DAYS` po końcu bety (rekomendacja 30).
4. Dostawca maili.
5. Czy zniżka po becie zależy od wypełnionych ankiet (rekomendacja: tak, zapisane w regulaminie bety).
