---
name: proc-project-planning
description: Użyj przy planie projektu dla sponsora — cel i zakres, koszt i termin jako przedziały, zapas, ryzyka, kamienie milowe.
metadata:
  katalog: "Użyj przy planowaniu projektu przed startem lub przy ponownym planowaniu — cel i miara sukcesu, zakres i „poza zakresem”, szacowanie kosztu i terminu jako przedziałów (stożek niepewności, klasa referencyjna, szacunek trzypunktowy), budżet z zapasem na ryzyka, zasoby i role (RACI), interesariusze i komunikacja, rejestr ryzyk, kamienie milowe, finansowanie etapami, reakcja na opóźnienie (prawo Brooksa), dobór modelu cyklu życia (kaskadowy, V, spiralny, Agile, DevOps, pętla AI-native). Nie do prognozy przepustowości zespołu z danych (proc-agile), decyzji, co budować (proc-product-discovery), szacunków technicznych architekta (arch-architect-practice) ani kosztów chmury (ops-finops)."
  slowa: "plan projektu, model cyklu życia, model V, model kaskadowy, waterfall, model spiralny, harmonogram, budżet projektu, ile to będzie kosztować, kiedy będzie gotowe, termin, kamienie milowe, rejestr ryzyk, karta projektu, sponsor, kierownik projektu, szacowanie projektu, opóźniony projekt, dołożyć ludzi"
---

# Planowanie projektu

Plan projektu odpowiada sponsorowi na pytania **po co, co, za ile, do kiedy, kto i co może pójść źle** — z jawną
niepewnością. Backlog, iteracje i prognozy z przepustowości są w proc-agile; tu jest rama, w której zespół pracuje.
Artefakt: `docs/project/01-discovery/project-plan.md` (szablon w core-project-record). Decyzje o budżecie, terminie
i zakresie podejmuje człowiek (bramka B1 w core-delivery-lifecycle); agent przygotowuje warianty i liczby.

## Zasady
1. **Cel i miara sukcesu przed zakresem.**
   - Wynik biznesowy z miarą, np. „80% rezerwacji bez telefonu do recepcji w 3 miesiące od startu”, a nie lista funkcji.
   - Zakres zawsze z sekcją **„poza zakresem”**.
   - Ograniczenia (budżet, data, regulacje) zapisujesz jako dane wejściowe, nie jako szacunek.
2. **Szacunek to przedział z datą i poziomem pewności, nigdy jedna liczba.**
   - Podawaj P50 i P80, np. „P50: 11 tygodni, P80: 15 tygodni, stan na 2026-10-03”.
   - **Stożek niepewności** (McConnell): na etapie pomysłu szacunek może się mylić od 0,25× do 4×, a zawęża się
     dopiero z decyzjami (zakres, wymagania, szkielet działający end-to-end).
   - Na etapie pomysłu zamiast liczby punktowej proponujesz najpierw tanie odkrywanie, które zawęzi przedział.
3. **Najpierw widok z zewnątrz, potem od środka.**
   - Prognozowanie klasą referencyjną (Flyvbjerg):
     1. wybierz klasę podobnych, zakończonych projektów;
     2. ustal rozkład ich wyników (koszt i czas: plan względem rzeczywistości);
     3. umieść swój projekt w tym rozkładzie.
   - Dopiero potem rozbijasz pracę na części i szacujesz je trzema punktami.
   - Projekty IT mają **gruby ogon przekroczeń**: w badaniu 5392 projektów rozkład był potęgowy, z nielicznymi
     przekroczeniami wielokrotnymi. Suma szacunków części zaniża wynik.
4. **Szacunek trzypunktowy** (konwencja PERT) dla części:
   - wartość oczekiwana E = (O + 4M + P) / 6, odchylenie σ ≈ (P − O) / 6;
   - sumuj wartości E, nie „najbardziej prawdopodobne” M, bo rozkłady są prawoskośne;
   - przedział z sumy wariancji zakłada niezależność części, więc jest za wąski — koryguj go klasą referencyjną.
   - Przykład liczbowy: `references/szacowanie.md`.
5. **Koszt całkowity:**
   - ludzie × czas × stawka;
   - środowiska i chmura (ops-finops), licencje;
   - modele AI dla zespołu agentów (core-cost-control);
   - **utrzymanie po wydaniu** (faza 9 w core-delivery-lifecycle), co najmniej na pierwszy rok;
   - podaj źródło stawek i założenia.
6. **Rezerwy jawne i osobne:**
   - na ryzyka zidentyfikowane (z rejestru, wyliczona z P × skutek);
   - kierownicza na nieznane, w dyspozycji sponsora.
   - Nie chowasz zapasu w szacunkach części.
7. **Kamienie milowe są sprawdzalne:**
   - opisujesz je wynikiem („szkielet end-to-end działa na środowisku testowym”, „pilotaż z 2 salami”),
     a nie procentem wykonania;
   - pierwszy kamień to szkielet i sprawdzenie największego ryzyka (spike).
8. **Finansowanie etapami:**
   - przykład etapów: odkrywanie → prototyp (alfa) → wersja z prawdziwymi użytkownikami (beta) → produkcja
     (wzór GOV.UK Service Manual);
   - po każdym etapie sponsor decyduje: kontynuacja, zmiana, stop;
   - prototyp z alfy wolno wyrzucić.
9. **Rejestr ryzyk:**
   - zapis przyczyna → zdarzenie → skutek;
   - prawdopodobieństwo i wpływ (1–5), reakcja, właściciel, **sygnał wczesny**, status;
   - reakcje na zagrożenie: unikaj, ograniczaj, przenieś, akceptuj (z rezerwą); na szansę: wykorzystaj, wzmocnij, współdziel;
   - przegląd przy każdym kamieniu milowym (proces wg ISO 31000: kontekst → identyfikacja, analiza, ocena → postępowanie →
     monitorowanie → raportowanie).
