---
name: ddd-event-storming
description: Użyj przy Event Stormingu (Big Picture, Process, Design Level) — przygotowanie, prowadzenie, zapis, przejście do architektury.
metadata:
  katalog: "Użyj przy planowaniu, prowadzeniu i zapisie sesji Event Storming — Big Picture, Process Level, Design Level — oraz przy przejściu od wyników sesji do architektury. Nie do technik pracy z ludźmi i językiem (ddd-facilitation) ani szczegółów implementacji agregatów (ddd-tactical-design)."
---

# Event Storming

Event Storming to wspólne modelowanie na osi czasu zdarzeń domenowych. Zdarzenia są „ciastem pizzy”:
reszta notacji to dodatki, które kładziesz dopiero wtedy, gdy pomagają odpowiedzieć na pytanie sesji.
To odmiana ModelStormingu — celem jest wspólne zrozumienie, a nie ładny diagram.

## 1. Zanim zaczniesz: po co ta sesja?
Ustal jedno pytanie, na które sesja ma odpowiedzieć, i wybierz format:

| Format | Pytanie sesji | Kogo zaprosić | Co wychodzi |
|---|---|---|---|
| **Big Picture** | Jak działa cały biznes / duży obszar? Gdzie boli? Gdzie są granice? | szeroko: biznes + IT; „ci, co mają pytania, i ci, co mają odpowiedzi” | oś czasu, zdarzenia przełomowe, hot spoty, kandydaci na konteksty, priorytety problemów |
| **Process Level** | Jak dokładnie działa ten jeden proces? | eksperci procesu + zespół | proces w pełnej gramatyce (komendy, polityki, read modele), reguły, pytania |
| **Design Level** | Jak to zbudować w tym kontekście? | zespół + ekspert dziedziny | agregaty/ograniczenia, zdarzenia, komendy → gotowe do implementacji |
| Value Driven | Gdzie powstaje i ginie wartość? | biznes | wartość +/- na osi, value stream |
| UX Driven | Co widzi i czuje użytkownik? | produkt, UX | read modele / ekrany na osi, momenty frustracji |
| Retro | Co się naprawdę wydarzyło (incydent, projekt)? | zespół | oś zdarzeń, przyczyny, szanse |
| Onboarding | Jak wprowadzić nowe osoby w domenę? | nowi + weterani | wspólna mapa jako materiał startowy |

Najpierw rób **Big Picture**, jeśli nie wiesz, gdzie jesteście (patrz ddd-strategic-analysis → Cynefin).

## 2. Notacja — kolory i gramatyka

| Element | Kolor | Zapis |
|---|---|---|
| Zdarzenie domenowe | pomarańczowy | czas przeszły, język biznesu: „Zamówienie zostało opłacone” |
| Hot spot | różowy/fioletowy (neon) | pytanie, konflikt, ryzyko, „nie wiemy” |
| Aktor | mała żółta | osoba/rola/dział |
| System zewnętrzny | szeroka różowa | system IT, dostawca |
| Szansa | zielona | pomysł na usprawnienie |
| Wartość | mała czerwona/zielona | utrata / zysk wartości |
| Komenda | niebieska | intencja/decyzja: „Opłać zamówienie” |
| Polityka | liliowa | „Kiedy X, wtedy Y” — reakcja na zdarzenie |
| Read model | zielona | informacja potrzebna do podjęcia decyzji |
| Agregat / ograniczenie | duża żółta | reguła, która może odrzucić komendę |

**Gramatyka Process Level** (każdy krok musi się „domknąć”):
`Aktor + Read model → Komenda → System/Agregat → Zdarzenie → Polityka → Komenda → …`
Każde zdarzenie albo uruchamia politykę, albo kończy ścieżkę, albo aktualizuje read model. Luka w łańcuchu = hot spot.

**Design Level**: `Komenda → Agregat (niezmienniki) → Zdarzenie(a)`; zdarzenie odrzucenia też jest zdarzeniem.

