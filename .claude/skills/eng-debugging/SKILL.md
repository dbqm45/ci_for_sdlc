---
name: eng-debugging
description: Użyj, gdy coś działa źle, a przyczyna nie jest oczywista — odtworzenie, hipotezy, zawężanie, git bisect, debugger.
metadata:
  katalog: "Użyj, gdy program działa źle, a przyczyna nie jest oczywista — opis objawu, odtworzenie (najlepiej czerwonym testem), hipotezy z eksperymentem rozstrzygającym, zawężanie (bisekcja w historii przez git bisect run, w danych wejściowych, w kodzie i konfiguracji), debugger i logi, typowe klasy przyczyn (niedeterminizm, stan współdzielony, cache, środowisko, wersje), przyczyna źródłowa i poprawka bez maskowania. Nie do prowadzenia incydentu produkcyjnego (ops-sre-incidents), diagnozy serwera i sieci (ops-linux-networking), przeglądu zgłoszeń z zewnątrz (proc-issue-triage) ani kwarantanny niestabilnych testów (qa-regression)."
  slowa: "debugowanie, błąd, bug, nie działa, dlaczego to nie działa, przyczyna błędu, wyjątek, stack trace, NullPointerException, regresja, git bisect, który commit zepsuł, debugger, breakpoint, pdb, odtworzyć błąd, działa lokalnie a nie w CI"
---

# Debugowanie — od objawu do przyczyny

Zasada: **najpierw przyczyna, potem poprawka.** Poprawka bez zrozumienia przyczyny zwykle przenosi błąd w inne
miejsce albo go maskuje. Pracujesz jak w eksperymencie: obserwacja → hipoteza → przewidywanie → test → wniosek.
Prowadzisz krótki dziennik (co sprawdzone, wynik), żeby nie sprawdzać dwa razy tego samego i móc przekazać pracę.

## Procedura
1. **Opisz objaw dokładnie:**
   - co oczekiwane, co rzeczywiste;
   - od kiedy, gdzie (środowisko, wersja, commit, dane, użytkownik);
   - pełny komunikat i stos wywołań, bez streszczania.
   Rozbieżność „działa u mnie / nie działa w CI” to już informacja: różnica środowisk jest pierwszym podejrzanym.
2. **Odtwórz błąd:**
   - najmniejszy, powtarzalny przypadek, najlepiej **test automatyczny, który jest czerwony** z właściwego powodu;
     to jest też pierwszy krok TDD przy poprawce (hook `tdd_guard`);
   - błąd losowy: uruchom wielokrotnie w pętli, ustal ziarno losowości, zegar, kolejność testów i równoległość;
   - bez odtworzenia nie ogłaszasz naprawy, tylko „nie udało się odtworzyć” z listą prób.
3. **Postaw hipotezy i rozstrzygaj je eksperymentem:**
   - wypisz 2–4 możliwe przyczyny;
   - dla każdej zapisz, co musiałoby być prawdą i jaki eksperyment ją potwierdzi lub obali;
   - zacznij od tej, którą najtaniej sprawdzić, a nie od ulubionej;
   - zmieniaj jedną rzecz naraz.
4. **Zawężaj o połowę:**
   - **w historii**: `git bisect run <skrypt>` znajduje pierwszy zły commit w log₂(n) krokach (200 commitów → ok. 8);
     kod 125 pomija commit, którego nie da się sprawdzić — `references/bisekcja-i-narzedzia.md`;
   - **w danych**: dziel wejście na połowy, dopóki zostanie najmniejszy przypadek wywołujący błąd (delta debugging);
   - **w kodzie**: logi lub asercje na granicach modułów — gdzie stan jest jeszcze dobry, a gdzie już zły;
   - **w środowisku**: porównaj działające i niedziałające (wersje z lockfile, zmienne, flagi, dane, system).
5. **Obserwuj zamiast zgadywać:**
   - debugger: punkt zatrzymania, podgląd zmiennych, krokowanie (`breakpoint()` w Pythonie, `node --inspect-brk`,
     debugger IDE);
   - log z kontekstem (identyfikatory, wartości wejściowe), a nie „tu jestem”;
   - idź **wstecz od awarii**: która wartość jest zła, skąd przyszła, gdzie pierwszy raz stała się zła (defekt →
     zainfekowany stan → awaria).
