# SLI, SLO, SLA w praktyce

Model trzech poziomów (piramida): **SLI** to metryka, **SLO** to metryka z progiem, **SLA** to próg z konsekwencjami.
Każdy kolejny poziom opiera się na poprzednim — nie ma sensownego SLA bez SLO ani SLO bez zdefiniowanego SLI.

## 1. Wybór SLI
Najpierw pytanie: co użytkownik uzna za „działa”? Dopiero potem metryka.

| Typ usługi | Typowe SLI |
|---|---|
| API / usługa HTTP | dostępność (odsetek żądań bez 5xx), latencja (odsetek żądań szybszych niż próg), przepustowość jako kontekst |
| frontend | odsetek wczytań strony bez błędu, Core Web Vitals (np. odsetek wizyt z LCP < 2,5 s — fe-web-platform) |
| kolejka / przetwarzanie asynchroniczne | świeżość (odsetek wiadomości obsłużonych w ciągu N s), odsetek przetworzonych bez błędu |
| zadanie wsadowe | odsetek przebiegów zakończonych przed terminem, poprawność wyniku |
| magazyn danych | trwałość, odsetek odczytów i zapisów udanych, latencja |
| funkcja AI | trzy warstwy: infrastruktura, inferencja, zachowanie (skill, sekcja 2) |

Zasady:
- SLI zapisuj jako **stosunek**: dobre zdarzenia / wszystkie ważne zdarzenia × 100%. Wtedy każde SLI ma tę samą skalę
  0–100% i ten sam sposób liczenia budżetu.
- Mierz jak najbliżej użytkownika (load balancer, brama API, RUM w przeglądarce), a nie w środku systemu.
- Wykluczenia jawne: np. błędy 4xx po stronie klienta, żądania od sond i testów syntetycznych.
- Przepustowość (ile żądań system obsłuży) to zwykle wymaganie pojemności, a nie SLI — opisuje, czy SLO utrzymamy
  pod obciążeniem (arch-quality-attributes).
- Latencja: percentyle, nie średnia — średnia ukrywa ogon, który widzi część użytkowników. Próg latencji wpisuj do SLI
  („żądanie jest dobre, gdy trwa < 300 ms”), żeby dostępność i szybkość liczyć tak samo.
- 3–5 SLI na usługę wystarczy; więcej rozmywa uwagę.

## 2. Specyfikacja SLO (wzór)
```
Usługa:        orders-api
Ścieżka:       złożenie zamówienia
SLI:           odsetek żądań POST /orders zakończonych kodem < 500 i w czasie < 800 ms,
               mierzony na load balancerze; bez żądań sond i testów syntetycznych
Cel:           99,9%
Okno:          kroczące 28 dni
Budżet:        0,1% żądań (przy 2 mln żądań na 28 dni ≈ 2000 złych żądań)
Właściciel:    zespół zamówień
Polityka:      budżet < 25% → tylko zmiany poprawiające niezawodność, wymagany przegląd każdego wydania
Przegląd SLO:  co kwartał (czy cel nadal odpowiada oczekiwaniom użytkowników i biznesu)
```
- **Okno kroczące** (np. 28 lub 30 dni) lepiej oddaje odczucia użytkowników; okno kalendarzowe (miesiąc) pasuje do
  raportów i SLA.
- Cel ustalasz z danych historycznych i z potrzeb biznesu, nie „z sufitu”; zaczynasz od celu, który zespół dziś spełnia,
  i zaostrzasz go, gdy rośnie potrzeba.

## 3. Ile to jest w czasie
Budżet niedostępności w oknie 30 dni (43 200 minut):

| SLO | Budżet |
|---|---|
| 99% | 7 h 12 min |
| 99,5% | 3 h 36 min |
| 99,9% | 43,2 min |
| 99,95% | 21,6 min |
| 99,99% | ok. 4,3 min |

Przy SLI opartym na żądaniach budżet to liczba złych żądań, a nie minuty — krótka, całkowita awaria w nocy zużywa go
mniej niż długa, częściowa w godzinach szczytu.

## 4. Zależności i SLA
- Usługa wywołująca szeregowo kilka zależności ma dostępność nie wyższą niż iloczyn ich dostępności:
  trzy zależności po 99,9% dają co najwyżej ok. 99,7%. Wyższe SLO wymaga redundancji, pamięci podręcznej, trybu
  zdegradowanego (skill, sekcja 8) albo usunięcia zależności z krytycznej ścieżki.
- Sprawdź SLA dostawców (chmura, płatności, poczta): Twoje SLO nie może obiecywać więcej niż ich SLA, chyba że masz
  obejście. Konsekwencją SLA dostawcy są zwykle kredyty na usługi, a nie pokrycie Twoich strat.
- SLA dla klienta ustalasz luźniej niż wewnętrzne SLO (np. SLO 99,9%, SLA 99,5%) i z jasną definicją pomiaru,
  wyłączeń (prace planowe) i sposobu zgłaszania roszczeń.

## 5. Typowe błędy
- SLI mierzone na zasobach (CPU, pamięć) zamiast na doświadczeniu użytkownika.
- Średnia zamiast percentyla; brak definicji „awarii”.
- SLO równe SLA — pierwsze naruszenie celu od razu kosztuje.
- Cel 100% albo tak wysoki, że żadne wydanie się nie mieści w budżecie.
- SLO bez właściciela, polityki budżetu i regularnego przeglądu — wtedy to tylko dashboard.
- Te same metryki dla wszystkich typów usług; usługa wsadowa, magazyn danych i API potrzebują innych SLI.

## Źródła
- [Service Level Objectives (SLI, SLO, SLA) Explained Simply](https://froehlich.medium.com/service-level-objectives-sli-slo-sla-explained-simply-fb4b91dd4a07) — Steve Froehlich, 2023 (piramida SLI → SLO → SLA, przykładowe SLI, definicja awarii przez próg błędów, SLA z konsekwencjami)
- [Google SRE Book — Service Level Objectives](https://sre.google/sre-book/service-level-objectives/)
- [Google SRE Workbook — Implementing SLOs](https://sre.google/workbook/implementing-slos/)
- Obliczenia budżetu i dostępności złożonej: własne.
