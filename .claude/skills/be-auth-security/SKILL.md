---
name: be-auth-security
description: Użyj przy uwierzytelnianiu i autoryzacji — sesje, tokeny, OAuth/OIDC, hasła, walidacja wejścia, przegląd backendu wg OWASP.
metadata:
  katalog: "Użyj przy uwierzytelnianiu, autoryzacji, sesjach i tokenach (kradzież i odtwarzanie, rotacja, unieważnianie), OAuth/OIDC (PKCE, zgody, device code), hasłach, sekretach, walidacji wejścia, deserializacji, panelach administracyjnych i przeglądzie bezpieczeństwa backendu (OWASP). Nie do konfiguracji sieci i chmury (ops-iac-terraform) ani zależności (ops-supply-chain-security)."
---

# Auth i bezpieczeństwo backendu

## Uwierzytelnianie
- Nie pisz własnej kryptografii ani własnego systemu logowania, jeśli projekt ma bibliotekę/IdP.
- Hasła: argon2id (lub bcrypt z kosztem ≥ 12). Nigdy MD5/SHA-* bez soli i rozciągania.
- Rate limiting i opóźnienia dla logowania, resetu hasła, OTP. Jednakowy komunikat dla „zły login” i „złe hasło”.
- MFA chroni logowanie, ale **nie chroni skradzionej sesji**: napastnicy kupują ciasteczka i tokeny wykradzione przez
  złośliwe oprogramowanie i odtwarzają je bez logowania. Dlatego liczy się projekt sesji i tokenów.

## Sesje i tokeny
- Ciasteczka sesji `HttpOnly; Secure; SameSite=Lax` (lub `Strict`), rotacja ID po zalogowaniu, sesje w magazynie
  po stronie serwera, żeby dało się je unieważnić.
- Access token krótki (≤ 15 min); weryfikuj `alg`, `iss`, `aud`, `exp` — **`aud` ściśle**: token wydany dla jednej usługi
  nie działa w innej.
- Refresh token z rotacją; ponowne użycie już zużytego refresh tokenu = kradzież → unieważnij całą rodzinę tokenów.
- Zmiana hasła, MFA lub e-maila unieważnia wszystkie sesje i refresh tokeny użytkownika. Operacja „wyloguj wszędzie”
  to jedno wywołanie API, przećwiczone przed incydentem.
- Limit bezczynności i limit bezwzględny sesji; ponowne uwierzytelnienie (step-up) przed operacjami wrażliwymi: zmiana
  e-maila lub MFA, wypłata, uprawnienia, eksport danych.
- Tam, gdzie się da, wiąż token z urządzeniem lub kluczem (DPoP, mTLS między usługami, DBSC w przeglądarce).
Szczegóły i sygnały nadużyć: `references/tokeny-sesje-oauth.md`.

## OAuth / OIDC
- Authorization Code + **PKCE** dla każdego klienta; redirect URI zarejestrowane i porównywane dokładnie (bez wzorców,
  bez dowolnego portu loopback dla klienta poufnego).
- Identyfikator klienta publicznego nie jest dowodem tożsamości — napastnik użyje identyfikatora znanej aplikacji.
- Zakresy (scopes) minimalne; lista dozwolonych zakresów per klient; zgoda administratora dla zakresów wysokiego ryzyka
  (poczta, pliki, katalog). Użytkownik widzi i może cofnąć zgody.
- Przepływ device code **wyłączony**, chyba że klient naprawdę go potrzebuje (urządzenie bez klawiatury) — to dziś
  popularna metoda phishingu, która omija MFA.

## Autoryzacja
- Sprawdzana na serwerze **per zasób i per akcja** (nie tylko „czy zalogowany”). Najczęstszy błąd: IDOR — `GET /invoices/{id}` bez sprawdzenia właściciela.
- Domyślnie odmowa (deny by default); uprawnienia w jednym module, nie rozsiane po kontrolerach.
- Wybór modelu (RBAC, ABAC, ReBAC, PBAC, DAC, MAC) i macierz testów autoryzacji: `references/modele-autoryzacji.md`.
- Konta usług: jedna tożsamość na usługę, własne poświadczenia o minimalnym zakresie; nigdy wspólny superużytkownik bazy.
- Panel administracyjny i endpointy zarządzania: osobny host, SSO z MFA, dostęp z VPN/sieci firmowej — nie z internetu.
  Uprawnienia administracyjne nadawane na czas (just-in-time) i zapisywane w logu audytowym.

## Wejście i wyjście
- Walidacja schematem na granicy; limity rozmiaru body i plików.
- SQL tylko parametryzowany (be-database). Komendy systemowe bez interpolacji wejścia.
- **Deserializacja:** nigdy nie zamieniaj niezaufanych danych w obiekty natywne (Java `ObjectInputStream`, podobne
  mechanizmy w innych językach i frameworkach). Tylko formaty danych (JSON) ze schematem albo allowlista klas.
  Przykłady ataków bez logowania: SolarWinds Web Help Desk (Java), React2Shell (protokół React Server Components).
- Upload: whitelist typów (sprawdzaj zawartość, nie rozszerzenie), losowe nazwy, przechowywanie poza webroot.
- SSRF: żądania do URL-i od użytkownika tylko przez allowlistę hostów; blokuj adresy wewnętrzne i metadane chmury
  (`169.254.169.254`).

## Sekrety
- Tylko ze zmiennych środowiskowych / menedżera sekretów. Nigdy w repo, logach, komunikatach błędów ani odpowiedziach API.
- Wykrycie sekretu w repo = rotacja sekretu, nie tylko usunięcie z pliku.

## Logowanie zdarzeń bezpieczeństwa
Loguj: logowania (sukces/porażka), wydanie i odświeżenie tokenu (klient, zakresy, IP, ASN, user agent), zgody OAuth,
zmiany uprawnień, reset hasła i MFA — bez haseł, tokenów i pełnych danych osobowych. Retencja na tyle długa, żeby
odpowiedzieć na pytanie „czy ktoś miał dostęp” (ops-observability).

## Nagłówki
`Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, CORS z jawną listą originów (nigdy `*` z credentials).

Pełna checklista przed wydaniem API (uwierzytelnianie, JWT z ustalonym algorytmem i JWKS, transport i HSTS, XXE
i „billion laughs”, upload przez podpisany URL, nagłówki odpowiedzi, CI/CD, monitorowanie):
`references/checklista-bezpieczenstwa-api.md`.

## Checklista przeglądu
- [ ] każdy nowy endpoint ma sprawdzenie autoryzacji per zasób + test na 403
- [ ] tokeny: krótkie, `aud` sprawdzane, rotacja refresh z wykrywaniem ponownego użycia, unieważnianie po zmianie poświadczeń
- [ ] OAuth: PKCE, dokładne redirect URI, minimalne zakresy, device code wyłączony bez potrzeby
- [ ] brak deserializacji niezaufanych danych do obiektów natywnych
- [ ] panel admina i endpointy zarządzania niedostępne z internetu
- [ ] brak sekretów w diffie i logach; zdarzenia bezpieczeństwa logowane
- [ ] walidacja wejścia i limity; zależności bez znanych krytycznych CVE (ops-supply-chain-security)
