# TDD z agentem — pionowe plasterki na uzgodnionych spoinach

Uzupełnienie cyklu z SKILL.md dla pracy agenta. Słownik (moduł, interfejs, spoina, adapter): eng-module-depth.

## Zanim powstanie pierwszy test
- **Nazwij spoiny** (publiczne interfejsy, przez które obserwujesz zachowanie) i **zatrzymaj się na potwierdzenie**.
  Testu w niepotwierdzonej spoinie nie piszesz. Wszystkiego nie przetestujesz — uzgodnienie spoin kieruje wysiłek na
  krytyczne ścieżki i złożoną logikę, nie na każdy przypadek brzegowy. Spoiny zwykle ustala się już przy specyfikacji
  (qa-spec-first-testing) albo w briefie zadania.
- Nazwy testów i interfejsów — słowami ze słownika domeny; szanuj ADR z obszaru.
- Gdy niejasny jest sam kształt interfejsu — najpierw eng-module-depth, potem testy.

## Pętla
1. **Jeden plasterek na cykl:** jedna spoina, jeden test, minimalna implementacja. Pierwszy cykl to **pocisk smugowy** —
   jedna ścieżka od początku do końca, która dowodzi, że całość się łączy.
2. Red → green; nie przewiduj kolejnych testów, nie dodawaj funkcji „na zapas”.
3. Następny test wynika z tego, czego nauczył poprzedni cykl.
4. **Refaktoryzacja osobno** — po zielonym, jako osobny krok lub commit, zwykle przy review. Agenci w praktyce pomijają
   ją w pętli, więc wpisz ją jawnie w plan albo w listę przeglądu, zamiast zakładać, że „sama się zrobi”.

## Trzy anty-wzorce
| Anty-wzorzec | Sygnał | Zapobieganie |
|---|---|---|
| **test związany z implementacją** | test pada po zmianie nazwy funkcji wewnętrznej, choć zachowanie się nie zmieniło; mocki własnych modułów, liczenie wywołań, sprawdzanie przez zapytanie do bazy zamiast przez interfejs | testuj tylko przez interfejs; zapisany obiekt sprawdzasz, odczytując go publiczną metodą |
| **test tautologiczny** | oczekiwana wartość liczona tak samo jak w kodzie (`expect(suma(a, b)).toBe(a + b)`), migawka wyprowadzona tym samym sposobem | oczekiwana wartość ze specyfikacji, znanego literału albo przeliczonego ręcznie przykładu (`toBe(15)`) |
| **cięcie poziome** | najpierw paczka testów, potem cały kod | testy sprawdzają wyobrażone zachowanie i kształt, a nie to, czego potrzebuje użytkownik → pionowe plasterki |

## Mocki tylko na granicy systemu
- Mockujesz: zewnętrzne API (płatności, e-mail), czas, losowość; czasem system plików i bazę (lepiej baza testowa).
- Nie mockujesz: własnych klas i modułów, wewnętrznych współpracowników — niczego, nad czym masz kontrolę.
- Zależności zewnętrzne **wstrzykuj** (nie twórz klienta w środku funkcji).
- Klient zewnętrznego API w stylu SDK — osobna funkcja na operację (`pobierzUzytkownika`, `utworzZamowienie`) zamiast
  jednego ogólnego `fetch(endpoint, opcje)`: mock zwraca jeden kształt, bez warunków w konfiguracji testu, z typami.

## Pętla w większym przepływie
- Kolejność: przesłuchanie → specyfikacja (tu uzgadniasz spoiny) → zadania → TDD w każdym zadaniu → review.
- **Review sprawdza spoiny:** czy testy powstały tylko w uzgodnionych spoinach, czy nazwy opisują zachowanie, czy są mocki
  własnych modułów. Refaktoryzację robi się przy review, nie w pętli.
- Agent nie widzi innych zadań: do zadania dołącz specyfikację (link), nie sam opis zadania; zadania tnij tak, żeby każde
  dało się domknąć jedną pętlą.
- Niejasny wybór spoiny → poproś agenta o porównanie 2–3 wariantów (co każdy pozwala testować, co ukrywa), zanim
  potwierdzisz.
- Agenci bez pilnowania czasem piszą kod przed testem. W fabryce kolejność wymusza hook `tdd_guard`: kod produkcyjny
  dopiero po edycji testu i czerwonym uruchomieniu. Przy kluczowych plasterkach sprawdź w raporcie, czy czerwony wynik
  był z właściwego powodu.

## Działa dobrze, gdy
Agent nazywa spoiny i czeka przed pierwszym plikiem testów; testy pojawiają się po jednym (pada → minimalny kod → następny);
nazwy testów opisują możliwość użytkownika („zamówienie z poprawnym koszykiem zostaje potwierdzone”), nie wnętrze
(„wywołuje paymentService.process”); zmiana nazw wewnętrznych nie psuje żadnego testu; mocki są tylko na granicy.
Wolne testy E2E/przeglądarkowe uruchamiasz na końcu (zapisz to w `CLAUDE.md` projektu).
Praca bez określonego zachowania (konfiguracja, klej, proste CRUD) — TDD ma tu małą wartość; wystarczy test integracyjny
ścieżki.

## Źródło
[mattpocock/skills](https://github.com/mattpocock/skills) (MIT), skill `tdd` (z plikami o dobrych testach i mockowaniu);
opis: [aihero.dev](https://www.aihero.dev/skills-tdd). Opisane własnymi słowami.
