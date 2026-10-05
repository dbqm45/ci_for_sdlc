# Przebieg próbny — jak sprawdzić, czy fabryka dowozi projekt

Cel: zmierzyć na małym, prawdziwym projekcie, czy fabryka przeprowadza go od pomysłu do stanu gotowego do wdrożenia,
ile to kosztuje i gdzie potrzebuje człowieka. Wynikiem jest raport z liczbami i lista poprawek do fabryki, a nie
tylko działająca aplikacja.

Gotowy zestaw (pomysł z decyzjami właściciela produktu, polecenia krok po kroku, arkusz pomiarów) jest
w repozytorium fabryki: `docs/pilot/`.

## Wybór projektu
- Mały, ale kompletny: kilka przypadków użycia, logowanie, baza, jedna integracja lub zadanie w tle, wdrożenie na
  środowisko testowe. Przykład: rezerwacja sal w biurze (kalendarz sal, rezerwacja z kontrolą konfliktów, anulowanie,
  powiadomienie e-mail, panel administratora).
- Ze stacku, który fabryka zna najlepiej (TypeScript lub Java, PostgreSQL, Docker, CI).
- Bez danych produkcyjnych i bez prawdziwych użytkowników z zewnątrz. Środowisko testowe w kontenerach lub
  lokalnym klastrze, poczta przez lokalny serwer testowy (np. Mailpit).
- Nowe, puste repozytorium z zainstalowaną fabryką (README fabryki, „Instalacja w projekcie”).

## Przebieg
1. **Faza 0**: `claude --agent maja` z opisem pomysłu w 3–5 zdaniach. Odpowiadaj na pytania jak właściciel
   produktu. Maja wybiera ścieżkę (dla tego przykładu skróconą albo pełną; zapisz, którą i dlaczego).
2. **Fazy 1–5**: uruchamiaj persony z Przekazania. Na bramkach czytaj TL;DR i akceptuj albo odsyłaj z uwagami.
3. **Faza 6**: realizacja krok po kroku; po każdym kroku sprawdź raport kroku i zielony CI.
4. **Faza 7**: przegląd gotowości w pełnej wersji (`gotowosc-produkcyjna.md`), także przećwiczone wycofanie
   i przywracanie kopii na środowisku testowym.
5. **Faza 8**: wdrożenie na środowisko testowe tak, jakby było produkcją: strategia stopniowa, obserwacja, retrospektywa.

## Co mierzyć (zapisuj w trakcie w `docs/project/07-review/<data>-przebieg-probny.md`)
| Miara | Jak |
|---|---|
| czas na fazę | od startu sesji do artefaktu `proposed` |
| koszt | tokeny lub kwota z panelu, rozbite na persony i modele |
| interwencje człowieka | liczba i rodzaj: odpowiedź na pytanie, poprawka merytoryczna, poprawka techniczna, odblokowanie (konto, sekret) |
| odesłania na bramkach | ile razy artefakt wrócił do poprawki i dlaczego |
| defekty | znalezione przez testy fabryki, przez przegląd, przez człowieka, po wdrożeniu (te ostatnie są najważniejsze) |
| zgodność z wymaganiami | ile kryteriów akceptacji spełnionych przy B4 |
| punkty gotowości | spełnione / niespełnione / zaakceptowane ryzyka |
| ciągłość | czy każda sesja zaczęła od dziennika bez powtarzania pracy poprzedniej |

## Ocena
- **Fabryka dowozi**, gdy: wszystkie kryteria „musi” spełnione, przegląd gotowości bez niespełnionych punktów
  *(minimum)*, wycofanie i przywracanie zadziałały, człowiek nie musiał pisać ani poprawiać kodu, a interwencje
  dotyczyły decyzji, nie naprawiania pracy agentów.
- **Dowozi z pomocą**, gdy człowiek musiał poprawiać artefakty lub kod, ale projekt doszedł do B4.
- **Nie dowozi**, gdy projekt utknął przed B4 albo defekty po wdrożeniu dotyczą wymagań „musi”.
Każdą interwencję techniczną i każde odesłanie zamień na wniosek: której fazy, persony lub skilla dotyczy i co w nim
zmienić.

## Wnioski do fabryki
- Lekcje projektu (core-project-record, `lessons.md`) dotyczą tego projektu. Poprawki fabryki (skille, role,
  persony, hooki) zapisz osobno jako listę propozycji dla człowieka, bo zmiany w `factory/` i `.claude/hooks/`
  wymagają jego zgody (CLAUDE.md).
- Powtórz przebieg po poprawkach na innym małym projekcie, żeby nie dopasować fabryki do jednego przykładu.