6. **Sprawdź założenia**, które „na pewno są prawdą”:
   - czy uruchamiasz kod, który myślisz (stary build, cache bajtkodu, nieprzeładowany serwer, inny branch);
   - wersje zależności i konfiguracja;
   - strefy czasowe, kodowanie znaków, ustawienia regionalne.
   Przykład: w bisekcji Pythona nieaktualny `__pycache__` dał fałszywy wynik — referencja.
7. **Znajdź przyczynę źródłową:**
   - zadaj „dlaczego” kilka razy: dlaczego wartość była zła, dlaczego kod na to pozwolił, dlaczego test tego nie złapał;
   - poprawiasz przyczynę i lukę w testach, nie tylko objaw.
8. **Popraw bez maskowania:**
   - test czerwony → minimalna poprawka → test zielony → cały zestaw testów;
   - nie maskujesz: puste `except`, ponawianie bez przyczyny, `sleep` w teście, wyłączenie testu lub reguły lintera;
   - podobne miejsca w kodzie sprawdzasz `grep`-em — ten sam błąd często jest w kilku kopiach.
9. **Zapisz** w raporcie kroku: objaw, przyczynę, dowód (test, commit z bisekcji) i poprawkę. Pułapka, która może
   wrócić, trafia do `docs/project/lessons.md` (core-project-record).
10. **Wiedz, kiedy przestać:**
    - po ok. 2 godzinach bez postępu albo po obaleniu wszystkich hipotez przedstaw człowiekowi dziennik i hipotezy
      albo oddaj problem agentowi w świeżym kontekście;
    - błąd na produkcji z wpływem na użytkowników: najpierw przywrócenie usługi (ops-sre-incidents), diagnoza potem.

## Typowe klasy przyczyn
| Klasa | Sygnał | Pierwszy eksperyment |
|---|---|---|
| niedeterminizm | błąd co n-te uruchomienie | pętla N razy; stałe ziarno, zegar, kolejność; bez równoległości |
| stan współdzielony | test przechodzi sam, pada w zestawie | uruchom w innej kolejności; szukaj zmiennych globalnych, singletonów, wspólnej bazy |
| wartości brzegowe | błąd dla części danych | puste, `null`, zero, bardzo duże, znaki spoza ASCII, przełom doby/miesiąca |
| czas i strefy | błąd o określonej godzinie lub dacie | ustaw zegar na tę chwilę; sprawdź strefę serwera i bazy |
| cache i artefakty | „poprawka nie działa” | czysty build, wyczyść cache, sprawdź, który plik się wykonuje |
| środowisko | działa lokalnie, nie w CI/produkcji | porównaj wersje, zmienne, uprawnienia, dane |
| zależność | po aktualizacji | bisekcja po lockfile, informacje o wydaniu (ops-dependency-upgrades) |
| współbieżność | rzadkie, pod obciążeniem | test z wieloma wątkami; logi z identyfikatorem wątku/żądania; blokady i transakcje |

## Granice
- Incydent produkcyjny (dowodzenie, komunikacja, wycofanie): ops-sre-incidents. Objawy serwera i sieci (DNS, TLS,
  porty, procesy): ops-linux-networking. Wydajność: qa-performance-testing, eng-algorithms-data-structures.
- Zgłoszenie z zewnątrz (kategoria, odtworzenie, brief dla wykonawcy): proc-issue-triage. Niestabilne testy w CI
  (kwarantanna, metryki): qa-regression.

## Checklista
- [ ] objaw opisany z pełnym komunikatem, wersją i środowiskiem
- [ ] błąd odtworzony testem, który był czerwony z właściwego powodu
- [ ] hipotezy z eksperymentami w dzienniku; jedna zmiana naraz
- [ ] przyczyna źródłowa nazwana i udowodniona (test, commit, pomiar)
- [ ] poprawka bez maskowania; cały zestaw testów zielony; podobne miejsca sprawdzone

## Źródła
- A. Zeller, *Why Programs Fail* i debuggingbook.org (metoda naukowa, łańcuch defekt → infekcja → awaria, delta debugging)
- D. J. Agans, *Debugging: The 9 Indispensable Rules*
- git-scm.com/docs/git-bisect (`git bisect run`, kod 125); zachowanie sprawdzone na git 2.43 (2026-10-03)
Opisane własnymi słowami.
