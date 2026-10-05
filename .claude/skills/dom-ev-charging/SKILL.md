---
name: dom-ev-charging
description: Użyj przy ładowaniu pojazdów elektrycznych — CPO/eMSP/CSMS, sesja i rozliczenie, OCPP, OCPI, ISO 15118, Plug & Charge.
metadata:
  katalog: "Użyj, gdy praca dotyczy pojazdów elektrycznych i ich ładowania — role CPO/eMSP/CSMS/hub, hierarchia Location/EVSE/Connector, sesja end-to-end (autoryzacja, telemetria, CDR, rozliczenie), OCPP 1.6/2.0.1/2.1, OCPI 2.2.1/2.3, ISO 15118 i Plug & Charge, złącza i moc. Nie do ogólnego modelowania archetypów (ddd-archetypes) ani projektu API i kolejek (be-*)."
---

# Ładowanie pojazdów elektrycznych — wiedza branżowa

Skill mówi, **jak działa branża** (pojęcia, role, protokoły, przepływy). Jak to zamodelować — ddd-* (sekcja
„Pojęcia domenowe”); jak zbudować — be-*/fe-*. Wiedza pochodzi z importu (źródła 2024–2025, włączone 2026-09-27);
wersje i daty oznaczone „do weryfikacji” sprawdza `researcher`, zanim trafią do decyzji lub dokumentu.

## Mapa pojęć
**Role (strony):**
| Rola | Kto to | Uwaga |
|---|---|---|
| **CPO** (Charge Point Operator) | operuje siecią punktów ładowania | właściciel danych o lokalizacjach, taryfach, sesjach, CDR |
| **eMSP** (e-Mobility Service Provider) | obsługuje kierowcę: aplikacja, karta RFID, kontrakt, faktura | ta sama firma bywa CPO i eMSP — to **role**, nie typy firm |
| **Hub roamingowy** | pośrednik CPO↔eMSP (np. Hubject, Gireve) | alternatywa dla połączeń bilateralnych |
| **CSMS / CPMS / Central System** | backend CPO sterujący ładowarkami | trzy nazwy tej samej roli: OCPP 2.0.1 / slang / OCPP 1.6 |

**Infrastruktura (od ogółu):** `Location` (adres, pinezka na mapie) → *stacja / EVSE pool* (fizyczny słupek; **nie ma
osobnego obiektu w modelu OCPI**) → **`EVSE`** (ładuje **jedno auto naraz** — jednostka „wolne/zajęte”, na niej startuje
sesja; ID np. `PL*ABC*E12345*1`) → `Connector` (wtyczka: Type 2, CCS2, CHAdeMO, NACS; na EVSE aktywne jedno naraz).
Dwa złącza na jednym EVSE to **jedno** miejsce do ładowania, nie dwa.

**Warstwy protokołów:**
| Protokół | Łączy | Do czego |
|---|---|---|
| ISO 15118 / DIN 70121 / PWM | pojazd ↔ ładowarka | parametry ładowania, Plug & Charge, V2G |
| OCPP | ładowarka ↔ CSMS | sterowanie sprzętem, statusy, transakcje, telemetria, smart charging |
| OCPI (alternatywa: OICP) | CPO ↔ eMSP / hub | roaming: lokalizacje, taryfy, tokeny, sesje, CDR, komendy |
| OpenADR | sieć ↔ system energii | demand response — poza samym ładowaniem |

„Roaming, rozliczenia między firmami” → OCPI. „Ładowarka nie odpowiada, statusy, firmware” → OCPP. „Auto, certyfikat,
SoC” → ISO 15118.

**Jednostki:** kW = moc (jak szybko), kWh = energia (ile). AC: konwersja w aucie (ładowarka pokładowa, typowo
3,7–22 kW — często ona ogranicza, nie stacja); DC: prąd stały prosto do baterii.

## Sesja end-to-end (skrót)
1. **Podłączenie** — `StatusNotification` (1.6 `Preparing` / 2.0.1 `Occupied`).
2. **Autoryzacja** — aplikacja (OCPI `START_SESSION` → OCPP Remote/RequestStart), RFID (`Authorize`, tokeny z OCPI
   Tokens lub lokalna lista), terminal płatniczy (preautoryzacja), Plug & Charge (certyfikat kontraktu, EMAID).
3. **Ładowanie** — `StartTransaction` (1.6) / `TransactionEvent Started` (2.0.1, `seqNo`), `MeterValues`, OCPI
   `Session` do eMSP, profile mocy.
4. **Zakończenie** — `StopTransaction` / `TransactionEvent Ended`, odblokowanie złącza, powrót do `Available`.
5. **Rozliczenie** — CDR (niezmienny; korekta = CDR kredytowy) przez OCPI CDRs → faktura eMSP, rozliczenie hurtowe
   CPO↔eMSP.

