# Odłożone na później

Lista propozycji, które świadomie odłożono, żeby o nich nie zapomnieć. Każda pozycja ma źródło: ustalenie z rozmowy (P1–P8) albo punkt raportu [`reviews/2026-10-05-review.md`](reviews/2026-10-05-review.md).

## Model domeny

- **P6b. Uzasadnienie wymuszenia powiązane z ustaleniami.** Teraz wymuszone zatwierdzenie wymaga tylko tekstu. Później: wskazanie, których blokujących ustaleń dotyczy uzasadnienie.
- **P8b. Role i uprawnienia (SaaS).** Teraz każdy z tokenem administratora może potwierdzać, zatwierdzać i wymuszać. Później: role, np. tylko lider może wymusić zatwierdzenie albo potwierdzić ustalenie AI.
- **P7b. Osobne zatwierdzanie feature i epic.** Odrzucone na teraz (gotowość jest wyliczana ze story). Do ponownej oceny, jeśli zespoły będą chciały zatwierdzać całe funkcjonalności.
- **P1b. Mapowanie hierarchii poza typem zgłoszenia.** Np. po etykiecie, komponencie albo polu niestandardowym Jira.

## Kolejne kroki naprawcze z raportu

- **Krok 3.** Lista dozwolonych hostów `*.atlassian.net`, adresy dostawców AI tylko ze zmiennych środowiskowych, błędy bez treści odpowiedzi zewnętrznej, webhook domyślnie zamknięty z podpisem HMAC (API-12, API-13).
- **Krok 4.** Ujednolicenie modelu: wspólny rejestr reguł, agregaty Decision i Approval (API-02, API-08), rozbicie `project.ts`.
- **Krok 5.** Zmiany łamiące kontrakt pod `/api/v1` z OpenAPI w CI i testami kontraktowymi (API-05, 06, 14, 15, 16, 17).
- **Krok 6.** Port `SourceAdapter` i `CredentialProvider`, rozdzielenie „odśwież” od „przelicz”, `GET /credentials` zamiast nazw zmiennych w `GET /settings`.
- **Krok 7.** SaaS: tenancy, Postgres, workery, egress proxy, limity AI na organizację, `Idempotency-Key`, SSE per tenant z `Last-Event-ID` (API-11), rate limit (API-18).

## API (szczegóły odłożone)

- Paginacja list (ustalenia, decyzje, historia, audyt).
- `ETag` / `If-Match` dla zapisu ustawień i decyzji (ochrona przed nadpisaniem).
- `202 Accepted` i zasób operacji dla długich analiz.
- Wersjonowanie ścieżek `/api/v1`.
- `Last-Event-ID` w SSE.
