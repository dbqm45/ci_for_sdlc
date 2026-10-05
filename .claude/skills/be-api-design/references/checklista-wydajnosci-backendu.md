# Checklista wydajności backendu — przed wydaniem i w review

Na podstawie listy roadmap.sh „Backend Performance Best Practices”, z doprecyzowaniem i odnośnikami do skilli, które
dany punkt rozwijają. Cel wydajności wynika z SLO i scenariuszy atrybutów jakości (ops-sre-incidents,
arch-quality-attributes). Każdą optymalizację potwierdzasz pomiarem przed i po (qa-performance-testing).

## Cache
- [ ] Warstwy: cache HTTP i CDN dla odpowiedzi publicznych (`http-w-praktyce.md`), cache po stronie serwera dla drogich
  obliczeń i odczytów, cache w kliencie tylko dla danych tego użytkownika.
- [ ] **Wzorzec dobrany świadomie**:
  | Wzorzec | Jak | Kiedy |
  |---|---|---|
  | cache-aside (leniwy) | aplikacja czyta z cache; przy braku czyta z bazy i zapisuje do cache | domyślny; odporny na awarię cache |
  | read-through | cache sam doczytuje z bazy przy braku | gdy biblioteka lub usługa to zapewnia |
  | write-through | zapis idzie do cache i bazy synchronicznie | dane czytane zaraz po zapisie; wolniejszy zapis |
  | write-behind | zapis do cache, do bazy asynchronicznie | rzadko; ryzyko utraty danych — tylko dla danych, które można stracić |
  | refresh-ahead | cache odświeża popularne klucze przed wygaśnięciem | przewidywalnie gorące dane; marnuje pracę, gdy przewidywanie chybia |
- [ ] **Unieważnianie**: czas życia (TTL) jako zabezpieczenie zawsze, do tego unieważnianie przy zmianie (zdarzenie
  domenowe → usunięcie klucza) albo klucz z wersją (`produkt:42:v17`). Zapisz, ile nieaktualności biznes akceptuje.
- [ ] **Lawina zapytań** po wygaśnięciu popularnego klucza: łączenie równoczesnych żądań o ten sam klucz (single-flight),
  losowy rozrzut TTL, wcześniejsze odświeżanie w tle. Cache nie może być jedyną drogą do danych — awaria cache to
  wolniejszy system, nie awaria.
- [ ] W cache nic, czego nie wolno pokazać innemu użytkownikowi: klucz zawiera najemcę i użytkownika, gdy dane są
  prywatne.

## Baza danych
- [ ] Pula połączeń z dobranym rozmiarem i limitami czasu; log wolnych zapytań i `pg_stat_statements`; indeksy
  sprawdzone `EXPLAIN ANALYZE`; brak N+1 i `SELECT *`; paginacja kursorowa; utrzymanie (VACUUM), repliki,
  denormalizacja i partycjonowanie tylko z pomiaru (be-database, `wydajnosc-bazy.md`).
- [ ] Ładowanie powiązań dobrane do przypadku: eager (`join`) dla danych zawsze potrzebnych, leniwe tylko w zapisie
  agregatu, batch (`IN (...)`, DataLoader w GraphQL) zamiast zapytania w pętli.

## API i sieć
- [ ] Limity rozmiaru żądań, paginacja, kompresja odpowiedzi, odpowiedzi bez zbędnych pól (`http-w-praktyce.md`).
- [ ] Duże wyniki strumieniowane (NDJSON, SSE) zamiast budowania całości w pamięci (`style-i-komunikacja.md`).
- [ ] **Połączenia wielokrotnego użytku**: keep-alive i pula połączeń HTTP dla wywołań do innych usług (w Node od
  wersji 19 globalny agent HTTP ma domyślnie włączony keep-alive; w Javie jeden współdzielony klient HTTP, nie nowy na
  każde żądanie).
- [ ] **Limity czasu na każdym wywołaniu wychodzącym** (połączenie i odpowiedź), ustalone z budżetu czasu żądania:
  jeśli użytkownik czeka maksymalnie 2 s, trzy wywołania po 5 s nie mają sensu. Pozostały budżet przekazywany dalej
  (deadline w gRPC, nagłówek w HTTP).
