# Checklista bezpieczeństwa API — przed wydaniem i w review

> **Spis treści:** Uwierzytelnianie · JWT · Dostęp i transport · Autoryzacja i OAuth · Wejście · Przetwarzanie · Wyjście · CI/CD · Monitorowanie

Na podstawie listy roadmap.sh „API Security Best Practices” i jej źródła (shieldfy/API-Security-Checklist, MIT),
z poprawkami tam, gdzie lista upraszcza. Ryzyka i kontrole OWASP API Top 10: be-api-design,
`cykl-zycia-i-bezpieczenstwo.md`. Zaznaczaj tylko to, co sprawdziłeś (test, konfiguracja, skan) — nie to, co „powinno być”.

## Uwierzytelnianie
- [ ] Standard zamiast własnego mechanizmu: OAuth 2 / OIDC przez IdP albo sesje frameworka (SKILL.md). Uwaga do listy:
  „JWT zamiast Basic Auth” to skrót myślowy. JWT to format tokenu, a nie protokół logowania, i nie jest sam w sobie
  bezpieczniejszy. Basic Auth odpada, bo wysyła stałe hasło przy każdym żądaniu.
- [ ] Ochrona logowania: rosnące opóźnienie i limit per konto **i** per IP, CAPTCHA lub inne wyzwanie po podejrzanej
  aktywności. Twarda blokada konta po N próbach pozwala napastnikowi zablokować cudze konta — stosuj ją ostrożnie
  i czasowo.
- [ ] Dane wrażliwe szyfrowane w ruchu (TLS) i w spoczynku (szyfrowanie bazy lub pól); klucze w menedżerze kluczy
  (KMS, HSM dla podpisów o wysokiej wadze), nie w kodzie (ops-secrets-identities).

## JWT
- [ ] **Algorytm ustalony po stronie serwera** (allowlista, np. tylko `RS256` lub `EdDSA`), nigdy brany z nagłówka tokenu;
  `alg: none` i zamiana RS→HS odrzucane. Weryfikacja `iss`, `aud`, `exp`, `nbf` (SKILL.md).
- [ ] Między usługami podpis asymetryczny: usługi weryfikują kluczem publicznym z JWKS, wybieranym po `kid` z listy
  znanych kluczy, z cache i rotacją. HS256 tylko w obrębie jednej usługi, z sekretem ≥ 256 bitów z CSPRNG.
- [ ] Krótki czas życia access tokenu (≤ 15 min) i rotowany refresh token (`tokeny-sesje-oauth.md`).
- [ ] W treści tokenu nic poufnego — to base64, nie szyfrowanie. Mały payload (identyfikator, zakresy), bo token
  jedzie w każdym żądaniu i nagłówkach proxy.

## Dostęp i transport
- [ ] Limity żądań per klucz/użytkownik i per IP, osobno dla logowania i drogich operacji (be-api-design, `http-w-praktyce.md`).
- [ ] TLS 1.2+ (preferowane 1.3) z nowoczesnymi szyframi; certyfikaty monitorowane (ops-observability).
- [ ] `Strict-Transport-Security: max-age=31536000; includeSubDomains` na domenach API (lista preload tylko świadomie —
  trudno z niej wyjść).
- [ ] Brak listowania katalogów i plików statycznych z serwera API; wyłączony tryb debugowania, konsole administracyjne
  i dokumentacja testowa na produkcji (OWASP API8, API9).
- [ ] API prywatne dostępne tylko z sieci prywatnej lub allowlisty, **a i tak z uwierzytelnieniem** — sieć to dodatkowa
  warstwa, nie jedyna.
- [ ] Między usługami: mTLS albo tokeny tożsamości obciążenia; każde żądanie walidowane także od usług wewnętrznych
  (zero trust — napastnik po wejściu do sieci nie dostaje wszystkiego).

## Autoryzacja i OAuth
- [ ] `redirect_uri` porównywane dokładnie z zarejestrowaną listą; Authorization Code + PKCE, bez `response_type=token`
  (implicit); `state` (lub PKCE) przeciw CSRF w logowaniu; domyślny minimalny zakres i walidacja zakresów per klient
  (SKILL.md, OAuth/OIDC).
- [ ] Każdy endpoint za uwierzytelnieniem, chyba że jest jawnie publiczny — test, który przechodzi po wszystkich trasach
  i sprawdza 401 bez tokenu.
- [ ] Zasoby bieżącego użytkownika przez `/me/...` zamiast `/users/{id}/...` — mniej okazji do BOLA. Identyfikatory
  nieprzewidywalne (UUID v4, albo v7, gdy liczy się kolejność w indeksie) utrudniają zgadywanie, ale **nie zastępują**
  sprawdzenia uprawnień do obiektu.

