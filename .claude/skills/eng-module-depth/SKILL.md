---
name: eng-module-depth
description: Użyj przy projekcie interfejsu modułu — głębokie moduły, test usunięcia, spoiny i adaptery, płytkie moduły.
metadata:
  katalog: "Użyj przy projektowaniu interfejsu modułu i przeglądzie architektury pod kątem płytkich modułów — słownik (moduł, interfejs, głębokość, spoina, adapter), test usunięcia, kategorie zależności, „zaprojektuj dwa razy”, raport kandydatów do pogłębienia. Nie do mapy całego repo (eng-codebase-mapping) ani audytu długu (eng-tech-debt-audit)."
---

# Głębokie moduły

Cel: dużo zachowania za małym interfejsem, w dobrze wybranym miejscu, testowalne przez ten interfejs. Zyskują wywołujący
(dźwignia), utrzymujący (lokalność) i testy. To słownik i procedura przeglądu — sam skill niczego nie refaktoryzuje.

## Słownik (używaj dokładnie tych słów)
| Pojęcie | Znaczenie | Unikaj |
|---|---|---|
| **moduł** | wszystko, co ma interfejs i implementację: funkcja, klasa, pakiet, wycinek przez warstwy | komponent, serwis (w tym znaczeniu) |
| **interfejs** | wszystko, co wywołujący musi wiedzieć: sygnatura **oraz** niezmienniki, kolejność wywołań, tryby błędów, wymagana konfiguracja, wydajność | „API”, „sygnatura” (za wąskie) |
| **głębokość** | ile zachowania można uruchomić na jednostkę interfejsu, której trzeba się nauczyć; płytki = interfejs prawie tak złożony jak implementacja | stosunek linii kodu (nagradza pompowanie) |
| **spoina** (ang. *seam*, Feathers) | miejsce, w którym zmienisz zachowanie bez edycji w tym miejscu — tam leży interfejs | „granica” (koliduje z granicą kontekstu w DDD) |
| **adapter** | konkretna rzecz spełniająca interfejs w spoinie (repozytorium Postgres i fake w pamięci to oba adaptery) | — |
| **dźwignia** | co dostaje wywołujący: więcej możliwości na jednostkę interfejsu | — |
| **lokalność** | co dostaje utrzymujący: zmiana, błąd i weryfikacja w jednym miejscu | — |
Pojęcia domeny bierzesz ze słownika projektu (`docs/project/02-domain/glossary.md`): „moduł przyjmowania Zamówień”,
nie „OrderHandler”.

## Zasady
0. **Najpierw: czy w ogóle modularyzować.** Prototyp lub rozwiązanie jednorazowe, system z góry na jeden moduł albo brak
   złożoności to powód, żeby nie dzielić — ocena wstępna w ddd-discovery-intake (pytania o cykl życia i złożoność).
1. **Głębokość to cecha interfejsu.** Moduł może mieć w środku małe wymienne części i własne, wewnętrzne spoiny — nie
   wystawiasz ich na zewnątrz tylko dlatego, że używają ich testy.
2. **Test usunięcia.** Wyobraź sobie, że moduł znika. Złożoność znika razem z nim → był przelotką. Złożoność wraca
   u N wywołujących → zarabia na siebie.
3. **Interfejs jest powierzchnią testów.** Wywołujący i testy przechodzą przez tę samą spoinę. Chcesz testować „za”
   interfejsem → moduł ma zły kształt.
4. **Jeden adapter = spoina hipotetyczna, dwa = prawdziwa.** Nie wprowadzaj portu, dopóki coś się w nim nie zmienia
   (zwykle: produkcja + test). Spoina z jednym adapterem to tylko pośrednictwo (eng-design-principles, YAGNI).
Pytania przy projektowaniu: czy da się zmniejszyć liczbę metod, uprościć parametry, ukryć więcej w środku? Przyjmuj
zależności zamiast je tworzyć; zwracaj wynik zamiast robić skutki uboczne.

## Kategorie zależności — jak testować pogłębiony moduł
| Kategoria | Przykład | Strategia |
|---|---|---|
| w procesie | czyste obliczenia, stan w pamięci | scal moduły, testuj przez nowy interfejs, bez adaptera |
| lokalnie zastępowalna | baza z lekkim zamiennikiem (kontener testowy, PGlite), system plików w pamięci | zamiennik w testach, spoina wewnętrzna |
| zdalna, ale nasza | własna usługa za siecią | port w spoinie; adapter HTTP/kolejka w produkcji, w pamięci w testach |
| naprawdę zewnętrzna | bramka płatności, SMS | port wstrzykiwany, w testach mock adaptera |
**Zastępuj, nie dokładaj:** gdy są testy na interfejsie pogłębionego modułu, stare testy płytkich modułów usuwasz.
Testy sprawdzają wynik obserwowalny przez interfejs; jeśli test musi się zmienić przy zmianie implementacji, testuje za
głęboko (eng-testing).

## Procedura A — przegląd: kandydaci do pogłębienia
1. **Zakres przed skanem.** Kierunek od człowieka (moduł, ból) ma pierwszeństwo. Bez niego — gorące miejsca z historii
   (`git log --since=6.months --name-only`, jak w eng-tech-debt-audit): pogłębienie opłaca się tam, gdzie kod się zmienia.
   Przeczytaj słownik domeny i ADR z tego obszaru.
2. **Szukaj tarcia** (zwykle tani `scout`): zrozumienie jednego pojęcia wymaga skakania po wielu małych modułach;
   interfejs prawie jak implementacja; czyste funkcje wydzielone „dla testów”, a błędy siedzą w sposobie wywołania; moduły
   przeciekające przez spoiny; kod nietestowalny przez obecny interfejs. Na każdym podejrzanym — test usunięcia.
