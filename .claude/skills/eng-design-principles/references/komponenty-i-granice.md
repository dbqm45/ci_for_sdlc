# Komponenty, granice, polityka i szczegół

Uzupełnienie SKILL.md na poziomie wyżej niż klasa: jak grupować kod w komponenty (biblioteki Nx, pakiety Javy, moduły
Mavena/Gradle) i jak ustawić między nimi zależności. Słownik modułu i spoiny: eng-module-depth.

## 1. Paradygmaty jako ograniczenia
Każdy paradygmat zabiera jakąś swobodę i dzięki temu coś daje (R. C. Martin, *Clean Architecture*):
| Paradygmat | Co zabiera | Co daje w projekcie |
|---|---|---|
| strukturalny | `goto` — sterowanie tylko przez sekwencję, wybór, pętlę | funkcje, które da się czytać i testować osobno |
| obiektowy | niekontrolowane wskaźniki na funkcje — polimorfizm jest bezpieczny | odwracanie zależności: szczegół zależy od polityki |
| funkcyjny | przypisanie — dane niezmienne, czyste funkcje | brak wyścigów i ukrytego stanu; logika łatwa w testach |
W TS i Javie mieszasz je świadomie: niezmienne obiekty wartości i czyste funkcje w domenie (ddd-tactical-design),
obiekty z zachowaniem dla reguł z niezmiennikami, proste procedury w kleju i skryptach.

## 2. Polityka i szczegół
- **Polityka** — reguły biznesowe i przypadki użycia: *co* system robi. **Szczegół** — baza, framework, UI, protokół,
  zewnętrzne API, kolejka: *jak* to jest dostarczone.
- Zależności w kodzie wskazują **od szczegółu do polityki**. Domena nie importuje frameworka, ORM ani klienta HTTP —
  definiuje port, szczegół dostarcza adapter (eng-design-principles: D z SOLID).
- **Poziom** = odległość od wejścia i wyjścia. Reguła walidacji rabatu jest wyżej niż kontroler HTTP; kod wyżej zmienia
  się rzadziej i z ważniejszych powodów, więc nie może zależeć od kodu niżej.
- Test kontrolny: czy przypadki użycia uruchomisz w teście jednostkowym **bez** serwera, bazy i frameworka? Jeśli nie,
  szczegół wyciekł do polityki.

## 3. Framework na dystans
- Framework to narzędzie, nie architektura. Klasy domeny nie dziedziczą po klasach frameworka i nie noszą jego
  adnotacji, jeśli da się tego uniknąć (w Javie encja JPA ≠ model domeny, gdy model ma nietrywialne reguły).
- Kod frameworka trzymasz na brzegu: kontrolery, konfiguracja DI, mapowanie ORM, komponenty Angulara wywołują
  przypadki użycia, nie zawierają reguł.
- Koszt: dodatkowe mapowanie. Przy prostym CRUD (skrypt transakcji, be-database) dystans jest zbędny — KISS.

## 4. Struktura krzycząca domeną i podział według aktora
- Katalogi najwyższego poziomu nazywają **obszary biznesowe** (`orders/`, `billing/`, `scheduling/`), nie warstwy
  techniczne (`controllers/`, `services/`, `repositories/`). Nowa osoba ma zobaczyć, *co* system robi, zanim zobaczy,
  *jak* (Screaming Architecture; dla frontu: Feature-Sliced Design w fe-architecture).
- Podział według funkcji (package by feature) zamiast według warstwy: zmiana jednej funkcji dotyka jednego katalogu,
  a widoczność pakietu ukrywa wnętrze.
- **Podział według aktora** (Single Responsibility w ujęciu Martina): moduł odpowiada przed jedną grupą interesariuszy.
  Wspólna funkcja liczenia godzin dla księgowości i kadr to pułapka — gdy jeden dział zmieni regułę, zepsuje drugiemu.
  Podobny kod dla różnych aktorów to często duplikacja przypadkowa (DRY w SKILL.md).

## 5. Granice
- Granica oddziela to, co zmienia się z różnych powodów i w różnym tempie. Przez granicę przechodzą proste struktury
  danych (DTO, zdarzenia), nie encje ani obiekty frameworka.
