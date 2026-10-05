# Proces pisania dokumentacji technicznej

> **Spis treści:** Etapy · Zbieranie informacji · Projekt (plan) dokumentacji — co powinien zawierać · Weryfikacja i recenzja · Korekta (proofreading) — oddzielny przebieg od recenzji… · Przejmowanie dokumentacji napisanej przez kogoś innego · Podsumowanie (post-mortem) po zakończeniu pracy

Rozwinięcie hubu core-tech-docs. W projektach z dziennikiem `docs/project/` plan, statusy i przekazania prowadzi
core-project-record — tu tylko proces pisania samego dokumentu.

## Etapy

1. zbieranie informacji o opisywanym systemie,
2. tworzenie projektu/struktury dokumentacji,
3. pisanie treści,
4. weryfikacja,
5. poprawki i uzupełnianie braków.

Etapy 4 i 5 zwykle powtarzają się kilkakrotnie, aż do usunięcia wszystkich usterek — to nie jest liniowy,
jednorazowy przebieg.

Nie pisz dokumentu liniowo od pierwszego do ostatniego akapitu. Lepiej: rozpisz najpierw pełną strukturę
(rozdziały → podrozdziały → pod-podrozdziały, i tak dalej), a potem wypełniaj treścią kolejne węzły tej
struktury. Zalety: (1) gdy trafisz na fragment, którego nie możesz w danym momencie napisać (np. czekasz na
konsultację z developerem), zaznaczasz to i przechodzisz do innego węzła, zamiast blokować całą pracę; (2)
na pierwszy rzut oka widać stan prac — co gotowe, co wymaga uzupełnienia, co nawet nie zaczęte; (3) unikasz
sytuacji, w której cała treść jest już napisana, ale okazuje się, że układ powinien być inny.

## Zbieranie informacji

Trzy główne źródła, zwykle łączone:
- czytanie już istniejących fragmentów dokumentacji,
- praca z samym programem i analiza kodu źródłowego,
- konsultacje (zazwyczaj z developerami, którzy stworzyli system).

Gdy sam po raz pierwszy uruchamiasz/używasz systemu jako „użytkownik” — **zapisuj wszystko, co sprawiło
trudność**. Bardzo prawdopodobne, że realny użytkownik natknie się na te same trudności — to naturalny
sygnał, które miejsca opisać ze szczególną dokładnością.

Zawsze pracuj na **aktualnym kodzie rozwojowym**, nie na starej wersji ani na okrojonej wersji demo. Jeśli
system nadal się zmienia w trakcie pisania dokumentacji, poproś developerów o krótkie, regularne (np.
dzienne) informacje o zmianach — nie muszą to być szczegółowe raporty, wystarczy jedna linia typu "zmieniłem
klasę taką i taką"; ty sam oceniasz, czy dana zmiana wymaga aktualizacji dokumentu.

### Konsultacje z developerami — jak je prowadzić efektywnie

- Konsultuj się najpierw z osobą **najniżej w hierarchii**, która może znać odpowiedź (programista → szef
  zespołu → kierownik projektu), dopiero gdy niższy poziom nie potrafi odpowiedzieć. Powód: czas osób wyżej
  w hierarchii jest cenniejszy dla organizacji.
- **Przygotuj się przed rozmową** — dowiedz się samodzielnie tyle, ile się da, żeby zadawać precyzyjne
  pytania i lepiej rozumieć odpowiedzi. Przygotuj konkretną listę pytań i wyślij ją rozmówcy z
  wyprzedzeniem, żeby mógł się przygotować.
- Przy rozmowie z kimś, kto ma mało czasu — użyj nagrania zamiast notatek robionych w trakcie (ale
  **zapowiedz to od razu na początku rozmowy**, nigdy w połowie, i nigdy bez zapowiedzi). Notatki
  robione „na bieżąco” zabierają rozmówcy czas na bezproduktywne przerwy; nagranie pozwala zachować naturalne
  tempo rozmowy.
- Jeśli osoba nigdy nie ma czasu — poproś, żeby **sama zaproponowała termin**. Jeśli to nie pomaga po kilku
  próbach, poszukaj innej osoby ze tą wiedzą; jeśli to niemożliwe, zgłoś problem swojemu przełożonemu.
- Na koniec konsultacji zawsze zadaj: **„czy jest coś jeszcze, o czym powinienem wiedzieć?”** — to pytanie
  regularnie wyciąga informacje, o które sam nie zapytałbyś, bo nie przyszłyby ci do głowy.
