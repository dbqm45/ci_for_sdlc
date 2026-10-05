# Style API i sposoby komunikacji

Domyślnie REST/JSON przez HTTP. Inny styl wybierasz, gdy konkretny scenariusz go wymaga, i zapisujesz decyzję w ADR.

## 1. Wybór stylu
| Styl | Kiedy | Koszt i pułapki |
|---|---|---|
| **REST / JSON** | API publiczne i między zespołami, CRUD z akcjami, cache HTTP | nadmiar lub niedobór danych na ekran → BFF albo pola wybierane parametrem |
| **GraphQL** | wiele różnych klientów składa dane z wielu źródeł, front potrzebuje elastycznych zapytań | N+1 w resolverach (DataLoader), limity głębokości i kosztu zapytania (ochrona przed DoS — OWASP API4), autoryzacja per pole (API3), błędy zwracane w odpowiedzi 200, trudniejszy cache HTTP; w produkcji tylko zapisane (persisted) zapytania lub allowlista |
| **gRPC** | komunikacja usługa–usługa, niskie opóźnienia, strumienie, kontrakt w Protobuf | przeglądarka tylko przez gRPC-Web lub Connect; zawsze ustawiony deadline (inaczej wiszące wywołania), kody statusu gRPC zamiast HTTP, zgodność schematu przez numery pól (nie usuwaj, nie zmieniaj numerów) |
| **SOAP** | integracja z istniejącymi systemami, które go wymagają (bankowość, administracja) | XML, WSDL, WS-Security; nie wybierasz go do nowych API |
| **Webhooki** | powiadamianie systemów zewnętrznych o zdarzeniach (płatność, zmiana statusu) | dostarczanie, ponowienia, podpisy, kolejność — sekcja 3 |
| **SSE** (`text/event-stream`) | strumień serwer → przeglądarka: postęp, powiadomienia, odpowiedzi modelu AI token po tokenie | jednokierunkowe; ponowne połączenie z `Last-Event-ID`; proxy i timeouty muszą przepuszczać długie połączenia |
| **WebSocket** | dwukierunkowo i z małym opóźnieniem: czat, współpraca na żywo, gry | stanowe połączenia (skalowanie, sticky sessions lub broker), własny protokół wiadomości, uwierzytelnianie przy nawiązaniu i wygasanie tokenu w trakcie |
| **Strumieniowanie odpowiedzi** (NDJSON / JSON Lines, `application/json-seq` z RFC 7464) | duży wynik, który klient przetwarza na bieżąco (eksport, logi) | osobny endpoint lub typ w `Accept`, żeby klient oczekujący JSON nie dostał kilku obiektów |
| **Odpytywanie (polling)** | rzadkie zmiany, klient bez publicznego adresu, prostota | opóźnienie do długości interwału, koszt pustych zapytań; ustaw rozsądny interwał i `ETag` (304 zamiast pełnej odpowiedzi) |

## 2. Synchroniczne czy asynchroniczne
- Operacja dłuższa niż kilka sekund (import, raport, generowanie przez AI) → **`202 Accepted`** z nagłówkiem `Location`
  wskazującym zasób statusu (`/jobs/{id}`: `pending | running | succeeded | failed`, wynik lub link do wyniku). Klient
  odpytuje z `Retry-After` albo dostaje webhook lub SSE po zakończeniu.
- Zlecenie zadania jest idempotentne (`Idempotency-Key`), a anulowanie to osobna akcja (`POST /jobs/{id}/cancel`).
- Między własnymi usługami zamiast łańcucha synchronicznych wywołań — zdarzenia przez broker (be-messaging-outbox).

## 3. Webhooki — projekt po stronie wysyłającego
- **Podpis**: HMAC-SHA256 z treści i znacznika czasu w nagłówku (np. `Webhook-Signature`, `Webhook-Timestamp`);
  odbiorca weryfikuje podpis w czasie stałym i odrzuca wiadomości starsze niż kilka minut (ochrona przed powtórzeniem).
  Sekret per subskrypcja, z rotacją (dwa ważne sekrety przez okres przejściowy).
- **Dostarczanie co najmniej raz**: ponowienia z wykładniczym odstępem i losowym rozrzutem przez wiele godzin, potem
  kolejka martwych wiadomości i widok dostarczeń dla klienta (ręczne ponowienie). Każde zdarzenie ma `id` — odbiorca
  odrzuca duplikaty.
- **Kolejność nie jest gwarantowana** — zdarzenie niesie wersję lub znacznik czasu; „cienkie” zdarzenie (sam `id` i typ,
  odbiorca pobiera aktualny stan przez API) omija problem nieaktualnych danych.
- Odbiorca odpowiada szybko `2xx` i przetwarza asynchronicznie; timeout po stronie wysyłającego (np. 10 s).
- **Adres URL podaje klient → ryzyko SSRF** (OWASP API7): tylko `https`, blokada adresów prywatnych i metadanych chmury,
  rozwiązywanie DNS przy każdym wysłaniu.
- Zdarzenia opisane w dokumentacji jak kontrakt (np. AsyncAPI lub schematy JSON), wersjonowane jak API.

## 4. Brama API i BFF
- **Brama API** (gateway): sprawy przekrojowe — routing, terminacja TLS, uwierzytelnianie, limity żądań, logi
  i metryki, czasem cache. **Bez logiki biznesowej** — reguła w bramie to reguła ukryta przed testami domeny.
  Brama jest punktem, przez który przechodzi każde żądanie, więc musi być wysoko dostępna (kilka instancji w różnych
  strefach), skalowana razem z ruchem i objęta własnymi SLO i alertami. Jej awaria wyłącza wszystkie usługi naraz.
  Centralne uwierzytelnianie w bramie nie zwalnia usług z autoryzacji: usługa sprawdza uprawnienia do konkretnego
  zasobu i nie ufa ślepo ruchowi z sieci wewnętrznej (be-auth-security, OWASP API1).
- **Backend for Frontend**: osobne API dopasowane do jednego rodzaju klienta (web, mobile, API publiczne — według
  doświadczenia, nie urządzenia). Składa dane z wielu usług i kształtuje je pod ekran. Zwykle utrzymuje go zespół
  tego frontu. Nie kopiuje reguł biznesowych — wywołuje usługi, które je mają.
- **BFF jako strażnik tokenów** (token handler): przeglądarka dostaje ciasteczko `HttpOnly; Secure; SameSite`, a tokeny
  OAuth zostają po stronie serwera (be-auth-security, `tokeny-sesje-oauth.md`).
- Jeden klient lub klienci o podobnych potrzebach → BFF niepotrzebny; wystarczy dobrze zaprojektowane API.

## Źródła
- [gRPC Core Concepts](https://grpc.io/docs/what-is-grpc/core-concepts/), [MDN: Using server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)
- [Hookdeck: When to use webhooks, WebSocket, pub/sub and polling](https://hookdeck.com/webhooks/guides/when-to-use-webhooks)
- [APIs You Won't Hate: Streaming data with REST APIs](https://apisyouwonthate.com/blog/streaming-data-with-rest-apis/)
- [bff-patterns.com](https://bff-patterns.com/); S. Newman, „Backends For Frontends”
- [roadmap.sh — API Design](https://roadmap.sh/api-design)
Opisane własnymi słowami.
