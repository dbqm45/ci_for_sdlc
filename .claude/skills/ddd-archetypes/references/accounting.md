# Archetyp Accounting — mapper (wartość, konta, zapisy, transakcje)

> **Spis treści:** Test dopasowania · Model (istota) · Pytania · Kroki mapowania · Decyzje do kontroli (R/A/X) · Format wyniku · Wzorce i pułapki · Kontrola jakości · Przykład (skrócony)

Zamienia wymagania, w których coś się **gromadzi lub zużywa**, na model księgowy: konta, transakcje, zapisy, odwrócenia,
okresy ważności i kolejność rozliczania. Wartością nie muszą być pieniądze: punkty, dni urlopu, limit danych, kredyty API,
sztuki w magazynie, godziny w pakiecie. Efekt: każde saldo da się **wyjaśnić, odwrócić bez utraty historii, zaudytować
i analizować**. Protokół wspólny (pytania, „To zależy”, kontrola R/A/X, zapis): `SKILL.md` → „Mapper — wspólny protokół”.

## Test dopasowania
**Pytanie rdzeniowe:** *czy da się zapytać „ile X ma podmiot S?” i dostać sensowną liczbę z historią transakcji?*
Tak → archetyp prawdopodobnie pasuje. Naturalne pytanie brzmi „w jakim stanie jest X?” → to maszyna stanów, nie księga.

| Sygnał w wymaganiach | Pasuje? |
|---|---|
| „zdobywa / wydaje / nalicza / zużywa N jednostek” | ✅ |
| „saldo nie może spaść poniżej zera”, limit, pula | ✅ |
| „przyznaj / zwróć / wygaś / przenieś / skoryguj” | ✅ |
| „skąd się wzięło to saldo?”, rozrachunki, storno | ✅ |
| „zgłoszenie przechodzi: otwarte → przypisane → zamknięte” | ❌ maszyna stanów |
| „dokument ma wersje / różnice / gałęzie” | ❌ graf wersji |
| „obserwuje / przestaje obserwować” | ❌ graf relacji (→ Party) |
| „odpowiedź w ciągu 1 h” (SLA) | ❌ ograniczenie czasowe zdarzenia, nie wartość |
| „termin wolny / zajęty / zablokowany” | ⚠️ graniczny |

**Przypadki graniczne:**
- *Terminy/sloty* — czy tę samą jednostkę da się **częściowo** zużyć? Binarne wolny/zajęty → stan (→ Availability).
  Pojemność liczbowa („sala na 10 osób, zajęte 7”) → wartość → pasuje (często razem z Availability).
- *Uprawnienia / flagi* — włączone/wyłączone, nic się nie gromadzi → stan.
- *Pozycja w kolejce* — porządek, nie saldo → Waitlist.

## Model (istota)
- **Konto** — miejsce, w którym żyje wartość; typ, jednostka, polityka salda, wersja (blokada optymistyczna). Saldo **wynika
  z zapisów** — dodanie zapisu nie wymaga ładowania całej historii.
- **Typy kont:** aktywa (wartość podmiotu), pasywa/zobowiązania (wartość należna, oczekująca), przychody, koszty, **pule**
  (źródła wartości: promocja, przydział miesięczny) oraz **pozabilansowe** (informacyjne, warunkowe, prognozy — bez wpływu na bilans).
- **Zapis** — obciążenie (debet) albo uznanie (kredyt) jednego konta: kwota w jednostce kanonicznej, **dwa czasy**:
  `utworzono` (zawsze teraz, nieedytowalny) i `obowiązuje_od` (moment skuteczny dla salda — może być wcześniejszy przy korekcie
  wstecz), opcjonalnie okres ważności i powiązanie z zapisem, który rozlicza.
- **Transakcja** — atomowy zbiór zapisów z typem; ≥ 2 zapisy na ≥ 2 kontach; dla kont bilansowych **suma = 0**
  (podwójny zapis). Zapisuje wszystkie zapisy naraz albo żadnego. Transakcja jest w centrum — nie „jedno wielkie konto z listą operacji”.
- **Odwrócenie** — pomyłek nie edytuje się ani nie usuwa: transakcja odwracająca (lustrzane zapisy) z odwołaniem do oryginału.
- **Alokacja** — rozliczanie zapisów względem siebie: FIFO, LIFO, priorytet źródeł, proporcjonalnie, ręcznie.
- **Konto projekcyjne** — wirtualne konto zdefiniowane filtrem (np. „wszystkie należności przeterminowane”) — raport bez
  przenoszenia wartości.