- Rodzaje od najtańszej: pakiet lub biblioteka w jednym procesie → osobny proces lokalny → usługa sieciowa. Każdy krok
  w prawo kosztuje (sieć, wersjonowanie, obserwowalność); wybierasz najtańszą, która wystarcza (arch-quality-attributes).
- Granicę możesz przygotować częściowo (osobne biblioteki i porty w monolicie), żeby później wydzielić usługę bez
  przepisywania; pełnej granicy „na zapas” nie stawiasz (YAGNI).

## 6. Zasady komponentów
**Spójność — co razem w jednym komponencie**
| Zasada | Treść | Pytanie |
|---|---|---|
| **REP** — wielokrotne użycie = wydanie | komponent używany przez innych ma wersje i changelog; trzyma razem klasy wydawane razem | czy da się to sensownie wersjonować jako całość? |
| **CCP** — wspólne domknięcie | razem to, co zmienia się z tego samego powodu i w tym samym czasie (SRP dla komponentów) | czy typowa zmiana dotyka jednego komponentu? |
| **CRP** — wspólne użycie | nie zmuszaj klientów do zależności od rzeczy, których nie używają (ISP dla komponentów) | czy klient bierze cały komponent, czy jego mały kawałek? |
REP i CRP rozdrabniają, CCP skleja. Na początku projektu ważniejsze jest CCP (łatwe zmiany), w dojrzałej bibliotece
współdzielonej — REP i CRP (stabilni klienci).

**Sprzężenie — zależności między komponentami**
- **ADP — brak cykli.** Graf zależności komponentów jest acykliczny. Cykl łamiesz przez odwrócenie zależności (interfejs
  po stronie używającego) albo wydzielenie wspólnej części do nowego komponentu. Wykrywanie: `nx graph`,
  `madge --circular`, dependency-cruiser, w Javie ArchUnit (`slices().matching("..app.(*)..").should().beFreeOfCycles()`).
- **SDP — zależ w stronę stabilności.** Stabilność I = Ce / (Ca + Ce), gdzie Ca to zależności przychodzące, a Ce
  wychodzące. I = 0 — stabilny (wielu zależy od niego, sam nie zależy od nikogo), I = 1 — niestabilny. Zależność
  powinna prowadzić do komponentu o mniejszym I.
- **SAP — stabilny = abstrakcyjny.** Abstrakcyjność A = liczba typów abstrakcyjnych / liczba wszystkich typów.
  Stabilne komponenty mają być abstrakcyjne (porty, kontrakty), żeby dało się je rozszerzać bez zmiany.
- **Odległość od ciągu głównego** D = |A + I − 1|. Blisko 0 — dobrze. **Strefa bólu** (A≈0, I≈0): konkretny kod,
  od którego wszystko zależy — każda zmiana boli (wyjątek: rzeczy stabilne z natury, np. biblioteka standardowa).
  **Strefa bezużyteczności** (A≈1, I≈1): abstrakcje, których nikt nie używa — usuń.

**W praktyce (Nx / Java)**
- Biblioteki z tagami typu (`type:feature`, `type:ui`, `type:data-access`, `type:util`, `type:domain`) i reguła
  `@nx/enforce-module-boundaries` utrwalają kierunek zależności (tool-nx).
- Metryki liczysz dla kilku krytycznych komponentów raz na kwartał lub przy przeglądzie architektury
  (eng-codebase-mapping daje graf), nie dla całego repo co commit. Wynik to sygnał do rozmowy, nie ocena.

## Źródła
- R. C. Martin, *Clean Architecture* (2017) — paradygmaty, polityka i szczegół, granice, zasady komponentów i metryki.
- R. C. Martin, [Screaming Architecture](https://blog.cleancoder.com/uncle-bob/2011/09/30/Screaming-Architecture.html) (2011).
- [roadmap.sh — Software Design and Architecture](https://roadmap.sh/software-design-architecture) (tematy: component
  principles, policy vs detail, boundaries, keep framework code distant, organize code by actor, programming paradigms).
Opisane własnymi słowami.
