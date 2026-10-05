---
name: qa-test-design
description: Użyj przy projekcie przypadków i planu testów — klasy równoważności, brzegi, tablice decyzyjne, stany, ryzyko.
metadata:
  katalog: "Użyj przy projektowaniu przypadków testowych i planu testów w dowolnej technologii — klasy równoważności, wartości brzegowe, tablice decyzyjne, przejścia stanów, testy parami, testowanie oparte na ryzyku, dobór poziomu testu, format przypadku z oczekiwanym wynikiem i jego źródłem. Nie do pisania kodu testów (tool-*)."
---

# Projektowanie testów

## Techniki — kiedy której użyć
| Technika | Kiedy | Jak |
|---|---|---|
| **Klasy równoważności** | dane wejściowe z zakresami/kategoriami | podziel na klasy poprawne i niepoprawne; jeden przypadek na klasę |
| **Wartości brzegowe** | każdy zakres i próg („od 10 sztuk”) | testuj **granicę, tuż pod i tuż nad** (9, 10, 11) oraz min/max/0/pusty |
| **Tablica decyzyjna** | kilka warunków daje różne wyniki (rabaty, uprawnienia) | kolumna = kombinacja warunków → oczekiwana akcja; usuń niemożliwe kombinacje |
| **Przejścia stanów** | obiekt ma stany (rezerwacja, zamówienie, blokada z archetypu Availability) | diagram stanów → test każdego dozwolonego przejścia **i** niedozwolonego (powinno zostać odrzucone) |
| **Testy parami (pairwise)** | wiele parametrów konfiguracji (przeglądarka × rola × język) | zestaw pokrywający każdą parę wartości zamiast pełnego iloczynu |
| **Scenariusze / przypadki użycia** | przepływy użytkownika end-to-end | ścieżka główna + alternatywne + błędów |
| **Zgadywanie błędów** | uzupełnienie powyższych | puste wartości, duplikaty, znaki specjalne, strefy czasowe, współbieżność, podwójne kliknięcie, utrata sieci |

## Priorytet — testowanie oparte na ryzyku
Ryzyko = **wpływ** (pieniądze, dane, bezpieczeństwo, reputacja) × **prawdopodobieństwo** (złożoność, nowość, historia błędów).
Wysokie ryzyko → więcej technik, niższe poziomy testów, testy mutacyjne; niskie → pojedynczy test ścieżki głównej.

## Poziom testu — „jak najniżej, jak najtaniej”
| Co sprawdzasz | Poziom |
|---|---|
| reguła biznesowa, obliczenie, walidacja, przejście stanu | **jednostkowy** (logika domeny, bez frameworka) |
| współpraca z bazą, kolejką, zewnętrznym API | **integracyjny** (prawdziwe zależności, np. kontenery testowe) |
| zgodność kontraktu między usługami/frontem a API | **kontraktowy** |
| komponent UI z interakcją | **komponentowy** (np. przeglądarka w Vitest) |
| krytyczna ścieżka użytkownika przez cały system | **e2e** (nieliczne) |
| wygląd | **wizualny** (zrzuty ekranu), dostępność — **automatycznie (axe) + ręcznie** |
Ten sam przypadek nie powinien być testowany na wszystkich poziomach — wybierz najniższy, który go wiarygodnie sprawdza.

## Format przypadku testowego
| ID | Wymaganie | Technika | Warunki wstępne | Kroki / wejście | **Oczekiwany wynik** | **Źródło wyniku** | Poziom | Priorytet |
|---|---|---|---|---|---|---|---|---|
| TC-014 | H1-AC2 | wartości brzegowe | koszyk pusty | 10 szt. × 20,00 zł | 190,00 zł (rabat 5%) | requirements.md: „od 10 sztuk włącznie 5%” | jednostkowy | H |
Kolumna **Źródło wyniku** jest obowiązkowa (qa-spec-first-testing). Brak źródła = otwarte pytanie, nie zgadywanie.

## Wymagania niefunkcjonalne (minimum)
- **Dostępność**: automatyczny skan (axe) + ręcznie klawiatura, fokus, czytnik ekranu dla kluczowych ścieżek.
- **Wydajność**: test dymny czasów odpowiedzi dla scenariuszy (H,H) z arch-quality-attributes.
- **Bezpieczeństwo**: walidacja wejścia, autoryzacja per zasób (test na 403 dla cudzego zasobu), brak danych wrażliwych w odpowiedziach.

Strategia i plan testów (weryfikacja vs walidacja, czarna/biała/szara skrzynka, dymne, sanity, regresja, UAT, model V
i praca zwinna, kryteria wejścia i wyjścia, raport z testów, analiza ucieczek defektów): `references/strategia-i-plan-testow.md`.
Testy wydajnościowe: qa-performance-testing.

## Wynik
`docs/project/05-plan/test-plan.md` (szablon core-project-record): zakres, ryzyka, techniki, poziomy, przypadki (lub link do
pliku z przypadkami), kryteria wejścia/wyjścia, podział na testy automatyczne i ręczne.