- Jeśli czas na spotkanie się kończy, a temat nie jest zamknięty — nie przeciągaj, tylko ustal kolejny
  termin.
- **Dodaj informacje z konsultacji do dokumentacji od razu po jej zakończeniu.** Odkładanie tego grozi
  problemami z rozszyfrowaniem własnych skróconych notatek później.

## Projekt (plan) dokumentacji — co powinien zawierać

- tytuł dokumentacji,
- rodzaj dokumentacji (np. podręcznik użytkownika, dokumentacja API, runbook),
- przewidywana data zakończenia,
- autor(zy),
- krótki opis zakresu — co dokumentacja będzie zawierać,
- szacunkowa liczba stron (najlepiej przez porównanie z istniejącymi, podobnymi dokumentami),
- spis głównych rozdziałów,
- terminy kamieni milowych.

### Kamienie milowe

Zwykle wystarczą dwa:
- **pierwszy** — gdy ok. 2/3–3/4 tekstu jest napisane, a miejsca docelowe dla rysunków/zrzutów ekranu są
  już zaznaczone (nie muszą być wypełnione).
- **drugi** — gdy praktycznie cały tekst i (prawie) wszystkie ilustracje są już w dokumencie, a usterki z
  weryfikacji po pierwszym kamieniu są poprawione.

Kamień milowy to moment, w którym dokumentacja trafia do weryfikacji/recenzji — nie koniec pracy.

### Znacznik miejsc niedokończonych

Ustal **jeden, konsekwentny symbol** (np. `TBD`) dla miejsc wymagających uzupełnienia, zamiast ad hoc opisów
(„do uzupełnienia”, „sprawdzić później” itp.). Powód jest czysto praktyczny: dzięki jednemu, stałemu ciągowi
znaków wszystkie niedokończone miejsca w całym dokumencie da się znaleźć jednym wyszukiwaniem.

## Weryfikacja i recenzja

Weryfikacja obejmuje:
- dokładne przeczytanie w poszukiwaniu błędów,
- sprawdzenie, czy zrzuty ekranu odpowiadają temu, co faktycznie widać w opisywanym momencie,
- **wykonanie procedur/instrukcji z dokumentacji** i sprawdzenie, czy rzeczywiście dają opisany rezultat
  (nie zakładać, że opis jest poprawny — przetestować go jak kod),
- przekazanie do recenzji i zebranie uwag.

Pożyteczne jest też poproszenie kogoś **bez głębokiej wiedzy o systemie** o przeczytanie i sprawdzenie, że
wszystko zrozumiał — autor dokumentacji może przeoczyć coś „oczywistego dla niego”, a recenzent dobrze
znający system może nie zauważyć tego braku, bo sam nie potrzebuje tego wyjaśnienia.

### Trzy metody zbierania opinii recenzentów

1. **Wspólne spotkanie** (najbardziej efektywne przy niewielkiej liczbie recenzentów) — wszyscy razem
   przechodzą przez rozdziały/akapity, uwagi zgłaszane na głos są od razu rozpatrywane przez cały zespół.
   Ryzyko: rozmowa łatwo odbiega od tematu, zwłaszcza gdy jest więcej uczestników — przy większej grupie
   warto wyznaczyć **moderatora** (osobę niebiorącą udziału w recenzji), który tylko pilnuje trzymania się
   tematu, nie zabiera głosu merytorycznie.
2. **Rozesłanie i konsolidacja** — dokumentacja idzie do wszystkich recenzentów równolegle, uwagi wracają
   osobno, autor je konsoliduje. Wymaga uwagi przy **sprzecznych sugestiach**: poinformować obu autorów
   sprzecznych uwag o sytuacji i poprosić o przemyślenie stanowiska drugiej strony; jeśli nikt nie ustępuje
   i autor dokumentacji nie ma własnego zdania — skłaniać się do propozycji osoby wyżej w hierarchii, ale
   jeśli to autor osobiście preferuje wersję osoby niżej w hierarchii — skonsultować to ze swoim przełożonym
   przed decyzją.
3. **Przekazywanie sekwencyjne** — dokumentacja + uwagi każdego kolejnego recenzenta trafiają do
   następnego, więc każdy (poza pierwszym) widzi też uwagi poprzedników. Najdokładniejsza, ale najbardziej
   czasochłonna metoda.

Gdy dokument idzie do **powtórnej** recenzji — zawsze zaznacz, co zmieniło się od poprzedniej wersji, żeby
recenzenci nie musieli czytać wszystkiego od nowa.

