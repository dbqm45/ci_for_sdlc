---
name: ddd-strategic-analysis
description: Użyj przy podziale domeny na subdomeny (core, supporting, generic) i granicach kontekstów; strategia (Cynefin).
metadata:
  katalog: "Użyj przy wyborze strategii analizy (Cynefin, top-down vs bottom-up), podziale domeny na subdomeny (core, supporting, generic) i wyznaczaniu granic kontekstów (bounded contexts). Nie do relacji między kontekstami (ddd-context-mapping) ani prowadzenia warsztatu (ddd-event-storming)."
---

# Analiza strategiczna

## Czy DDD ma tu sens?
Warto, gdy domena jest złożona z natury (**złożoność istotna**, której nie da się usunąć bez utraty funkcji),
jest dostęp do ekspertów i zespół potrafi iteracyjnie „przemielać” wiedzę. Nie warto, gdy wyzwaniem jest
skala lub ergonomia, a nie reguły biznesowe (np. prosty blog) — wtedy rób prosto.
Uważaj na **złożoność przypadkową** (z wybranych rozwiązań): nowy framework, protokół czy modne słowo nie naprawią złego modelu.

Formalną ocenę wstępną („czy modularyzować?” — trzy pytania, werdykt człowieka) i obszary biznesowe oparte na dowodach
przygotowuje ddd-discovery-intake. Obszar z intake to **wejście** do tej analizy, nie gotowy kontekst.

## Krok 1: Big Picture, żeby zobaczyć, gdzie jesteśmy
Zanim wybierzesz metodę, zrób Event Storming Big Picture (ddd-event-storming): jakie są procesy wysokiego poziomu,
jakie **pytania kluczowe** padają w wielu miejscach i rozgałęziają proces. Na tej podstawie oceń obszary wg Cynefin.

## Krok 2: Cynefin — wybór sposobu analizy
| Strona | Domena | Rozpoznasz po | Jak analizować |
|---|---|---|---|
| **Prawa (uporządkowana)** | Oczywista, Skomplikowana | eksperci się zgadzają, są procedury/regulacje, przyczyna → skutek da się ustalić (czasem przez eksperta) | biznes jest zwykle **procesowy** → **analiza top-down**: najpierw procesy, potem projekt |
| **Lewa (nieuporządkowana)** | Złożona, Chaotyczna | eksperci się nie zgadzają, nowy produkt/rynek, dużo „nie wiemy”, skutki widać dopiero po fakcie | **zrób i sprawdź** (probe → sense → respond) → **analiza bottom-up** |

Różne części jednej domeny mogą leżeć po różnych stronach — dobierz podejście per obszar, nie dla całego systemu.
Archetypy biznesowe (ddd-archetypes) najlepiej sprawdzają się po prawej stronie.

### Top-down (prawa strona)
1. Big Picture → lista procesów wysokiego poziomu i zdarzeń przełomowych.
2. Process Level dla kluczowych procesów (zacznij od core domain i od największych problemów z głosowania).
3. Wyznacz konteksty i relacje między nimi (ddd-context-mapping).
4. Design Level w wybranych kontekstach → projekt (ddd-tactical-design).

### Bottom-up (lewa strona)
1. Zacznij od **konkretnych przypadków** i przykładów, nie od ogólnego procesu.
2. Zbuduj mały model dla jednego przypadku, sprawdź go w praktyce (prototyp, spike, test z użytkownikiem).
3. Uogólniaj dopiero, gdy kolejne przypadki potwierdzają wzorzec; decyzje trzymaj odwracalne.
4. W systemie istniejącym: czytaj kod i dane — słownik z nazw klas/tabel, pola „status”, „klasy-bogowie”,
   powtarzające się warunki; zrekonstruuj zdarzenia z kodu i zweryfikuj je z ekspertem.

## Krok 3: Destylacja — subdomeny
| Typ | Pytanie rozpoznające | Inwestycja |
|---|---|---|
| **Core** | Czy to daje przewagę konkurencyjną? Czy gdyby to kupić, stracilibyśmy wyróżnik? | najlepsi ludzie, pełne DDD, głęboki model, ciągła pielęgnacja (jak bonsai) |
| **Supporting** | Potrzebne do działania, ale nie wyróżnia nas | prościej, niższa poprzeczka, kandydat do outsourcingu |
| **Generic** | Każda firma ma to samo (fakturowanie, uwierzytelnianie) | kupić/użyć gotowego, zintegrować przez ACL |

## Krok 4: Granice kontekstów — heurystyki
Kontekst to granica, wewnątrz której model i język są spójne. Wyznaczaj go na podstawie **zachowania i języka**, nie rzeczowników.
- **Język**: to samo słowo znaczy co innego → różne konteksty.
- **Zdarzenia przełomowe** i zmiana swimlane → naturalne cięcia.
- **Autonomia**: czy ta część może podejmować decyzje i wdrażać zmiany bez pytania innych?
- **Różny rytm zmian i różni aktorzy/działy** → osobne konteksty.
- **Pytania kluczowe**: kontekst, który „jest właścicielem odpowiedzi” na pytanie zadawane w wielu miejscach.
- **Zdolność (capability) zamiast produktu**: wydziel ogólną zdolność (np. „dostępność zasobów”), a nie produktowy wariant
  („rezerwacja aut”, „rezerwacja sal”) — produkty się zmieniają, zdolność zostaje.
- **Klasa problemu**: CRUD, obliczenia, integracja i konkurencja o zasoby zwykle chcą różnych modeli (ddd-deep-modeling).
- **Spójność**: reguły, które muszą być spójne natychmiast, nie mogą przechodzić przez granicę kontekstu.
- **Algorytm pod spodem** (ddd-algorithm-recognition): ten sam algorytm w kilku obszarach → kandydat do połączenia lub wspólnego jądra;
  te same słowa, różne algorytmy → szew, czyli prawdopodobna granica; brak znanego algorytmu → kandydat na core, analiza bottom-up.

Anty-wzorce: kontekst = encja („Serwis Klienta” z każdym zachowaniem klienta), kontekst = warstwa techniczna,
kontekst = zespół bez względu na język, mieszanie kontekstów „bo tak szybciej”.

## Zapis wyniku
`docs/project/02-domain/strategic.md`: obszary z oceną Cynefin i wybraną metodą, subdomeny z typem i uzasadnieniem, konteksty
(nazwa, odpowiedzialność, kluczowe pojęcia, zdarzenia wejściowe/wyjściowe, właściciel), otwarte pytania.
Decyzje o granicach → ADR (core-tech-docs).

## Sprawdzenie granic przed decyzją
- **Test obciążeniowy metryką biznesową** (ddd-model-stress-test): ten sam zamrożony zbiór wymagań, wygenerowany bez wglądu
  w architekturę, puszczony przeciw dwóm wariantom podziału — porównaj rozkład zmian lokalnych/rozproszonych/nowych modułów.
- **Pomiar sprzężeń** kluczowych par (ddd-connascence-analysis) — dla systemu istniejącego lub mapy kontekstów.
Wyniki dołącz do ADR jako dowód.
