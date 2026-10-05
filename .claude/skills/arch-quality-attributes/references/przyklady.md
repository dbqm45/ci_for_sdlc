# Przykłady — atrybuty jakości i styl architektury

## 1. Scenariusze i drzewo użyteczności dla rezerwacji sal
**Sytuacja.** „Robimy system rezerwacji sal konferencyjnych dla sieci 40 biurowców. Ma być szybki, bezpieczny i niezawodny.
Spisz wymagania jakościowe.”

**Jak.**
1. Każde „ma być szybki” zamieniam na scenariusz `źródło → bodziec → (środowisko) → artefakt → odpowiedź → miara`;
   zdanie bez miary nie przechodzi.
2. Przeglądam listę atrybutów (ISO 25010, skrót) — dochodzą modyfikowalność i dostępność (a11y), o które nikt nie zapytał.
3. Wydajność i dostępność zapisuję od razu jako SLI/SLO (ops-sre-incidents).
4. Każdemu scenariuszowi daję parę (ważność, trudność) w skali H/M/L; architekturę kształtują tylko (H,H).
5. Dla (H,H) proponuję fitness function w CI.

**Wynik** (sekcja „Atrybuty jakości” w `03-requirements/requirements.md`):

| ID | Atrybut | Scenariusz (źródło → bodziec → środowisko → artefakt → odpowiedź → miara) | Priorytet |
|---|---|---|---|
| QA-1 | wydajność | 100 pracowników → rezerwuje salę → szczyt 8:45–9:15 → API rezerwacji → przyjmuje żądania → p95 < 300 ms | (H,H) |
| QA-2 | niezawodność | 2 osoby → rezerwują ten sam slot w tej samej sekundzie → normalna praca → moduł rezerwacji → jedna wygrywa, druga dostaje komunikat → 0 podwójnych rezerwacji | (H,H) |
| QA-3 | dostępność | użytkownik → otwiera kalendarz → dni robocze → aplikacja → odpowiada → SLO 99,5% udanych żądań w oknie 30 dni | (H,M) |
| QA-4 | modyfikowalność | właściciel produktu → dodaje nowy typ zasobu (miejsce parkingowe) → rozwój → model rezerwacji → zmiana w 1 module → ≤ 5 dni pracy | (H,H) |
| QA-5 | bezpieczeństwo | pracownik firmy A → próbuje odczytać rezerwacje firmy B → produkcja → API → odmowa → 0 udanych odczytów w testach nadużyć | (H,M) |
| QA-6 | dostępność (a11y) | użytkownik czytnika ekranu → rezerwuje salę → przeglądarka → formularz → kończy zadanie → bez pomocy innej osoby | (M,L) |

Fitness functions dla (H,H): QA-1 — test obciążeniowy w CI z progiem p95 < 300 ms; QA-2 — test współbieżny
(50 równoległych prób na jeden slot → dokładnie 1 sukces); QA-4 — raport wpływu zmian (ddd-model-stress-test).

## 2. Kompromis w ADR: cache cennika
**Sytuacja.** „Strona produktu ładuje się 1,2 s, bo za każdym razem liczymy cenę z promocjami. Dodajmy cache.”

**Jak.**
1. Najpierw scenariusz z miarą: wejście na stronę produktu w kampanii → p95 < 400 ms.
2. Nazywam kompromis jawnie: wydajność ↔ spójność (stara cena przez czas życia wpisu) i wydajność ↔ modyfikowalność
   (każda nowa reguła promocji musi unieważniać cache).
3. Wskazuję **punkt wrażliwości** (czas życia wpisu decyduje o świeżości ceny) i **punkt kompromisu** (sam cache: wydajność
   rośnie, spójność i modyfikowalność spadają).
4. Zapisuję w ADR razem z warunkiem odwrotu.

**Wynik** (fragment ADR):
```markdown
## ADR-014: Cache wyliczonej ceny na stronie produktu
Status: proposed
Czynnik: QA-7 (wydajność, H,H) — strona produktu w kampanii, p95 < 400 ms (dziś 1,2 s).
Decyzja: cache ceny per produkt, czas życia 60 s; zmiana promocji unieważnia wpisy jej produktów.
Kompromisy:
- wydajność ↔ spójność: klient może przez ≤ 60 s widzieć starą cenę na liście; koszyk i zamówienie liczą cenę bez cache.
- wydajność ↔ modyfikowalność: nowy typ promocji = nowa reguła unieważniania (koszt w każdej zmianie cennika).
Punkt wrażliwości: czas życia wpisu (60 s). Punkt kompromisu: cache jako taki.
Fitness function: test obciążeniowy strony produktu, próg p95 < 400 ms; test „zmiana promocji → nowa cena po ≤ 60 s”.
Odwrót: jeśli reklamacje cenowe > 0 w miesiącu, skracamy czas życia albo wyłączamy cache listy.
```

## 3. „Chcemy mikroserwisy” przy jednym zespole
**Sytuacja.** „Startujemy z platformą do zapisów na kursy. Zespół: 5 osób. Od razu zróbmy mikroserwisy, żeby się skalowało.”

**Jak.**
1. Pytam o scenariusze (H,H): najtrudniejszy to szczyt zapisów — 2000 żądań/s przez 10 minut na starcie semestru, p95 < 300 ms;
   niezależnych zespołów ani różnych wymagań niezawodności per kontekst brak.
2. Porównuję z tabelą stylów: mikroserwisy uzasadnia niezależne wdrażanie wielu autonomicznych zespołów — tu jest jeden.
3. Domyślnie najprostszy: **modularny monolit** z kontekstami jako modułami; szczyt zapisów obsługuje skalowanie
   poziome całej aplikacji.
4. Granice pilnuję fitness function, żeby ewentualne wydzielenie było później tanie — dopiero gdy konkretny (H,H) tego wymaga.

**Wynik** (zapis w `04-architecture/stack-decision.md`, „Czynniki decyzyjne”, i ADR):

| Czynnik | Modularny monolit | Mikroserwisy |
|---|---|---|
| QA-1: 2000 żądań/s przez 10 min, p95 < 300 ms | skalowanie poziome instancji | skalowanie per usługa (nie jest tu potrzebne) |
| zespół 5 osób, jeden backlog | jedno wdrożenie, jedna obserwowalność | sieć, spójność ostateczna, platforma — koszt bez zysku |
| QA-4: zmiana reguł zapisów w 1 module | granice modułów + test architektury | granice usług |
| **Decyzja** | **wybrany** | odrzucony; wraca, gdy pojawi się drugi autonomiczny zespół |

Fitness function w CI (granice modułów i budżet wydajności):
```yaml
architecture-fitness:
  stage: test
  script:
    - npm run test:architecture   # moduł „zapisy” nie importuje wnętrza modułu „płatności”
    - npm run test:perf -- --threshold-p95=300
```