**Wprowadzaj notację stopniowo** — na starcie tylko pomarańczowe zdarzenia i hot spoty. Aktorów i systemy
dodawaj po uporządkowaniu osi, komendy/polityki/read modele dopiero na poziomie procesu. Legenda wisi na
ścianie i rośnie razem z sesją. Cała notacja od razu = uczestnicy dyskutują o kolorach zamiast o biznesie.

## 3. Big Picture — przebieg
1. **Chaotyczna eksploracja** — każdy sam pisze zdarzenia (czas przeszły) i przykleja mniej więcej w czasie. Bez dyskusji, bez poprawiania innych. Ilość > jakość.
2. **Porządkowanie osi (enforce the timeline)** — usuwamy duplikaty, łączymy synonimy (ale synonimy to sygnał dla języka — zapisz!), ustawiamy kolejność, zaznaczamy ścieżki równoległe.
3. **Zdarzenia przełomowe (pivotal events)** — zob. §4. Dzielą oś na rozdziały.
4. **Swimlanes** — poziome tory, gdy procesy biegną równolegle albo gdy odpowiedzialność przechodzi między działami/aktorami. Tor = „czyja to historia”. Rozgałęzienie procesu → osobne tory od punktu decyzji.
5. **Ludzie i systemy** — kto/co powoduje zdarzenia; gdzie przechodzi odpowiedzialność.
6. **Opowieść (walkthrough)** — ktoś z uczestników opowiada przebieg od lewej do prawej; każde „eee… to zależy” to hot spot. Pomaga też **czytanie od końca** (reverse narrative): „co musiało się stać, żeby to zdarzenie mogło nastąpić?” — wyłapuje brakujące zdarzenia.
7. **Problemy i szanse** — hot spoty i zielone kartki; potem **głosowanie kropkami** na najważniejsze problemy.
8. **Wyłaniające się konteksty** — obrysuj obszary o spójnym języku i odpowiedzialności (zob. ddd-strategic-analysis).

### Pytania kluczowe (rozgałęziające)
Zbieraj pytania, które biznes zadaje **w wielu miejscach procesu** i od których zależy, którędy pójdzie proces
(„Czy klient jest zweryfikowany?”, „Czy mamy wolne zasoby w tym terminie?”, „Czy przekroczono limit?”).
Każde takie pytanie to kandydat na: read model, politykę, osobną zdolność (capability) lub osobny kontekst,
który „jest właścicielem odpowiedzi”. Wypisz je listą z miejscami, w których padają.

## 4. Zdarzenia przełomowe (pivotal events)
Zdarzenie przełomowe to takie, po którym „świat jest inny”: zmienia się odpowiedzialność, obowiązują inne reguły,
pojawiają się nowi aktorzy, sprawa staje się trudno odwracalna.
Przykład: „Upload zdjęcia rozpoczęty”, „Zdjęcie otagowane”, „Miniatura wygenerowana” to kroki; przełomowe jest
„**Zdjęcie zostało opublikowane**” — od tej chwili widzą je inni, obowiązują inne reguły (moderacja, prawa autorskie).
Test: czy biznes świętuje / raportuje to zdarzenie? czy po nim zmienia się właściciel sprawy? czy trudno je cofnąć?
Zdarzenia przełomowe są naturalnymi granicami rozdziałów osi i częstymi granicami kontekstów.

## 5. As-is, to-be i punkt startu
- **Znamy proces (nic nie odkrywamy na nowo)** — postaw dwa zdarzenia graniczne **Begin** i **End** (np. „Zgłoszenie
  przyjęte” … „Sprawa zamknięta”) i wypełnij przestrzeń między nimi stanem **as-is**. Potem, osobną warstwą
  (inny kolor/tor), modeluj **to-be** i zaznacz różnice. Granice chronią przed rozlewaniem się sesji.
