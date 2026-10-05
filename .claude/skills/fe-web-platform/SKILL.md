---
name: fe-web-platform
description: Użyj przy API przeglądarki i dostępności — fetch, DOM, event loop, Core Web Vitals, storage, service workers, XSS, WCAG.
metadata:
  katalog: "Użyj przy API przeglądarki niezależnie od frameworka — fetch i anulowanie, zdarzenia DOM, event loop i renderowanie, Core Web Vitals, storage, service workers, i18n (Intl), bezpieczeństwo DOM (XSS) oraz dostępność i semantyka HTML (ARIA, fokus, klawiatura, live regions, WCAG). Nie do składni (lang-*), konwencji frameworka (fw-*), stylów (fe-css) ani struktury aplikacji (fe-architecture)."
---

# Platforma webowa (przeglądarka)

## Żądania sieciowe
```js
const res = await fetch(url, { signal });
if (!res.ok) throw new HttpError(res.status, await res.text());
const data = await res.json(); // dane z sieci są niezaufane — waliduj na granicy
```
- `fetch` nie rzuca na 4xx/5xx — zawsze sprawdzaj `res.ok`. Parametry w URL przez `encodeURIComponent`/`URLSearchParams`.
- Anulowanie przez `AbortController` przy opuszczeniu widoku i przy wyszukiwaniu „na żywo”; ignoruj odpowiedzi nieaktualnych zapytań.
  Timeout: `AbortSignal.timeout(ms)`, łączenie sygnałów: `AbortSignal.any([...])`.
- Konflikt (409) i odrzucenie biznesowe (422) to normalne wyniki — pokaż je użytkownikowi, nie traktuj jak awarii.
- Realtime: SSE (`EventSource`) dla strumienia serwer→klient, WebSocket dla dwukierunkowego; zawsze z ponownym łączeniem i backoffem.

## Wydajność
- Główny wątek: zadania > 50 ms blokują wejście (zły INP) — dziel pracę (`scheduler.yield()`), ciężkie obliczenia do Web Workera.
- Debounce dla pól wyszukiwania (~250–300 ms), throttle/`requestAnimationFrame` dla scroll/resize, `passive: true` dla scroll/touch.
- Delegacja zdarzeń dla długich list; wirtualizacja przy tysiącach elementów.
- Leniwe ładowanie ciężkich modułów (`import()`) i obrazów poniżej zgięcia (`loading="lazy"`); obraz LCP — `fetchpriority="high"`, nigdy lazy.
- Obrazy/iframe z `width`/`height` (brak CLS). Nie przeplataj odczytów i zapisów layoutu w pętli (layout thrashing).
- Mierz LCP ≤ 2,5 s, INP ≤ 200 ms, CLS ≤ 0,1 na danych polowych (p75), nie tylko w Lighthouse.

## Bezpieczeństwo
- Nigdy `innerHTML` z danymi użytkownika lub modelu AI — `textContent`, DOM API albo sanityzacja (DOMPurify / Sanitizer API `setHTML`); ufaj escapowaniu frameworka i nie omijaj go.
- Zakaz `eval`, `new Function`, `setTimeout("string")`; URL-e od użytkownika — tylko schemat `http(s):`.
- Tokenów sesji nie trzymaj w `localStorage`, jeśli można użyć ciasteczek `HttpOnly`.
- CSP bez `unsafe-inline` (nonce + `strict-dynamic`), Trusted Types tam, gdzie dostępne. Wzorce — fe-architecture (`references/security/`).

## Storage i stan przeglądarki
- `localStorage`/`sessionStorage` tylko dla preferencji i wygody (może być pusty lub niedostępny) — w `try/catch`; większe dane — IndexedDB.
- Stan, który musi przetrwać i być spójny, należy do backendu. Service worker tylko przy realnej potrzebie offline/PWA.

## API urządzeń i systemu
- Przed dodaniem biblioteki sprawdź API platformy (udostępnianie, schowek, synchronizacja kart, wake lock, pliki), ale
  też jego obsługę: wiele działa tylko w Chromium. Wykrywanie funkcji, HTTPS, wywołanie w obsłudze kliknięcia, uprawnienia
  w kontekście, ścieżka zastępcza, dostęp za adapterem, osłona SSR — `references/natywne-api-przegladarki.md`.

