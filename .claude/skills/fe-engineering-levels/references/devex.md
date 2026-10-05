# Developer Experience (DevEx)

> **Spis treści:** Definicja · Dlaczego to ma znaczenie biznesowe (nie tylko dla… · Model tight-loose (governance) · Trzy źródła danych o DevEx · Metryki: FLOW i DORA · Antywzorce (5 typowych błędów) · 9 praktyk poprawy DevEx (z artykułu signadot) · Model AI-readiness (5 kryteriów, z conlea.pl) · Praktyczny plan wdrożenia (5–6 kroków, z… · Kiedy stosować tę wiedzę

Źródła: networkperspective.io/devex-polska/procesy-developer-experience, blog.conlea.pl/jak-developer-
experience-devex, medium.com/@signadot/how-to-improve-and-measure-devex-in-your-organization — opisane własnymi
słowami. DevEx nie jest specyficzne dla frontendu; ten plik opisuje je jako kompetencję Staff/Principal.

## Definicja

DevEx to **„niewidzialna infrastruktura”** — całość warunków, procesów i narzędzi wpływających na to, jak
łatwo, szybko i bez frustracji programista przechodzi od pomysłu do działającego, wdrożonego kodu. Można to
też ująć jako **„UX organizacji technologicznej”**: tak jak UX mierzy, jak łatwo użytkownikowi korzystać z
produktu, DevEx mierzy, jak łatwo inżynierowi korzystać z wewnętrznych systemów, procesów i narzędzi swojej
firmy.

To nie jest tylko „dobre IDE” czy „szybkie CI” — DevEx obejmuje cały cykl: onboarding, jakość dokumentacji,
czas oczekiwania na review, stabilność środowisk testowych, jakość komunikacji między zespołami, jasność
priorytetów.

## Dlaczego to ma znaczenie biznesowe (nie tylko dla samopoczucia inżynierów)

Cytowane w źródłach szacunki (traktuj jako orientacyjne, zależne od branży/firmy, nie jako uniwersalną
stałą):
- Organizacje z dobrym DevEx notują **40–50% krótszy cycle time** (czas od rozpoczęcia pracy nad
  zadaniem do wdrożenia na produkcję) i podobny rząd wielkości przyspieszenia ogólnego delivery.
- Dobrze zoptymalizowane pipeline'y CI/CD bywają nawet **10× szybsze** niż nieutrzymywane, co bezpośrednio
  skraca pętlę feedbacku programisty.

Mechanizm tego efektu: każde tarcie (friction) — wolny build, niejasny błąd, brak dokumentacji, flaky test —
kosztuje nie tylko czas, ale też **przełączenie kontekstu** (context switching), które jest nieproporcjonalnie
drogie kognitywnie. DevEx nie jest „polerowaniem” pracy inżynierskiej — jest usuwaniem realnego, mierzalnego
kosztu z każdej iteracji.

## Model tight-loose (governance)

Praktyczny model zarządzania DevEx polega na rozróżnieniu, co powinno być **ściśle** (tight) ustandaryzowane
w całej organizacji, a co można zostawić **swobodnie** (loose) do decyzji zespołu:

| | Tight (wspólny standard) | Loose (decyzja zespołu) |
|---|---|---|
| Przykłady | pipeline CI/CD, format commitów, polityka bezpieczeństwa, observability/logging | wybór edytora, wewnętrzna struktura folderów w ramach konwencji, sposób prowadzenia stand-upów |
| Cel | konsystencja, możliwość przenoszenia się między zespołami, mniejszy koszt utrzymania platformy | autonomia zespołu, brak narzucania rozwiązania niepasującego do lokalnego kontekstu |

Błąd w obie strony jest kosztowny: nadmierne „tight” (narzucanie wszystkiego centralnie) zabija autonomię i
tempo; nadmierne „loose” (brak żadnego standardu) tworzy fragmentację, która utrudnia rotację ludzi między
zespołami i podnosi koszt platformy wspierającej wszystkich.

## Trzy źródła danych o DevEx

1. **Dane automatyczne (telemetria)** — metryki z systemów (czas budowania, czas review, liczba
   deploy'ów, wskaźniki DORA — patrz niżej). Obiektywne, ale nie mówią „dlaczego”.
2. **Dane od ludzi (ankiety/wywiady)** — subiektywne odczucie tarcia, satysfakcji, frustracji. Mówią
   „dlaczego”, ale są podatne na bias i wymagają regularności, by wychwycić trend.
3. **Dane od AI/narzędzi analitycznych** — nowsza kategoria: automatyczna analiza wzorców w danych
   telemetrycznych i tekstowych (np. sentiment w retro/ankietach) w skali, której człowiek nie przeanalizuje
   ręcznie.

Żadne z tych źródeł osobno nie daje pełnego obrazu — telemetria bez kontekstu ludzkiego prowadzi do
optymizacji złej metryki (patrz „antywzorce” niżej); ankiety bez telemetrii nie pokazują, czy odczucie
odpowiada rzeczywistej zmianie.

## Metryki: FLOW i DORA

**FLOW** — metryki skupione na przepływie pracy przez system (nie na pojedynczym programiście):
- **Flow velocity** — tempo, w jakim praca przepływa przez pipeline (ile elementów pracy kończy się w danym
  okresie).
- **Flow efficiency** — proporcja czasu aktywnej pracy do czasu całkowitego (reszta to czekanie: na review,
  na CI, na decyzję).
- **Flow time** — całkowity czas od startu zadania do jego zakończenia.
- **Flow load** — ilość pracy w toku (WIP) — zbyt wysoki load rozprasza uwagę i wydłuża flow time
  nieproporcjonalnie (efekt kolejkowania, nie liniowy).

**DORA** (DevOps Research and Assessment) — metryki dostarczania uznawane za wskaźnik dojrzałości delivery,
nazwane w źródłach podejściem „ilościowym”. Aktualny zestaw (od raportu 2024 — pięć metryk: częstotliwość wdrożeń,
czas realizacji zmiany, czas przywrócenia po nieudanym wdrożeniu, odsetek nieudanych zmian, odsetek przeróbek
wdrożeń) z definicjami jest w **eng-continuous-delivery** — nie dubluj go tu. Źródła importu znały jeszcze wersję
czteroelementową z „time to restore service”.

**Uwaga o kompletności źródeł:** artykuł signadot, mimo tytułu obiecującego szerszy przegląd sposobów
mierzenia DevEx, w praktyce nazywa wprost i szczegółowo tylko DORA jako framework ilościowy — nie omawia
explicite frameworków SPACE ani DX Core 4, mimo że są to znane, publicznie dokumentowane alternatywne/
komplementarne modele pomiaru DevEx (SPACE: satisfaction, performance, activity, communication, efficiency;
DX Core 4: speed, effectiveness, quality, impact — łączy DORA, SPACE i DevEx). Nie zakładaj więc, że ten skill (czy źródłowy artykuł) wyczerpuje temat
metryk DevEx — SPACE/DX Core 4 są warte doczytania osobno, jeśli potrzebna jest pełna mapa dostępnych
frameworków.

## Antywzorce (5 typowych błędów)

1. **Mierzenie samej aktywności, nie wyniku** — liczba commitów/linii kodu jako proxy produktywności;
   premiuje szum, nie wartość.
2. **Metryki per-osoba użyte do oceny/rankingu jednostek** — DORA/FLOW są metrykami **systemu/zespołu**, nie
   narzędziem do rankingu programistów; użyte tak, wywołują gaming metryk i chowanie problemów.
3. **Zbieranie danych bez działania na nich** — ankiety/dashboardy, które nie prowadzą do żadnej zmiany,
   szybko tracą zaufanie zespołu i przestają dostawać szczere odpowiedzi.
4. **Rozwiązywanie problemu, zanim go zrozumiano** — wdrażanie narzędzia/procesu „bo inni tak robią” bez
   wcześniejszej diagnozy, gdzie faktycznie jest tarcie w tej konkretnej organizacji.
5. **Traktowanie DevEx jako projektu jednorazowego** — wdrożenie ankiety/dashboardu raz i uznanie tematu za
   zamknięty, zamiast ciągłego procesu.

## 9 praktyk poprawy DevEx (z artykułu signadot)

Skrót — praktyki, jakie artykuł wskazuje jako konkretne działania poprawiające DevEx (nie tylko mierzące):
usuwanie ręcznych, powtarzalnych kroków (automatyzacja onboardingu, self-service środowisk), skracanie
pętli feedbacku (szybsze testy/build, środowiska per-branch/preview), redukcja flaky testów, jasna i
aktualna dokumentacja wewnętrzna, standaryzacja tooling'u w duchu modelu tight-loose (patrz wyżej), aktywne
usuwanie „toil” (praca operacyjna bez wartości rozwojowej), inwestycja w platform engineering (wewnętrzne
platformy self-service zamiast ręcznego ticketowania do innych zespołów), regularne, jakościowe (nie
tylko ilościowe) zbieranie feedbacku od zespołów, oraz świętowanie/komunikowanie usunięcia konkretnego
tarcia — żeby zespół widział, że zgłoszony problem faktycznie prowadzi do zmiany (zamyka pętlę z
antywzorcem 3 powyżej).

**Zasada nadrzędna z tego źródła:** „identyfikuj ból, zanim zaczniesz go rozwiązywać” — narzędzie/proces
wdrożony bez wcześniejszej diagnozy realnego problemu w konkretnym zespole z dużą szansą trafia w złe
miejsce, nawet jeśli sam w sobie jest dobrą praktyką gdzie indziej.

## Model AI-readiness (5 kryteriów, z conlea.pl)

Kryteria, według których organizacja może ocenić, czy jej DevEx/procesy są gotowe na efektywne wykorzystanie
AI w pracy inżynierskiej (a nie tylko „mamy dostęp do narzędzia AI”):
1. **Jakość i dostępność danych/kontekstu** — czy AI ma dostęp do aktualnej dokumentacji, historii kodu,
   konwencji zespołu, czy działa w informacyjnej próżni.
2. **Standaryzacja procesów** — powtarzalne, dobrze zdefiniowane procesy są łatwiejsze do wspomagania/
   automatyzacji przez AI niż chaotyczne, ad-hoc.
3. **Jakość istniejącego kodu/architektury** — AI wspomaga szybciej dobrze ustrukturyzowany kod; dług
   techniczny i niekonsystencja utrudniają skuteczne wsparcie AI tak samo, jak utrudniają je ludziom.
4. **Kultura feedbacku i iteracji** — organizacja musi mieć nawyk oceniania i korygowania wyników (w tym
   wyników AI), nie tylko akceptowania ich bez weryfikacji.
5. **Bezpieczeństwo i governance danych** — jasne zasady, jakie dane/kod mogą trafić do narzędzi AI, żeby
   przyspieszenie nie tworzyło nowego ryzyka compliance/bezpieczeństwa.

## Praktyczny plan wdrożenia (5–6 kroków, z networkperspective.io)

1. **Zdiagnozuj, zanim wybierzesz narzędzie** — zbierz dane (telemetria + ankiety) o tym, gdzie faktycznie
   jest tarcie w tej konkretnej organizacji, zamiast kopiować rozwiązanie z innej firmy.
2. **Ustal model tight-loose** — zdecyduj świadomie, co jest wspólnym standardem, a co autonomią zespołu,
   zamiast zostawiać to przypadkowi.
3. **Wybierz mały zestaw metryk (FLOW + DORA)** i zacznij je zbierać systematycznie, zanim inwestujesz w
   duże zmiany procesu.
4. **Wdrażaj zmiany iteracyjnie, małymi krokami**, mierząc efekt każdej zmiany — nie jeden duży „program
   transformacji DevEx” wdrożony naraz.
5. **Zamknij pętlę z zespołem** — komunikuj, jaka zmiana wynikła z ich feedbacku (antywzorzec 3 i praktyka
   „świętowania” wyżej) — to, co utrzymuje szczerość kolejnych ankiet.
6. **Traktuj to jako proces ciągły**, nie projekt z datą zakończenia — powtarzaj cykl diagnoza → zmiana →
   pomiar regularnie.

## Kiedy stosować tę wiedzę

Poziom Staff/Senior Staff to zwykle pierwszy poziom, na którym inżynier ma realny wpływ na DevEx całego
zespołu/domeny (nie tylko własnej pracy) — patrz `staff.md`. Poziom Principal zwykle wpływa na DevEx całej
organizacji technologicznej i decyduje o wyborze platform/standardów na tym poziomie — patrz
`principal.md`.
