---
name: ddd-archetypes
argument-hint: "[archetyp] [wymagania]"
description: Użyj przy archetypach biznesowych — strony, dostępność i rezerwacje, ilości i pieniądze, produkt, księgowanie, cennik, kolejka.
metadata:
  katalog: "Użyj, gdy modelujesz, mapujesz wymagania na archetyp lub analizujesz (także istniejący kod) obszar ze sprawdzonym wzorcem biznesowym — strony i relacje, dostępność i rezerwacje, ilości i pieniądze, produkt, księgowanie, cennik, konfigurator, kolejka oczekujących, przydział zasobów, planowanie etapów. Nie do domen czysto technicznych ani nowatorskich bez wzorca."
  slowa: "program lojalnościowy, punkty lojalnościowe, saldo, wygasanie punktów, rezerwacja zasobu, dostępność terminu, cennik, rabat, kolejka oczekujących, przydział zasobów"
---

# Archetypy modeli biznesowych

Archetyp to sprawdzony, generyczny model problemu, który powtarza się w wielu branżach (dopracowywany m.in. przez
inżynierów systemów ERP i w wzorcach analitycznych Fowlera). Zamiast wymyślać model od zera, rozpoznajesz archetyp,
a specyfikę biznesu dokładasz **politykami i konfiguracją**. Efekt: system otwarty na rozszerzenia.

## Archetyp to nie wzorzec projektowy
Wzorce GoF to taktyczne, techniczne rozwiązania w kodzie, rozpoznawalne i stosowane jednakowo. Archetyp działa poziom wyżej:
to **sposób myślenia o modelu biznesowym**, stosowany strategicznie i taktycznie, z elastyczną implementacją.
Traktuj go jako **kierunkowskaz, nie gotowy plan** — szczegóły zależą od złożoności biznesu, skali, granic spójności
i regulacji.

## Kiedy sięgać
- **Strategicznie** — przyspiesza wyznaczanie kontekstów: problem wyceny → Pricing, wartość zmieniająca się w czasie →
  Accounting, użytkownicy i role → Party, dostępność zasobów → Availability (bywa nazywany Inventory). Pomaga oddzielić
  złożoność core domain od powtarzalnych wzorców operacyjnych.
- **Taktycznie** — podpowiada decyzje o agregatach i znane pułapki, np.:
  - Accounting: zamiast jednego wielkiego agregatu Konto z listą transakcji — w centrum **transakcja**, a konta są punktami
    odniesienia dla zapisów (transakcja zwykle dotyczy dwóch kont; lepiej się skaluje i oddaje rzeczywistość);
  - Party: adresy w agregacie strony czy osobno? Rozstrzyga pytanie o **reguły wymagające natychmiastowej spójności**
    między stroną a adresami; w dużej skali częściej osobno.
- Najlepiej: oprogramowanie szyte na miarę, modernizacja lub refaktoryzacja architektury, nowe systemy w klasycznych
  domenach (handel, finanse, logistyka, zdrowie, telekomunikacja, energetyka).

## Kiedy NIE sięgać
- **Domeny czysto techniczne** (firmware, sterowanie lotem) — brak klasycznych archetypów biznesowych.
- **Wdrażanie kupionego produktu** (ERP, CMS, BPMS) bez wpływu na model.
- **Legacy utrzymywane łatkami**, bez spójności architektury, gdy nie planujemy modernizacji.

## Sygnały, że archetyp pasuje
- Obszar leży po **prawej stronie Cynefin** (uporządkowany, znany w branży) — ddd-strategic-analysis.
- W modelu pojawiają się flagi i rozgałęzienia typu „a jeśli klient jest też dostawcą?”, „a jeśli auto jest w serwisie?”.
- Kilka produktów/procesów zadaje to samo pytanie kluczowe („czy zasób jest wolny?”, „kim jest ta strona?”) → modeluj
  **zdolność** (capability), nie produkt.

## Jak używać
1. Opisz problem poziomami (od najprostszego wymagania do najtrudniejszego) — jak w materiałach referencyjnych.
2. Rozpoznaj archetyp i sprawdź, które jego elementy są potrzebne. Nie wdrażaj całości „na zapas”.
3. Specyfikę biznesu wyraź politykami (np. kto może nadać rolę, ile relacji wolno mieć, czy zasób wolno wyłączyć).
4. Umieść archetyp jako osobny moduł/kontekst z małym interfejsem na krawędzi (ddd-context-mapping → moduł głęboki).
5. Zdecyduj o poziomie modelu:
   - **zdolność (capability)** — co w ogóle potrafimy (np. zasób może być zablokowany w czasie),
   - **operacje** — codzienne działania (zablokuj, zwolnij),
   - **polityki** — reguły konfigurujące operacje (kto, kiedy, ile),
   - **wsparcie decyzji** — analizy i rekomendacje na podstawie danych operacyjnych.

