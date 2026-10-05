# Checklista wydajności frontendu — przed wydaniem i w review

Na podstawie listy roadmap.sh „Frontend Performance Best Practices” i jej źródła (Front-End-Performance-Checklist,
MIT), z poprawkami tam, gdzie lista jest przestarzała albo się sama wyklucza. Miarą sukcesu są **Core Web Vitals
z danych polowych** (`core-web-vitals.md`: LCP ≤ 2,5 s, INP ≤ 200 ms, CLS ≤ 0,1 na 75. percentylu), a nie pojedynczy
wynik Lighthouse. Zaznaczaj tylko to, co zmierzyłeś.

## Wysoki priorytet
- [ ] **Budżet wagi strony** — punkt startowy listy „< 1500 KB, najlepiej < 500 KB” traktuj jako górną granicę dla
  całej strony. Ważniejszy jest budżet JS na trasę, ustalony z pomiarów na urządzeniach użytkowników (średni telefon
  z Androidem, wolniejsza sieć) i pilnowany w CI (sekcja „Budżety w CI”).
- [ ] **„Ładowanie < 3 s”** → zamień na progi CWV i TTFB. **TTFB** dobry ≤ 0,8 s (75. percentyl; lista podaje 1,3 s —
  to stara granica). Na TTFB wpływają: cache na CDN dla stron publicznych, SSR bez łańcuchów zapytań, odpowiedź
  wczesna (`103 Early Hints`) tam, gdzie serwer i CDN ją obsługują.
- [ ] **Kompresja** Brotli (lub gzip) dla tekstu: HTML, CSS, JS, JSON, SVG. Nie kompresuj ponownie obrazów i czcionek
  WOFF2 (już skompresowane).
- [ ] **Liczba żądań**: przy HTTP/2 i HTTP/3 wiele małych plików nie jest już problemem, a łączenie wszystkiego w jeden
  plik psuje cache (zmiana jednej linii unieważnia całość). Ograniczaj żądania **blokujące renderowanie** i łańcuchy
  zależności (żądanie, które odkrywa kolejne), a nie samą liczbę.
- [ ] **Cache HTTP**: zasoby z hashem w nazwie (`app.3f9a1c.js`) — `Cache-Control: public, max-age=31536000, immutable`;
  HTML — `no-cache` (zawsze walidacja), żeby nowe wydanie było widoczne od razu (be-api-design, `http-w-praktyce.md`).
- [ ] **JavaScript nieblokujący**: moduły i skrypty z `defer` (kolejność zachowana) lub `async` (niezależne, np.
  analityka); żadnego synchronicznego `<script>` w `<head>` bez powodu. Minifikacja i usuwanie martwego kodu robi
  builder (esbuild w Angularze, Vite) — sprawdź, że działa w trybie produkcyjnym.
- [ ] **CSS**: minifikowany, nieblokujący poza krytycznym. **Krytyczny CSS w linii** (to, co potrzebne do pierwszego
  ekranu) i reszta asynchronicznie — to wyjątek od zasady „unikaj CSS w linii”, nie sprzeczność. W Angularze przy
  SSR/prerenderingu krytyczne style wstawia builder (opcja `inlineCritical`).
- [ ] **Obrazy**: format dopasowany (AVIF lub WebP dla zdjęć z zapasowym JPEG, SVG dla ikon i ilustracji wektorowych,
  PNG tylko tam, gdzie potrzebna bezstratność), kompresja, rozmiar bliski wyświetlanemu (`srcset` i `sizes`).
- [ ] **HTTPS** wszędzie (warunek HTTP/2 i HTTP/3, service workerów i wielu API) i ten sam protokół dla wszystkich
  zasobów — mieszana zawartość jest blokowana.
- [ ] **Brak 404** dla zasobów (zmarnowane żądania, często ikony i mapy źródeł) — sprawdzane w teście E2E lub crawlerze.
- [ ] **Ramki iframe**: tylko potrzebne, z `loading="lazy"` poniżej pierwszego ekranu; osadzenia (wideo, mapy, czaty)
  przez **fasadę** — obrazek z przyciskiem, a pełny skrypt dopiero po kliknięciu.
- [ ] **Złożoność stylów**: unikaj bardzo głębokich selektorów i drogich właściwości na dużych powierzchniach;
  `content-visibility: auto` dla długich sekcji poza ekranem (fe-css).

## Średni priorytet
- [ ] HTML zminifikowany przy generowaniu (zysk mały przy kompresji — nie priorytet).
- [ ] **CDN** dla zasobów statycznych i stron publicznych z cache na brzegu.
- [ ] **Obrazy**: `width` i `height` (lub `aspect-ratio`) zawsze — brak przesunięć układu; leniwe ładowanie poniżej
  pierwszego ekranu, ale **obraz LCP nigdy leniwy**, za to z `fetchpriority="high"`. Bez obrazów w Base64 poza
  bardzo małymi (powiększają HTML/CSS i omijają cache). W Angularze `NgOptimizedImage` (`ngSrc`, `priority` dla LCP)
  pilnuje tych zasad.
