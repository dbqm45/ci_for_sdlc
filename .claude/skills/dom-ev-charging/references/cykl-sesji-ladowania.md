# Cykl życia sesji ładowania — ISO 15118, OCPP i OCPI razem

> **Spis treści:** 1. Podział ról i warstwy protokołów · 2. Cykl życia sesji — 5 faz · 3. Moduły OCPI 2.2.1 w kontekście tego cyklu · 4. Jak to się łączy z resztą tego skilla

Stan wiedzy: import (źródła 2024–2025), włączony 2026-09-27; przykłady OCPI dla linii 2.2.x, OCPP dla 1.6 i 2.0.1.

Ten plik łączy trzy protokoły opisane osobno w `ocpp.md`, `ocpi.md` i `iso-15118.md` w jeden, kompletny przepływ end-to-end: od podjechania samochodu do wystawienia
faktury. Żaden z tamtych dwóch plików nie pokazuje tego w jednym miejscu — tam jest **co potrafi
każdy protokół z osobna**, tutaj jest **w jakiej kolejności i między kim faktycznie lecą wiadomości**
w realnej sesji ładowania.

## 1. Podział ról i warstwy protokołów

```
[ Pojazd (EV) ]
       │  ▲
       │  │  ISO 15118 / DIN 70121 / PWM
       ▼  │
[ Charger / EVSE ]
       │  ▲
       │  │  OCPP  (Hardware ↔ Backend)
       ▼  │
[ CPO / CSMS ]
       │  ▲
       │  │  OCPI / OICP  (Backend ↔ Backend, roaming)
       ▼  │
[ eMSP / Partnerzy / aplikacja kierowcy ]
```

| Protokół | Warstwa | Rola |
|---|---|---|
| **ISO 15118** / DIN 70121 / PWM | EV ↔ Charger | komunikacja cyfrowa wysokiego poziomu (ISO 15118) albo sygnalizacja niskopoziomowa (PWM, starszy DIN 70121) między pojazdem i złączem — Plug & Charge, dynamiczny dobór parametrów prądu, smart charging po stronie pojazdu |
| **OCPP** | Charger ↔ CSMS/CPO | komunikacja w czasie rzeczywistym (WebSocket) między fizycznym punktem ładowania a systemem zarządzania — sterowanie sprzętem, telemetria, autoryzacja, komendy techniczne. Wersje w praktyce: **1.6-J, 2.0.1, 2.1** (pełny opis: `ocpp.md`) |
| **OCPI** (albo konkurencyjne **OICP**) | CPO ↔ eMSP / roaming | REST-owy protokół B2B: dane taryfowe, lokalizacyjne, statusy stacji, sesje, rozliczenia (CDR) między CPO a eMSP/hubem roamingowym (pełny opis: `ocpi.md`) |

**Reguła orientacyjna:** jeśli wiadomość idzie do/od samego pojazdu (nie ładowarki) — to ISO 15118,
nie OCPP. OCPP zawsze ma ładowarkę jako jedną ze stron, nigdy pojazd bezpośrednio.

## 2. Cykl życia sesji — 5 faz

### Faza 1 — Gotowość i podłączenie (Discovery & Cable Plugin)

- Ładowarka w stanie czuwania raportuje status złącza do CSMS: `StatusNotification` (`Available`).
- Kierowca wpina wtyczkę → złącze fizycznie połączone z pojazdem → status zmienia się na
  `Preparing` (OCPP 1.6) albo `Occupied` (OCPP 2.0.1; w 2.0.1 dodatkowo `TransactionEvent` z wyzwalaczem
  `CablePluggedIn`, jeśli transakcja startuje od podłączenia kabla).
- Pojazd i ładowarka nawiązują komunikację niskopoziomową (detekcja oporu/sygnalizacja PWM, albo
  pełna sesja ISO 15118, zależnie od wyposażenia obu stron).

### Faza 2 — Identyfikacja i autoryzacja (Pre-Authorization)

Cztery typowe ścieżki, zależnie od tego, jak kierowca inicjuje sesję:

