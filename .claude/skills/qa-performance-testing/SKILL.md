---
name: qa-performance-testing
description: Użyj przy testach wydajnościowych — rodzaje, model obciążenia, progi z SLO, k6 i Gatling, środowisko, analiza, raport.
metadata:
  katalog: "Użyj przy planowaniu, pisaniu i analizie testów wydajnościowych — rodzaje (dymny, obciążenia, przeciążenia, wytrzymałości, skoku, punktu granicznego), model obciążenia z ruchu produkcyjnego, progi z SLO, k6 (TS/JS) i Gatling (Java), środowisko i dane, analiza wąskich gardeł, raport, test dymny w CI. Nie do wydajności frontendu w przeglądarce (fe-web-platform) ani SLO i alertów (ops-sre-incidents)."
---

# Testy wydajnościowe

Odpowiadają na pytanie „czy system spełni wymagania przy spodziewanym ruchu i jak się zachowa ponad nim”. Wymaganie
pochodzi ze scenariusza atrybutu jakości lub SLO (arch-quality-attributes, ops-sre-incidents), nie z „im szybciej,
tym lepiej”.

## Rodzaje testów
| Rodzaj | Pytanie | Kształt obciążenia | Kiedy |
|---|---|---|---|
| **dymny** | czy skrypt działa i jaki jest punkt odniesienia | 1–5 użytkowników wirtualnych, krótko | po każdej zmianie skryptu; w CI |
| **obciążenia (średniego)** | czy przy typowym ruchu spełniamy progi | ruch średni z produkcji, 5–60 min, z rozbiegiem | regularnie, przed wydaniem dużych zmian |
| **przeciążenia** (stress) | co się dzieje powyżej oczekiwań | 1,5–3× średniego, 5–60 min | przed kampanią, sezonem, nowym klientem |
| **wytrzymałości** (soak) | czy coś narasta w czasie (wycieki pamięci, połączenia, dysk) | ruch średni, godziny | po zmianach w zarządzaniu zasobami, okresowo |
| **skoku** (spike) | czy system przeżyje nagły napływ i wróci | bardzo duży ruch w krótkim czasie | przed zdarzeniami z gwałtownym ruchem (sprzedaż, publikacja) |
| **punktu granicznego** (breakpoint) | gdzie jest granica pojemności | stopniowy wzrost aż do awarii | rzadko, do planowania pojemności — nie na środowisku współdzielonym |
Kolejność: dymny → obciążenia → reszta według ryzyka.

## Procedura
1. **Cel i progi**: scenariusz (H,H), np. „p95 czasu złożenia zamówienia < 800 ms i < 1% błędów przy 200 zamówieniach
   na minutę”. Progi zapisane w skrypcie — test bez progów niczego nie rozstrzyga.
2. **Model obciążenia z produkcji**: które ścieżki, w jakich proporcjach (np. 70% przeglądania, 20% wyszukiwania,
   10% zakupu), tempo żądań lub przybyć w szczycie, czasy namysłu, rozkład danych (popularne i rzadkie produkty).
   Model **otwarty** (stałe tempo przybyć — jak prawdziwy internet) zamiast zamkniętego (stała liczba użytkowników,
   którzy czekają na odpowiedź i ukrywają spowolnienie), gdy testujesz usługę publiczną.
3. **Środowisko**: możliwie podobne do produkcji (rozmiary, konfiguracja, dane w podobnej skali); generator obciążenia
   poza testowanym systemem i z zapasem zasobów (sam generator nie może być wąskim gardłem). Zależności zewnętrzne
   (płatności, SMS) — zaślepki o realistycznych czasach odpowiedzi, nigdy prawdziwe usługi i prawdziwe pieniądze.
   Test na produkcji tylko za zgodą człowieka, z planem i oknem czasowym.
4. **Dane testowe**: dość kont i rekordów, żeby cache i indeksy zachowywały się jak w produkcji; dane syntetyczne
   (qa-regression, `.claude/skills/qa-regression/references/dane-srodowiska-i-specjalne.md`).
5. **Skrypt** (k6 dla TS/JS, Gatling dla zespołów Javy): scenariusze ze sprawdzeniami odpowiedzi (status i treść —
   szybka odpowiedź z błędem to nie sukces), parametryzacja danych, korelacja tokenów i identyfikatorów, tagi per
   ścieżka, progi.
6. **Uruchomienie z obserwacją**: równolegle metryki systemu (CPU, pamięć, połączenia do bazy, kolejki, GC, opóźnienia
   zależności — ops-observability) i ślady rozproszone dla wolnych żądań.
7. **Analiza**: gdzie rośnie czas — aplikacja, baza (wolne zapytania, blokady, pula połączeń), sieć, zależność;
   metoda USE dla zasobów (wykorzystanie, nasycenie, błędy). Jedna zmiana naraz, powtórzenie testu po poprawce.
8. **Raport**: cel i progi, model obciążenia, środowisko i różnice względem produkcji, wyniki (p50/p95/p99, przepustowość,
   odsetek błędów, zasoby) na wykresie w czasie, wąskie gardła z dowodami, rekomendacje, ryzyka i ograniczenia testu.

## k6 — szkic
```js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  scenarios: {
    zakupy: { executor: 'ramping-arrival-rate', startRate: 10, timeUnit: '1m', preAllocatedVUs: 50,
              stages: [{ target: 200, duration: '5m' }, { target: 200, duration: '20m' }, { target: 0, duration: '2m' }] },
  },
  thresholds: {
    'http_req_failed': ['rate<0.01'],
    'http_req_duration{sciezka:zamowienie}': ['p(95)<800'],
  },
};

export default function () {
  const res = http.post(`${__ENV.BASE_URL}/api/orders`, JSON.stringify({ sku: 'A-1', qty: 1 }),
    { headers: { 'Content-Type': 'application/json' }, tags: { sciezka: 'zamowienie' } });
  check(res, { 'utworzono': (r) => r.status === 201 });
  sleep(1);
}
```
Niespełniony próg → niezerowy kod wyjścia, więc CI oznacza test jako nieudany. Adres środowiska i tokeny przez zmienne
środowiskowe, nigdy w skrypcie.

## Testy wydajnościowe w CI
- **Dymny test wydajności** przy każdym PR do ścieżek krytycznych (krótko, mało ruchu) — wykrywa regresje rzędu
  wielkości (N+1, brak indeksu).
- **Test obciążenia** nocą lub przed wydaniem na środowisku dedykowanym, z porównaniem do poprzedniego wyniku
  (trend, nie tylko próg).
- Wyniki zapisane (artefakt CI, dashboard), żeby było widać, kiedy zaczęło się pogarszać.

## Checklista
- [ ] progi z wymagań w skrypcie, sprawdzenia treści odpowiedzi
- [ ] model obciążenia z danych produkcyjnych, model otwarty dla usług publicznych
- [ ] środowisko i dane opisane z różnicami względem produkcji; zależności zaślepione
- [ ] metryki systemu zbierane w trakcie; wąskie gardła z dowodami
- [ ] raport z ograniczeniami testu; dymny test wydajności w CI

## Źródła
- [Grafana k6 — load test types](https://grafana.com/docs/k6/latest/testing-guides/test-types/),
  [thresholds](https://grafana.com/docs/k6/latest/using-k6/thresholds/)
- B. Gregg — metoda USE; [roadmap.sh — QA](https://roadmap.sh/qa) (load & performance, stress testing, k6, Gatling,
  JMeter, Locust, Artillery)
Opisane własnymi słowami.