## Mapper — wspólny protokół (każdy archetyp)
Każdy plik `references/<archetyp>.md` to **procedura mapowania** wymagań na archetyp: test dopasowania → pytania → kroki →
kontrola decyzji → wynik. Ten protokół jest wspólny; pliki archetypów zawierają tylko to, co specyficzne. Wywołanie wprost:
„zmapuj na archetyp Accounting: <wymagania>” albo `/ddd-archetypes accounting <wymagania>`.

0. **Wymagania** — z argumentu; jeśli brak, z bieżącej rozmowy / `docs/project/` (areas, requirements); dopiero gdy nic nie ma —
   jedno pytanie o opis domeny.
1. **Test dopasowania** (sekcja pliku archetypu) — **przed** mapowaniem. Nie pasuje → krótka ocena „❌ nie pasuje” z powodami
   z wymagań i **stop**. Jeśli sygnały jednoznacznie wskazują inny archetyp z katalogu — jedno zdanie „sprawdź X”; nic więcej.
   Przypadek graniczny → rozstrzygające pytanie z pliku.
2. **Pytania** — tylko o to, czego wymagania nie rozstrzygają: (A) standardowe decyzje archetypu, (B) **luki**: możliwości
   archetypu, o których wymagania milczą (myśl samodzielnie, lista w pliku to przykłady).
   - `AskUserQuestion`: do 4 pytań na wywołanie, decyzje jako **opcje projektowe**, nie założenia; ostatnia opcja zawsze
     **„To zależy”**. „To zależy” = **polityka zmienna**: archetyp przyjmuje *parametr* (np. `ważne_do`, `polityka_salda`),
     a jego wartość liczy warstwa reguł nad archetypem — nie modeluj tej logiki w archetypie.
   - W podagencie (bez rozmowy): nie zgaduj — zwróć pytania jako hot spoty, a w modelu oznacz decyzje jako (X).
3. **Mapowanie pojęć** — tabela `pojęcie domeny → element archetypu → uzasadnienie` + sekcja **„Niezmapowane pojęcia”**
   (zawsze obecna; „brak” też jest wynikiem). Niezmapowane pojęcie często wskazuje inny archetyp lub core.
4. **Kroki specyficzne** archetypu (z pliku).
5. **Kontrola decyzji (R/A/X)** — przed wynikiem wypisz każdą konkretną decyzję zawartą w modelu i jej źródło:
   **(R)** z wymagań · **(A)** odpowiedź na pytanie · **(X)** przyjęta po cichu. Decyzja (X) o małym wpływie (techniczna) →
   jawne założenie w „Uwagach”; (X) zmieniająca zachowanie biznesowe → **zapytaj przed oddaniem modelu** (w podagencie: hot spot).
6. **Wynik** wg formatu z pliku → `docs/project/02-domain/archetypes/<archetyp>-<obszar>.md` (nagłówek core-project-record,
   `artifact: archetype-model`, TL;DR, Otwarte pytania, Przekazanie).

Zasady wspólne:
- **Autoryzacja poza archetypem.** Archetyp zapisuje, co się stało, i pilnuje niezmienników strukturalnych. „Czy wolno?” zależne
  od tego *kto*, *dlaczego* i *co jeszcze się dzieje* — warstwa aplikacji/polityk, która potem woła archetyp. Wyjątek:
  bezwarunkowe ograniczenia liczbowe („saldo nigdy < 0”) może egzekwować sam archetyp.
- **Polityka zmienna przychodzi z zewnątrz** jako parametr operacji — archetyp wykonuje ją mechanicznie.
- **Minimum, które odpowiada na wymagania** — nie wdrażaj całego archetypu „na zapas”; brakujące elementy to przyszłe rozszerzenia.
- Archetypy się składają — gdy mapowanie odsłania inny archetyp (np. Quantity w Product), odnotuj i odeślij do jego pliku.
- Koszt: czytaj tylko plik wskazanego archetypu; mapowanie dużych materiałów zlecaj podagentowi (`*-ddd-analyst`), a rozmowę prowadź w głównym wątku.