## Wejście
- [ ] Właściwa metoda HTTP; inna → `405` z nagłówkiem `Allow`.
- [ ] Obsługiwane formaty w `Accept` (inaczej `406`) i w `Content-Type` żądania (inaczej `415`).
- [ ] Walidacja schematem i limity rozmiaru (SKILL.md: wejście i wyjście); SQL parametryzowany, bez interpolacji
  w poleceniach systemowych.
- [ ] **XML**: wyłączone DTD i encje zewnętrzne (XXE). W Javie np.
  `DocumentBuilderFactory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true)`.
- [ ] **XML/YAML z aliasami**: limit rozwijania (ochrona przed „billion laughs”). SnakeYAML — `LoaderOptions` z limitem
  aliasów; pakiet `yaml` w JS — `maxAliasCount`; parsery tylko w trybie bezpiecznym (bez tworzenia dowolnych typów).
- [ ] Sekrety nigdy w URL (logi, historia, `Referer`) — tylko nagłówek `Authorization` lub dedykowany.
- [ ] Pliki: przesyłanie bezpośrednio do magazynu obiektów przez krótkotrwały podpisany URL, z limitem rozmiaru i typu,
  skanem złośliwego oprogramowania i serwowaniem z osobnej domeny (inaczej plik HTML/SVG wykona się w Twoim originie).

## Przetwarzanie
- [ ] Ciężkie operacje w tle (kolejka, workery) i szybka odpowiedź `202` (be-api-design) — długie żądania blokują
  pulę wątków i ułatwiają DoS.
- [ ] GraphQL: introspekcja wyłączona na produkcji, limity głębokości i kosztu, allowlista zapytań.
- [ ] Operacje o wysokiej wadze (przelew, zmiana uprawnień, webhooki) z podpisem żądania: HTTP Message Signatures
  (RFC 9421) albo HMAC z czasem i identyfikatorem (ochrona przed powtórzeniem).
- [ ] Środowisko uruchomieniowe utwardzone: kontener bez roota, system plików tylko do odczytu, bez zbędnych narzędzi
  (ops-docker). Punkt listy o „non-executable stack” zapewniają dziś system i kompilator, nie kod API.

## Wyjście
- [ ] Odpowiedzi API z nagłówkami: `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none';
  frame-ancestors 'none'` (dla JSON), `X-Frame-Options: DENY` dla starszych przeglądarek, `Cache-Control: no-store`
  dla danych prywatnych.
- [ ] `Content-Type` zgodny z treścią (`application/json; charset=utf-8`), nigdy zgadywany.
- [ ] Usunięte nagłówki zdradzające stos (`X-Powered-By` — w Express `app.disable('x-powered-by')`, `Server` z wersją).
- [ ] Błędy ogólne dla klienta (RFC 9457 bez stack trace i treści SQL), szczegóły tylko w logach z identyfikatorem
  korelacji podanym w odpowiedzi.
- [ ] Brak haseł, tokenów, sekretów i nadmiarowych pól w odpowiedziach (OWASP API3); właściwe kody statusu.

## CI/CD
- [ ] Testy jednostkowe i integracyjne obejmują autoryzację (macierz: `modele-autoryzacji.md`) i walidację.
- [ ] Review bez samodzielnego zatwierdzania (ochrona gałęzi, CODEOWNERS); zmiany od agenta AI przez ten sam proces
  (ops-ci-cd).
- [ ] SAST i skan sekretów w każdym PR; DAST na stagingu; skan zależności i obrazów (SCA) z polityką naprawy
  (ops-supply-chain-security).
- [ ] Przećwiczone wycofanie wdrożenia (ops-release-engineering).

## Monitorowanie
- [ ] Logi scentralizowane, ze zdarzeniami bezpieczeństwa (logowanie, odmowy autoryzacji, zmiany uprawnień, użycie
  kluczy) i bez danych wrażliwych (hasła, karty, tokeny, PIN — maskowanie przed zapisem).
- [ ] Alerty na anomalie: skok 401/403/429, nietypowe godziny, wolumen lub sekwencje endpointów, wiele obiektów
  z jednego konta (sygnał BOLA i scrapowania).
- [ ] WAF lub IDS/IPS przed API publicznym jako warstwa dodatkowa — nie zamiast walidacji i autoryzacji w kodzie.

## Źródła
- [roadmap.sh — API Security Best Practices](https://roadmap.sh/api-security-best-practices) (w danych roadmapy grupa
  „Input” powiela punkty grupy „Access Control”; brakujące punkty wzięte ze źródła listy).
- [shieldfy/API-Security-Checklist](https://github.com/shieldfy/API-Security-Checklist) (MIT, stan z 07.2026).
- OWASP Cheat Sheets: XML External Entity Prevention, Authentication, REST Security, JSON Web Token;
  RFC 9421 (HTTP Message Signatures), RFC 6797 (HSTS).
Opisane własnymi słowami, z poprawkami.
