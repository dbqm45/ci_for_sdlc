---
name: arch-system-design
description: Użyj przy projekcie systemu od wymagań do skali — szacunki, API i dane, wąskie gardła, wysoka dostępność, wzorcowe rozwiązania.
metadata:
  katalog: "Użyj, gdy trzeba zaprojektować system od wymagań do skalowania — przypadki użycia, szacunki na serwetce, API i model danych, projekt ogólny, pogłębienia, wąskie gardła; liczby opóźnień i dostępności, wysoka dostępność, antywzorce wydajności. Nie do wyboru stacku (arch-tech-selection) ani katalogu stylów (arch-quality-attributes)."
  slowa: "dostępność usług, usługi połączone szeregowo, ile dziewiątek, SLA całości, szacunki ruchu, skalowanie, wąskie gardło, ile serwerów, wywołuje synchronicznie, jaką dostępność obiecać, SLA każdej zależności"
---

# Projektowanie systemu

Procedura prowadzi od wymagań do projektu, który da się uzasadnić liczbami. Pomija się ją, gdy zadanie jest małe —
wtedy wystarczy eng-design-principles. Wynik: dokument architektury z diagramami C4 i ADR (arch-architect-practice).

## Procedura
1. **Przypadki użycia, ograniczenia, założenia** — przepytaj (core-plan-interview), nie zgaduj:
   - kto używa i do czego (3–5 głównych przypadków; reszta jawnie poza zakresem);
   - skala: liczba użytkowników, aktywnych dziennie, żądań w szczycie, wzrost w 1–3 lata;
   - dane: wolumen, retencja, proporcja odczytów do zapisów, rozmiar typowego obiektu;
   - wymagania jakości jako scenariusze (opóźnienie p95, dostępność, spójność, RPO/RTO — arch-quality-attributes);
   - ograniczenia: budżet, zespół, regulacje (lokalizacja danych), istniejące systemy.
2. **Szacunki na serwetce** (rząd wielkości, nie precyzja):
   - żądania na sekundę = dzienne operacje ÷ ~86 400 (≈ 10⁵ s), szczyt zwykle 2–10× średniej;
   - zajętość = obiekty dziennie × rozmiar × retencja (+ repliki, indeksy, kopie zapasowe);
   - przepustowość sieci = żądania/s × rozmiar odpowiedzi; pamięć cache = gorący zbiór (często ~20% danych daje
     ~80% odczytów).
   - miesiąc to ~2,5 mln s: 400 żądań/s ≈ 1 mld żądań na miesiąc; potęgi dwójki i długość identyfikatorów
     w `references/przyklady-projektow.md`.
   Liczby decydują: 50 zapisów/s obsłuży jedna baza; 50 000 zapisów/s wymaga innego projektu.
3. **API** (be-api-design) i **model danych** (encje, klucze, wzorce dostępu — od zapytań, nie od tabel); wybór
   magazynów (arch-quality-attributes, `architektura-danych.md`).
4. **Projekt ogólny**: komponenty i przepływy (diagram kontenerów C4), ścieżka odczytu i zapisu osobno, granice
   synchroniczne i asynchroniczne. Najprostszy projekt, który spełnia wymagania (modularny monolit, jedna baza).
5. **Pogłębienie kluczowych komponentów**: tam, gdzie jest ryzyko lub skala — struktury danych, algorytmy (np.
   generowanie identyfikatorów, kolejność zdarzeń, liczniki), schemat i indeksy, kontrakty.
6. **Skalowanie i wąskie gardła**: dla każdego wymagania jakości — co się zepsuje pierwsze przy 10× ruchu i jak temu
   zapobiec: cache, repliki, partycjonowanie, kolejki, CDN, skalowanie poziome bezstanowych usług; pojedyncze punkty
   awarii; antywzorce (`references/antywzorce-wydajnosci.md`). Każda zmiana z kompromisem nazwanym wprost.
   Skaluj iteracyjnie (pomiar → profil → wąskie gardło → zmiana → pomiar), nie skacz od razu do projektu
   docelowego; drabina skalowania i wzorce z gotowych ćwiczeń (rozsyłanie przy zapisie a przy odczycie, wyliczanie
   wsadowe, haszowanie spójne, LRU): `references/przyklady-projektow.md`.
