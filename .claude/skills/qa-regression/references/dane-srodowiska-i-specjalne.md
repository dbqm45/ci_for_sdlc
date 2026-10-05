# Dane testowe, środowiska i testy specjalne

## Zarządzanie danymi testowymi
- **Domyślnie dane syntetyczne**: fabryki i budowniczowie w kodzie testów (z sensownymi wartościami domyślnymi
  i nadpisywaniem tylko tego, co ważne w teście), generatory (np. Faker z lokalizacją `pl` dla imion, adresów, NIP
  z poprawną sumą kontrolną). Każdy test tworzy własne dane i nie zależy od kolejności (SKILL.md).
- **Dane referencyjne** (słowniki, katalog produktów, konfiguracja) jako wersjonowany zestaw startowy (seed) ładowany
  skryptem, identyczny lokalnie i w CI.
- **Kopia produkcji** tylko za zgodą właściciela danych i po **nieodwracalnej anonimizacji** przed opuszczeniem
  produkcji: maskowanie zachowujące format i powiązania (ten sam klient → ten sam pseudonim we wszystkich tabelach),
  podzbiór danych zamiast całości, usunięcie danych szczególnych. Pseudonimizacja to nadal dane osobowe (RODO).
- **Dane do testów wydajności** w skali produkcji, ale syntetyczne (qa-performance-testing).
- Reset stanu: transakcja wycofywana po teście, osobny schemat lub baza per przebieg CI, kontenery testowe
  (Testcontainers). Testy E2E sprzątają przez API, nie przez UI.

## Testowanie e-maili
- Lokalnie i w CI przechwytujący serwer SMTP, np. **Mailpit** (SMTP na porcie 1025, interfejs WWW i REST API na 8025):
  aplikacja wysyła normalnie, test pobiera wiadomość przez API (`GET /api/v1/search?query=to:adres@test`,
  `GET /api/v1/message/{ID}`), sprawdza temat, odbiorcę, treść i link, a potem otwiera link w Playwright (reset hasła,
  potwierdzenie konta). Sprzątanie: `DELETE /api/v1/messages`.
- Unikalny adres per test (`uzytkownik+<uuid>@test.local`), żeby testy równoległe się nie mieszały.
- Mailpit ma też sprawdzenie linków, zgodności HTML z klientami poczty i (z SpamAssassinem) wskaźnika spamu.
  Wygląd w prawdziwych klientach (Outlook, Gmail) sprawdzasz osobnymi narzędziami podglądu.
- Nigdy prawdziwe skrzynki ani publiczne usługi tymczasowych adresów dla danych innych niż całkowicie testowe.

## Kompatybilność
- **Macierz z danych**, nie z przyzwyczajenia: przeglądarki, systemy i rozdzielczości z analityki produktu (np.
  pokrywające 95% ruchu) plus wymagania kontraktowe. Zapisz ją w planie testów.
- Playwright: projekty `chromium`, `firefox`, `webkit` w CI dla ścieżek krytycznych; reszta na jednym silniku.
  Emulacja urządzenia (rozmiar, dotyk, user agent) nie jest prawdziwym urządzeniem — kluczowe ścieżki mobilne
  sprawdzaj okresowo na prawdziwym Safari iOS i Chrome Android (farma urządzeń lub ręcznie).
- Wersja minimalna: co jeszcze wspieramy (np. dwie ostatnie wersje głównych przeglądarek) — z Browserslist w repo,
  ta sama lista dla budowania i testów.

## Aplikacje mobilne (gdy projekt je ma)
- Natywne: Espresso (Android) i XCUITest (iOS) — szybkie, stabilne, w języku platformy. Wieloplatformowo: Appium
  (WebDriver, wiele języków), Detox dla React Native (synchronizacja z aplikacją ogranicza niestabilność).
- Te same zasady co w webie: testy przez interfejs użytkownika tylko dla ścieżek krytycznych, reszta niżej; dane
  przygotowane przez API; emulatory w CI, prawdziwe urządzenia przed wydaniem.
- Specyfika: uprawnienia systemowe, przerwanie (połączenie, tło), słaba sieć i tryb samolotowy, aktualizacja
  aplikacji z zachowaniem danych, różne rozmiary i orientacje.

## Testy API (narzędzia)
Testy API trzymaj w repozytorium w kodzie, obok testów aplikacji: Playwright `request` lub supertest w TS, REST Assured
w Javie, Karate dla zespołów preferujących składnię BDD. Kolekcje Postman (uruchamiane przez Newman w CI) — gdy zespół
już ich używa; wtedy w repo, bez sekretów w zmiennych kolekcji. Walidacja odpowiedzi ze schematem OpenAPI
(be-api-design, `cykl-zycia-i-bezpieczenstwo.md`).

## Bezpieczeństwo w pracy QA
- Macierz autoryzacji: role × akcje × „swój / cudzy obiekt” jako testy API (be-auth-security, `modele-autoryzacji.md`).
- Skan DAST na stagingu: OWASP ZAP w trybie bazowym (pasywnym) w CI dla każdego wdrożenia, pełny skan aktywny
  okresowo i tylko na środowisku testowym — nigdy aktywny skan cudzych lub produkcyjnych systemów bez zgody.
- Przypadki z OWASP Top 10 i checklisty API (be-auth-security, `checklista-bezpieczenstwa-api.md`) w planie testów.

## Po wydaniu (przesunięcie w prawo)
- **Monitoring syntetyczny**: kilka testów Playwright ścieżek krytycznych uruchamianych co kilka minut na produkcji,
  na dedykowanych kontach testowych, bez skutków biznesowych (zamówienia oznaczone i anulowane, płatności w trybie
  testowym dostawcy) — alarm przy porażce (ops-observability).
- **Śledzenie błędów** (np. Sentry) i logi jako sygnał jakości: nowe typy błędów po wydaniu, wzrost błędów JS
  na stronie, porównanie z poprzednią wersją; tester przegląda je jak raport z testów.
- Każdy defekt z produkcji → analiza ucieczki (qa-test-design, `strategia-i-plan-testow.md`).

## Źródła
- [Mailpit](https://github.com/axllent/mailpit) (README i trasy API); Playwright, OWASP ZAP, Testcontainers — dokumentacja
- [roadmap.sh — QA](https://roadmap.sh/qa) (test data management, email testing, compatibility, mobile automation,
  backend automation, security testing, vulnerability scanning, monitoring & logs)
Opisane własnymi słowami.
