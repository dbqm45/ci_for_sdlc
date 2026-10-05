# Service Workers, cache i offline

Przeniesione z importu frontend-developer (`senior.md`, „Service Workers”), uzupełnione.

## Czym jest

Skrypt działający w tle, poza wątkiem strony, jako **proxy między aplikacją a siecią** — podstawa PWA i offline.
Działa tylko w bezpiecznym kontekście (HTTPS; `localhost` do testów), bo ma władzę nad całym ruchem strony w swoim
zakresie (`scope`).

## Cykl życia

1. `install` — pierwsza instalacja: pre-cache statycznych assetów (app shell).
2. `activate` — nowa wersja przejmuje kontrolę: sprzątanie starych cache'y.
3. `fetch` — przechwytywanie żądań i odpowiedź z cache, sieci lub obu.

Pułapki aktualizacji: nowy SW czeka, aż zamkną się wszystkie karty ze starym (`waiting`); `skipWaiting()` +
`clients.claim()` przyspieszają przejęcie, ale mogą zmieszać stary HTML z nowymi chunkami — pokaż użytkownikowi
„Dostępna nowa wersja — odśwież” zamiast przełączać po cichu. Plik SW serwuj z `Cache-Control: no-cache`.

## Strategie cache (nazwy zwyczajowe)

| Strategia | Działanie | Dla |
|---|---|---|
| Cache-first | cache, sieć tylko przy braku | assety z hashem w nazwie, fonty |
| Network-first | sieć, cache przy błędzie/offline | HTML, dane, które mają być świeże |
| Stale-while-revalidate | natychmiast z cache, w tle odśwież | treści średnio zmienne (awatary, listy) |
| Network-only / cache-only | bez fallbacku / tylko cache | żądania mutujące / zasoby offline |

Nie cache'uj odpowiedzi spersonalizowanych ani z danymi wrażliwymi bez klucza per użytkownik i czyszczenia przy
wylogowaniu. Zwykle nie pisz strategii ręcznie — Workbox lub moduł frameworka (`@angular/service-worker`,
`vite-plugin-pwa`).

## Możliwości dodatkowe

- **Push notifications** (Push API + Notification; na iOS tylko dla PWA dodanych do ekranu głównego).
- **Background Sync** — dokończenie wysyłki po odzyskaniu sieci (Chromium; w innych silnikach — kolejka w IndexedDB
  i ponowienie przy `online`).
- **Navigation preload** — równoległe pobranie nawigacji podczas uruchamiania SW (mniejsze opóźnienie network-first).

## Kiedy nie

Aplikacja bez wymagań offline/instalacji rzadko potrzebuje SW — dodaje złożoność aktualizacji i trudne do
odtworzenia błędy cache. Dla samej szybkości często wystarczy poprawny HTTP cache (`Cache-Control`, `immutable` dla
assetów z hashem) i CDN.