## Wersje (fakty wg importu)
| Standard | Stan | Uwagi |
|---|---|---|
| OCPP 1.6 (2015) | najszerzej wdrożona | JSON/WebSocket lub SOAP; bezpieczeństwo przez dodatek (Security Whitepaper) |
| OCPP 2.0.1 (2020) | dominująca linia 2.x | niezgodna z 1.6 (Device Model, `TransactionEvent`); profile bezpieczeństwa 1–3 |
| OCPP 2.1 (2025) | najnowsza | rozszerza 2.0.1: ISO 15118-20, V2G, DER — zakres i data do weryfikacji |
| OCPI 2.2.1 | najczęściej wdrażana linia 2.2.x | role, huby, Charging Profiles; rok wydania do weryfikacji |
| OCPI 2.3.0 (2025) | najnowsza wydana wg importu | AFIR, Bookings, Payments; Edition 2 i OCPI 3.0 — do weryfikacji |
| ISO 15118-2 (2014) / -20 (2022) | PnC / druga generacja z V2G | wymogi regulacyjne i terminy — do weryfikacji |

Integracje buduj wielowersyjnie (sieć ma mieszany sprzęt); zawsze zapisuj wersję **i edycję** specyfikacji.

## Pojęcia domenowe (archetypy — ddd-archetypes)
| Obszar EV | Archetyp | Na co uważać |
|---|---|---|
| CPO, eMSP, hub, kierowca, flota | **Party** (role i relacje stron) | jedna strona w wielu rolach; identyfikator OCPI strony to `country_code` + `party_id`; EMAID, RFID i konto to różne identyfikatory |
| EVSE jako zasób, rezerwacje (`ReserveNow`, OCPI `RESERVE_NOW`, Bookings) | **Availability** | zasobem jest EVSE, nie connector ani stacja; blokada w czasie; wyłączenie serwisowe to też blokada |
| Taryfy OCPI (energia, czas, postój, opłata stała, ograniczenia czasowe i mocowe) | **Pricing** + **Quantity/Money** | kWh, kW, minuty i waluta jako wartości z jednostką; cena netto/brutto; taryfa to polityka cenowa, nie liczba w kodzie |
| Sesja → CDR → faktura, rozliczenie CPO↔eMSP | **Accounting** | CDR jako niezmienny zapis; korekty nowymi zapisami; rozliczenie hurtowe, nie per sesja |

Szczegóły modelowania (agregaty, niezmienniki, zdarzenia) — ddd-tactical-design; integracja przez zdarzenia i outbox —
be-messaging-outbox.

## Czytaj references, gdy…
| Pytanie | Plik |
|---|---|
| komunikat OCPP, format ramek, kody błędów, profile bezpieczeństwa, smart charging, offline, testowanie | `references/ocpp.md` |
| model danych OCPI (Location/EVSE/Connector), moduły, role Sender/Receiver, hub vs P2P, AFIR, wersje | `references/ocpi.md` |
| kolejność wiadomości w sesji, 4 ścieżki autoryzacji, moment CDR i rozliczenia | `references/cykl-sesji-ladowania.md` |
| Plug & Charge, EMAID, PKI, DIN 70121 vs ISO 15118-2/-20, V2G | `references/iso-15118.md` |
| złącza, AC/DC, kW/kWh, punkt vs stacja, instalacja domowa i komercyjna | `references/infrastruktura-ladowania.md` |
| typy pojazdów (BEV/PHEV/HEV/RE-EV/FCEV), komponenty, efektywność, serwis | `references/pojazdy-elektryczne.md` |

## Pułapki
- Liczenie „punktów ładowania” po słupkach lub złączach zamiast po EVSE.
- Mieszanie słowników statusów OCPP 1.6 i 2.0.1; zakładanie, że 2.x jest zgodne z 1.6.
- Traktowanie OCPI jak systemu płatności — przenosi dane do rozliczeń, nie realizuje płatności ani faktur.
- Wymaganie SoC w modelu sesji (bywa niedostępny bez ISO 15118).

## Checklista
- [ ] Rola strony (CPO/eMSP/hub) i kierunek komunikacji ustalone jawnie
- [ ] Jednostka dostępności = EVSE; identyfikatory EVSE/Connector zgodne z formatem
- [ ] Wersja (i edycja) OCPP/OCPI zapisana; obsługa wielu wersji rozważona
- [ ] Taryfy, energia i kwoty jako wartości z jednostką; CDR niezmienny
- [ ] Niepewne wersje/daty przekazane do weryfikacji (`researcher`)

Źródła (import): OCA/openchargealliance.org, github.com/ocpi/ocpi, evroaming.org, ocpplab.com, fransiscuss.com,
virta.global, driveco.com, Renewable Energy Institute — treść opracowana własnymi słowami.