- **Nic nie wiemy — odkrywamy, badamy** — nie wymuszaj Begin/End. Najpierw ustal kilka **zdarzeń przełomowych**
  jako rusztowanie, a dopiero potem dopisuj zdarzenia między nimi.

## 6. Od sesji do architektury
| Element z sesji | Co zwykle z niego wynika |
|---|---|
| zdarzenia przełomowe, zmiana języka, swimlanes | granice kontekstów/modułów |
| polityka „kiedy X, to Y” | handler zdarzenia, saga / proces menedżer (długie procesy) |
| read model | strona odczytu (CQRS), projekcja, zapytanie |
| komenda | metoda serwisu aplikacyjnego / endpoint na krawędzi modułu |
| ograniczenie na żółtej kartce | niezmiennik agregatu → granica spójności |
| system zewnętrzny | ACL albo Open Host Service (ddd-context-mapping) |
| hot spot | pytanie do eksperta, spike, ryzyko w backlogu |
| pytanie kluczowe | read model / osobna zdolność / kontekst będący właścicielem odpowiedzi |

## 6a. Formalny zapis procesu (BPMN, EPC)
Event Storming służy odkrywaniu; gdy proces trzeba przekazać precyzyjnie (wiele ról i systemów, wymogi audytu,
silnik procesów), zapisz go po warsztacie:
- **BPMN 2.0**: zdarzenia (start, pośrednie, koniec), czynności, bramki (wyłączna XOR, równoległa AND, inkluzywna OR,
  zdarzeniowa), tory (pools/lanes) dla ról i systemów, przepływ wiadomości między uczestnikami. Mapowanie
  z warsztatu: zdarzenie domenowe → zdarzenie lub wynik czynności, komenda → czynność, polityka → bramka lub
  zdarzenie pośrednie, aktor → tor.
- **EPC** (łańcuch procesów sterowany zdarzeniami): naprzemiennie zdarzenie → funkcja → zdarzenie, z łącznikami
  AND/OR/XOR; spotykany w organizacjach używających ARIS i SAP.
- Prosty przepływ bez wielu ról: Mermaid `flowchart` (core-tech-docs, `diagramy-i-prezentacje.md`).
Diagram procesu nie zastępuje modelu domeny — reguły i niezmienniki zostają w agregatach i politykach.

## 7. Jak prowadzisz to jako agent (bez fizycznej ściany)
- Zbierasz zdarzenia od użytkownika partiami (np. „wypisz 10–20 rzeczy, które się dzieją, w czasie przeszłym”).
- Własne propozycje zawsze oznaczasz **[propozycja]** i prosisz o potwierdzenie. **Nie wymyślasz faktów biznesowych**
  — każde założenie to hot spot.
- Na bieżąco wyłapujesz sygnały językowe (ddd-facilitation) i zadajesz pytania modelujące (ddd-deep-modeling).
- Stan tablicy zapisujesz plikiem wg szablonu z `references/board-template.md` w `docs/project/02-domain/event-storming/RRRR-MM-DD-<temat>.md`
  i aktualizujesz słownik `docs/project/02-domain/glossary.md`.

## Materiały dodatkowe
- `references/session-scripts.md` — scenariusze minutowe sesji Big Picture / Process / Design, przygotowanie sali, wersja zdalna.
- `references/board-template.md` — szablon zapisu tablicy w Markdown + Mermaid.

## Wejście z tablicy (zdjęcie, eksport)
Gdy dostajesz zdjęcie lub eksport ściany: czytaj **przepływ po torach** (numerowane kroki z typem kartki w nawiasie), zdarzenia
przełomowe i hot spoty jako indeksy do kroków, niepewność jawnie (`[nieczytelne]`), bramka z losową próbką kartek.
Procedura i format: ddd-discovery-intake → `.claude/skills/ddd-discovery-intake/references/board-reading.md`. Na Big Picture dopuszczalne są tylko zdarzenia i hot spoty —
inne typy kartek to sygnał mieszania poziomów (samokontrola w ddd-facilitation).