1. **Aplikacja mobilna (przez OCPI)** — aplikacja → żądanie do eMSP → eMSP wysyła komendę OCPI
   `START_SESSION` do CPO → CPO wysyła `RemoteStartTransaction` (OCPP 1.6) albo `RequestStartTransaction`
   (OCPP 2.0.1) do konkretnego EVSE; wynik komendy CPO odsyła eMSP asynchronicznie na `response_url`.
2. **Karta RFID / tag ładowania** — czytnik RFID w ładowarce odczytuje identyfikator → wysyła
   `Authorize.req(idTag)` do CSMS → CSMS weryfikuje uprawnienia lokalnie albo odpytuje eMSP przez
   moduł OCPI **Tokens** (patrz `ocpi.md` §6).
3. **Karta płatnicza (tap & pay / POS)** — terminal blokuje kwotę jako preautoryzację (dynamic
   reservation), zleca start transakcji do systemu zarządzania zamówieniem/płatnością operatora.
4. **Plug & Charge (ISO 15118)** — pojazd przekazuje certyfikat kontraktu (**EMAID**), ładowarka
   weryfikuje podpis kryptograficzny przez **PKI** i przekazuje `Authorize` dalej w OCPP 2.0.1 — bez
   żadnej akcji kierowcy (karta/apka), to jest cały sens Plug & Charge.

### Faza 3 — Rozpoczęcie ładowania i transfer energii

- **Ryglowanie wtyczki** — zamek mechaniczny blokuje złącze fizycznie w gnieździe (i pojazdu, i
  ładowarki), zapobiegając odpięciu pod napięciem.
- **Start transakcji w OCPP:**
  - **OCPP 1.6:** ładowarka wysyła `StartTransaction.req(connectorId, idTag, meterStart,
    timestamp)`; CSMS odpowiada `StartTransaction.conf(transactionId)`.
  - **OCPP 2.0.1:** wysyłany jest `TransactionEvent(eventType=Started)` (patrz `ocpp.md` — nowy
    model transakcji z `seqNo`, zastępujący Start/StopTransaction z 1.6).
- **Powiadomienie w OCPI:** CPO wysyła obiekt `Session` do interfejsu Receiver eMSP (w 2.2.x:
  `PUT {sessions_receiver_url}/{country_code}/{party_id}/{session_id}`, status `ACTIVE`; kolejne zmiany jako `PATCH`) — dzięki temu kierowca widzi trwającą
  sesję w swojej aplikacji w czasie rzeczywistym, nie tylko po fakcie.
- **Telemetria (`MeterValues`):** ładowarka cyklicznie (typowo co 30–60 s) wysyła `MeterValues.req`
  — aktualną moc (kW), pobraną energię (kWh), poziom naładowania baterii (SoC %). CSMS aktualizuje
  stan sesji live i weryfikuje limity energetyczne (**Dynamic Load Management** — patrz smart
  charging/charging profiles w `ocpp.md` §6 i `ocpi.md` §6, moduł Charging Profiles).

### Faza 4 — Zakończenie sesji (Stop Transaction)

Trzy typowe wyzwalacze zatrzymania:
- kierowca kończy przez aplikację → OCPI `STOP_SESSION` → OCPP `RemoteStopTransaction` (1.6) /
  `RequestStopTransaction` (2.0.1);
- ponowne przyłożenie karty RFID/płatniczej (toggle: przyłożenie startuje, drugie przyłożenie kończy);
- limit naładowania osiągnięty (100% SoC) po stronie pojazdu, albo odpięcie złącza od strony auta.

Przebieg: przekaźnik w EVSE odcina obwód wysokiego napięcia → ładowarka wysyła `StopTransaction.req
(transactionId, meterStop, timestamp, reason)` (1.6) albo `TransactionEvent(eventType=Ended, stoppedReason)` (2.0.1)
→ zamek mechaniczny odblokowuje kabel → po odpięciu status wraca do `Available` (w 1.6 zwykle przez `Finishing`).
Uwaga: w 2.0.1 moment końca transakcji jest konfigurowalny (`TxStopPoint`, np. przy odpięciu kabla albo przy końcu
autoryzacji) — ustal go jawnie, bo wpływa na naliczanie opłat za postój.