10. **Ludzie i role:**
    - realna dostępność osób (urlopy, inne projekty);
    - **RACI** z jednym „A” na decyzję;
    - interesariusze z planem komunikacji: kto, co, jak często, jakim kanałem;
    - decyzje biznesowe i prawne mają właściciela po stronie człowieka.
11. **Opóźnienie:**
    - **prawo Brooksa** — dołożenie ludzi do spóźnionego projektu zwykle go opóźnia (wdrożenie nowych osób, więcej
      komunikacji);
    - proponujesz kolejno: cięcie zakresu (MVP, priorytety), przesunięcie terminu, usunięcie przeszkód;
    - dodanie ludzi tylko do pracy dającej się wydzielić, z kosztem wdrożenia w planie.
12. **Plan żyje:**
    - prognozę aktualizujesz danymi z realizacji (przepustowość — proc-agile) przy każdym kamieniu milowym;
    - odchylenie poza przedział P80 to decyzja sponsora, nie cicha zmiana;
    - nowa wersja planu = nowa akceptacja (core-project-record).

## Model cyklu życia — dobór do projektu
| Model | Kiedy pasuje | Ryzyko, gdy nie pasuje |
|---|---|---|
| kaskadowy (sekwencyjny) | wymagania stałe i znane z góry, odbiór całości (umowa, przetarg), dużo dokumentacji wymaganej z zewnątrz | zmiana wymagań w trakcie jest droga; błędy wychodzą dopiero przy testach |
| model V | wymagana weryfikacja i walidacja każdego poziomu oraz **identyfikowalność** wymaganie → projekt → test (urządzenia medyczne, motoryzacja, lotnictwo) | ciężki przy niepewnych wymaganiach; łącz go z krótkimi iteracjami wewnątrz poziomów |
| spiralny (Boehm) | duży, nowatorski projekt z wysokim ryzykiem: każda pętla zaczyna się od analizy ryzyka i prototypu | narzut analizy przy małym projekcie |
| przyrostowy / iteracyjny, Agile (Scrum, Kanban) | wymagania się zmieniają, liczy się szybka informacja zwrotna od użytkowników (proc-agile) | bez celu i ram budżetu łatwo o niekończący się zakres |
| prototypowanie (RAD) | interfejs i przepływy trzeba sprawdzić z użytkownikami, zanim powstanie właściwy produkt | prototyp przechodzi na produkcję bez przepisania |
| DevOps / ciągłe dostarczanie | produkt żyje długo i zmienia się często; ten sam zespół buduje i utrzymuje (eng-continuous-delivery) | wymaga automatyzacji testów i wdrożeń od pierwszego kroku |
| pętla AI-native | agenci piszą kod szybciej niż ludzie przeglądają: artefakt po każdym etapie, plan przed kodem, ewaluacje, przegląd PR przez AI (core-delivery-lifecycle) | bez artefaktów i bramek tracisz ślad audytowy i kontrolę |

Modele się łączy: np. model V na poziomie wymagań i testów akceptacyjnych systemu regulowanego, a wewnątrz iteracje
z ciągłym dostarczaniem. Normy branżowe (np. IEC 62304 dla oprogramowania urządzeń medycznych) wymagają zwykle
udokumentowanego procesu i identyfikowalności, a nie konkretnego modelu — sprawdź wymagania normy dla projektu.

## Granice
- Jak zespół planuje sprinty, tnie historyjki i prognozuje z przepustowości: proc-agile; wiele zespołów: proc-safe.
- Co budować i po co (hipotezy, metryki produktu, priorytety funkcji): proc-product-discovery.
- Szacunki pojemności systemu i decyzje architektoniczne: arch-system-design, arch-architect-practice.

## Checklista
- [ ] cel z miarą sukcesu; zakres z „poza zakresem”; ograniczenia jako dane wejściowe
- [ ] koszt i termin jako P50/P80 z datą; źródło: klasa referencyjna + szacunek części
- [ ] rezerwa na ryzyka i rezerwa kierownicza osobno
- [ ] kamienie milowe ze sprawdzalnym kryterium; pierwszy = szkielet + największe ryzyko
- [ ] rejestr ryzyk z właścicielami i sygnałami wczesnymi
- [ ] RACI z jednym A; plan komunikacji; decyzje do podjęcia przez sponsora wypisane

## Źródła
- PMI, *PMBOK Guide — Eighth Edition* i *The Standard for Project Management* (listopad 2025): 6 zasad, 7 obszarów
  wyników — pmi.org/standards/pmbok; PMI: karta projektu, reakcje na ryzyka — pmi.org/learning/library
- S. McConnell, stożek niepewności — construx.com/books/the-cone-of-uncertainty (dostęp 2026-10-03)
- B. Flyvbjerg, prognozowanie klasą referencyjną (PMI Learning Library); B. Flyvbjerg i in., rozkład przekroczeń
  kosztów 5392 projektów IT — arxiv.org/abs/2210.01573
- B. W. Boehm, „A Spiral Model of Software Development and Enhancement”, IEEE Computer, 1988; V-Modell XT
- GAO-20-195G *Cost Estimating and Assessment Guide* (2020): 12 kroków szacunku, rezerwy — gao.gov
- ISO 31000:2018 (proces zarządzania ryzykiem); GOV.UK Service Manual (etapy discovery, alpha, beta, live)
- F. P. Brooks, *The Mythical Man-Month* (1975)
Opisane własnymi słowami.