Po oddaniu dokumentacji do produkcji następuje jej „zamrożenie” — dalsze zmiany idą do erraty (dołączanej
osobno), a nie z powrotem do zamrożonego dokumentu; właściwe poprawki trafiają do następnej wersji.

**Zbieraj uwagi od realnych odbiorców** po dostarczeniu im każdej gotowej części, a nie tylko od
recenzentów wewnętrznych — to źródło zarówno konkretnych poprawek, jak i sygnałów o potrzebie zmiany
przyjętych standardów (np. odbiorca prosi o większą czcionkę, bo ma słaby wzrok). Szczególnie ważne po
pierwszej dostarczonej części, z tych samych powodów co recenzje wewnętrzne.

Po wdrożeniu warto też monitorować, **z jakimi problemami odbiorcy zgłaszają się do supportu** — jeśli
dotyczą czegoś opisanego w dokumentacji, to sygnał, że dany fragment ma błąd, jest niejasny albo
niedostatecznie szczegółowy.

## Korekta (proofreading) — oddzielny przebieg od recenzji merytorycznej

- **Nigdy nie łącz** szukania błędów merytorycznych z szukaniem błędów literowych/gramatycznych/
  interpunkcyjnych w jednym przebiegu — to różne rodzaje uwagi i robione razem gorzej wychwytują oba typy
  błędów. Najpierw dopracuj merytorykę do końca, potem osobno przejdź korektę literową.
- Sam automatyczny spellchecker nie wystarcza — nie wykryje błędu, który przypadkiem zamienił jedno
  poprawne słowo w inne poprawne słowo.
- Do wychwytywania błędów literowych: **wydrukuj tekst** (albo przenieś do innego medium/formatu niż to, w
  którym pisano) — oko ludzkie łatwiej łapie błędy na papierze/w nowym kontekście niż w tym samym oknie
  edytora, w którym tekst był tworzony.
- Jedna z technik: czytaj akapity **od końca rozdziału do początku** — to wymusza skupienie na pisowni
  słowa po słowie, zamiast na sensie całości (przy czytaniu od początku mózg „doczytuje” sens i łatwiej
  przeoczyć literówkę).
- Szczególna uwaga podczas korekty literowej na: ortografię/gramatykę/interpunkcję, imiona i nazwiska,
  inicjały, tytuły, nazwy firm i inne nazwy własne, liczby, daty.
- Tekst po polsku: korektę zleć skillom txt-polish-correctness (poprawność) i txt-polish-style (redakcja) albo
  personie Stefan (edytor).

### Checklista przed wysłaniem do recenzentów

Zanim autor przekaże dokument do recenzji, powinien sam odpowiedzieć na:
- czy dokumentacja jest wystarczająco obszerna jak na obecny kamień milowy?
- czy informacje są właściwie zorganizowane/poukładane?
- czy informacje techniczne są dokładne?
- czy pojęcia, których czytelnik może nie znać, są wyjaśnione?
- czy język dokumentacji jest spójny?
- czy przykłady są dobrze dobrane i umieszczone w odpowiednich miejscach?
- czy numery stron w spisie treści/indeksie są poprawne?

## Przejmowanie dokumentacji napisanej przez kogoś innego

Przed dopisywaniem nowych rozdziałów:
- przeczytaj, co już jest napisane,
- jeśli możliwe, porozmawiaj z poprzednim autorem — czego nie zdążył napisać, co zamierzał zmienić,
- usiądź z developerami, zweryfikuj, że w dokumentacji nie ma błędów i dowiedz się, co nowego pojawiło się
  w systemie od czasu napisania istniejącej treści,
- sam obejrzyj/przetestuj opisywany system i oceń, na ile pasuje do obecnej treści dokumentu,
- dowiedz się, czy odbiorcy zgłaszali wcześniej uwagi lub prośby o zmiany.

## Podsumowanie (post-mortem) po zakończeniu pracy

Warto zrobić to zawsze, a przy pracy zespołowej — jako spotkanie. Pytania do zadania:
- ile czasu zajęło napisanie tej dokumentacji, a ile powinno zająć?
- jakie problemy przeszkadzały lub spowalniały pracę?
- co (np. jakie narzędzie) było pożyteczne i pomocne?
- które osoby były uczynne i chętne do pomocy?
- ile czasu pochłonęło samo czekanie na informacje?
- czy komunikacja między osobami piszącymi dokumentację była dobra?
- czy komunikacja z osobami udzielającymi konsultacji była dobra?
- co można zrobić, żeby następną dokumentację napisać lepiej lub szybciej?

Cel nie jest rytualny — to realny mechanizm poprawy procesu na następny raz, analogiczny do retro po
sprincie.
