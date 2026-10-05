---
name: eng-design-principles
description: Użyj przy decyzjach i review — KISS, YAGNI, DRY, SOLID, Demeter, kompozycja, zasady komponentów, konflikty zasad.
metadata:
  katalog: "Użyj przy każdej decyzji projektowej i przeglądzie kodu — KISS, YAGNI, DRY (i kiedy go nie stosować), SOLID, separacja odpowiedzialności, prawo Demeter, tell-don't-ask, kompozycja zamiast dziedziczenia, zasady komponentów (REP/CCP/CRP, ADP/SDP/SAP), fail fast, zasada najmniejszego zaskoczenia — oraz rozstrzyganie konfliktów między nimi. Nie do stylu nazw i funkcji (eng-clean-code)."
---

# Zasady projektowe

Zasady to **heurystyki, nie prawa**. Służą do wyboru prostszego z dwóch rozwiązań i do uzasadniania uwag w review.
Zawsze nazywaj zasadę i konkretny koszt, którego unikamy („YAGNI: ta abstrakcja ma jedną implementację i nie ma planu drugiej”).

## Zasady i jak je stosować
| Zasada | Pytanie kontrolne | Sygnał naruszenia |
|---|---|---|
| **KISS** — najprostsze rozwiązanie, które działa | Czy nowa osoba zrozumie to w 5 minut? | warstwy „na przyszłość”, generyczne frameworki dla jednego przypadku |
| **YAGNI** — nie buduj, zanim nie jest potrzebne | Czy jest wymaganie *teraz*? | parametry i interfejsy bez użycia, konfigurowalność, o którą nikt nie prosił |
| **DRY** — jedna wiedza, jedno miejsce | Czy to *ta sama wiedza biznesowa*, czy przypadkowo podobny kod? | reguła biznesowa skopiowana w 3 miejsca (np. rabat w UI i w serwisie) |
| **AHA / reguła trzech** — unikaj pochopnych abstrakcji | Czy widzę trzeci przypadek? | abstrakcja z flagami `if (typeA)` wewnątrz |
| **S**ingle Responsibility | Ile jest powodów do zmiany tej klasy/modułu? | zmiany z różnych działów trafiają do jednego pliku |
| **O**pen/Closed | Czy nowy wariant wymaga edycji istniejącego kodu? | `switch` po typie powtarzany w wielu miejscach → polityka/warianty |
| **L**iskov | Czy podtyp może zastąpić typ bez niespodzianek? | podklasa rzuca „not supported” |
| **I**nterface Segregation | Czy klient zależy od metod, których nie używa? | „tłuste” interfejsy serwisów |
| **D**ependency Inversion | Czy domena zależy od infrastruktury? | import frameworka/ORM w modelu domeny → port + adapter |
| **Separacja odpowiedzialności** | Czy UI, logika i dostęp do danych są rozdzielone? | zapytania HTTP/SQL w komponentach lub encjach |
| **Prawo Demeter** | Czy rozmawiam tylko z bezpośrednimi współpracownikami? | `a.getB().getC().doX()` |
| **Tell, don't ask** | Czy wyciągam dane z obiektu, żeby podjąć decyzję, którą mógłby podjąć sam? | `if (konto.getSaldo() >= kwota) konto.setSaldo(…)` zamiast `konto.obciąz(kwota)`; ale zapytania (gettery) do odczytu i prezentacji są w porządku — reguła nie nakazuje usuwać wszystkich getterów (Fowler) |
| **Zasada Hollywood** („nie dzwoń do nas, my zadzwonimy”) | Kto steruje przepływem: kod wysokiego poziomu czy szczegół? | moduł niskiego poziomu odpytuje lub wywołuje kod nadrzędny; rozwiązanie: odwrócenie sterowania (DI, zdarzenia, metoda szablonowa, haki cyklu życia frameworka) |
| **Hermetyzuj to, co się zmienia** | Która część zmienia się częściej niż reszta? | zmienny fragment (taryfa, format, dostawca) rozlany po wielu klasach → za interfejsem; tylko gdy zmienność jest realna (YAGNI) |
| **Kompozycja > dziedziczenie** | Czy dziedziczę zachowanie, czy tylko kod? | głębokie hierarchie, klasy bazowe z `protected` stanem |
| **Fail fast** | Czy błąd ujawnia się najbliżej przyczyny? | walidacja „gdzieś później”, ciche wartości domyślne |
| **Najmniejsze zaskoczenie** | Czy nazwa i zachowanie się zgadzają? | `get…()` ze skutkami ubocznymi |
| **Reguła skauta** | Czy zostawiam kod trochę lepszym? | ale: bez refaktoru „przy okazji” w tym samym commicie co funkcja |

