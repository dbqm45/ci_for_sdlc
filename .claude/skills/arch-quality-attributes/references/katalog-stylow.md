# Katalog stylów i wzorców architektury

Uzupełnienie tabeli „Style architektury” w SKILL.md. Styl wybierasz ze scenariuszy atrybutów jakości, nie z mody;
domyślnie najprostszy, który spełnia scenariusze (H,H). Wybór zapisujesz w ADR z odrzuconymi alternatywami.

## Struktura całego systemu
| Styl | Kiedy | Koszt i ryzyko | Sygnał złego wyboru |
|---|---|---|---|
| **Warstwowa** (prezentacja → aplikacja → domena → infrastruktura) | prawie zawsze wewnątrz modułu | warstwy „przelotowe” bez logiki; zmiana funkcji przechodzi przez wszystkie warstwy | każda zmiana dotyka 4 katalogów → podział według funkcji (eng-design-principles, `komponenty-i-granice.md`) |
| **Klient–serwer** | aplikacja z centralnymi danymi i wieloma klientami | serwer jako wąskie gardło i pojedynczy punkt awarii | — (to tło niemal każdego systemu webowego) |
| **Modularny monolit** | domyślny start | dyscyplina granic (tool-nx, ArchUnit) | moduły wiedzą o swoich tabelach nawzajem |
| **Mikroserwisy** | niezależne wdrażanie i skalowanie kontekstów, autonomiczne zespoły | sieć, spójność ostateczna, obserwowalność, platforma | rozproszony monolit: usługi wdrażane razem, wspólna baza, łańcuchy synchronicznych wywołań |
| **SOA** | integracja wielu systemów organizacji przez wspólne kontrakty | szyna integracyjna (ESB) z logiką routingu i transformacji staje się centralnym monolitem | reguły biznesowe w szynie; mikroserwisy wolą „mądre końcówki, głupie rury” |
| **Zdarzeniowa** | reakcje asynchroniczne, wielu odbiorców, audyt | trudne śledzenie przepływu, kolejność, duplikaty | łańcuch zdarzeń, którego nikt nie umie narysować |
| **Serverless** | nieregularny ruch, mały zespół, zadania krótkie | zimny start, limity czasu, uzależnienie od dostawcy, koszt przy stałym ruchu | długie procesy dzielone na siłę; rachunek rośnie szybciej niż ruch |
| **Peer-to-peer** | brak centralnego serwera z założenia (wymiana plików, sieci rozproszone, synchronizacja offline) | spójność, bezpieczeństwo i wykrywanie węzłów bez centrum | potrzebujesz i tak centralnego autorytetu (uprawnienia, rozliczenia) |

## Wzorce wewnątrz systemu
| Wzorzec | Na czym polega | Kiedy | Pułapki |
|---|---|---|---|
| **Mikrojądro (plug-in)** | małe jądro z minimalną funkcją + wtyczki przez kontrakt i rejestr | produkt z rozszerzeniami (IDE, ESLint, wtyczki Nx), reguły per klient lub rynek | kontrakt wtyczki to publiczne API — wersjonowanie i zgodność wstecz; wtyczki z zewnątrz to kod niezaufany (izolacja, uprawnienia) |
| **Tablica (blackboard)** | wspólna przestrzeń danych + niezależne źródła wiedzy, które ją czytają i uzupełniają + sterowanie wybierające następne źródło | problemy bez znanego algorytmu, składane z częściowych wyników (rozpoznawanie, planowanie, zespoły agentów AI) | trudne testy i debugowanie, niedeterminizm; potrzebne jasne reguły zapisu na tablicę (fabryka używa tej idei: `docs/project/` jako tablica, orkiestrator jako sterowanie) |
| **Publish–subscribe** | wydawca publikuje do tematu, nie znając odbiorców; broker dostarcza każdemu subskrybentowi | wielu niezależnych odbiorców tego samego faktu | dostarczenie „co najmniej raz” → idempotentni odbiorcy; kolejność tylko w partycji; zmiana schematu wiadomości to zmiana kontraktu (be-messaging-outbox) |
| **Potoki i filtry** | dane przechodzą przez kolejne niezależne kroki | przetwarzanie wsadowe, ETL, kompilatory, przetwarzanie obrazu | wspólny format między krokami; błędy w środku potoku |
| **MVC / MVP / MVVM** | oddzielenie modelu, widoku i sterowania lub stanu widoku | UI | logika biznesowa w kontrolerze lub komponencie; w Angularze komponenty i sygnały są bliżej MVVM (fe-architecture) |

## Orkiestracja procesów biznesowych
Długie procesy z wieloma krokami, oczekiwaniem (na człowieka, partnera, termin) i kompensacjami:
- **Choreografia** (każda usługa reaguje na zdarzenia) — luźne sprzężenie, ale przepływ trudno zobaczyć i zmienić.
- **Orkiestracja** (jeden koordynator wie, co dalej) — przepływ widoczny w jednym miejscu: saga w kodzie
  (ddd-tactical-design), silnik BPMN (np. Camunda — proces modelowany diagramem, ddd-event-storming: sekcja 6a)
  albo silnik trwałego wykonania (np. Temporal — proces jako kod, którego stan przetrwa restarty i awarie).
- BPEL (XML, epoka SOA i szyn integracyjnych) spotkasz w starszych systemach — nowe procesy modeluj BPMN lub w kodzie.
- Silnik procesów to ciężka zależność: wybieraj, gdy procesów jest wiele, trwają długo i biznes chce je widzieć
  i zmieniać; pojedynczy przepływ to zwykła saga z tabelą stanu.

## Jak wybierać
1. Wypisz scenariusze (H,H) z drzewa użyteczności (SKILL.md).
2. Dla 2–3 kandydatów oceń każdy scenariusz: spełnia / częściowo / nie, z uzasadnieniem.
3. Dopisz koszt operacyjny (ludzie, platforma, dyżury) — style rozproszone wymagają dojrzałości ops (ops-*).
4. Zaplanuj fitness function, która pilnuje wybranego stylu (SKILL.md).
Style łączysz: np. modularny monolit z publish–subscribe między modułami i mikrojądrem dla reguł per klient.

## Źródła
- F. Buschmann i in., *Pattern-Oriented Software Architecture, Vol. 1* (1996) — warstwy, potoki i filtry, tablica,
  mikrojądro, MVC.
- M. Richards, [Software Architecture Patterns](https://www.oreilly.com/library/view/software-architecture-patterns/9781491971437/)
  (O'Reilly) — rozdział o architekturze mikrojądra (dostępny fragment).
- [roadmap.sh — Software Design and Architecture](https://roadmap.sh/software-design-architecture) (architectural
  styles i patterns: client-server, peer-to-peer, SOA, microkernel, blackboard, publish-subscribe, MVC, serverless).
Opisane własnymi słowami.
