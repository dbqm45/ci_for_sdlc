# HTTP w praktyce API: cache, negocjacja, limity, kolekcje, operacje masowe

## 1. Cache HTTP
- Każda odpowiedź `GET` ma świadomie ustawione `Cache-Control`:
  - dane publiczne i rzadko zmienne: `public, max-age=…` (dla CDN `s-maxage`);
  - dane konkretnego użytkownika: `private` albo `no-store`, nigdy w cache współdzielonym.
- **Walidacja**: `ETag` (albo `Last-Modified`) + żądanie warunkowe `If-None-Match` → `304 Not Modified` bez treści.
  Ten sam `ETag` służy do optymistycznej kontroli wersji przy zapisie (`If-Match` → 412, SKILL.md).
- `Vary` wymienia nagłówki, od których zależy odpowiedź (`Accept`, `Accept-Language`, `Authorization`, jeśli dotyczy).
  Bez tego cache poda jednemu klientowi odpowiedź przygotowaną dla innego.
- Cache po stronie serwera (Redis, cache aplikacji) to osobna decyzja z jawną strategią unieważniania i czasem życia.

## 2. Negocjacja treści
- Klient mówi, co przyjmuje (`Accept`), i co wysyła (`Content-Type`). Brak `Accept` → domyślnie `application/json`.
- Typ nieobsługiwany w `Accept` → `406`, nieobsługiwany `Content-Type` żądania → `415`; w odpowiedzi lista obsługiwanych.
- Błędy w `application/problem+json` (RFC 9457) niezależnie od typu sukcesu.
- Kompresja (`Accept-Encoding: gzip, br`) włączona dla dużych odpowiedzi JSON; nie kompresuj danych tajnych razem
  z danymi od użytkownika w tej samej odpowiedzi (ataki typu BREACH).

## 3. Limity żądań
- **Gdzie**: per klucz API lub klient OAuth (podstawowo), per użytkownik, per najemca, per IP (ochrona przed nadużyciem
  bez logowania). Osobne, ostrzejsze limity dla drogich operacji i przepływów biznesowych (logowanie, reset hasła,
  zakup, wysyłka SMS — OWASP API6).
- **Algorytm**: token bucket (pozwala na krótkie skoki, najczęstszy wybór), okno przesuwne (równiej), stałe okno
  (najprostsze, ale skok na granicy okien). Licznik wspólny dla wszystkich instancji (np. Redis) albo limit w bramie API.
- **Odpowiedź**: `429 Too Many Requests` z `Retry-After`. Informacja o limicie: nagłówki `RateLimit-Policy`
  i `RateLimit` z projektu IETF (draft-ietf-httpapi-ratelimit-headers, wersja 11 z 05.2026 — jeszcze nie RFC; składnia
  może się zmienić) albo popularne `X-RateLimit-Limit` / `-Remaining` / `-Reset`. Wybierz jedną konwencję
  i opisz ją w OpenAPI.
- **Kwoty** (np. 10 000 żądań miesięcznie w planie) to coś innego niż limit szybkości — osobny licznik i komunikat.
- Klient (także nasz) respektuje `Retry-After` i ponawia z wykładniczym odstępem i losowym rozrzutem.

## 4. Kolekcje: paginacja, filtrowanie, sortowanie, wyszukiwanie
- **Offset** (`?offset=100&limit=20`): prosty, pozwala skoczyć na stronę N. Wolny przy dużych przesunięciach, a nowe
  wpisy przesuwają strony (duplikaty lub pominięcia). Tylko dla małych, rzadko zmiennych zbiorów.
- **Kursor / keyset** (`?cursor=…&limit=20`): zapytanie `WHERE (created_at, id) > (:c, :id)` z indeksem. Stabilny
  przy dopisywaniu, szybki na dużych zbiorach, ale bez skoku na stronę N.
  - Kursor jest **nieprzezroczysty** (zakodowany, klient go nie składa) i zawiera wszystkie pola sortowania.
  - Sortowanie zawsze kończy się unikalnym polem (`id`), inaczej rekordy o tej samej wartości giną między stronami.
- Linki do następnej strony w treści (`next`) lub w nagłówku `Link` (RFC 8288). Całkowita liczba wyników jest droga —
  opcjonalna (`?include=total`) albo przybliżona.
- **Filtry**: allowlista pól i operatorów (`?status=paid&createdAt[gte]=2026-01-01`). Nieznany filtr → `400`, nie cicha
  ignoracja. Każdy filtr i sortowanie mają indeks albo limit (be-database).
- **Sortowanie**: `?sort=-createdAt,id` (minus = malejąco), tylko pola z allowlisty.
- **Wyszukiwanie pełnotekstowe**: osobny parametr lub endpoint (`?q=`), zwykle osobny silnik (indeks wyszukiwania),
  z limitem długości zapytania.

## 5. Operacje masowe i długie
| Rodzaj | Semantyka | Odpowiedź |
|---|---|---|
| **batch** | wszystko albo nic (jedna transakcja) | `200`/`201` albo błąd z listą rekordów do poprawy |
| **bulk** | każdy rekord osobno, częściowy sukces dozwolony | `207 Multi-Status` z wynikiem per rekord (status, błędy, identyfikator) |
| długie (sekundy i więcej) | asynchronicznie | `202 Accepted` + `Location` zasobu zadania (`style-i-komunikacja.md`) |
- Limit liczby rekordów i rozmiaru żądania; duże importy jako strumień rekordów (NDJSON albo `application/json-seq`),
  żeby jeden błędny rekord nie unieważniał całego dokumentu JSON.
- Wynik per rekord pozwala klientowi ponowić tylko nieudane — z tym samym kluczem idempotencji per rekord.

## 6. Ponowienia i idempotencja
- Bezpiecznie ponawiane: `GET`, `HEAD`, `PUT`, `DELETE` (idempotentne z definicji). `POST` i `PATCH` — tylko
  z `Idempotency-Key`: serwer zapamiętuje wynik pierwszego wykonania dla klucza (np. 24 h) i zwraca go ponownie;
  ten sam klucz z inną treścią → `422`.
- Ponawiaj błędy przejściowe (`408`, `429`, `502`, `503`, `504`, zerwane połączenie), nie ponawiaj `4xx` błędów
  klienta. Wykładniczy odstęp z losowym rozrzutem, limit prób i łączny limit czasu.

## 7. HATEOAS w praktyce
Pełne API sterowane hipermediami rzadko się opłaca. Linki `next`/`prev` w kolekcjach i odnośniki do powiązanych
zasobów są tanie i przydatne. Lista dozwolonych akcji w zasobie (np. `"actions": ["cancel"]`) pomaga frontowi
pokazać właściwe przyciski bez kopiowania reguł biznesowych.

## Źródła
- [MDN: HTTP caching](https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching), [MDN: Content negotiation](https://developer.mozilla.org/en-US/docs/Web/HTTP/Content_negotiation),
  [SoftwareMill: Content negotiation in practice](https://softwaremill.com/content-negotiation-in-practice/)
- [Tyk: API rate limiting](https://tyk.io/learning-center/api-rate-limiting/),
  [IETF draft: RateLimit header fields](https://datatracker.ietf.org/doc/draft-ietf-httpapi-ratelimit-headers/)
- [Nordic APIs: API pagination](https://nordicapis.com/everything-you-need-to-know-about-api-pagination/),
  [Tyk: bulk vs batch import](https://tyk.io/blog/api-design-guidance-bulk-and-batch-import/)
- [roadmap.sh — API Design](https://roadmap.sh/api-design)
Opisane własnymi słowami.
