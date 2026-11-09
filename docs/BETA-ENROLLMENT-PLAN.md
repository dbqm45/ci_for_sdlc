# Zapisy i uczestnictwo w becie (T10)

Stan: 2026-11-09, plan. Zadanie T10 z [`BETA-PLAN.md`](BETA-PLAN.md) §4. Cel: zespół zapisuje się sam, dostaje
betę na określony czas, a wypełnianie ankiet ([`BETA-SURVEYS.md`](BETA-SURVEYS.md)) i koniec bety pilnuje serwer,
nie właściciel w kalendarzu.

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
