# OCPP (Open Charge Point Protocol)

> **Spis treści:** 1. Definicja · 2. Wersje protokołu · 3. Architektura komunikacji · 4. Katalog komunikatów · 5. Profile bezpieczeństwa (OCPP 2.0.1 — obowiązkowe;… · 6. Smart Charging (zarządzanie mocą) · 7. Offline charging · 8. OCPP vs inne protokoły ekosystemu EV · 9. Ekosystem — kto to tworzy i wdraża · 10. Skalowalność backendu (CSMS) — architektura platform… · 11. Testowanie OCPP · 12. FAQ

Źródła (import): ocpplab.com/blog/what-is-ocpp; fransiscuss.com — „What is OCPP: A Complete Guide” i „Architecting
Scalable OCPP Compliant EV Charging Platforms”; specyfikacje OCA (openchargealliance.org). Stan wiedzy: źródła z lat
2024–2025, włączone do repozytorium 2026-09-27. Wersje, daty i liczby oznaczone „(do weryfikacji)” sprawdza `researcher`
przed użyciem w decyzji lub dokumencie dla klienta.

## 1. Definicja

OCPP to otwarty, **royalty-free**, neutralny względem dostawcy protokół aplikacyjny umożliwiający
komunikację między stacją ładowania (**Charge Point** / **Charging Station**) a systemem
zarządzającym w tle (**CPMS** — branżowy slang / **CSMS** — formalny termin OCPP 2.0.1 / **Central
System** — termin OCPP 1.6; patrz mapa pojęć w `SKILL.md`). Powstał, żeby rozwiązać problem
**vendor lock-in** — bez standardu każdy producent ładowarek używał własnego, zamkniętego protokołu,
co uniemożliwiało interoperacyjność i podnosiło koszt integracji. Tworzony i zarządzany przez
**Open Charge Alliance (OCA)**, założoną w 2014 w Holandii, 400+ członków organizacyjnych,
specyfikacje publikowane bezpłatnie na openchargealliance.org.

## 2. Wersje protokołu

| Wersja | Rok | Transport | Status / kluczowe cechy |
|---|---|---|---|
| OCPP 1.2 | 2009/2010 | SOAP/XML | pierwsza wersja, bardzo ograniczona, przestarzała |
| OCPP 1.5 | 2012 | SOAP/XML | lepsza stabilność/struktura, wciąż bez zaawansowanych funkcji, legacy |
| **OCPP 1.6** | 2015 | WebSocket/JSON **lub** SOAP/XML | **najbardziej rozpowszechniona wersja na świecie**; Remote Start/Stop, podstawowy Smart Charging, firmware management, diagnostyka; 28 unikalnych akcji (10 Charge Point, 18–19 CPMS + DataTransfer) |
| OCPP 2.0 | 2018 | WebSocket/JSON | gruntowna przebudowa: Device Model, Security Profiles, ISO 15118, zastąpiona przez 2.0.1 |
| **OCPP 2.0.1** | 2020 | WebSocket/JSON | **najnowsza stabilna, dominująca wersja 2.x**; poprawki błędów względem 2.0, rosnąca adopcja |
| OCPP 2.1 | 2025 (styczeń — do weryfikacji) | WebSocket/JSON | rozszerzenie 2.0.1 (w dużej mierze zgodne wstecz z 2.0.1, nie z 1.6); ISO 15118-20, V2G/dwukierunkowość, lokalne zarządzanie energią (DER), płatności ad-hoc — zakres szczegółowy do weryfikacji |

Specyfikacje OCA wychodzą w kolejnych **edycjach** (errata włączane do dokumentu, np. OCPP 2.0.1 Edition 3) — przy
certyfikacji i sporach z producentem podawaj wersję **i edycję** (numer aktualnej edycji — do weryfikacji).

**Ważne:** OCPP 2.x **nie jest wstecznie kompatybilne** z 1.6 — to inny model danych (Device Model)
i inny model transakcji (`TransactionEvent` zamiast `StartTransaction`/`StopTransaction`). Wiele
platform (np. AMPECO) wspiera **obie** linie równocześnie (1.5/1.6 **i** 2.0.1) dla wstecznej
kompatybilności ze starszym sprzętem w tej samej sieci.

## 3. Architektura komunikacji

### Topologia

```
Charge Point (klient)  ◄──── WebSocket (wss://, szyfrowany) ────►  CPMS/CSMS (serwer)
```

- **Charge Point / Charging Station** — fizyczne urządzenie, klient OCPP, inicjuje połączenie.
- **CPMS / CSMS / Central System** — backend, serwer OCPP; zarządza sesjami, autoryzacją, billing,
  diagnostyką, firmware.
- Starsze wdrożenia OCPP 1.5/1.6 mogą używać **SOAP/HTTP** zamiast WebSocket — nowe wdrożenia:
  **WebSocket/JSON**, opcjonalnie **SOAP/XML** dla 1.6.

### Cykl życia połączenia

1. Rozwiązanie DNS + handshake TCP do hosta CPMS.
2. (Dla `wss://`) negocjacja TLS.
3. Upgrade WebSocket z nagłówkiem `Sec-WebSocket-Protocol: ocpp1.6` (albo `ocpp2.0.1`).
4. **BootNotification** — natychmiast po ustanowieniu WebSocket, Charge Point wysyła dane
   rejestracyjne (vendor, model, numer seryjny, wersja firmware); CPMS odpowiada `Accepted` /
   `Pending` / `Rejected` + interwał Heartbeatu.
5. Stała komunikacja dwustronna przy utrzymywanym połączeniu.
6. Utrata połączenia → automatyczny reconnect z exponential backoff.

### Format wiadomości — JSON-RPC nad WebSocket

**Call (żądanie)** — `[2, "message-id", "ActionName", { ...payload }]` (przykłady niżej: payload OCPP 1.6)
```json
[2, "unique-message-id", "BootNotification",
 {"chargePointVendor": "Example", "chargePointModel": "Model123"}]
```

**CallResult (odpowiedź OK)** — `[3, "message-id", { ...payload }]`
```json
[3, "unique-message-id",
 {"status": "Accepted", "currentTime": "2025-02-20T10:00:00Z", "interval": 300}]
```

**CallError (błąd)** — `[4, "message-id", "ErrorCode", "opis", { szczegóły }]`
```json
[4, "unique-message-id", "FormationViolation", "Invalid payload", {}]
```
Kody błędów różnią się między wersjami — waliduj wg wersji połączenia:
- **1.6-J:** `NotImplemented`, `NotSupported`, `InternalError`, `ProtocolError`, `SecurityError`, `FormationViolation`,
  `PropertyConstraintViolation`, `OccurenceConstraintViolation` (literówka jest w specyfikacji), `TypeConstraintViolation`,
  `GenericError`.
- **2.0.1:** m.in. `FormatViolation` (zamiast `FormationViolation`), `OccurrenceConstraintViolation`,
  `MessageTypeNotSupported`, `RpcFrameworkError`.
- **2.1:** nowe typy ramek (m.in. wiadomość bez odpowiedzi `SEND` i `CALLRESULTERROR`) — do weryfikacji przed implementacją.

**Reguła:** każda strona może mieć maksymalnie **jedno outstanding żądanie na raz**; typowy timeout
odpowiedzi to ~30 sekund. `message-id` wiąże `CallResult`/`CallError` z konkretnym wcześniejszym
`Call` — to nie jest zwykłe req/response HTTP, obie strony inicjują `Call`e niezależnie od siebie.

## 4. Katalog komunikatów

### Inicjowane przez Charge Point → CPMS

| Komunikat | Cel |
|---|---|
| `BootNotification` | rejestracja przy starcie (vendor/model/firmware) |
| `Heartbeat` | keep-alive; CPMS odpowiada aktualnym czasem UTC (synchronizacja zegara) |
| `StatusNotification` | zmiana stanu konektora — **różne słowniki wersji**: 1.6 `Available`, `Preparing`, `Charging`, `SuspendedEV`, `SuspendedEVSE`, `Finishing`, `Reserved`, `Unavailable`, `Faulted`; 2.0.1 tylko `Available`, `Occupied`, `Reserved`, `Unavailable`, `Faulted` (stan ładowania niesie `TransactionEvent`) |
| `StartTransaction` / `StopTransaction` | start/koniec sesji ładowania (**OCPP 1.6**) |
| `TransactionEvent` | zdarzenie transakcji `Started`/`Updated`/`Ended` (**OCPP 2.0.1**, z `seqNo`) |
| `MeterValues` | zużycie energii, moc, napięcie, prąd, temperatura, SoC |
| `Authorize` | walidacja RFID/tagu ID przed ładowaniem |
| `DiagnosticsStatusNotification` | status przesyłania diagnostyki |
| `FirmwareStatusNotification` | status aktualizacji firmware |
| `DataTransfer` | wymiana danych specyficznych dla producenta (vendor-specific) |

### Inicjowane przez CPMS/CSMS → Charge Point

| Komunikat | Cel |
|---|---|
| `RemoteStartTransaction` / `RemoteStopTransaction` | zdalny start/stop sesji |
| `SetChargingProfile` / `ClearChargingProfile` | ustawienie/usunięcie profilu smart charging |
| `GetCompositeSchedule` | odczyt efektywnego, połączonego harmonogramu mocy |
| `ChangeConfiguration` / `GetConfiguration` | zapis/odczyt klucza konfiguracyjnego (OCPP 1.6) |
| `ChangeAvailability` | ustawienie konektora jako operacyjny/wyłączony |
| `Reset` | soft/hard reset ładowarki |
| `UnlockConnector` | zdalne odblokowanie złącza |
| `UpdateFirmware` / `GetDiagnostics` | zdalna aktualizacja firmware / żądanie logów |
| `ReserveNow` / `CancelReservation` | rezerwacja konektora dla tagu ID / jej anulowanie |
| `SendLocalList` / `GetLocalListVersion` | aktualizacja/odczyt wersji lokalnej listy autoryzacyjnej |
| `TriggerMessage` | żądanie, by Charge Point wysłał konkretny komunikat na żądanie |
| `ClearCache` | wyczyszczenie lokalnej pamięci podręcznej autoryzacji |
| `DataTransfer` | wymiana danych vendor-specific (też w tym kierunku) |

### Dodatkowe komunikaty OCPP 2.0.1 (Device Model, bezpieczeństwo, ISO 15118)

| Komunikat | Cel |
|---|---|
| `SetVariables` / `GetVariables` | odczyt/zapis strukturalnego Device Model (zamiast płaskiego Change/GetConfiguration z 1.6) |
| `GetBaseReport` / `NotifyReport` | pełny dump Device Model / raport danych od Charge Point |
| `RequestStartTransaction` / `RequestStopTransaction` | odpowiedniki Remote Start/Stop z rozszerzonymi parametrami |
| `SetDisplayMessage` | zdalna kontrola treści na wyświetlaczu ładowarki |
| `CostUpdated` | aktualizacja kosztu sesji w czasie rzeczywistym |
| `SetNetworkProfile` | zdalna konfiguracja sieciowa Charge Point |
| `InstallCertificate` / `DeleteCertificate` / `GetInstalledCertificateIds` | cykl życia certyfikatów |
| `SignCertificate` | żądanie nowego certyfikatu przez Charge Point |
| `Get15118EVCertificate` | provisioning certyfikatu ISO 15118 (Plug & Charge) |
| `NotifyEVChargingNeeds` | pojazd komunikuje swoje potrzeby ładowania |
| `SecurityEventNotification` | raport zdarzenia bezpieczeństwa (tamper, nieudana autoryzacja) |
| `LogStatusNotification` | status operacji przesyłania logów |

OCPP 2.0.1 organizuje komunikaty w **16 blokach funkcjonalnych (A–P)**, znacznie szerszych niż 28
akcji OCPP 1.6 Edition 2 (10 Charge Point + 18 CPMS + `DataTransfer`, plus 11 dodatkowych w
opcjonalnym Security Whitepaper edition 2 dla 1.6).

## 5. Profile bezpieczeństwa (OCPP 2.0.1 — obowiązkowe; opcjonalne jako dodatek do 1.6)

| Profil | Transport | Autoryzacja | Kiedy używać |
|---|---|---|---|
| **1 — Basic Auth** | `ws://` (niezaszyfrowany) | HTTP Basic Auth | tylko testy/sieci izolowane — poświadczenia i wiadomości w czystym tekście |
| **2 — TLS + Basic Auth** | `wss://` (TLS po stronie serwera) | HTTP Basic Auth nad TLS | produkcja, gdy zarządzanie certyfikatami klienckimi jest niewykonalne; minimum rekomendowane do produkcji |
| **3 — TLS + Client Certs (mTLS)** | `wss://` (wzajemny TLS) | certyfikat klienta + serwera | wdrożenia wysokiego bezpieczeństwa, infrastruktura publiczna, compliance — wymaga PKI do provisioning/rotacji/revoke |

OCPP 2.0.1 dodatkowo **wymaga** podpisanych aktualizacji firmware (Charge Point weryfikuje podpis
kryptograficzny przed instalacją). Core OCPP 1.6 ma bezpieczeństwo minimalne (TLS opcjonalny);
Security Whitepaper edition 2 dodaje profile bezpieczeństwa jako opt-in.

## 6. Smart Charging (zarządzanie mocą)

`SetChargingProfile` (CPMS → Charge Point) niesie:
- **Stack level** — priorytet profilu; wyższy poziom nadpisuje niższy.
- **Charging profile purpose**:
  - OCPP 1.6: `ChargePointMaxProfile`, `TxDefaultProfile`, `TxProfile`.
  - OCPP 2.0.1: `ChargingStationMaxProfile`, `ChargingStationExternalConstraints`,
    `TxDefaultProfile`, `TxProfile`.
- **Charging schedule** — seria limitów moc/prąd rozłożona w czasie.

**Przykład (z artykułu źródłowego):** lokacja z 150 kW dostępnej moc sieciowej i 4 szybkimi
ładowarkami DC — `ChargePointMaxProfile`/`ChargingStationMaxProfile` dynamicznie dzieli moc, każda
ładowarka dostaje ~37,5 kW; gdy spada dostępność sieciowa, CSMS zmniejsza limit lokacji do 100 kW i
przelicza rozkład.

OCPP 2.0.1 dodaje: profilowanie na poziomie EVSE **i** stacji, obliczanie composite schedule, limity
zewnętrzne z Energy Management System, harmonogramy absolutne i względne (relative do startu
transakcji). OCPP 1.6 ma tylko proste stackowanie na poziomie konektora.

## 7. Offline charging

CPMS wysyła **Local Authorization List** (`SendLocalList`) z autoryzowanymi tagami ID. Po utracie
WebSocket Charge Point może autoryzować lokalnie i uruchamiać sesje z tej listy; dane transakcji są
buforowane lokalnie i wysłane po przywróceniu łączności. OCPP 2.0.1 ulepsza to przez event-based
model transakcji z numerami sekwencji (`seqNo`) — CPMS wykrywa brakujące zdarzenia i rekonstruuje
pełną transakcję bez utraty danych, zamiast tylko dostać końcowy stan.

## 8. OCPP vs inne protokoły ekosystemu EV

| Protokół | Łączy | Zakres |
|---|---|---|
| **OCPP** | Charge Point ↔ CPMS/CSMS | ten plik |
| **OCPI** | CPMS ↔ CPMS / eMSP | roaming między sieciami |
| **OICP** | CPMS → Hub (Hubject) → CPMS | roaming przez centralny hub |
| **ISO 15118** | EV ↔ Charge Point | Plug & Charge, V2G — poniżej poziomu OCPP |
| **OpenADR** | Utility/sieć ↔ Energy Management System | demand response na poziomie sieci energetycznej |

## 9. Ekosystem — kto to tworzy i wdraża

(Listy firm i deklaracje producentów pochodzą ze źródeł o charakterze marketingowym — traktuj jako orientacyjne.)

- **Organizacja standaryzująca:** Open Charge Alliance (OCA), Holandia, założona 2014, 400+
  członków, program certyfikacji (self-service testing → conformance testing w akredytowanym labie
  → interoperability testing). Certyfikacja nie jest prawnie wymagana, ale wiele unijnych RFP/
  programów finansowania ją wymaga/preferuje.
- **Producenci ładowarek:** ABB E-mobility (Terra), Schneider Electric, EVBox, Wallbox, Alfen,
  Tritium, Kempower, Autel Energy, BTC Power.
- **Operatorzy sieci (CPO):** ChargePoint, Fastned, EVgo, Allego, Shell Recharge/Ubitricity, bp pulse.
- **Dostawcy CPMS:** Driivz (Vontier), EVConnect, AMPECO, Current, EV.energy, Open Charge Point
  (open-source).

## 10. Skalowalność backendu (CSMS) — architektura platform zgodnych z OCPP

Z artykułu „Architecting Scalable OCPP Compliant EV Charging Platforms” (materiał koncepcyjny,
wysokopoziomowy — bez konkretnych wzorców typu sharding/message queues/Kubernetes; to, co faktycznie
podaje źródło):

**Kluczowe komponenty skalowalnej architektury:**
- **Backend system design** — musi wspierać **wiele wersji OCPP równocześnie** (sieć rzadko ma
  jednorodny sprzęt); przykład: AMPECO wspiera trójkę wersji 1.5/1.6/2.0.1 naraz, co ilustruje
  znaczenie wstecznej kompatybilności w projektowaniu sieci ładowania.
- **CSMS jako „nerve center”** — centralny punkt kierujący komunikacją między podłączonymi stacjami
  i zarządzający ich stanem operacyjnym; musi być projektowany pod **horizontal scalability**, żeby
  dodawanie kolejnych punktów ładowania było bezszwowe przy rosnącym popycie.
- **Certification compliance** — formalna certyfikacja OCA nie jest tylko znakiem jakości, ale
  gwarancją interoperacyjności i integracji z certyfikowanym sprzętem innych producentów; buduje
  zaufanie operatorów i użytkowników.

**Korzyści z architektury opartej na OCPP:**
- **Hardware agnosticism** — operator integruje dowolną ładowarkę zgodną z OCPP niezależnie od
  producenta (przykład z artykułu: platforma AMPECO deklaruje kompatybilność z 70+ producentami).
- **Interoperability / future-proofing** — zgodność ze standardem chroni przed fragmentacją systemu
  i przed przestarzeniem inwestycji przy zmianie technologii.
- **Security enhancements** — OCPP 2.0.1 podnosi poziom bezpieczeństwa (przykład z artykułu:
  certyfikacja EV Connect dla modułów Core i Advanced Security OCPP 2.0.1, marzec 2025).

**Rekomendacje na przyszłość (z sekcji „Future Considerations” źródła):**
- projektować z myślą o **przyszłej upgradability** — bez pełnej przebudowy przy nowych wersjach OCPP;
- zachować **wsteczną kompatybilność**, żeby nowe systemy nadal obsługiwały starsze wdrożenia OCPP;
- projektować pod skalę **tysięcy do milionów sesji ładowania**, zgodnie z tempem wzrostu adopcji EV;
- **regularnie aktualizować profile bezpieczeństwa** wraz z nowymi zagrożeniami/standardami;
- rozważyć integrację z szerszymi **systemami zarządzania energią (Energy Management Systems)**.

## 11. Testowanie OCPP

**Fizyczne testowanie — wyzwania:** stacja DC fast charging to duży koszt kapitałowy (instalacja
sieciowa, uziemienie, pozwolenia); wymaga fizycznych złączy/zasilaczy/pojazdów; trudno odtworzyć
edge case'y (network drop mid-transaction, uszkodzenie firmware); cykl testowy trwa tygodnie–miesiące.

**Testowanie symulacyjne — zalety:** wdrożenie 1000+ wirtualnych Charge Pointów w minuty; pełne
pokrycie OCPP 1.6 i 2.0.1; symulacja 100+ modeli urządzeń z ich specyficznymi „quirkami”; łatwe
odtwarzanie edge case'ów (network failures, malformed messages, concurrent operations); integracja z
CI/CD do automatyzacji regresji; testowanie złożonych profili smart charging i composite schedules.

## 12. FAQ

**Czy OCPP jest darmowy?** Tak — otwarty protokół OCA, royalty-free, specyfikacja bezpłatna.

**OCPP vs OCPI?** OCPP = charger↔backend (start sesji, raportowanie). OCPI = roaming
międzysieciowy (obsługa kierowcy z innej sieci ładowania).

**Czy wszystkie ładowarki wspierają OCPP?** Większość komercyjnych — tak, minimum 1.6. Tesla
Supercharger był historycznie proprietary; doniesienia o szerszym wsparciu OCPP (np. przy stacjach finansowanych z NEVI)
— do weryfikacji. Niskobudżetowe ładowarki domowe bywają standalone, bez OCPP.

**CSMS vs CPMS?** CSMS = termin formalny OCPP 2.0.1. Central System = termin OCPP 1.6. CPMS =
branżowy slang na to samo (nie termin ze specyfikacji 2.0.1). Wszystkie trzy = backend
autoryzacji/sesji/billingu/energii/firmware.

**Którą wersję implementować (stan na dziś)?** Zwykle obie: OCPP 1.6 dla wstecznej kompatybilności
ze starszym sprzętem + OCPP 2.0.1 dla nowych urządzeń, ISO 15118 i obowiązkowego bezpieczeństwa.

**Czy OCPP ma wbudowane bezpieczeństwo?** Core 1.6: minimalne (TLS opcjonalny). 1.6 + Security
Whitepaper ed. 2: profile bezpieczeństwa opt-in. 2.0.1: profile 1/2/3 obowiązkowe. Produkcyjne
minimum: Profil 2 (TLS + basic auth); rekomendowane: Profil 3 (mTLS).

**Co to Heartbeat?** Keep-alive wysyłany przez Charge Point w stałych, konfigurowalnych interwałach
(typowo 30–300 s); odpowiedź CPMS zawiera znacznik czasu UTC — służy też do synchronizacji zegara
ładowarki.

**Czy OCPP wspiera V2G (Vehicle-to-Grid)?** OCPP 2.0.1 ma podstawową integrację ISO 15118 (w tym
negative power profiles). OCPP 2.1 (2025) rozszerza to pod ISO 15118-20/V2G. Pełne V2G wymaga też
protokołów po stronie sieci energetycznej (np. OpenADR).

**Co się dzieje przy zerwaniu połączenia w trakcie transakcji?** Krytyczne komunikaty
(`StartTransaction`/`StopTransaction` w 1.6) są buforowane i wysyłane ponownie po reconnect. W
2.0.1 `TransactionEvent` ma `seqNo` per transakcję — Charge Point odtwarza zakolejkowane zdarzenia
offline przy reconnect, a CPMS wykrywa brakujące numery sekwencji i wie, że coś przepadło.
