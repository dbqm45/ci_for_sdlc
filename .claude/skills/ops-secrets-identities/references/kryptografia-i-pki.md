# Kryptografia w praktyce, KMS i PKI

Zasada nadrzędna: nie wymyślaj kryptografii i nie składaj jej z prymitywów, jeśli jest gotowa konstrukcja wysokiego
poziomu (biblioteka platformy, libsodium/Tink, KMS, TLS).

## Wybór narzędzia
| Potrzeba | Użyj | Nie używaj |
|---|---|---|
| szyfrowanie danych | AES-256-GCM lub ChaCha20-Poly1305 (szyfrowanie z uwierzytelnieniem), losowy nonce, nigdy powtórzony z tym samym kluczem | AES-ECB, CBC bez MAC, własne schematy |
| integralność i autentyczność wiadomości między stronami ze wspólnym sekretem | HMAC-SHA-256, porównanie w czasie stałym | zwykły hash z sekretem doklejonym (`sha256(secret+msg)`) |
| podpis, tożsamość, wymiana klucza | Ed25519 / ECDSA P-256, RSA ≥ 3072 (2048 tylko dla zgodności), X25519 / ECDHE | RSA bez paddingu OAEP/PSS, klucze < 2048 |
| odcisk danych, deduplikacja, suma kontrolna | SHA-256 / SHA-3 | MD5, SHA-1 (kolizje) |
| hasła | argon2id albo bcrypt (be-auth-security) | SHA-256 nawet z solą — za szybki |
| losowość | CSPRNG platformy (`crypto.randomBytes`, `SecureRandom`) | `Math.random`, `Random` |
| transport | TLS 1.3 (1.2 z nowoczesnymi szyframi), mTLS między usługami | własny protokół nad TCP |

## KMS i szyfrowanie kopertowe
- Klucz główny (KEK) żyje w KMS lub HSM i nigdy go nie opuszcza. Dane szyfrujesz kluczem danych (DEK) generowanym
  per obiekt lub partię. DEK zaszyfrowany przez KMS przechowujesz obok danych.
- Rotacja KEK nie wymaga przeszyfrowania danych (KMS trzyma stare wersje do odszyfrowania); kompromitacja DEK dotyczy
  jednego obiektu.
- Uprawnienia do KMS rozdzielone: kto może szyfrować, kto odszyfrowywać, kto administrować kluczem (to trzy różne role).
  Każde użycie klucza w logu audytowym.
- Usunięcie klucza = utrata danych (kryptograficzne usuwanie) — z okresem oczekiwania i zatwierdzeniem człowieka.

## Cykl życia certyfikatów
- Inwentarz (CBOM, sekcja 5 w SKILL.md): gdzie są certyfikaty, kto wystawił, kiedy wygasają, kto jest właścicielem.
- Wystawianie i odnawianie automatyczne (ACME, cert-manager); monitoring wygasania niezależny od automatu
  (ops-observability). Ważność publicznych certyfikatów maleje do 47 dni (CA/B Forum, do 2029).
- Unieważnianie: Let's Encrypt wyłączył OCSP 6.08.2025 i publikuje tylko listy CRL. Krótki czas życia certyfikatów
  zastępuje coraz częściej unieważnianie, więc sprawdź, czy klienci w Twojej infrastrukturze nie wymagają OCSP.
- Klucz prywatny generowany tam, gdzie będzie używany (lub w HSM/KMS), nigdy przesyłany e-mailem ani przez repozytorium.

## Własna PKI (wewnętrzne mTLS, urządzenia, podpisywanie)
- Hierarchia: **root CA offline** (HSM, używany rzadko, procedura z dwiema osobami) → **pośrednie CA online**
  per zastosowanie lub środowisko → certyfikaty końcowe krótkotrwałe (godziny–dni dla usług).
- Polityka certyfikatów: kto może dostać jaki certyfikat (nazwy, rozszerzenia, czas życia), jak weryfikowana tożsamość.
- **Odporność na awarię**: co najmniej dwa pośrednie CA wydające certyfikaty (w różnych strefach lub regionach), wysoka
  dostępność dystrybucji CRL, zapas czasu — certyfikaty odnawiane w połowie ważności, więc awaria CA przez kilka godzin
  nie zatrzymuje usług. Procedura kompromitacji CA (unieważnienie pośredniego, wymiana zaufania) przećwiczona.
- Gotowe rozwiązania zamiast własnego CA od zera: zarządzane CA dostawcy chmury, step-ca, HashiCorp Vault PKI,
  siatka usług z wbudowanym CA.

## Kryptografia postkwantowa
Napastnik może dziś zapisać ruch i odszyfrować go w przyszłości („zbierz teraz, odszyfruj później”). Dla danych
o długim okresie poufności: inwentarz kryptografii, przegląd tego, gdzie stosujesz wymianę kluczy, i włączanie trybów
hybrydowych (np. ML-KEM z X25519 w TLS), gdy wspierają je biblioteki i klienci w Twoim stosie.

## Źródła
- [roadmap.sh — DevSecOps](https://roadmap.sh/devsecops) (symmetric, asymmetric, hashing, SHA-256, bcrypt, KMS,
  certificate lifecycle, PKI design and failover, TLS)
- [AWS KMS — concepts](https://docs.aws.amazon.com/kms/latest/developerguide/overview.html);
  [Let's Encrypt: Ending OCSP support in 2025](https://community.letsencrypt.org/t/ending-ocsp-support-in-2025/229786)
- NIST FIPS 203 (ML-KEM, 2024)
Opisane własnymi słowami.
