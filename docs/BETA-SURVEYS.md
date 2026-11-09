# Ankiety zamkniętej bety Quorum

Stan: 2026-11-09. Pytania do przeniesienia do formularza (narzędzie: `BETA-PLAN.md` §8). Ankiety zastępują stałe
rozmowy: zespół odpowiada sam, w swoim czasie, a my porównujemy odpowiedzi z pomiarem.

Oznaczenia:
- **[S]** — pytanie sprawdzające: odpowiedź porównujemy z pomiarem (zdarzenie z `BETA-PLAN.md` §8) albo
  z audytem przestrzeni;
- **[K]** — wymaga konkretu (klucz historyjki, liczba), który da się znaleźć w danych;
- **(wym.)** — pytanie wymagane.

Zasady dla wszystkich ankiet:
- Odpowiada jedna osoba kontaktowa zespołu w imieniu zespołu; inni członkowie mogą wypełnić ankietę dwutygodniową
  osobno (wtedy liczymy każdą odpowiedź, a w raporcie pokazujemy też rozrzut w zespole).
- Nie pytamy o treść historyjek ani o dane osobowe poza imieniem osoby kontaktowej. W pytaniach otwartych prosimy
  o klucz historyjki, nie o jej treść.
- Skale zawsze w tej samej kolejności (1 = najgorzej, 5 = najlepiej) i z opisem skrajnych wartości.

## A. Formularz zgłoszenia do bety (raz, ok. 3 min)

1. Nazwa organizacji i zespołu. (wym.)
2. Osoba kontaktowa: imię, e-mail służbowy, rola. (wym.)
3. Ile osób w zespole pisze i doprecyzowuje historyjki (PO, analitycy, projektanci), a ile je realizuje? (wym.)
4. Których źródeł używacie: Jira Cloud, Confluence Cloud, Figma, repozytorium z planami zmian (tf/pdi), inne?
   (wielokrotny wybór) (wym.)
5. Czy możecie podłączyć Jirę Cloud z prawdziwymi danymi po podpisaniu DPA? (tak / tak, ale tylko jeden projekt /
   nie, tylko dane testowe) (wym.)
6. Zgody (każda osobno, wymagane do udziału):
   - akceptuję regulamin bety (bezpłatnie na czas bety, bez gwarancji dostępności, `BETA-PLAN.md` §5);
   - zgadzam się na mierzenie użycia w zakresie z `BETA-PLAN.md` §8 (zdarzenia bez treści historyjek,
     pseudonimy osób, wyłącznik w ustawieniach przestrzeni);
   - zobowiązujemy się wypełnić ankietę wejściową, ankietę co dwa tygodnie (ok. 5 min) i ankietę końcową.
7. Czy zgadzacie się, żebyśmy po becie wymienili was jako użytkownika (logo, cytat)? (tak / po uzgodnieniu / nie)
   — nieobowiązkowe, nie wpływa na udział.

## B. Ankieta wejściowa (raz, przed pierwszą analizą, ok. 7 min)

Cel: punkt odniesienia — jak jest bez Quorum. Te same pytania (B4–B7) wracają w ankiecie końcowej (D5).

1. Jak dziś sprawdzacie, czy historyjka jest gotowa do realizacji? (wielokrotny wybór: Definition of Ready
   w Confluence / lista w szablonie Jiry / refinement bez listy / przegląd przez architekta lub QA / nie sprawdzamy /
   inne) (wym.)
2. Kto podejmuje decyzję „gotowe”? (PO / zespół na refinemencie / lider techniczny / nikt formalnie) (wym.)
3. Ile historyjek weszło do realizacji w ostatnim zakończonym sprincie? [K] (liczba) (wym.)
4. Ile z nich wróciło z developmentu albo testów, bo wymaganie było niejasne, sprzeczne albo niekompletne? [K]
   (liczba; „nie wiem” dopuszczalne) (wym.)
5. Podajcie klucz jednej takiej historyjki i jednym zdaniem, czego brakowało. [K] (np. `PAY-123`: brak zachowania
   przy odrzuconej płatności)
6. Ile godzin w sprincie zespół spędza łącznie na doprecyzowaniu wymagań (refinement, pytania do PO, poprawki
   opisów)? (do 2 / 2–5 / 5–10 / 10–20 / ponad 20 / nie wiem) (wym.)
7. Jak oceniacie dziś jakość wymagań, które trafiają do developmentu? (1 = większość trzeba doprecyzować w trakcie,
   5 = prawie zawsze kompletne) (wym.)
8. Jakiego jednego problemu z wymaganiami najbardziej chcielibyście się pozbyć? (tekst, wym.)
9. Czego używacie albo próbowaliście używać do tego celu (wtyczki do Jiry, asystent AI w Jirze lub Confluence,
   własne skrypty, nic)? (tekst)

## C. Ankieta co dwa tygodnie (8 pytań, ok. 5 min)

Wysyłka: w aplikacji (baner w przestrzeni) i mailem do osoby kontaktowej, w poniedziałek co drugi tydzień; okno
na odpowiedź 5 dni roboczych. Pytania 1–2 i 4 są sprawdzające: porównujemy je z pomiarem za te same dwa tygodnie.

1. Ile historyjek przeszło w tych dwóch tygodniach przez analizę Quorum i decyzję (rozstrzygnięcie albo
   zatwierdzenie)? [S] (0 / 1–5 / 6–15 / 16–30 / ponad 30) (wym.)
   — porównanie: liczba elementów z `finding_decided` lub `item_approved` w przestrzeni.