## Dostępność i semantyka
- **Najpierw natywny HTML**: `button` dla akcji, `a href` dla nawigacji, `label` dla pól, landmarki (`header`, `nav`, `main`, `footer`), nagłówki w kolejności. `div` z `click` to błąd.
- **ARIA to ostateczność** — tylko dla widżetów bez natywnego odpowiednika; zła ARIA jest gorsza niż brak. Rola nie dodaje zachowania — klawiaturę piszesz sam.
- Dialogi: `<dialog>` + `showModal()` (fokus, Escape, inertne tło, powrót fokusu); `popover` dla menu/tooltipów.
- Fokus: po otwarciu nakładki do niej, po zamknięciu — z powrotem; po nawigacji SPA na `<h1>` nowego widoku; widoczny `:focus-visible`.
- Klawiatura: wszystko osiągalne Tabem; wzorce WAI-ARIA APG (strzałki w listach/zakładkach, Escape zamyka, roving tabindex).
- Komunikaty asynchroniczne (np. „termin zajęty”, „zapisano”) w regionie `aria-live` (`role="status"`, pilne — `role="alert"`), region obecny w DOM wcześniej.
- Formularze: błąd powiązany z polem (`aria-describedby`, `aria-invalid`), natywne `required`, fokus na pierwszy błąd po wysyłce.
- Cel: **WCAG 2.2 AA** (w UE wymóg prawny — European Accessibility Act od 06.2025). Automaty łapią tylko część — testuj klawiaturą i czytnikiem.

## i18n
- Teksty w ICU MessageFormat (liczba mnoga w komunikacie), formaty wyłącznie przez `Intl.*`; `<html lang dir>`; układ na CSS logical properties (RTL).

## Indeks references
- `rendering-pipeline.md` — event loop (zadania/mikrozadania, long tasks), Critical Rendering Path, koszt zmian stylu, priorytety ładowania.
- `checklista-wydajnosci.md` — checklista wydajności przed wydaniem (priorytety, poprawki przestarzałych zaleceń, bfcache, budżety w CI, Angular).
- `core-web-vitals.md` — LCP/INP/CLS: progi, przyczyny, poprawki; dane polowe vs laboratoryjne.
- `seo-publiczne-strony.md` — publiczna aplikacja (SSR/prerendering): indeksowanie, metadane, dane strukturalne, roboty AI.
- `natywne-api-przegladarki.md` — 21 API (Web Share, BroadcastChannel, Wake Lock, Clipboard, File System Access, WebOTP…): mapa obsługi, ścieżki zastępcze, czego nie używać.
- `service-workers.md` — cykl życia, strategie cache, aktualizacje, push/background sync, kiedy nie.
- `i18n.md` — i18n vs l10n, ICU, polska liczba mnoga, `Intl`, RTL, pseudolokalizacja.
- `accessibility/` — czytaj plik zależnie od problemu:
  `semantic-html` (natywne elementy), `aria-roles-and-attributes` (role, stany, combobox 1.2), `accessible-forms`,
  `keyboard-navigation` (roving tabindex, skróty), `focus-management` (modal, trasa, usuwanie z listy), `focus-trap`
  (`<dialog>`, `inert`), `live-regions` (polite/assertive), `wcag-levels` (A/AA/AAA, WCAG 2.2, EAA/ADA).

## Checklista
- [ ] `res.ok` sprawdzane, żądania anulowane przy opuszczeniu widoku
- [ ] Brak `innerHTML`/`eval` z niezaufanymi danymi
- [ ] Interaktywne elementy natywne, obsługa klawiatury i widoczny fokus
- [ ] Komunikaty asynchroniczne ogłaszane (live region), błędy formularza powiązane z polami
- [ ] Brak long tasks w interakcjach; obrazy z wymiarami; LCP nie leniwy
- [ ] Formaty przez `Intl`, brak sklejanych tekstów
- [ ] API urządzeń z wykrywaniem funkcji i ścieżką zastępczą; nieużywane funkcje wyłączone w `Permissions-Policy`

Źródła: frontendpatterns.dev (Den Odell) — wzorce dostępności; WAI-ARIA APG, WCAG 2.2 (W3C), web.dev — opisane własnymi słowami.
