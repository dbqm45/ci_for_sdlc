# Strategia, plan testów, raportowanie i analiza ucieczek

## Podstawowe rozróżnienia
- **Weryfikacja** — „czy budujemy produkt dobrze?” (zgodność ze specyfikacją: przeglądy, testy automatyczne).
  **Walidacja** — „czy budujemy dobry produkt?” (czy rozwiązuje potrzebę: UAT, testy z użytkownikami, metryki po
  wydaniu — fe-ux-design, proc-product-discovery). Projekt może przejść weryfikację i oblać walidację.
- **Podejście**: czarna skrzynka (zachowanie ze specyfikacji, bez znajomości kodu — clean-room, qa-spec-first-testing),
  biała skrzynka (ścieżki w kodzie, pokrycie gałęzi — testy jednostkowe programisty), szara skrzynka (częściowa wiedza:
  schemat bazy, kontrakty API, logi — testy integracyjne i eksploracyjne).
- **Rodzaje uruchomień**:
  | Rodzaj | Cel | Zakres |
  |---|---|---|
  | dymny (smoke) | czy build w ogóle nadaje się do testowania lub czy wdrożenie żyje | kilka ścieżek krytycznych, minuty |
  | sanity | czy konkretna poprawka działa i nie zepsuła najbliższego otoczenia | wąsko, wokół zmiany |
  | regresja | czy nic wcześniej działającego się nie zepsuło | szeroko, warstwami (qa-regression) |
  | UAT | czy biznes akceptuje rozwiązanie w swoich scenariuszach | scenariusze użytkowników, przez nich (qa-exploratory-manual) |
- **Myślenie testera**: pytaj, co się stanie, gdy założenie nie zachodzi (puste, za długie, równocześnie, w złej
  kolejności, bez uprawnień, bez sieci); myśl jak użytkownik i jak napastnik; zgłaszaj fakty z dowodem, nie opinie;
  pragmatyzm — głębokość testów zależy od ryzyka, nie od ambicji.

## Testowanie w modelu wytwarzania
- **Model V**: każdemu etapowi specyfikacji odpowiada poziom testów (wymagania ↔ akceptacyjne, architektura ↔
  systemowe i integracyjne, projekt modułu ↔ jednostkowe); przypadki projektujesz w chwili powstania specyfikacji,
  nie po implementacji. Ta zasada działa też w pracy zwinnej.
- **Zwinnie** (Scrum, Kanban, XP): jakość to odpowiedzialność całego zespołu; tester uczestniczy w doprecyzowaniu
  historyjek (Example Mapping — eng-testing), testy w Definition of Done (proc-agile), automatyzacja w tym samym
  sprincie co funkcja.
- **Przesunięcie w lewo**: przegląd wymagań i projektu, testy przed kodem (TDD/ATDD), statyczna analiza i skany w PR.
  **W prawo**: monitorowanie syntetyczne, flagi i canary, błędy z produkcji jako sygnał jakości
  (qa-regression, `dane-srodowiska-i-specjalne.md`).

## Plan testów (`docs/project/05-plan/test-plan.md`)
Krótko i dla tej zmiany lub wydania, nie dokument dla dokumentu. Sekcje (zgodne co do idei z ISO/IEC/IEEE 29119-3):
1. **Zakres**: co testujemy i czego nie (z uzasadnieniem).
2. **Ryzyka produktowe** i priorytety (SKILL.md: testowanie oparte na ryzyku).
3. **Podejście**: poziomy i rodzaje testów, techniki, co automatyzujemy, co ręcznie, wymagania niefunkcjonalne
   (wydajność — qa-performance-testing, dostępność, bezpieczeństwo).
4. **Środowiska i dane testowe**; zależności zewnętrzne i ich zaślepki.
5. **Kryteria wejścia** (np. build przechodzi testy dymne, środowisko gotowe) i **wyjścia** (np. brak otwartych
   defektów krytycznych, wszystkie przypadki wysokiego ryzyka wykonane, znane problemy zaakceptowane przez właściciela).
6. **Harmonogram, role, rezultaty** (raport, zgłoszenia, zaktualizowana regresja).
7. **Ryzyka projektu testów** (brak danych, niestabilne środowisko) i plan na nie.

## Raport z testów
- Dla odbiorcy: decyzja („czy wydajemy?”) na górze — stan względem kryteriów wyjścia, otwarte ryzyka, rekomendacja.
- Liczby: wykonane / zaliczone / niezaliczone / zablokowane według ryzyka, defekty według wagi i stanu, pokrycie
  **wymagań** (każde kryterium akceptacji ma wynik), znane problemy z akceptacją.
- Raport techniczny z CI: format JUnit XML (czyta go każdy system CI), HTML z Playwright lub Allure (historia, kroki,
  zrzuty, nagrania, kategorie błędów). Raport z danymi osobowymi lub sekretami w zrzutach nie wychodzi poza zespół.
- Metryki jakości do uczenia się, nie do oceny ludzi: defekty, które uciekły na produkcję (i dlaczego), czas od
  zgłoszenia do naprawy, odsetek testów niestabilnych. „Gęstość defektów” i procent pokrycia linii łatwo
  zmanipulować — nie robią z nich celów.

## Analiza ucieczek (RCA defektu)
Dla każdego poważnego defektu z produkcji, oprócz poprawki:
1. Przyczyna techniczna (5 × dlaczego, bez szukania winnych — ops-sre-incidents).
2. **Dlaczego testy go nie złapały** — jedna z kategorii: brak wymagania lub niejasne wymaganie; wymaganie było,
   brak przypadku; przypadek był na złym poziomie (np. tylko jednostkowo, a błąd w integracji); test istniał,
   ale oczekiwany wynik był z kodu (test lustrzany — qa-spec-first-testing); różnica środowiska lub danych; test
   niestabilny i zignorowany.
3. Działanie: test regresji na właściwym poziomie (najpierw czerwony), zmiana w procesie, jeśli kategoria się powtarza.

## Źródła
- ISTQB Certified Tester Foundation Level Syllabus (v4.0); ISO/IEC/IEEE 29119-3 (dokumentacja testów)
- [roadmap.sh — QA](https://roadmap.sh/qa) (QA mindset, verification & validation, testing approaches, smoke, sanity,
  UAT, SDLC models, test planning, reporting, Allure, RCA)
Opisane własnymi słowami.
