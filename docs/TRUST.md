# Quorum — bezpieczeństwo i poufność danych

Stan: 2026-11-16. Dokument dla zespołów i działów bezpieczeństwa firm, które rozważają Quorum (gotowa odpowiedź na
pytania z kwestionariusza bezpieczeństwa). Opisuje usługę hostowaną w becie; szczegóły techniczne i stan kontroli:
[`SECURITY-REVIEW.md`](SECURITY-REVIEW.md), [`DATA-DELETION.md`](DATA-DELETION.md), [`BACKUPS.md`](BACKUPS.md),
[`AI-PLATFORM.md`](AI-PLATFORM.md). Przed wysłaniem klientowi zagranicznemu: wersja angielska.

## 1. Jakie dane czytamy

- **Jira i Confluence** zespołu, przez OAuth Atlassiana, **tylko do odczytu** (`read:jira-work`, odczyt stron, przestrzeni
  i etykiet Confluence). Quorum nic w nich nie zapisuje.
- **Figma** — tylko jeśli zespół ją podłączy.
- **Co powstaje u nas:** wyniki analizy (ustalenia, pytania), decyzje i zatwierdzenia zespołu, dziennik audytu,
  ustawienia przestrzeni.
- **Konta:** imię, e-mail i identyfikator konta Atlassian osób zespołu (logowanie zakresem `read:me`).
- **Pomiar użycia (beta):** zdarzenia bez treści — liczby i rodzaje działań, osoby jako pseudonimy; zespół może go
  wyłączyć.

## 2. Gdzie leżą dane

| Co | Gdzie | Region |
|---|---|---|
| Aplikacja i baza | Render (Web Service + Postgres) | UE — Frankfurt |
| Kopie bazy | Backblaze B2, zaszyfrowane i zablokowane przed usunięciem | UE — Amsterdam |
| Model AI | Amazon Bedrock, profil wnioskowania UE | UE |
| Poczta | Resend (tylko adresat, temat, treść maila — nigdy treść historyjek) | wg ustawień Resend |
| Pomiar użycia (opcjonalnie) | PostHog | UE |

Pełna lista podprzetwarzających jest w umowie powierzenia (DPA).

## 3. Jak chronimy dane

- **Szyfrowanie w spoczynku, zawsze:** w usłudze hostowanej stan każdej przestrzeni — decyzje, zatwierdzenia,
  wyniki analizy, pamięć podręczna AI, zmiany (drift), propozycje odpowiedzi i dziennik audytu — jest zapisywany
  zaszyfrowany (AES-256-GCM). Bez klucza usługi baza i kopie zawierają tylko szyfrogram. Usługa nie wystartuje na
  produkcji bez klucza. Tokeny połączeń z Atlassianem są szyfrowane zawsze.
- **Szyfrowanie w drodze:** HTTPS z HSTS; połączenia z Atlassianem, Bedrockiem i B2 też po TLS.
- **Oddzielenie firm:** każda przestrzeń ma osobne wiersze w bazie chronione przez zabezpieczenie na poziomie wierszy
  (RLS) — zapytanie jednej przestrzeni nie zwróci cudzych wierszy nawet przy błędzie w kodzie. Osoby widzą tylko
  przestrzenie swojej organizacji; sprawdzają to testy.
- **Dostęp osób:** logowanie kontem Atlassian; role Owner / Admin / Member / Viewer; sesja tylko jako skrót w bazie,
  wygasa po 12 godzinach bezczynności lub 7 dniach.
- **Zabezpieczenia aplikacji:** ścisła polityka treści (CSP), ochrona przed CSRF i DNS rebinding, limit zapytań na
  formularzu publicznym, powiadomienia o zmianach z sekretem przestrzeni; przegląd bezpieczeństwa przed betą i test,
  który pilnuje, że żadna trasa nie odpowiada bez logowania poza wymienionymi publicznymi.
- **Logi i alerty** nie zawierają treści historyjek, decyzji ani sekretów.

## 4. Sztuczna inteligencja

- **Model:** Claude przez Amazon Bedrock w UE; dostawcę i model wybiera usługa, zespół nie może wskazać innego adresu.
- **Co trafia do modelu:** treść historyjki i powiązanych stron, przycięta do 6000 znaków na źródło, z usuniętymi
  danymi osobowymi (e-maile, telefony itp.). Domyślnie **tylko na żądanie** — dla historyjki, o której przegląd AI
  ktoś poprosił.
- **„Nigdy”:** zespół może ustawić *Run semantic review → Never*; wtedy nic z jego przestrzeni nie trafia do żadnego
  modelu, a analiza działa na regułach deterministycznych.
- **Trenowanie:** Amazon Bedrock nie używa danych wejściowych do trenowania modeli — **do potwierdzenia w aktualnych
  warunkach AWS przed wysłaniem dokumentu klientowi.**
- **Koszt i nadużycia:** miesięczny limit wydatku na przestrzeń.

## 5. Kto z naszej strony ma dostęp

- Usługę prowadzi jeden operator (właściciel produktu). Panel operatora pokazuje zgłoszenia, liczby użycia i wydatki
  AI — **nie treść** analiz zespołów.
- Dostęp techniczny do przestrzeni zespołu (token administratora) jest używany tylko na prośbę zespołu, przy zgłoszeniu
  problemu. **Każde takie użycie zapisuje się w dzienniku audytu tej przestrzeni** („The platform operator used …”),
  który zespół widzi w Quorum.
- Konta u dostawców (Render, AWS, Backblaze, Resend) mają włączone 2FA; dostęp ma tylko operator.

## 6. Przechowywanie i usuwanie

- Dane są przechowywane, dopóki zespół korzysta z Quorum.
- **Usunięcie przestrzeni:** połączenie z Atlassianem znika od razu; dane po 30 dniach (do tego czasu można je
  przywrócić).
- **Usunięcie organizacji na żądanie:** wszystko od razu — przestrzenie, osoby, zaproszenia, pomiar, zgłoszenie i
  odpowiedzi na ankiety; zostaje tylko zapis, że i kiedy to zrobiono (bez danych osobowych).
- **Kopie:** wygasają same — dzienne po 35, miesięczne po 100 dniach. Odtwarzanie bazy w Render obejmuje ostatnie
  3 dni.

## 7. Incydenty

- Monitoring dostępności i alerty o błędach do operatora; codzienne kopie z regularną próbą odtworzenia.
- Naruszenie ochrony danych zgłaszamy zespołowi bez zbędnej zwłoki (zgodnie z DPA, w terminie z art. 33 RODO dla
  administratora); kontakt w umowie.

## 8. Dla firm o wyższych wymaganiach

| Opcja | Na czym polega |
|---|---|
| **Instancja dedykowana** | osobna aplikacja i osobna baza tylko dla firmy (ten sam kod, osobne klucze) |
| **AI z konta firmy** | Quorum woła Bedrock z konta AWS firmy — treść nie przechodzi przez nasze konto AI |
| **Bez AI** | *Never* dla wszystkich przestrzeni |
| **Self-hosted** | firma uruchamia obraz Dockera u siebie; dane nie opuszczają jej infrastruktury |
| **W Jirze (plan)** | reguły w aplikacji Atlassian Forge — dane nie opuszczają Atlassiana (`JIRA-GATE-PLAN.md`) |

**Nie mamy jeszcze** własnych certyfikatów (SOC 2, ISO 27001), SSO/SAML ani kluczy szyfrowania zarządzanych przez
klienta; korzystamy z certyfikacji dostawców infrastruktury (Render, AWS) — ich aktualne raporty podajemy na prośbę.