- **Reguły księgowania** — reakcja na zdarzenia/zapisy: warunek kwalifikacji (składalny i/lub/nie), wybór kont docelowych
  (po tagach), kalkulator tworzący transakcję; priorytet reguł. Nowy skutek finansowy (prowizja, podatek, rezerwa) = konfiguracja.

## Pytania
**A — decyzje standardowe** (pytaj tylko o nierozstrzygnięte; każda może mieć odpowiedź „dla części przypadków tak”):
- Księga **tylko dopisywana**, czy w jakichś przypadkach dopuszczasz edycję/usuwanie zapisów?
- Czy wartość **wygasa**? Które zapisy, po jakim czasie, kalendarzowo czy kroczącą?
- Czy któreś konto / typ transakcji może zejść **poniżej zera**? (bywa zależne od konta lub inicjatora)
- Czy wolno księgować **wstecz** (`obowiązuje_od ≠ utworzono`)?
- Czy wartość można **przenosić** między podmiotami?
- **Jednostki:** jedna czy kilka? Czy są przeliczalne (1 GB = 1024 MB, waluty)?

**B — luki** (przykłady; szukaj samodzielnie, czego archetyp umie, a wymagania nie mówią):
- kolejność zużycia źródeł (promocyjne vs kupione vs zarobione)? · limit salda lub tempa naliczania? · różna ważność per źródło?
- rozróżnienie „zarobione” vs „przyznane przez admina” (analityka, polityki)? · **kaskadowe odwrócenia** (odwrócić też zużycie
  opłacone odwróconą wartością)? · audyt/eksport/RODO? · ochrona przed **podwójnym naliczeniem** tego samego zdarzenia
  (idempotencja)? · stan „oczekuje na zatwierdzenie” — gdzie żyje wartość w tym czasie?

## Kroki mapowania
1. **Wartość** — co się gromadzi/zużywa? Nazwa (`DNI_URLOPU`, `PUNKTY`) i **jednostka kanoniczna**; przy wielu jednostkach —
   przeliczniki; zapisy zawsze w jednostce kanonicznej.
2. **Konta** — wszystkie miejsca, gdzie wartość żyje: różni właściciele, różne źródła tej samej wartości, konta przeciwstawne
   do podwójnego zapisu. Nazwa `{właściciel}_{wartość}_{cel}`. Dla każdego: typ, jednostka, **polityka salda**:
   `blokuj` | `pozwól` | `debet_do: N`.
3. **Typy transakcji** — z czasowników domeny (przyznaj, kup, zużyj, zwróć, wygaś, przenieś, skoryguj) i zadań cyklicznych
   (reset miesięczny, wygaszanie). Dla każdej: zdarzenie wyzwalające, kierunek przepływu, inicjator (użytkownik/system), odwracalność.
4. **Zapisy** — pary debet/kredyt dla każdej transakcji; suma = 0; reguła dla `obowiązuje_od`.
5. **Odwrócenia** — dla każdego typu: zawsze / warunkowo (okno, saldo wystarczające) / nigdy (np. wygaśnięcie); lustrzane zapisy
   + odwołanie do oryginału; ewentualne kaskady.
6. **Ważność** — dla pul z terminem: `ważne_od`, `ważne_do`, co przy wygaśnięciu (transakcja wygaszająca na konto „wygasłe”).
   Saldo liczone tylko z zapisów ważnych na dany moment.
7. **Alokacja** — gdy podmiot ma kilka źródeł tej samej wartości: kolejność zużycia i uzasadnienie.
8. **Reguły księgowania** — automatyczne skutki zdarzeń (prowizja, podatek, bonus) jako reguły, nie `if` w transakcjach.

## Decyzje do kontroli (R/A/X)
polityka salda każdego konta (i per inicjator) · wygasanie (które zapisy, kalendarz/kroczące, co przy wygaśnięciu) ·
kolejność alokacji · model przeniesienia (bezpośrednio / przez konto przejściowe; kto inicjuje) · reguły odwróceń (kto, w jakim oknie) ·
księgowanie wstecz · stan oczekujący i gdzie w nim żyje wartość · korekta administracyjna (czy łamie ograniczenia) ·
tylko dopisywanie · całkowite vs ułamkowe jednostki · limity · przypadki na granicy (co z wartością „w drodze”, gdy wygasa lub następuje reset).