7. **Operacje**: monitorowanie (metryki RED/USE, ślady, alerty z SLO), wdrażanie i wycofanie, koszt
   (ops-observability, ops-release-engineering, ops-finops), bezpieczeństwo (arch-threat-modeling).

## Liczby, które warto mieć w głowie (rzędy wielkości)
| Operacja | Rząd wielkości |
|---|---|
| odczyt z pamięci podręcznej procesora | ~1 ns |
| odczyt z pamięci RAM | ~100 ns |
| odczyt 4 KB z dysku SSD/NVMe | ~10–100 µs |
| podróż w obie strony w obrębie centrum danych | ~0,5 ms |
| odczyt 1 MB sekwencyjnie z SSD | ~1 ms |
| zapytanie do bazy z indeksem przez sieć | ~1–10 ms |
| podróż w obie strony między kontynentami | ~100–150 ms |
Wnioski: pamięć jest o rzędy wielkości szybsza od sieci, a sieć w centrum danych — od sieci między kontynentami; łańcuch
synchronicznych wywołań sumuje opóźnienia; dane blisko użytkownika (CDN, region) liczą się bardziej niż szybszy kod.
Dokładne wartości zależą od sprzętu — mierz własne.

## Opóźnienie, przepustowość i skalowalność
- **Opóźnienie** to czas jednego żądania odczuwany przez użytkownika. Mierz je percentylami (p95, p99), a nie
  średnią. Jest sumą warstw: sieć, kolejka, przetwarzanie, baza, wywołania zależności. Najpierw ustal, która warstwa
  dominuje (ślady rozproszone — ops-observability), dopiero potem ją optymalizuj.
- **Przepustowość** to ilość pracy w jednostce czasu (żądania/s). Niskie opóźnienie nie gwarantuje wysokiej
  przepustowości, a wysoka przepustowość nie gwarantuje niskiego opóźnienia. Przepustowość rośnie głównie przez
  równoległość (więcej instancji, wątków, partycji), a opóźnienie spada przez skracanie ścieżki (cache, bliskość
  danych, mniej wywołań po kolei).
- **Prawo Little'a** dla systemu: średnia liczba żądań w toku = przepustowość × średni czas obsługi. Przy 200
  żądaniach/s po 50 ms średnio 10 żądań jest w toku jednocześnie. Z tego wyliczasz rozmiar puli wątków i połączeń oraz
  liczbę instancji, z zapasem na szczyt. Gdy opóźnienie zależności rośnie, rośnie liczba żądań w toku i pule się
  wyczerpują. Dlatego potrzebne są limity czasu (be-api-design, `checklista-wydajnosci-backendu.md`).
- **Skalowalność to cecha całego systemu, nie jednego komponentu.** System jest tak skalowalny jak najsłabsza
  warstwa. Dziesięć razy więcej serwerów aplikacji przy tej samej bazie nie usuwa wąskiego gardła, tylko je
  przesuwa, a często pogarsza (więcej połączeń do bazy). Przy każdej zmianie skali sprawdź wszystkie warstwy: load
  balancer, aplikację, cache, bazę, kolejki i zależności zewnętrzne.
- Skalowanie pionowe jest proste, ale ma sufit i jeden punkt awarii. Skalowanie poziome wymaga bezstanowych
  instancji (sesje i pliki poza procesem). Przyklejone sesje na load balancerze to obejście, które osłabia
  równoważenie i przełączanie po awarii. Load balancer daje odporność dzięki sprawdzaniu zdrowia, nie tylko
  dzięki podziałowi ruchu (L4 a L7 — ops-linux-networking, `serwery-www-i-proxy.md`).