2. Podajcie klucz historyjki, w której ustalenie Quorum coś zmieniło, i co dokładnie zmieniliście (opis, kryterium,
   decyzja PO, makieta). [S][K] (tekst; „nie było takiej” dopuszczalne) (wym.)
   — porównanie: czy dla tego klucza jest `finding_decided` z `effect: resolve` w tym okresie.
3. Czy w tych dwóch tygodniach Quorum wskazało coś, czego zespół sam by nie zauważył przed developmentem?
   (tak, podajcie klucz [K] / nie / nie wiem) (wym.)
4. Ile ustaleń odrzuciliście jako fałszywe albo nieistotne? [S] (0 / 1–3 / 4–10 / ponad 10) (wym.)
   — porównanie: `finding_decided` z `effect: dismiss`.
   Jeśli co najmniej jedno: jaka reguła albo jaki rodzaj ustaleń był najczęściej szumem? (tekst)
5. Ile czasu zespół spędził w Quorum w tych dwóch tygodniach i ile, waszym zdaniem, zaoszczędził na
   doprecyzowaniu i poprawkach? (dwa pola: spędzony / zaoszczędzony; do 1 h / 1–3 h / 3–8 h / ponad 8 h / nie wiem)
   (wym.)
6. Ile historyjek z tych dwóch tygodni wróciło z developmentu albo testów przez niejasne wymagania? [K] (liczba;
   „nie wiem” dopuszczalne) — porównanie z B4.
7. Jak bardzo Quorum pomogło w tych dwóch tygodniach? (1 = przeszkadzało, 3 = bez różnicy, 5 = wyraźnie pomogło)
   (wym.)
8. Co najbardziej przeszkadzało albo czego brakowało? (tekst, wym.; zgoda na kontakt w tej sprawie: tak / nie)

Pytanie kontrolne co drugą ankietę (wariant pytania 7, zadany inaczej, żeby sprawdzić spójność odpowiedzi):
„Gdyby od jutra Quorum nie było, co by się zmieniło w waszej pracy?” (nic / drobne utrudnienie / wrócilibyśmy do
ręcznego sprawdzania i byłoby gorzej / musielibyśmy szukać zastępstwa). Odpowiedź „nic” przy ocenie 4–5
w pytaniu 7 oznacza niespójność.

## D. Ankieta końcowa (raz, w fazie 3, ok. 10 min)

1. Jak byście się czuli, gdybyście nie mogli dalej używać Quorum? (bardzo rozczarowani / trochę rozczarowani /
   nie rozczarowani / już nie używamy) (wym.) — miara „musieć mieć” z `BETA-PLAN.md` §1.
2. Dla kogo Quorum jest najbardziej przydatne? (tekst)
3. Jaka jest główna korzyść z Quorum? Podajcie jeden przykład z kluczem historyjki. [K] (tekst, wym.)
4. Co musiałoby się zmienić, żebyście używali Quorum codziennie? (tekst, wym.)
5. Powtórzenie B3, B4, B6 i B7 dla ostatniego zakończonego sprintu (te same skale) — porównanie przed i po. (wym.)
6. Cena (Van Westendorp; kwota w zł miesięcznie za jedną osobę piszącą historyjki, z limitem analiz AI):
   - przy jakiej cenie Quorum byłoby tak tanie, że zaczęlibyście wątpić w jego jakość?
   - przy jakiej cenie byłoby okazją?
   - przy jakiej cenie zaczęłoby być drogie, ale nadal byście się zastanowili?
   - przy jakiej cenie byłoby za drogie, żeby w ogóle rozważać?
7. Propozycja: plan Team w cenie X zł za stanowisko miesięcznie (`SAAS.md` §6; X wpisujemy przed wysyłką).
   Czy kupilibyście go po becie? (tak, od razu / tak, po zgodzie budżetowej / tak, ale w innym modelu: per zespół
   albo per przestrzeń / nie) (wym.)
8. Kto u was decyduje o takim zakupie i ile trwa taka decyzja? (tekst, wym.)
9. Co by was powstrzymało przed zakupem? (wielokrotny wybór: cena / bezpieczeństwo i zgodność / brak funkcji /
   za mało korzyści / zmiana narzędzi w firmie / inne) (wym.)
10. Czy przyjmiecie zniżkę dla design partnerów na pierwszy rok w zamian za zgodę na referencję? (tak / nie /
    do uzgodnienia)

## E. Jak czytamy odpowiedzi

- **Pytania sprawdzające [S].** Rozbieżność większa niż 50% albo jeden przedział skali między odpowiedzią a pomiarem
  (np. „16–30 historyjek”, a w pomiarze 4) oznacza, że odpowiedzi z tej ankiety traktujemy ostrożnie w ocenie §1
  i wysyłamy jedną krótką wiadomość z pytaniem o przyczynę (np. analiza w innej przestrzeni, wyłączony pomiar).
- **Konkrety [K].** Klucz, którego nie ma w przestrzeni albo przy którym nie ma decyzji w tym okresie, liczymy
  jako odpowiedź bez dowodu (nie odrzucamy jej, ale nie liczymy do przykładów w ocenie).
- **Spójność.** Pytanie kontrolne w ankiecie C i porównanie C7 z D1: niespójne odpowiedzi opisujemy w raporcie
  z oceny, nie poprawiamy ich.
- **Brakujące ankiety.** Dwie ankiety dwutygodniowe brakujące z rzędu → wiadomość do osoby kontaktowej; trzy → zespół
  liczymy w miarach z pomiaru, ale nie w miarach jakościowych.
- **Raport z oceny (faza 3):** dla każdej miary z `BETA-PLAN.md` §1 wynik z pomiaru, wynik z ankiet i zgodność obu.