3. **Raport** `docs/project/07-review/<data>-poglebienia.md` (albo strona HTML wg core-tech-docs, jeśli człowiek chce).
   Karta kandydata: pliki/moduły · problem (tarcie) · rozwiązanie prostym językiem · korzyść w kategoriach lokalności
   i dźwigni oraz co z testami · diagram przed/po · siła: **Mocny** (test usunięcia przechodzi, realne tarcie) /
   **Warto zbadać** / **Spekulatywny**. Na końcu: od którego zacząć i dlaczego.
4. **Bez interfejsów i bez zmian w kodzie** na tym etapie. Pytasz: „Który kandydat badamy?”. Jeden kandydat na sesję.
5. Kandydat sprzeczny z ADR — pokazujesz tylko, gdy tarcie uzasadnia powrót do decyzji, z wyraźnym ostrzeżeniem.
6. Po wyborze: przesłuchanie (core-plan-interview) — ograniczenia, zależności, kształt modułu, co za spoiną, które testy
   przetrwają. Nowe pojęcie → słownik od razu. Odrzucenie z trwałym powodem → zaproponuj ADR (próg w core-tech-docs),
   żeby kolejny przegląd nie podsuwał tego samego. Wynik to **decyzja**, nie diff.
7. Decyzja → specyfikacja → zadania (core-project-record); pozostałe kandydaty zapisz jako osobne zadania, zamiast
   ciągnąć je w tej samej sesji (raport, przesłuchanie, słownik i kod naraz przepełniają kontekst).

**Uwagi do przeglądu**
- **Najlepsze pytanie startowe** wskazuje kierunek rozwoju: „wchodzimy w <funkcja ze specyfikacji> — co zrobić, żeby ta
  zmiana była łatwa?”. Skan bez kierunku nadaje się do okresowego przeglądu (np. raz na sprint).
- Przegląd ma skłonność do znajdowania czegoś zawsze. „Brak mocnych kandydatów” to poprawny wynik; kandydatów
  `Spekulatywny` zwykle pomijasz.
- **Bardzo zaniedbany kod:** najpierw wspólny słownik (ddd-facilitation: słownik w istniejącym repo), potem przegląd —
  bez nazw pojęć kandydaci dostają wymyślone nazwy i nic nie wyjaśniają.
- **Kod bez testów:** przegląd wskazuje spoiny, w których da się zaczepić testy charakteryzujące
  (eng-behavior-preserving-refactoring), zanim cokolwiek zmienisz.
- Raport HTML bez skryptów z CDN: style w pliku, diagramy jako gotowe SVG — działa offline i bez łańcucha dostaw.

## Jak wymusić głębokość w kodzie
Głębokość opisana w ADR i tak się rozmyje, jeśli każdy plik da się zaimportować z dowolnego miejsca. Wybierz mechanizm:
| Stack | Mechanizm | Koszt |
|---|---|---|
| TS w Nx | biblioteka z publicznym `index.ts`; reguła `@nx/enforce-module-boundaries` z tagami (`scope:`, `type:`) blokuje głębokie importy i zakazane kierunki | konfiguracja tagów (tool-nx) |
| TS poza monorepo | pole `exports` w `package.json` pakietu; `no-restricted-imports` albo dependency-cruiser dla ścieżek wewnętrznych | reguły trzeba utrzymywać |
| TS w jednym pliku | klasa lub domknięcie z jedną publiczną funkcją | duże pliki, słaba nawigacja |
| Java | pakiet z klasami package-private i jedną klasą publiczną; moduły JPMS (`exports`); testy ArchUnit | dyscyplina pakietów |
Reguła w lincie lub teście architektury jest lepsza niż zapis w dokumentacji — łamanie spoiny wychodzi w CI.

## Procedura B — zaprojektuj dwa razy
Pierwszy pomysł rzadko jest najlepszy (Ousterhout). Gdy trzeba wybrać interfejs:
1. Opisz człowiekowi przestrzeń problemu: ograniczenia, zależności (kategoria z tabeli), szkic kodu tylko jako ilustracja.
2. Uruchom równolegle (jedna wiadomość) 3 tanie podagenty, każdy z innym ograniczeniem: (a) minimalny interfejs, 1–3
   punkty wejścia; (b) elastyczność i rozszerzalność; (c) najprostszy typowy przypadek. Czwarty opcjonalnie: porty i adaptery.
   Każdy dostaje ten sam brief techniczny i oba słowniki.
3. Każdy zwraca: interfejs (z niezmiennikami, kolejnością, błędami), przykład użycia, co ukrywa, strategię zależności,
   gdzie dźwignia jest duża, a gdzie cienka.
4. Porównaj prozą po głębokości, lokalności i miejscu spoiny. Daj własną rekomendację (także hybrydę) — nie samo menu.

## Wynik dobry, gdy
Rozmowa używa słów „moduł, interfejs, spoina”; każda proponowana spoina ma nazwany drugi adapter; dyskusja o interfejsie
obejmuje niezmienniki i błędy; kandydaci leżą w niedawno zmienianym kodzie i noszą nazwy pojęć domeny; nic nie zostało
zrefaktoryzowane bez decyzji człowieka.

## Źródło
[mattpocock/skills](https://github.com/mattpocock/skills) (MIT): `codebase-design` (z DEEPENING, DESIGN-IT-TWICE)
i `improve-codebase-architecture`; opisy: [aihero.dev/skills-codebase-design](https://www.aihero.dev/skills-codebase-design), [aihero.dev/skills-improve-codebase-architecture](https://www.aihero.dev/skills-improve-codebase-architecture). Opisane własnymi
słowami i dopasowane do dziennika projektu; J. Ousterhout, *A Philosophy of Software Design*; M. Feathers,
*Working Effectively with Legacy Code*.