## Dostępność w liczbach
| Dostępność | Przestój w roku | w miesiącu | w tygodniu |
|---|---|---|---|
| 99% | ~3,65 dnia | ~7,3 h | ~1,7 h |
| 99,9% | ~8,8 h | ~44 min | ~10 min |
| 99,95% | ~4,4 h | ~22 min | ~5 min |
| 99,99% | ~53 min | ~4,4 min | ~1 min |
- **Szeregowo** (potrzebne oba komponenty): dostępność = iloczyn (99,9% × 99,9% ≈ 99,8%). **Równolegle**
  (wystarczy jeden z dwóch niezależnych): 1 − (1 − A)² (dwa po 99,9% ≈ 99,9999% — przy prawdziwej niezależności awarii).
- Każda dziewiątka więcej to zwykle rząd wielkości wyższy koszt i dyscyplina operacyjna (ops-sre-incidents,
  `sli-slo-sla.md`).

## Wysoka dostępność
- **Failover aktywny–pasywny**: rezerwa przejmuje ruch po utracie sygnału życia; czas przełączenia zależy od tego,
  czy rezerwa jest „gorąca” (działa i ma dane) czy „zimna”. Ryzyko: rozszczepienie (oba węzły uważają się za główne)
  → mechanizm wyboru lidera lub fencing.
- **Aktywny–aktywny**: obie kopie obsługują ruch; potrzebne równoważenie (DNS, load balancer) i rozwiązanie konfliktów
  zapisu albo podział zapisów (każdy region właścicielem części danych).
- **Replikacja** bazy: główna z replikami (odczyty skalowane, opóźnienie repliki) albo wiele węzłów zapisujących
  (konflikty) — be-database, `wydajnosc-bazy.md`. **Federacja** (podział funkcjonalny: osobna baza dla użytkowników,
  produktów, zamówień) przed shardingiem.
- **Odkrywanie usług**: rejestr i sprawdzanie zdrowia (DNS w Kubernetesie, Consul) zamiast adresów zaszytych
  w konfiguracji; klient lub load balancer pyta rejestr o zdrowe instancje.
- Ograniczanie napływu (back-pressure), kolejki wyrównujące obciążenie, bezpieczniki i grodzie — ops-sre-incidents
  i `wzorce-chmurowe.md`.

## Komunikacja — skrót
TCP (niezawodny, uporządkowany) vs UDP (bez gwarancji — strumienie mediów, DNS, QUIC jako podstawa HTTP/3); REST,
RPC (gRPC), GraphQL — be-api-design, `style-i-komunikacja.md`; kolejki zadań i komunikaty — be-messaging-outbox;
CDN typu **pull** (pobiera z originu przy pierwszym żądaniu, prosty) i **push** (wysyłasz pliki z góry — duże, rzadko
zmieniane zasoby).

## Checklista
- [ ] przypadki użycia, skala i wymagania jakości zapisane; poza zakresem jawnie
- [ ] szacunki ruchu, danych i pamięci w rzędach wielkości
- [ ] API, model danych i magazyny dobrane do wzorców dostępu
- [ ] dla każdego wymagania jakości: wąskie gardło przy 10× i odpowiedź z kompromisem
- [ ] pojedyncze punkty awarii, monitorowanie, koszt i bezpieczeństwo omówione

## Źródła
- [donnemartin/system-design-primer](https://github.com/donnemartin/system-design-primer) (CC BY 4.0) — podejście,
  dostępność w liczbach, failover, rozwiązania przykładowe; J. Dean — „Latency numbers every programmer should know”
- [Microsoft — Cloud design patterns](https://learn.microsoft.com/en-us/azure/architecture/patterns/),
  [Performance antipatterns](https://learn.microsoft.com/en-us/azure/architecture/antipatterns/)
- [roadmap.sh — System Design](https://roadmap.sh/system-design)
- Developer Awam, „7 Core Infrastructure Concepts You Need to Master to Become a DevOps Engineer”, CodeX / Medium,
  2026 — skalowalność całego systemu, opóźnienie a przepustowość, brama API
Opisane własnymi słowami.
