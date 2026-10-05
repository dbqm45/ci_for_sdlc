---
name: be-api-design
description: Użyj przy projekcie i kodzie API HTTP — zasoby, kody, błędy, paginacja, wersje, idempotencja, OpenAPI, cache, limity, webhooki.
metadata:
  katalog: "Użyj przy projektowaniu i implementacji endpointów HTTP/REST — ścieżki, metody, kody statusu, paginacja, błędy, wersjonowanie, idempotencja, OpenAPI, cache HTTP, limity żądań, webhooki, GraphQL/gRPC/SSE, OWASP API Top 10. Nie do schematu bazy (be-database) ani mechanizmów logowania (be-auth-security)."
---

# Projektowanie API

## Zasoby i metody
- Rzeczowniki w liczbie mnogiej: `/users`, `/users/{id}/orders`. Maks. 2 poziomy zagnieżdżenia.
- `GET` czyta (bez efektów ubocznych), `POST` tworzy, `PUT` zastępuje, `PATCH` częściowo zmienia, `DELETE` usuwa.
- Akcje, które nie pasują do CRUD: `POST /orders/{id}/cancel`.

## Kody statusu
| kod | kiedy |
|---|---|
| 200 / 201 (+`Location`) / 204 | sukces / utworzono / bez treści |
| 400 | nieprawidłowe dane wejściowe |
| 401 / 403 | brak uwierzytelnienia / brak uprawnień |
| 404 | nie istnieje (lub brak dostępu, gdy nie chcemy ujawniać istnienia) |
| 409 | konflikt stanu (np. duplikat, wersja) |
| 422 | poprawny format, ale reguła biznesowa odrzuca |
| 429 | limit żądań (+`Retry-After`) |
| 5xx | błąd po naszej stronie — nigdy za błąd klienta |

## Format błędu (RFC 9457 Problem Details)
```json
{ "type": "https://example.com/errors/validation", "title": "Validation failed",
  "status": 400, "detail": "email is invalid", "errors": [{"field": "email", "code": "invalid"}] }
```
Nigdy nie zwracaj stack trace ani komunikatów bazy danych.

## Kolekcje
- Paginacja kursorowa dla dużych/zmiennych zbiorów (`?cursor=…&limit=50`), offset tylko dla małych.
- Twardy limit `limit` po stronie serwera.
- Filtrowanie i sortowanie przez whitelistę pól.

## Idempotencja i spójność
- `POST` z efektem finansowym lub zewnętrznym przyjmuje nagłówek `Idempotency-Key`.
- Optymistyczna kontrola wersji: `ETag` + `If-Match` → 412 przy konflikcie.

## Wersjonowanie i kompatybilność
- Dodawanie pól jest bezpieczne; usuwanie/zmiana typu = breaking change → nowa wersja lub okres deprecjacji z nagłówkiem `Deprecation`.
- Numer wydania serwisu lub SDK nadajesz wg SemVer (core-semver): zmiana niezgodna kontraktu → MAJOR, nowe pole lub
  endpoint → MINOR. Prefiks `/v1` w URL to osobna decyzja; jego zmiana zwykle idzie z MAJOR.

## Walidacja
Każde wejście walidowane schematem na granicy (body, query, params). Nieznane pola odrzucane lub ignorowane — konsekwentnie.

## Indeks references
- `style-i-komunikacja.md` — REST, GraphQL, gRPC, SOAP, webhooki (podpisy, ponowienia, SSRF), SSE, WebSocket,
  strumieniowanie, operacje asynchroniczne (`202`), brama API i BFF.
- `http-w-praktyce.md` — cache HTTP (`Cache-Control`, `ETag`/304, `Vary`), negocjacja treści (406/415), limity żądań
  (algorytmy, 429, nagłówki RateLimit), paginacja kursorowa, filtry i sortowanie, batch vs bulk (207), ponowienia, HATEOAS.
- Checklista bezpieczeństwa przed wydaniem: be-auth-security, `.claude/skills/be-auth-security/references/checklista-bezpieczenstwa-api.md`.
- `checklista-wydajnosci-backendu.md` — checklista wydajności (wzorce cache i unieważnianie, limity czasu i ponowienia, keep-alive, asynchroniczność, skalowanie, profilowanie, logowanie asynchroniczne).
- `cykl-zycia-i-bezpieczenstwo.md` — design-first (lint, mock), wersjonowanie i wycofywanie (`Deprecation`, `Sunset`),
  OWASP API Top 10 (2023), klucze API, testy kontraktowe i wydajnościowe, dane osobowe.

## Checklista
- [ ] spec OpenAPI zaktualizowany
- [ ] testy: sukces, walidacja, 401/403, 404
- [ ] autoryzacja sprawdzana per zasób (patrz be-auth-security)
- [ ] `Cache-Control` ustawione świadomie; limity żądań i rozmiaru; brak nadmiarowych pól w odpowiedzi (OWASP API3)
- [ ] zmiana łamiąca → nowa wersja albo `Deprecation`/`Sunset` z planem migracji