### Faza 5 — Rozliczenie, CDR i fakturowanie (Settlement & Billing)

- **Generowanie CDR (Charge Detail Record):** CSMS liczy całkowitą dostarczoną energię (`meterStop −
  meterStart`), czas trwania sesji, ewentualne opłaty za postój (idle fee) i taryfy strefowe.
- **Przesłanie CDR przez OCPI:** CPO wysyła rekord do interfejsu Receiver eMSP (w 2.2.x: `POST {cdrs_receiver_url}`)
  albo eMSP pobiera CDR-y z interfejsu Sender CPO — moduł OCPI **CDRs**, patrz `ocpi.md` §6. CDR jest niezmienny;
  korekta to nowy CDR kredytowy (`credit`, `credit_reference_id` — 2.2+), nie edycja starego.
- **Obciążenie i płatność — dwa kanały:**
  - **Bezpośredni/B2C:** system płatności (np. dostawca typu Adyen) finalizuje obciążenie (capture)
    na podstawie wcześniejszej preautoryzacji z Fazy 2 i generuje potwierdzenie/e-paragon.
  - **Roamingowy/B2B:** eMSP wystawia fakturę kierowcy/flocie; CPO i eMSP rozliczają się hurtowo na
    podstawie zatwierdzonych rekordów CDR — nie per-transakcja w czasie rzeczywistym.

## 3. Moduły OCPI 2.2.1 w kontekście tego cyklu

Ta sama lista modułów co w `ocpi.md` §6, tutaj przypisana do konkretnej fazy cyklu, żeby było
jasne, **kiedy** dany moduł faktycznie wchodzi do gry:

| Moduł OCPI | Faza cyklu | Co robi tutaj konkretnie |
|---|---|---|
| **Locations** | przed Fazą 1 (odkrywanie stacji) | lokalizacje, EVSE, typy złączy, maks. moc, geolokalizacja — to czyta apka kierowcy, żeby pokazać stację na mapie |
| **Tariffs** | Faza 2 (przed autoryzacją) | cena za kWh, opłata startowa, cena za minutę ładowania/postoju — pokazywane kierowcy przed startem |
| **Tokens** | Faza 2 (autoryzacja RFID) | synchronizacja identyfikatorów RFID/tokenów aplikacji do autoryzacji offline/online |
| **Sessions** | Faza 3 (w trakcie ładowania) | podgląd na żywo aktywnej sesji — to ten `PUT /sessions/{id}` z Fazy 3 |
| **CDRs** | Faza 5 (po zakończeniu) | niezmienny rekord rozliczeniowy — podstawa finansowego rozliczenia CPO↔eMSP |
| **Commands** | Fazy 2 i 4 (start/stop/unlock) | zdalne sterowanie: start, stop, `UNLOCK_CONNECTOR` (odblokowanie zablokowanego złącza — przydatne, gdy mechanizm ryglujący z Fazy 3/4 się zatnie) |

## 4. Jak to się łączy z resztą tego skilla

- To jest **synteza**, nie zamiennik `ocpp.md`/`ocpi.md` — po pełny katalog komunikatów OCPP (nie
  tylko te użyte w tym cyklu) i po pełny opis wszystkich modułów/wersji OCPI, wciąż wracaj do tamtych
  plików. Ten plik odpowiada na „w jakiej kolejności to wszystko leci”, tamte na „co dany protokół
  w ogóle potrafi”.
- **Plug & Charge (Faza 2, ścieżka 4)** — mechanizm (EMAID, certyfikat kontraktu, PKI) opisuje `iso-15118.md`;
  OICP (roaming przez Hubject) nie ma jeszcze własnego pliku.
- **EVSE/Connector z hierarchii OCPI (`ocpi.md` §2)** — to dokładnie te same obiekty, których stan
  zmienia się w Fazach 1/3/4 tego cyklu (`Available`→`Preparing`→`Occupied`→z powrotem
  `Available`) — jeśli coś w kodzie/systemie zgłasza zły stan EVSE, sprawdź, w której fazie tego
  cyklu przepływ się urwał.