- [ ] **Ponowienia** tylko dla błędów przejściowych i operacji idempotentnych, z wykładniczym odstępem i losowym
  rozrzutem, limitem prób i budżetem ponowień (np. ≤ 10% ruchu) — inaczej ponowienia dobijają przeciążoną usługę;
  bezpiecznik (circuit breaker) przy długotrwałej awarii zależności (ops-sre-incidents: projektowanie na awarię).
- [ ] Grupowanie podobnych żądań (batch) między usługami, gdy wiele małych wywołań idzie do tej samej zależności.
- [ ] Bliskość: backend i baza w tym samym regionie i strefie co większość użytkowników; zasoby statyczne przez CDN;
  dane potrzebne w następnym kroku pobierane z wyprzedzeniem tylko wtedy, gdy prawdopodobieństwo użycia jest wysokie.

## Asynchroniczność i skalowanie
- [ ] Ciężka praca (raporty, importy, e-maile, przetwarzanie plików) w zadaniach w tle lub kolejce; żądanie zwraca
  `202` z zasobem statusu (`style-i-komunikacja.md`); komunikacja między usługami przez broker z outboxem
  (be-messaging-outbox).
- [ ] Skalowanie poziome wymaga bezstanowych instancji (sesje i pliki poza procesem); pionowe — prostsze, ale z sufitem.
  Autoskalowanie z górnym limitem i zapasem w puli połączeń bazy (`wydajnosc-bazy.md`; ops-kubernetes).
- [ ] Równoważenie obciążenia: algorytm najmniejszej liczby połączeń lub ważony dla żądań o różnym koszcie, sondy
  gotowości, łagodne wygaszanie instancji (dokończ żądania przed zamknięciem).

## Kod
- [ ] **Profilowanie zamiast zgadywania**: w Javie JDK Flight Recorder i async-profiler (wykresy płomieniowe CPU
  i alokacji), w Node `--cpu-prof` lub profil z inspektora; na danych i ruchu zbliżonych do produkcji. Optymalizujesz
  ścieżki krytyczne i najczęściej wywoływane endpointy.
- [ ] Struktury danych i algorytmy dobrane do skali (mapa zamiast wyszukiwania w liście w pętli, strumieniowanie
  zamiast wczytania całego pliku); zadania CPU w Node poza pętlą zdarzeń (worker threads).
- [ ] „Przepisz w Go lub Rust” albo „rozbij na mikroserwisy” to decyzje architektoniczne z kosztem (zespół, operacje,
  sieć) — dopiero gdy profil pokazuje, że wąskim gardłem jest sam język lub granica wdrożenia, i z ADR
  (arch-tech-selection, arch-quality-attributes).

## Monitorowanie
- [ ] Metryki RED per endpoint, metryki zasobów i puli, ślady rozproszone dla wolnych żądań (ops-observability).
- [ ] **Logowanie asynchroniczne** (Logback `AsyncAppender`, asynchroniczne loggery Log4j2, w Node pino z transportem
  w osobnym wątku) i bez logowania całych treści żądań w ścieżkach gorących. Przy przepełnieniu bufora świadomie:
  zgubić logi czy spowolnić żądania.
- [ ] Testy wydajnościowe regularnie i porównanie z poprzednim wynikiem (qa-performance-testing).

## Bezpieczeństwo a wydajność
Limity żądań i rozmiaru chronią też wydajność (OWASP API4). Uwierzytelnianie i autoryzacja nie są miejscem na
oszczędności — cache decyzji autoryzacji tylko krótki i z unieważnianiem. Punkt listy „aktualizuj zależności”: w fabryce
na prośbę człowieka, jako osobne zadanie (core-stack-sync, ops-supply-chain-security).

## Źródła
- [roadmap.sh — Backend Performance Best Practices](https://roadmap.sh/backend-performance-best-practices)
- Dokumentacja: Node.js (`http.globalAgent`, keep-alive), JDK Flight Recorder, async-profiler, Logback, Log4j2, pino;
  Google SRE Book — budżety ponowień i obsługa przeciążenia
Opisane własnymi słowami.