Poziom komponentów (biblioteki, pakiety): zasady REP/CCP/CRP i ADP/SDP/SAP, metryki stabilności, polityka i szczegół,
framework na dystans, struktura krzycząca domeną, granice — `references/komponenty-i-granice.md`.

## Gdy zasady się kłócą
- **KISS/YAGNI > DRY** przy przypadkowym podobieństwie kodu — duplikacja jest tańsza niż zła abstrakcja.
- **DRY > KISS** dla **wiedzy biznesowej** (reguły, ceny, uprawnienia) — jedno źródło prawdy, nawet kosztem warstwy.
- **SOLID w granicy modułu, KISS wewnątrz** — interfejsy i odwrócenie zależności na krawędziach, proste funkcje w środku.
- Konwencje istniejącego projektu mają pierwszeństwo przed „ładniejszym” wzorcem — odstępstwo proponuj osobno.
- Przy remisie wybierz rozwiązanie **łatwiejsze do usunięcia** (odwracalność).

## Drabina minimalizmu (zanim dopiszesz kod)
Zrozum przepływ i wszystkich wywołujących (grep), potem zatrzymaj się na pierwszym szczeblu, który wystarcza:
1. Czy to w ogóle potrzebne teraz? (YAGNI)
2. Czy już jest w repozytorium?
3. Czy robi to biblioteka standardowa (JDK, `Array`/`Intl`/`structuredClone`)?
4. Czy robi to platforma lub framework (Angular: signals, `HttpClient`, formularze, pipe'y; Spring)?
5. Czy robi to zależność, którą już mamy?
6. Czy wystarczy jedna linia?
7. Dopiero teraz — najmniejszy kod, który działa.
- Błąd naprawiasz u źródła (we wspólnej funkcji), nie w każdym wywołującym.
- Zakazane bez drugiego przypadku: interfejs z jedną implementacją, fabryka jednego produktu, konfiguracja dla stałej,
  „rusztowanie na później”. Usunięcie jest lepsze niż dopisanie.
- **Nigdy nie upraszczasz kosztem:** walidacji na granicy zaufania, obsługi błędów grożących utratą danych,
  bezpieczeństwa, dostępności ani tego, o co człowiek wprost prosił. Nietrywialna logika zostawia co najmniej jeden test.
- Świadomy skrót znakujesz komentarzem `debt: <ograniczenie>, <kiedy wrócić>` (zbiera go eng-tech-debt-audit).
- W raporcie po kodzie najwyżej 3 linie „pominąłem X, dodać gdy Y”.
- Przegląd pod kątem nadmiaru: jedna linia na uwagę `L<linia>: <usuń|stdlib|platforma|yagni|skróć> <co> → <czym zastąpić>`,
  na końcu bilans linii; poprawność i bezpieczeństwo oceniasz osobno.
Inspiracja: [ponytail](https://github.com/DietrichGebert/ponytail) — opisane własnymi słowami, bez jego stałych hooków.

## W review
Uwaga = zasada + konkretny problem + propozycja. Bez „bo tak jest ładniej”. Uwagi stylistyczne automatyzuj (linter, formatter).

Konkretny kształt rozwiązania (wzorce GoF, ich lżejsze formy i kiedy ich NIE używać) — eng-design-patterns.

## Przykład
**Sytuacja:** review PR eksportu do CSV: interfejs `ReportExporter`, `ExporterFactory`, jedna implementacja, własne
formatowanie dat.
**Wynik:**
```text
L12: yagni interfejs ReportExporter (1 implementacja) → funkcja exportCsv(rows)
L31: usuń ExporterFactory → bezpośrednie wywołanie
L58: stdlib formatDate() → Intl.DateTimeFormat("pl-PL")
Bilans: −96 / +18 linii. Walidacja wierszy zostaje — granica zaufania.
```
Więcej przykładów: `references/przyklady.md`.