## Format wyniku
```markdown
# Model Accounting: <obszar>
## Wartość            — nazwa, opis, jednostka kanoniczna, przeliczniki
## Mapowanie pojęć    — | Pojęcie domeny | Element archetypu | Uzasadnienie |
## Niezmapowane pojęcia
## Konta              — | Konto | Typ | Jednostka | Polityka salda | Opis |
## Transakcje i zapisy
### <transakcja>  — Wyzwalacz · Odwracalna: tak/nie/warunkowo (warunek)
| # | Konto | Debet/Kredyt | Kwota | obowiązuje_od | Uwagi |
## Ważność            — | Konto | Ważne od | Ważne do | Przy wygaśnięciu |
## Alokacja           — kolejność zużycia z uzasadnieniem
## Odwrócenia         — | Transakcja | Wyzwalacz odwrócenia | Odwracalna? | Warunek |
## Reguły księgowania — warunek → konta → kalkulator
## Decyzje (R/A/X)    — | Decyzja | Źródło |
## Uwagi              — założenia (X), przypadki brzegowe, parametry polityk zmiennych
```

## Wzorce i pułapki
- **Transakcja w centrum**, konta jako punkty odniesienia — skaluje się lepiej niż agregat konta z listą operacji.
- Saldo jako kolumna aktualizowana `UPDATE`-em gubi historię; saldo z zapisów (z cache/snapshotem dla wydajności) — nie.
- „Czy pracownik X może przekazać dni Y?” (aktywny? limit roczny? zgoda HR?) — **poza księgą**; księga tylko rejestruje
  i pilnuje ograniczeń strukturalnych (saldo ≥ 0).
- Zmienna polityka („premium: punkty ważne 365 dni, reszta 90”) → księga dostaje gotowe `ważne_do`.
- Idempotencja: identyfikator zdarzenia źródłowego na transakcji + unikalność → brak podwójnego naliczenia.
- Wygaśnięcie to **transakcja** (na konto „wygasłe”), nie cichy filtr — inaczej analityka nie pokaże, ile wartości przepadło.
- Kwoty jako Quantity/Money (liczba całkowita w najmniejszej jednostce) — `quantity-money.md`.
- Współbieżność: wersja na koncie, które ma politykę `blokuj`; konta z `pozwól` nie muszą się blokować.

## Kontrola jakości
- [ ] każda transakcja ma ≥ 1 debet i ≥ 1 kredyt; konta bilansowe sumują się do zera
- [ ] każde konto z zapisów jest zdefiniowane i ma politykę salda oraz jednostkę
- [ ] każdy zapis ma opisaną semantykę `utworzono` i `obowiązuje_od`
- [ ] każda odwracalna transakcja ma mechanizm odwrócenia; nieodwracalne są nazwane
- [ ] konta z terminem mają reguły ważności; alokacja pokrywa wszystkie kombinacje źródeł
- [ ] tabela mapowania i „Niezmapowane pojęcia” obecne; odpowiedzi/założenia odzwierciedlone w modelu; brak materialnych (X)

## Przykład (skrócony)
**Wejście:** „Pracownik dostaje 26 dni urlopu na rok. Niewykorzystane dni przechodzą na następny rok i przepadają 30 września.
Przełożony może przyznać dzień wolny za nadgodziny.”

```markdown
## Wartość — DNI_URLOPU (dzień; kanonicznie pół dnia = 0,5 → jednostka: pół dnia, liczby całkowite)
## Konta
| pracownik_urlop_bieżący | aktywa | pół dnia | blokuj | pula roku bieżącego |
| pracownik_urlop_zaległy | aktywa | pół dnia | blokuj | przeniesione z poprzedniego roku |
| pracownik_urlop_nadgodziny | aktywa | pół dnia | blokuj | dni za nadgodziny |
| firma_przydział | pula | pół dnia | pozwól | strona przeciwna przydziałów |
| urlop_wykorzystany | koszty | pół dnia | pozwól | analityka |
| urlop_przepadły | koszty | pół dnia | pozwól | analityka wygaśnięć |
## Transakcje: przydział_roczny (1 stycznia, system; nieodwracalna — korekta osobną transakcją) ·
   przeniesienie_na_nowy_rok (31 grudnia: bieżący → zaległy, ważne_do 30.09) · dzień_za_nadgodziny (przełożony; odwracalna do
   wykorzystania) · wykorzystanie (wniosek zatwierdzony; odwracalne przy anulowaniu urlopu) · wygaśnięcie (30.09, system; nieodwracalne)
## Alokacja — 1. zaległy (wygasa najwcześniej) 2. nadgodziny (A: „najpierw nadgodziny czy bieżący?” — To zależy → parametr
   `kolejność_źródeł` z polityki kadrowej) 3. bieżący
## Decyzje — pół dnia jako minimum (X → zapytano, A) · saldo nigdy < 0 (R?: brak → A) · anulowanie urlopu po jego terminie (X → hot spot)
```