- [ ] **Skrypty w linii**: jak najmniej (blokują parser i wymagają wyjątków w CSP — fe-web-platform: bezpieczeństwo).
- [ ] **Zależności**: rozmiar i duplikaty sprawdzane przy dodawaniu (bundlephobia, raport buildera). Lista mówi
  „aktualizuj zależności” — w fabryce agent **nie podnosi zależności projektu bez prośby człowieka**. Aktualizacja to
  osobne zadanie z testami (core-stack-sync, ops-supply-chain-security).
- [ ] **Problemy w JS**: długie zadania > 50 ms w interakcjach (INP), wycieki pamięci, przerysowania — profil w DevTools
  (Performance) na spowolnionym CPU (`rendering-pipeline.md`).
- [ ] **Service worker** tylko przy realnej potrzebie offline lub cache aplikacji (`service-workers.md`); ciężkie
  obliczenia raczej w Web Workerze.
- [ ] **Ciasteczka**: małe i nieliczne — jadą przy **każdym** żądaniu do domeny, także po obrazki. Przeglądarki
  ograniczają rozmiar pojedynczego ciasteczka do ok. 4 KB. Zasoby statyczne z domeny lub CDN bez ciasteczek.

## Niski priorytet (ale tanie)
- [ ] **Podpowiedzi zasobów**: `preconnect` do 1–3 krytycznych domen (czcionki, API, CDN obrazów); `preload` tylko dla
  zasobu potrzebnego wcześnie, a odkrywanego późno (czcionka, obraz LCP z CSS) — nadmiar preloadów odbiera
  przepustowość ważniejszym. Następna strona: `prefetch` lub reguły spekulacyjne (Speculation Rules API, Chromium) dla
  bardzo prawdopodobnej nawigacji.
- [ ] **Łączenie CSS w jeden plik** — przy HTTP/2 nieaktualne. Lepiej CSS per trasa lub komponent (ładowany razem
  z kodem) i dobry cache.
- [ ] **Nieużywany CSS** usuwany na etapie budowania (np. style komponentów z enkapsulacją, narzędzia jak PurgeCSS dla
  bibliotek użytkowych); pokrycie w DevTools (Coverage) pokazuje skalę.
- [ ] **Czcionki**: tylko WOFF2, podzbiór znaków (z polskimi znakami!), jak najmniej grubości (lub czcionka zmienna),
  łącznie zwykle < 100–300 KB; `font-display: swap` (lub `optional` dla czcionek ozdobnych) zamiast niewidocznego tekstu;
  dopasowanie metryk zapasowej czcionki (`size-adjust`) ogranicza przesunięcie przy podmianie.
- [ ] **Rozmiar zależności** monitorowany w CI (sekcja niżej).

## Czego lista nie ma, a warto
- **bfcache** (pamięć podręczna wstecz/dalej): natychmiastowy powrót na poprzednią stronę. Nie używaj zdarzenia
  `unload` (zamiast tego `pagehide` lub `visibilitychange`); `Cache-Control: no-store` dla HTML zwykle wyklucza stronę
  z bfcache — stosuj tylko tam, gdzie to konieczne (dane wrażliwe). Sprawdzenie: DevTools → Application → Back/forward cache.
- **Skrypty zewnętrzne** (analityka, tagi, czaty, testy A/B): inwentarz z właścicielem i kosztem, ładowanie po
  interakcji lub bezczynności, mierzenie ich udziału w INP; każdy to też ryzyko łańcucha dostaw (SRI, CSP — fe-architecture).
- **Renderowanie po stronie serwera i hydracja**: w Angularze SSR z hydracją przyrostową i `@defer` dla ciężkich
  sekcji poniżej pierwszego ekranu (fw-angular).

## Budżety w CI
- Angular: `budgets` w `angular.json` (np. rozmiar `initial` i `anyComponentStyle` z progiem ostrzeżenia i błędu) —
  build kończy się błędem po przekroczeniu.
- Lighthouse CI (lub podobne) na kilku kluczowych stronach z asercjami (LCP, CLS, TBT, waga zasobów) — wyniki
  laboratoryjne jako bramka regresji, nie zamiennik danych polowych.
- Rozmiar paczek per trasa z raportu buildera porównywany z gałęzią główną w komentarzu PR.
- Dane polowe (RUM: biblioteka `web-vitals` wysyłająca do własnej analityki, CrUX dla stron publicznych) przeglądane
  po każdym wydaniu (ops-observability).

## Źródła
- [roadmap.sh — Frontend Performance Best Practices](https://roadmap.sh/frontend-performance-best-practices);
  [Front-End-Performance-Checklist](https://github.com/thedaviddias/Front-End-Performance-Checklist) (MIT)
- web.dev: Core Web Vitals, TTFB, bfcache, Optimize resource loading; dokumentacja Angulara: budgets, NgOptimizedImage,
  SSR i hydracja
Opisane własnymi słowami, z poprawkami.