## Katalog
| Archetyp | Rozpoznasz po | Istota rozwiązania | Szczegóły |
|---|---|---|---|
| **Party** (strony i relacje) | użytkownik/klient/lead/partner/dostawca, osoby i firmy, działy, „w imieniu” | jedna strona (osoba, organizacja, jednostka), wiele ról; relacje jako osobne byty z rolami po obu stronach | `references/party.md` |
| **Availability** (dostępność) | podwójne rezerwacje, serwis/przestój, blokady czasowe, „czy wolne?” | jeden kontrakt zablokuj/zwolnij/wyłącz; wariant czasowy (segmenty) lub prosty (blokada „teraz” z wygasaniem) | `references/availability.md` |
| **Quantity / Money** | liczby z jednostką lub walutą, zaokrąglenia, podział kwot | obiekt wartości: wartość + jednostka/waluta, arytmetyka tylko dla zgodnych jednostek, jawne zaokrąglanie | `references/quantity-money.md` |
| **Product** | katalog, warianty, numery seryjne, partie, kolumny-cechy | typ vs egzemplarz vs partia vs pozycja w ofercie; strategia śledzenia; cechy jako dane z ograniczeniami | `references/product.md` |
| **Accounting** | salda, punkty, limity, rozrachunki, storna, „skąd to saldo?” | konta, zapisy debet/kredyt, transakcje bilansujące się do zera, odwrócenia zamiast edycji, reguły księgowania | `references/accounting.md` |
| **Pricing** | cenniki, odsetki, opłaty, promocje w `if`-ach | nazwane kalkulatory z typem, parametrami i opisem; nowa stawka = dane, nowy sposób liczenia = nowy typ | `references/pricing.md` |
| **Configurator** | opcje z zależnościami „nie razem / tylko razem / jedna z” | deklaratywne reguły + proces konfiguracji + solver SAT sprawdzający możliwe dokończenia | `references/configurator.md` |
| **Waitlist** | ograniczona podaż, kolejka chętnych, priorytety | lista z pojemnością, FIFO lub priorytetowa; „zasób zwolniony → następny z listy” | `references/waitlist.md` |
| **General assignment** | przydział zadań do zasobów o różnych cechach | wielowymiarowy problem plecakowy: maksymalna wartość przy dopasowaniu wymagań do zasobów | `references/general-assignment.md` |
| **Planning / Parallelization** | etapy z zależnościami, „co można robić równolegle”, ścieżka krytyczna, kary za opóźnienia | graf etapów → sortowanie topologiczne na poziomy równoległe; zależności jawne i niejawne (wspólny zasób); harmonogram | `references/planning.md` |

**Algorytm pod spodem** (ddd-algorithm-recognition): Availability → nakładanie przedziałów (drzewo przedziałów / ograniczenie
wykluczające w bazie) · General assignment → plecak wielowymiarowy / przydział · Planning → sortowanie topologiczne, ścieżka
krytyczna · Configurator → SAT/CSP · Waitlist → kolejka priorytetowa · Pricing, Accounting → transformacje (bez algorytmu).
Archetyp daje **model**, algorytm — **silnik** zamknięty za interfejsem archetypu.

Archetypy się łączą: Product używa Quantity, Pricing zwraca Money, Waitlist współpracuje z Availability,
General assignment planuje, a Availability blokuje, Accounting księguje skutki finansowe.

Pozostałe obszary z katalogu archetypów (bez szczegółowego opisu tutaj): struktury geograficzne, usługi i zasoby,
procesy i czynności, umowy i rezerwacje, dokumenty, produkcja i zaopatrzenie. Modeluj je pytaniami z ddd-deep-modeling
i nie zakładaj, że archetyp pasuje 1:1 — potwierdź z ekspertem.

## Archetypy w warstwach i technologiach
Ten skill mówi **co** modelować. Postać archetypu w poszczególnych warstwach (domena, krawędź, integracja, odczyt, UI),
twarde zasady dla UI i sygnały w kodzie dowolnego języka: `references/layers.md`. **Jak** to zapisać w danym języku
i frameworku — skille `lang-*` i `fw-*` (sekcja „Pojęcia domenowe w …”); łączenie wg `core-skill-composition`.

Źródło archetypów: repozytorium Software-Archetypes/archetypes (B. Słota, J. Pilimon, CC BY-NC-SA 4.0) — opisane tu własnymi słowami, bez kopiowania kodu.
Planning, rozdział optymalizacja/symulacja i uwagi „w kodzie”: na podstawie analizy przykładowego systemu SmartSchedule z kursu Domain Drivers (github.com/DomainDrivers/dd-typescript, repo bez licencji — tylko wnioski własnymi słowami).
