# FAQ — Continuous Intelligence for the SDLC

Odpowiedzi na najczęstsze pytania o to, jak działa aplikacja. Opis odpowiada kodowi w tym repozytorium; tam, gdzie to pomaga, podajemy plik, w którym można sprawdzić szczegóły.

Spis treści:

1. [Ogólnie](#1-ogólnie)
2. [Źródła danych i tryb demo](#2-źródła-danych-i-tryb-demo)
3. [Hierarchia: epic, feature, story](#3-hierarchia-epic-feature-story)
4. [Analiza: reguły, AI, ustalenia](#4-analiza-reguły-ai-ustalenia)
5. [Gotowość i polityka](#5-gotowość-i-polityka)
6. [Decyzje](#6-decyzje)
7. [Zatwierdzenia](#7-zatwierdzenia)
8. [Dryf (zmiany po zatwierdzeniu)](#8-dryf-zmiany-po-zatwierdzeniu)
9. [Analiza wpływu](#9-analiza-wpływu)
10. [Harmonogram, webhooki, zdarzenia na żywo](#10-harmonogram-webhooki-zdarzenia-na-żywo)
11. [Dane, szyfrowanie i audyt](#11-dane-szyfrowanie-i-audyt)
12. [Bezpieczeństwo i dostęp](#12-bezpieczeństwo-i-dostęp)
13. [Ustawienia domyślne](#13-ustawienia-domyślne)
14. [CLI i CI/CD](#14-cli-i-cicd)
15. [Ekrany aplikacji](#15-ekrany-aplikacji)
16. [Problemy i ich rozwiązania](#16-problemy-i-ich-rozwiązania)

---

## 1. Ogólnie

**Do czego służy aplikacja?**
Sprawdza, czy specyfikacja jest gotowa do realizacji, zanim zespół zacznie pisać kod. Łączy zgłoszenia z Jira, strony z Confluence i ramki z Figmy w jeden graf kontekstu. Potem szuka luk, sprzeczności i niejasności, zadaje pytania i liczy gotowość każdego elementu.

**Z czego się składa?**
Z trzech pakietów:

- `packages/core` — silnik analizy;
- `packages/server` — API (Fastify), zapis danych, harmonogram, webhooki i CLI;
- `packages/web` — interfejs w React.

Przepływ danych pokazuje schemat w [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

**Czy aplikacja zmienia coś w Jira, Confluence albo Figmie?**
Nie. Tylko czyta. Decyzje, zatwierdzenia i historię trzyma u siebie (patrz [11](#11-dane-szyfrowanie-i-audyt)).

**Czy AI jest wymagane?**
Nie. Domyślnie dostawca AI to `none` i działa tylko analiza regułowa, która jest deterministyczna. AI dodaje recenzję semantyczną (patrz [4](#4-analiza-reguły-ai-ustalenia)).

## 2. Źródła danych i tryb demo

**Co aplikacja czyta ze źródeł?**

- **Jira:**
  - zgłoszenia z projektu (opcjonalnie zawężone filtrem JQL);
  - ich typ, opis i kryteria akceptacji (z pola wskazanego w *Settings → Acceptance criteria field*);
  - status, rodzica i powiązania;
  - komponenty i etykiety.
- **Confluence** — strony z podanych przestrzeni (*space keys*).
- **Figma** — ramki z podanych plików (*file keys*), ich teksty i przejścia prototypu.
- **Kod (rekonstrukcja tf)** — plik `reconstruction.json`, który tf zapisuje po odtworzeniu reguł i wymagań z kodu
  (`recon_export.py`). Ścieżkę do pliku na serwerze podajesz w *Settings → Integrations → Code (tf reconstruction)*,
  opcjonalnie z adresem repozytorium, żeby dowody linkowały do linii kodu. Aplikacja sama kodu nie czyta. Reguła lub
  wymaganie z dowodem `plik:linia`, którego tf nie podważył, może się nie zgadzać ze specyfikacją — wtedy `CON-001`
  pokazuje konflikt, np. „Jira: 30 s, kod: 45 s” z dowodem `Code src/payments/gateway.ts:1`. Założenia i pytania
  z rekonstrukcji są tylko kontekstem, a kod nigdy nie zastępuje brakującej specyfikacji (np. limitu ponowień).

**Jak elementy są ze sobą łączone?**
Graf kontekstu (`packages/core/src/graph.ts`) tworzy dwa rodzaje powiązań:

- **jawne:**
  - epic i rodzic;
  - powiązania zgłoszeń i linki zdalne;
  - wzmianki o kluczu zgłoszenia w tekście;
  - linki między stronami;
  - przejścia w prototypie;
  - oznaczenie „zastąpione przez”;
- **semantyczne:**
  - podobieństwo tekstu (TF-IDF);
  - przepływy Figmy rozpoznawane po prefiksie nazwy ramki.

Story dziedziczy projekt i dokumentację po swoim epicu, a task albo bug po swojej story.

**Co to jest tryb demo?**
To tryb domyślny. Pokazuje przykładowy projekt *Checkout* (klucz `CHK`, zgłoszenia `PAY-…`). Nie potrzebuje żadnych kluczy. Na ekranie *Drift* można uruchomić scenariusze zmian i zobaczyć detekcję dryfu:

- `timeout-change` — w Confluence timeout płatności zmienia się z 30 s na 60 s;
- `figma-remove-error` — z Figmy znika ramka „Add card / Error”;
- `story-card-limit` — w Jira PAY-123 pozwala zapisać 10 kart, a Confluence nie zostaje zaktualizowany;
- `release-planning` — w Jira produkt oznacza MVP etykietami `release:R1` i linkuje flagi: *Checkout Experience* dostaje poprawny plan, *Payment Reliability* plan z problemami (`REL-002`…`REL-006`).

**Jak przejść na prawdziwe dane?**

1. Ustaw tokeny w zmiennych środowiskowych serwera (patrz [12](#12-bezpieczeństwo-i-dostęp)).
2. W UI przejdź do *Settings → Workspace → Mode: Live*.
3. Włącz integracje i podaj adresy, klucz projektu, przestrzenie oraz pliki.
4. Kliknij *Test connections*, a potem *Save & re-analyze*.

## 3. Hierarchia: epic, feature, story

**Jakie poziomy hierarchii zna aplikacja?**
`epic → feature → story`, a dodatkowo `bug`, `task` i `subtask`. Poziom *feature* jest opcjonalny. Jeśli projekt go nie używa, hierarchia ma postać `epic → story`.

**Czy coś jest ustawione domyślnie? Muszę mapować typy zgłoszeń?**
Nie musisz, bo domyślne ustawienia działają od razu. Typ zgłoszenia z Jira zamieniamy na poziom w czterech krokach (`packages/core/src/hierarchy.ts`):

1. **Sub-task** (zgłoszenie oznaczone w Jira jako podzadanie) to zawsze `subtask`.
2. **Mapowanie z ustawień** (*Settings → Jira → Issue type mapping*). Nowa instalacja ma w nim domyślnie:

   | Typ w Jira | Poziom |
   |---|---|
   | Epic | epic |
   | Feature | feature |
   | Story | story |

3. **Domyślne mapowanie silnika** dla typów spoza ustawień: `Epic`, `Feature`, `Story`, `Bug`, `Task`, `Sub-task` i `Subtask` trafiają na odpowiadające im poziomy.
4. **Heurystyka po nazwie**: nazwa zawierająca „epic” to epic, „bug” to bug, „task” to task. **Każdy inny typ staje się story.**

Wielkość liter nie ma znaczenia. Przykład: jeśli w Twojej Jira funkcjonalność to typ „Capability”, dodaj w ustawieniach `Capability → feature`. Bez tego wpisu „Capability” zostanie potraktowane jak story.

**Jak liczona jest gotowość epica i feature?**
Epica ani feature nie ocenia się samodzielnie. Ich gotowość wynika ze story pod spodem, a w przypadku epica także ze story pod jego feature'ami (`blendEpicScores` w `analysis/analyze.ts`). Działa to tak:

- wyniki wymiarów i zdrowie epica są uśredniane z wynikami jego story;
- jeśli choć jedna story nie jest gotowa, epic lub feature ma co najwyżej status *needs attention*, a lista blokad pokazuje, które to story;
- jeśli zatwierdzona story zmieniła się od zatwierdzenia, epic pokazuje „Changed since approval, review needed”.

**A bugi, taski i subtaski?**

- **Bug** jest analizowany własnymi regułami `BUG-*` i można go zatwierdzić tak jak story.
- **Task** służy do sprawdzania pokrycia: reguła `COV-001` zgłasza kryterium akceptacji, którego nie realizuje żaden task.
- **Subtask** nie ma osobnej oceny.

## 4. Analiza: reguły, AI, ustalenia

**Jak przebiega analiza?**

1. Konektory normalizują dane do wspólnego modelu.
2. Z modelu powstaje graf kontekstu.
3. Dla każdego elementu budowany jest kontekst i wyciągane są *twierdzenia* (claims), np. „timeout = 30 s”.
4. Analizę wykonują trzy mechanizmy:
   - reguły deterministyczne;
   - opcjonalna recenzja AI;
   - analiza stanów UI i ścieżek użytkownika.
5. Wynikiem są **ustalenia** (findings) i **pytania** do zespołu, a na ich podstawie liczona jest gotowość.

**Jakie twierdzenia porównuje `CON-001`? Czy działa poza checkoutem?**
Zależy od słownika domeny projektu: *Settings → Workspace → Domain vocabulary* (`project.claimPack` w
`/api/settings`). Działa bez AI, na tekście źródeł.

| Słownik | Twierdzenia (atrybuty) | Przykład konfliktu |
|---|---|---|
| `general` (domyślny) | timeout, limit ponowień, idempotencja, tryb przetwarzania, czas sesji, limit elementów, rozmiar pliku | „Jira: timeout 30 s, Confluence: 45 s” |
| `ev` (ładowanie pojazdów) | wszystko z `general` oraz moc (kW), energia (kWh), wersja OCPP, docelowy uptime (%), definicja uptime (z planowanym serwisem czy bez), status złącza w danej sytuacji | „Jira: stacja 22 kW, Confluence: 11 kW”, „OCPP 1.6 vs 2.0.1”, „status złącza po wpięciu kabla: Preparing vs Available” |

Słownik `ev` powstał z glosariusza EV w tf (`dom-ev-glossary`, statusy złącza z `dom-ev-ocpp-16`/`dom-ev-ocpp-2x`,
definicje uptime z `dom-ev-kpi-analytics`). Rozumie synonimy i polskie formy: *charger*, *wallbox*, *ładowarka* i
*Charge Point* (OCPP 1.6) to stacja ładowania; *EVSE* i *punkt ładowania* to punkt ładowania; *złącze*, *Type 2*, *CCS2*
to złącze; sesja i transakcja to osobne podmioty. Jednostki są normalizowane (22000 W = 22 kW, 40000 Wh = 40 kWh,
3,7 kW), a `1.6J` to OCPP 1.6. Status złącza porównywany jest tylko w tej samej sytuacji (kabel wpięty, po zakończeniu
sesji, rezerwacja, awaria), więc „Available przed sesją” i „Finishing po sesji” nie są konfliktem. Zakresy („3,7–22 kW”)
i zdania o migracji („z OCPP 1.6 na 2.0.1”) nie dają twierdzeń. Zmiana słownika działa od następnej analizy. Szczegóły:
[`docs/CLAIM-PACKS-PLAN.md`](docs/CLAIM-PACKS-PLAN.md).

**Jakie są reguły?**
Pełna tabela jest w [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#rules). Rodziny reguł:

| Rodzina | Co sprawdza |
|---|---|
| `REQ-*` | kryteria akceptacji, cel story, mierzalne sformułowania, limity ponowień |
| `ERR-*` | zachowanie przy błędach, timeoutach, wygaśnięciu sesji, akcjach nieodwracalnych |
| `ARCH-*` | idempotencja płatności, stany przetwarzania asynchronicznego, zgodność z dokumentacją |
| `DES-*` | brak projektu w Figmie, brakujące stany UI |
| `DOC-*` | brak dokumentacji albo dokumentacja nieaktualna lub zastąpiona |
| `CON-001` | sprzeczne twierdzenia w różnych źródłach albo sprzeczność z decyzją |
| `COV-001` | kryterium akceptacji bez taska |
| `STORY-*` | kształt historyjki: jedna akcja jednego aktora, rozmiar, wartość zamiast warstwy technicznej |
| `AC-*` | kryteria akceptacji: format (domyślnie GWT), obserwowalny wynik, brak szczegółów implementacji, jedna akcja na scenariusz |
| `BUG-*` | kompletność zgłoszenia błędu, powiązana story, test regresji, przyczyna źródłowa |
| `DEP-001` | zależność od elementu, który nie jest gotowy |
| `EPIC-*` | cel epica, story, projekt, spójność zachowania |
| `REL-*` | plan wydania epica: MVP (linia R1) wyznaczone, z wynikiem i metryką, nie za duże, przekrój end-to-end, zależności zgodne z kolejnością linii, flagi na historyjkach |
| `DRIFT-001` | zmiana po zatwierdzeniu |
| `AI-001` | ustalenia recenzji AI |

Pojedyncze reguły można wyłączyć w *Settings → Policy → Disabled rules*.

**W jakim formacie pisać kryteria akceptacji?**
Opis historyjki („Jako … chcę … aby …”) mówi, kto, co i po co. Kryteria akceptacji pod nim mówią, kiedy historyjka
jest gotowa. Domyślnym formatem jest **GWT** (Given/When/Then, po polsku Zakładając/Gdy/Wtedy): każdy scenariusz
ma warunek początkowy, jedną akcję i wynik, który da się zobaczyć. Taki scenariusz jest gotowym przypadkiem testowym
i pozwala policzyć zachowania historyjki.

| Zapis | Jak go czyta ci_for_sdlc |
|---|---|
| Scenariusze GWT (EN albo PL, także w jednej linii) | każdy scenariusz to jedna jednostka `AC-n`; z „When/Gdy” powstaje akcja główna; działają wszystkie reguły `STORY-*` i `AC-*` |
| Zdania EARS („The system shall …”) | jedna jednostka na zdanie; przy domyślnym formacie GWT zgłasza je `AC-001` |
| Lista punktów | każdy punkt to jednostka `AC-n` (wolny tekst); `AC-001` (info, nie blokuje) sugeruje przepisanie na GWT, `AC-002` i `AC-003` działają, akcji z punktów nie liczymy |

Pełniejsza obsługa listy (propozycja przepisania na GWT przez AI) jest odłożona:
[`docs/BACKLOG-DEFERRED.md`](docs/BACKLOG-DEFERRED.md), G2-L1. Format i progi ustawisz w *Settings → Policy → Story
shape*: format AC (GWT, EARS, oba albo wyłączony — wtedy listy i wolny tekst nie dostają `AC-001`), maksymalna liczba
scenariuszy i akcji w historyjce oraz liczba story points, od której historyjka jest za duża (`STORY-002`). W API to
pole `policy.storyShape` w `PUT /api/settings`.

**Jak oznaczyć plan wydania (MVP) w Jirze?**
Reguły `REL-*` czytają plan z konwencji (kontrakt pdi 0.4.0):

| Co | Domyślnie | Inaczej (*Settings → Integrations → Jira*) |
|---|---|---|
| Linia wydania historyjki (R1 = MVP, potem R2, R3…) | etykieta `release:R1` | inny prefiks etykiety, fixVersion o nazwie `R1` albo własne pole |
| Flaga funkcji historyjki | etykieta `flag:payment-retry` (jak w ShipScope) | własne pole z kluczami flag |
| Wynik i metryka MVP | sekcja „MVP:” w opisie epica, np. „MVP: Klient ponawia płatność. Metryka: co najmniej 25% odzyskanych płatności w ciągu 30 dni.” | — |

Epic z co najmniej 3 historyjkami bez żadnej w R1 dostaje `REL-001`. Gdy MVP jest wyznaczone, `REL-002` sprawdza
sekcję „MVP” (wynik, próg, horyzont), `REL-003` pilnuje, by R1 nie obejmowało więcej niż 60% historyjek, `REL-004`
— by w R1 nie było historyjek warstwowych, a `REL-006` — by historyjki z linią wydania miały flagę (domyślnie tylko
te widoczne dla użytkownika). `REL-005` (krytyczne) wykrywa historyjkę z R1 zablokowaną przez historyjkę z późniejszej
linii albo bez linii; epic jest wtedy *NOT READY*. Próg MVP i wymóg flag ustawisz w *Settings → Policy → Release plan*
(`policy.release`). Plan wydania widać na stronie epica w panelu *Release plan*; w trybie demo pokazuje go scenariusz
`release-planning`.

Zmiany trzymane w repo (`docs/project/changes/CHG-n`, [`docs/REPO-CHANGES.md`](docs/REPO-CHANGES.md)) sprawdzają
jeszcze dwie reguły. `REL-007` (info) zgłasza flagę z `release.yaml` bez planu: bez etapów wdrażania, z etapem bez
kryterium wyjścia (`exit`), bez właściciela albo bez daty usunięcia (`remove_by`). `REL-008` (ostrzeżenie) to
samokontrola planu z tf: fundament bez „Odblokowuje” (albo odblokowujący zadanie, którego w zmianie nie ma) i cięcie
bez wymagania (bez weryfikacji i bez ID typu `US-02`). W Jirze obie milczą.

**Skąd wiadomo, czy kryterium akceptacji ma test i czy ten test przechodzi?**

Z wyników testów w formacie JUnit XML, który zapisuje prawie każdy runner (Vitest, Jest, pytest, JUnit, Playwright):
`npm run analyze -- --tests reports/junit` (plik albo katalog, można podać kilka; [`docs/PDI-G4-PLAN.md`](docs/PDI-G4-PLAN.md)).
Test wskazuje kryterium nazwą albo klasą `KLUCZ/AC-n`, np. `PAY-124/AC-2 the card disappears` (także `PAY-124 AC-2`
i `describe('PAY-124 › …')` wokół `it('AC-2 …')`), tak jak każe tf w `qa-spec-first-testing`. Identyfikator wymagania
z kolumny „Wymagania” planu (`US-02`) wskazuje cięcie z repo, które go wymienia. Trzy reguły, wszystkie ostrzeżenia:
`TEST-001` — testy z kluczem elementu już są, ale któreś kryterium nie ma żadnego (bez żadnego testu reguła milczy,
bo przed implementacją to normalne); `TEST-002` — test kryterium nie przeszedł; `TEST-003` — test wskazuje kryterium,
którego element już nie ma (przenumerowane albo usunięte). Bez `--tests` wszystkie milczą. Plik wyników, którego nie
da się odczytać, zatrzymuje bramkę z powodem, nigdy nie znaczy „zero testów”.

**Kiedy działa AI i co do niego wysyłamy?**

- Dostawcy: Anthropic, Amazon Bedrock, OpenAI, Azure OpenAI albo własny endpoint zgodny z OpenAI.
- AI recenzuje tylko story i bugi.
- W trybie `on_demand` (domyślnym) recenzję uruchamiasz przyciskiem przy elemencie (`POST /api/items/:key/ai-review`). Zwykła analiza używa wtedy wyników z pamięci podręcznej.
- W trybie `every_analysis` AI działa przy każdej analizie.
- Do modelu trafia kontekst elementu:
  - każde źródło jest przycięte do `maxCharsPerSource` znaków (domyślnie 6000);
  - dane osobowe są maskowane (*Redact personal data*, domyślnie włączone).
- Ustalenie AI bez poprawnego odwołania do źródła jest odrzucane.
- Każde wywołanie AI trafia do audytu.

**Czym różni się ustalenie od pytania?**
Ustalenie opisuje problem: ma ważność (*critical*, *warning* albo *info*), wymiar i dowody. Wiele ustaleń ma też pytanie z propozycjami odpowiedzi. Odpowiedź na to pytanie to [decyzja](#6-decyzje).

## 5. Gotowość i polityka

**Jakie są statusy gotowości?**

| Status | Kiedy |
|---|---|
| **Ready** | brak otwartych ustaleń, które blokują albo wymagają uwagi |
| **Needs attention** | są otwarte ustalenia z akcją *notify*, ale żadne nie blokuje |
| **Not ready** | jest co najmniej jedno otwarte ustalenie z akcją *block* |

Zdrowie (0–100) to średnia ważona siedmiu wymiarów: wymagania, projekt, dokumentacja, architektura, ścieżki użytkownika, obsługa błędów i zależności. Ustalenie blokujące obniża zdrowie do najwyżej 49, niezależnie od średniej.

**Co robi każda ważność? (polityka)**
Domyślnie (`packages/core/src/policy.ts`):

| Ważność | Akcja | Skutek |
|---|---|---|
| critical | `block` | element jest *not ready* |
| warning | `notify` | element jest *needs attention* |
| info | `record` | ustalenie trafia tylko do zapisu i nie zmienia statusu |

Polityka jest w *Settings → Policy*.

**Czy AI może zablokować story?**
Zależy to od ustawienia *AI findings* (`policy.aiFindings`). Dotyczy ono ustaleń AI, które według ważności miałyby blokować:

- `require_confirmation` (**domyślnie**) — ustalenie AI na początku tylko wymaga uwagi i jest oznaczone jako „do potwierdzenia”. Blokuje dopiero wtedy, gdy człowiek je potwierdzi (decyzja z efektem `confirm`). Można je też odrzucić albo zaakceptować ryzyko.
- `block` — ustalenie AI blokuje od razu, jak ustalenie z reguły.
- `notify` — ustalenie AI nigdy nie blokuje.

## 6. Decyzje

**Czym jest decyzja?**
To odpowiedź człowieka na pytanie z ustalenia. Zapisujemy w niej:

- odpowiedź i opcjonalną notatkę;
- autora i czas;
- efekt.

| Efekt | Skutek dla ustalenia |
|---|---|
| `resolve` | zamyka ustalenie jako rozwiązane |
| `accept_risk` | zamyka ustalenie jako zaakceptowane ryzyko |
| `dismiss` | zamyka ustalenie jako odrzucone (np. fałszywy alarm) |
| `confirm` | potwierdza ustalenie AI: zostaje otwarte i liczy się z pełną ważnością |

Odpowiedź z decyzji staje się nowym twierdzeniem w analizie. Dzięki temu aplikacja wykryje dokument, który przeczy podjętej decyzji (reguła `CON-001`).

**Czy decyzję można zmienić albo usunąć?**
Decyzje są niezmienne i wersjonowane (`packages/core/src/decisions.ts`):

- **Zmiana:**
  - nowa odpowiedź na to samo pytanie tworzy nową wersję (v2, v3…);
  - poprzednia wersja dostaje status *superseded*;
  - zmiana aktywnej decyzji wymaga podania powodu.
- **Wycofanie** (`DELETE /api/decisions/:id`):
  - nie kasuje decyzji;
  - oznacza ją jako *withdrawn* i ponownie otwiera ustalenie;
  - pełna historia zostaje na ekranie *Decisions* i w audycie.

## 7. Zatwierdzenia

**Co daje zatwierdzenie?**
Zatwierdzenie oznacza element jako gotowy i zapisuje **punkt odniesienia**: odciski treści i znaczenia elementu oraz wszystkiego w jego kontekście. Od tego momentu aplikacja śledzi dryf (patrz [8](#8-dryf-zmiany-po-zatwierdzeniu)).

**Co można zatwierdzić?**
Tylko **story** i **bug**. Epic i feature mają gotowość wyliczaną ze swoich story, więc próba zatwierdzenia ich kończy się błędem `409`.

**Czy można zatwierdzić element z blokadami?**
Tak, ale tylko jako **zatwierdzenie wymuszone**, z obowiązkowym uzasadnieniem. Takie zatwierdzenie jest oznaczone w UI i w audycie. Bez wymuszenia element z blokadami dostaje `409`.

**Jak cofnąć zatwierdzenie?**
Służy do tego *Withdraw approval* (`DELETE /api/items/:key/approve`), z opcjonalnym powodem. Wpis trafia do audytu.

## 8. Dryf (zmiany po zatwierdzeniu)

**Co liczy się jako zmiana?**
Liczy się zmiana **znaczenia**, a nie każda edycja (`analysis/fingerprint.ts`):

- w zgłoszeniu Jira — kryteria akceptacji, reguły biznesowe i twierdzenia z opisu;
- na stronie Confluence — twierdzenia w treści;
- w ramce Figmy — stany UI, przejścia i twierdzenia z tekstów.

Poprawka literówki nie wywołuje dryfu, ale zmiana timeoutu z 30 s na 60 s już tak. Zatwierdzenia zapisane przed wprowadzeniem odcisków znaczenia porównują pełną treść.

**Co się dzieje po wykryciu dryfu?**
Przy elemencie pojawia się ustalenie `DRIFT-001` z listą zmienionych artefaktów. Dalszy skutek zależy od *Settings → Policy → Drift reaction*:

| Reakcja | Skutek |
|---|---|
| `review_required` (**domyślnie**) | element jest *not ready*, dopóki ktoś nie odpowie na pytanie „Is the approved specification still valid?”, wybierając „Still valid — re-approve” albo „Re-open” |
| `warn` | element dostaje ostrzeżenie (*needs attention*) i nie jest blokowany |
| `invalidate` | zatwierdzenie zostaje cofnięte; element trzeba zatwierdzić ponownie |

Dryf zatwierdzonej story jest widoczny także na jej epicu.

**Czym jest „drift log”?**
Ekran *Drift* pokazuje zmiany między kolejnymi analizami. Dla każdej zmiany widać, co się zmieniło, w którym źródle i których elementów dotyczy.

## 9. Analiza wpływu

**Jak działa „Impact”?**
Wpisujesz pojęcie albo klucz, np. `timeout` albo `PAY-123`. Aplikacja szuka w grafie i w twierdzeniach elementów, dokumentów i ramek, których to dotyczy, i pokazuje je razem z powiązaniami (`packages/core/src/impact.ts`). Zapytanie może mieć najwyżej 500 znaków.

## 10. Harmonogram, webhooki, zdarzenia na żywo

**Kiedy uruchamia się analiza?**
Analiza uruchamia się w trzech przypadkach.

- **Przyciskiem *Analyze*** albo przez `POST /api/analyze`.
- **Według harmonogramu** (*Settings → Schedule*):

  | Tryb | Kiedy działa |
  |---|---|
  | `on_demand` (**domyślnie**) | tylko ręcznie |
  | `interval` | co `intervalMinutes` minut (domyślnie 30) |
  | `continuous` | co 5 minut |

- **Po webhooku** z Jira, Confluence albo Figmy, gdy dane źródło jest włączone w ustawieniach (domyślnie wszystkie są).

Po zapisie decyzji, zatwierdzeniu i zmianie ustawień analiza też jest liczona ponownie.

**Jak podłączyć webhook?**

1. W narzędziu źródłowym ustaw wywołanie `POST https://<host>/api/webhooks/<jira|confluence|figma>`.
2. Ustaw na serwerze `CI_WEBHOOK_SECRET` i wysyłaj go w nagłówku `x-ci-webhook-secret`.

Bez sekretu webhook przyjmuje każde wywołanie. W kolejce do zrobienia jest domyślne zamknięcie webhooka i podpis HMAC (krok 3 w [`docs/BACKLOG-DEFERRED.md`](docs/BACKLOG-DEFERRED.md)).

**Skąd UI wie o nowej analizie?**
Z kanału Server-Sent Events `GET /api/events`, który wysyła zdarzenia `analysis` i `status`.

## 11. Dane, szyfrowanie i audyt

**Gdzie są dane?**
W katalogu `CI_DATA_DIR` (domyślnie `.ci-data/`), w zwykłych plikach:

- `settings.json`, `decisions.json`, `approvals.json`;
- `snapshot.json`, `drift.json`, `history.json`;
- `ai-cache.json`;
- `audit.jsonl`;
- `demo-context.json`.

**Co z `settings.json` ze starszej wersji?**
Przy starcie serwer oczyszcza plik: usuwa pola, których obecna wersja nie zna (np. dawne klucze API), i wartości spoza dozwolonego zakresu. Dla usuniętych wartości obowiązują ustawienia domyślne. Dzięki temu zapis z UI nie kończy się błędem `422`, a stare sekrety znikają z dysku. Każde takie czyszczenie trafia do audytu (aktor `system`) z listą ścieżek usuniętych pól, bez ich wartości.

**Czy dane są szyfrowane?**
Mogą być. Włącz *Settings → Security → Encrypt stored context* i ustaw `CI_ENCRYPTION_KEY`. Pliki z kontekstem są wtedy szyfrowane AES-256-GCM. Gdy szyfrowanie jest włączone, a klucza brak, zapis jest odrzucany. Nic nie trafi na dysk jawnym tekstem.

**Co się stanie przy uszkodzonym pliku?**
Zapis zachowuje się bezpiecznie (*fail-closed*):

- brak pliku oznacza pusty stan;
- plik, którego nie da się odczytać ani odszyfrować, zatrzymuje operację z błędem i **nie jest nadpisywany**, żeby nie stracić danych;
- wyjątkiem jest pamięć podręczna AI, którą można odbudować.

**Co zapisuje audyt?**
Audyt zapisuje:

- analizy;
- decyzje, ich zmiany i wycofania;
- zatwierdzenia i ich cofnięcia;
- zmiany ustawień;
- webhooki;
- scenariusze demo;
- wywołania AI.

Każdy wpis ma czas i osobę (`actor`). Zmiany przez API mają też pole `via`, które mówi, jak zmianę autoryzowano: `admin_token` albo `loopback`.

## 12. Bezpieczeństwo i dostęp

**Gdzie trzymać klucze i tokeny?**
Tylko w zmiennych środowiskowych serwera albo w sejfie, który je wstrzykuje. Nigdy w plikach repozytorium ani w ustawieniach UI. UI pokazuje tylko, czy dany sekret jest ustawiony.

Najważniejsze zmienne:

- `JIRA_API_TOKEN`, `CONFLUENCE_API_TOKEN`, `FIGMA_TOKEN`;
- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `AZURE_OPENAI_API_KEY`, `CUSTOM_AI_API_KEY`, a dla Bedrock łańcuch poświadczeń AWS;
- `CI_ENCRYPTION_KEY`, `CI_WEBHOOK_SECRET`, `CI_ADMIN_TOKEN`.

Pełna lista jest w [`README.md`](README.md#konfiguracja).

**Kto może zmieniać dane?**

- **Bez `CI_ADMIN_TOKEN`** (domyślnie, tryb lokalny):
  - zmiany przyjmowane są tylko z tej samej maszyny (adres loopback), czyli tak jak dotąd przy uruchomieniu na własnym komputerze;
  - żądanie z innej maszyny dostaje `401` z instrukcją.
- **Z `CI_ADMIN_TOKEN`:**
  - każda zmiana wymaga nagłówka `Authorization: Bearer <token>`;
  - UI zapyta o token raz i trzyma go tylko do zamknięcia karty (`sessionStorage`).
- Odczyty (`GET`) i webhooki nie wymagają tokenu. Webhooki mają własny sekret.

**Chcę udostępnić aplikację w sieci firmowej. Co ustawić?**

1. `HOST=0.0.0.0` (albo konkretny interfejs).
2. `CI_ADMIN_TOKEN`, żeby zmiany wymagały tokenu.
3. `CI_ALLOWED_HOSTS`, czyli nazwy, pod którymi serwer jest dostępny, np. `ci.firma.local:4317`. Chroni to przed atakiem DNS rebinding: żądanie z innym nagłówkiem `Host` dostaje `403`.
4. `CI_ALLOWED_ORIGINS`, jeśli UI działa pod innym adresem niż API, np. `https://ci.firma.pl`. Chroni to przed CSRF: zmiana wysłana z obcej strony dostaje `403`.

Przy starcie bez tokenu serwer wypisuje ostrzeżenie.

**Skąd aplikacja wie, kto podjął decyzję?**
Z nazwy podanej w UI (*Settings → Your name*). Nazwa jest wysyłana w nagłówku `X-CI-Actor`. To nazwa wyświetlana, a nie uwierzytelnienie. O uprawnieniu decyduje token albo loopback, co widać w polu `via` w audycie. Konta użytkowników (SSO) są w [kolejce](docs/BACKLOG-DEFERRED.md).

**Co, jeśli dwie osoby zapisują ustawienia jednocześnie?**
`GET /api/settings` zwraca `ETag`, a `PUT` musi go odesłać w `If-Match`. Jeśli ktoś zapisał ustawienia w międzyczasie, drugi zapis dostaje `412`. Wtedy trzeba odświeżyć ekran i zapisać ponownie, więc niczyje zmiany nie zostaną po cichu nadpisane.

## 13. Ustawienia domyślne

Ustawienia nowej instalacji (`packages/server/src/store.ts`):

| Obszar | Domyślnie |
|---|---|
| Tryb | `demo`, projekt `CHK` „Checkout” |
| Integracje | wyłączone |
| Mapowanie typów Jira | `Epic → epic`, `Feature → feature`, `Story → story` (resztę uzupełniają reguły z [3](#3-hierarchia-epic-feature-story)) |
| AI | dostawca `none`, effort `high`, temperatura 0,2, uruchamianie `on_demand` |
| Bezpieczeństwo | maskowanie danych osobowych włączone, 6000 znaków na źródło, tylko lokalna pamięć podręczna, szyfrowanie wyłączone, audyt wywołań AI i źródeł dowodów włączony |
| Harmonogram | `on_demand`, interwał 30 min, reakcja na webhooki ze wszystkich źródeł |
| Polityka | critical → block, warning → notify, info → record; AI findings → `require_confirmation`; drift → `review_required`; żadna reguła nie jest wyłączona |

## 14. CLI i CI/CD

**Czy mogę użyć analizy jako bramki jakości w pipeline?**
Tak. Służy do tego `npm run analyze` (`packages/server/src/cli.ts`):

```bash
npm run analyze                            # raport czytelny dla człowieka
npm run analyze -- --json report.json      # dodatkowo pełny wynik w JSON
npm run analyze -- --fail-on critical      # kod wyjścia 1, gdy któryś element jest NOT READY
npm run analyze -- --fail-on warning       # kod wyjścia 1, gdy któryś element nie jest READY
npm run analyze -- --items PAY-125,PAY-126 # tylko wybrane elementy
npm run analyze -- --repo . --fail-on critical  # tylko zmiany z docs/project/changes (bramka na PR)
```

CLI używa ustawień i decyzji z `CI_DATA_DIR`.

**Czy mogę pytać o gotowość w Claude?**
Tak. Serwer MCP z `packages/mcp` daje Claude Code i Claude Desktop narzędzia tylko do odczytu: podsumowanie gotowości
(też dla jednej zmiany, np. `CHG-12`), gotowość elementu z ustaleniami, dowodami i otwartymi pytaniami, graf kontekstu,
decyzje, dryf, reguły i stan połączenia z pdi. Nie zatwierdza, nie zapisuje decyzji i nie uruchamia analizy.
Konfiguracja i przykładowe pytania: [`packages/mcp/README.md`](packages/mcp/README.md).

**Czy jest opis API?**
Tak. Kontrakt OpenAPI 3 jest pod `GET /api/openapi.json`, a skrót w [`README.md`](README.md#api-skrót). Błędy mają format `application/problem+json` (RFC 9457). Błąd walidacji to `422` z listą pól.

## 15. Ekrany aplikacji

| Ekran | Co pokazuje |
|---|---|
| **Overview** | zdrowie projektu, gotowość, dług decyzyjny, najważniejsze ryzyka, trend |
| **Backlog** | lista epiców, feature'ów i story ze statusem i zdrowiem |
| **Element** (story, epic, bug) | wymiary, ustalenia z dowodami, pytania, stany UI, ścieżki, kontekst w grafie, zatwierdzenie |
| **Decisions** | log decyzji z wersjami i wycofaniami |
| **Drift** | zmiany między analizami i scenariusze demo |
| **Impact** | analiza wpływu pojęcia lub elementu |
| **Settings** | tryb, integracje, AI, bezpieczeństwo, harmonogram, polityka, Twoja nazwa |
| **Audit** | dziennik zdarzeń |

## 16. Problemy i ich rozwiązania

| Objaw | Przyczyna i rozwiązanie |
|---|---|
| `401` przy zapisie z innej maszyny | Brak `CI_ADMIN_TOKEN`, więc działa tylko loopback. Ustaw token na serwerze. |
| `401` mimo podania tokenu | Zły token. UI zapyta ponownie przy następnej zmianie. |
| `403 Host … is not allowed` | Dodaj nazwę hosta do `CI_ALLOWED_HOSTS`. |
| `403 Origin … may not change data` | Dodaj adres UI do `CI_ALLOWED_ORIGINS`. |
| `412` przy zapisie ustawień | Ktoś zmienił ustawienia w międzyczasie. Odśwież ekran i zapisz ponownie. |
| `422` przy zapisie ustawień | Wartość spoza dozwolonych albo nieznane pole. Lista pól jest w `errors` odpowiedzi. |
| `409` przy zatwierdzaniu | Element ma blokady (użyj zatwierdzenia wymuszonego z uzasadnieniem) albo jest epikiem lub feature'em. |
| Typ zgłoszenia z Jira widoczny jako story | Typ nie jest zmapowany. Dodaj go w *Settings → Jira → Issue type mapping*. |
| Błąd odczytu pliku w `.ci-data` | Plik jest uszkodzony albo brak `CI_ENCRYPTION_KEY`. Aplikacja go nie nadpisze, więc napraw plik albo ustaw klucz. |
