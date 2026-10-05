# Cykl życia API, bezpieczeństwo i testy

## 1. Najpierw kontrakt (design-first)
1. Zasoby z języka domeny (słownik, ddd-facilitation): rzeczowniki, które ekspert rozpoznaje, a nie nazwy tabel.
   Zasób API ≠ tabela ≠ agregat — modelujesz to, czego potrzebuje klient.
2. Spec OpenAPI w PR **przed** implementacją; przegląd przez konsumentów.
3. Lint specyfikacji w CI (np. Spectral z regułami zespołu: nazwy, kody błędów, paginacja, opisy, przykłady).
4. Mock z specyfikacji (np. Prism) — front i integratorzy zaczynają pracę równolegle.
5. Implementacja i testy kontraktu (sekcja 4). Dokumentacja generowana ze specyfikacji, z przykładami i opisem błędów.

## 2. Wersjonowanie i wycofywanie
- **Ewolucja addytywna** jako zasada: nowe pola opcjonalne, nowe endpointy, nowe wartości tylko tam, gdzie klienci
  są na to przygotowani (enum w odpowiedzi — opisz, że może się rozszerzyć). Klienci ignorują nieznane pola.
- Zmiana łamiąca → nowa wersja główna. W URL (`/v2/…`) dla API publicznych (widoczna, łatwa w routingu i logach);
  nagłówek lub typ mediów tylko, gdy zespół i klienci to obsłużą. Jedna strategia w całej organizacji.
- **Wycofanie** zapowiadane w odpowiedziach:
  - `Deprecation: @<unix-timestamp>` (RFC 9745) — od kiedy wycofane;
  - `Sunset: <data HTTP>` (RFC 8594) — kiedy przestanie odpowiadać (nie wcześniej niż data z `Deprecation`);
  - `Link: <…>; rel="deprecation"` — dokumentacja migracji.
  Do tego monitorowanie, kto jeszcze używa starej wersji (logi per klient), i kontakt z nimi przed wyłączeniem.
- **Inwentarz** (OWASP API9): lista hostów, wersji, środowisk i właścicieli; brak zapomnianych `/v1`, endpointów
  debugowania i środowisk testowych z prawdziwymi danymi.

## 3. Bezpieczeństwo — OWASP API Security Top 10 (2023)
| Ryzyko | Kontrola |
|---|---|
| API1 — autoryzacja na poziomie obiektu (BOLA/IDOR) | każde wywołanie z identyfikatorem sprawdza, czy *ten* użytkownik ma prawo do *tego* obiektu (be-auth-security); testy z dwoma kontami |
| API2 — uwierzytelnianie | sprawdzone biblioteki, limity prób logowania, tokeny krótkotrwałe (be-auth-security) |
| API3 — autoryzacja na poziomie właściwości | DTO z jawną listą pól na wejściu i wyjściu; brak masowego przypisania (`role`, `price` z body ignorowane lub odrzucane); brak nadmiarowych danych w odpowiedzi |
| API4 — nieograniczone zużycie zasobów | limity żądań, rozmiaru body, `limit` w paginacji, timeouty, limity kosztu zapytań GraphQL, limity wysyłki SMS i e-maili |
| API5 — autoryzacja na poziomie funkcji | endpointy administracyjne osobno, domyślna odmowa, testy „zwykły użytkownik → endpoint admina = 403” |
| API6 — nieograniczony dostęp do przepływów biznesowych | limity per przepływ (zakup, rejestracja, rezerwacja), wykrywanie automatyzacji, nie tylko limit techniczny |
| API7 — SSRF | URL od użytkownika tylko przez allowlistę i blokadę adresów wewnętrznych (be-auth-security, webhooki) |
| API8 — błędna konfiguracja | nagłówki bezpieczeństwa, CORS z allowlistą, brak stack trace, TLS wszędzie, wyłączone metody i funkcje debugowania |
| API9 — zarządzanie inwentarzem | sekcja 2 |
| API10 — niebezpieczne korzystanie z cudzych API | odpowiedzi zewnętrznych API walidowane jak wejście użytkownika, timeouty, brak ślepego podążania za przekierowaniami |

## 4. Klucze API (dla serwer–serwer, nie dla użytkowników w przeglądarce)
- Generowane z CSPRNG, co najmniej 128 bitów losowości; **prefiks** z typem i środowiskiem (np. `acme_live_…`,
  `acme_test_…`), żeby skanery sekretów i ludzie rozpoznali klucz (ops-secrets-identities).
- W bazie tylko **skrót** (SHA-256 wystarcza dla kluczy o wysokiej entropii) i kilka pierwszych znaków do identyfikacji;
  pełny klucz pokazany raz, przy utworzeniu.
- Zakresy (scopes) i, gdzie to możliwe, ograniczenie do adresów lub środowisk; data wygaśnięcia; właściciel.
- Rotacja z nakładaniem: dwa aktywne klucze na czas przejścia, potem unieważnienie starego. Natychmiastowe
  unieważnienie po wycieku i log użycia per klucz.
- Klucz tylko w nagłówku (`Authorization` lub dedykowany), **nigdy w URL** — trafia do logów, historii i nagłówka `Referer`.

## 5. Testy API
- **Kontraktowe**:
  - dostawca sprawdza, że odpowiedzi zgadzają się ze specyfikacją OpenAPI (walidacja schematu w testach integracyjnych);
  - przy wielu konsumentach wewnętrznych — testy kontraktowe sterowane przez konsumenta (Pact), uruchamiane w CI
    dostawcy przed wydaniem.
- **Integracyjne** przez prawdziwe HTTP z bazą testową: sukces, walidacja, 401/403/404, konflikty, idempotencja,
  paginacja (granice stron).
- **Mocki**: z specyfikacji (Prism) dla zespołów równoległych; w testach frontu MSW na poziomie sieci (tool-vitest).
- **Wydajnościowe** (np. k6): scenariusz z prawdziwego ruchu, cel z SLO (p95, odsetek błędów), test obciążenia
  i przeciążenia przed wzrostem ruchu (ops-sre-incidents).
- **Bezpieczeństwa**: testy BOLA z dwoma kontami, fuzzing wejścia ze specyfikacji, skan DAST na stagingu.

## 6. Dane osobowe i regulacje
- Minimalizacja: API zwraca tylko pola potrzebne klientowi; dane szczególne (zdrowie, finanse) za osobnym zakresem.
- Logi bez treści żądań z danymi osobowymi, tokenów i numerów kart (maskowanie). Retencja zgodna z polityką.
- RODO: prawo dostępu i usunięcia jako operacje API lub procedura; dane kart płatniczych przez dostawcę płatności
  (tokenizacja), żeby nie wchodzić w pełny zakres PCI DSS. Szczegóły prawne potwierdza dział prawny — agent nie
  rozstrzyga zgodności.

## Źródła
- [OWASP API Security Top 10 — 2023](https://owasp.org/API-Security/editions/2023/en/0x11-t10/)
- [RFC 9745 — Deprecation header](https://www.rfc-editor.org/rfc/rfc9745.html), RFC 8594 — Sunset header
- [roadmap.sh — API Design](https://roadmap.sh/api-design) (lifecycle, versioning, API keys, testing, standards and compliance)
Opisane własnymi słowami.
