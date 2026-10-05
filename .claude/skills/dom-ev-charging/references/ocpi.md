# OCPI (Open Charge Point Interface)

> **Spis treści:** 1. Definicja i cel · 2. Model danych: hierarchia obiektów (od ogółu do szczegółu) · 3. Wersje protokołu · 4. Role uczestników · 5. Modele roamingu · 6. Moduły specyfikacji (Core) · 6a. Kierunek komunikacji i adresowanie obiektów · 7. Zgodność z AFIR (Alternative Fuels Infrastructure… · 8. Korzyści · 9. OCPI 3.0 — kierunek rozwoju (planowane, nie wydane) · 10. Zarządzanie, licencja, kontrybucja · 11. Jak to się łączy z resztą tego skilla

Źródła (import): virta.global/blog — „OCPI Protocol Explained: The Backbone of EV Charging Interoperability”;
github.com/ocpi/ocpi (oficjalne repozytorium specyfikacji); materiał o hierarchii Location/EVSE Pool/EVSE/Connector.
Stan wiedzy: źródła z lat 2024–2025, włączone do repozytorium 2026-09-27. Pozycje „(do weryfikacji)” sprawdza
`researcher` (repozytorium specyfikacji i evroaming.org) przed użyciem w decyzji.

## 1. Definicja i cel

OCPI to otwarty protokół umożliwiający komunikację między **CPO** (Charge Point Operator — operator
stacji ładowania) a **eMSP** (e-Mobility Service Provider — dostawca usługi dla kierowcy: aplikacja,
karta RFID, billing). Cel: „uproszczenie, standaryzacja i harmonizacja” dostępu do ładowania dla
kierowców EV w całej Europie — żeby ładowanie było „tak proste jak tankowanie samochodu benzynowego”,
niezależnie od tego, u którego CPO faktycznie stoi ładowarka.

**Kluczowe rozgraniczenie względem OCPP** (patrz `ocpp.md`): OCPI **nie komunikuje się z
urządzeniami/sprzętem** — to rola OCPP (Charge Point ↔ CPMS/CSMS). OCPI żyje jeden poziom wyżej:
CPO ↔ eMSP, na poziomie danych biznesowych (taryfy, sesje, CDR), nie sterowania stacją.

| Aspekt | OCPI | OCPP |
|---|---|---|
| Komunikacja | CPO ↔ eMSP | Charge Point ↔ CPMS/CSMS |
| Funkcja | Roaming — dostęp kierowcy do wielu sieci | Kontrola urządzenia, sterowanie stacją |
| Cel | Interoperacyjność międzyoperatorska | Integracja hardware-software |
| Zakres danych | Taryfy, sesje, CDR (dane biznesowe) | Polecenia techniczne, monitoring urządzenia |

**Czego OCPI NIE robi** (jawne rozgraniczenie ze źródła):
- nie komunikuje się z urządzeniami (to OCPP),
- nie przetwarza płatności — tylko dostarcza dane potrzebne do rozliczenia,
- nie zarządza fakturowaniem — to odpowiedzialność biznesowa eMSP.

## 2. Model danych: hierarchia obiektów (od ogółu do szczegółu)

Fundament, na którym stoją wszystkie moduły OCPI (`Locations`, `Sessions`, `CDRs`, `Tariffs`…) — bez
zrozumienia tej hierarchii łatwo pomylić, na jakim poziomie systemu coś się dzieje.

```
Poziom 1: SITE / LOCATION        (np. MOP przy autostradzie, galeria handlowa)
    └─ Poziom 2: EVSE POOL / CHARGING STATION   (fizyczny słupek/postument)
         └─ Poziom 3: EVSE       (punkt ładowania — zasila jedno auto naraz)
              └─ Poziom 4: CONNECTOR   (fizyczna wtyczka/kabel, np. CCS, Type 2)
```

**Poziom 1 — Location / Site.** Najwyższy poziom hierarchii: konkretny adres geograficzny/punkt na
mapie (współrzędne GPS), gdzie zainstalowano infrastrukturę. W aplikacji eMSP to pojedyncza pinezka
na mapie. Zawiera dane adresowe, godziny otwarcia, udogodnienia (restauracja, toalety), ogólne
instrukcje dojazdu (np. „poziom -1 w garażu podziemnym”).

**Poziom 2 — EVSE Pool / Charging Station.** Fizyczne urządzenie (obudowa, postument/pedestal,
wallbox) stojące w danej lokalizacji — jedna Location może mieć wiele takich urządzeń. Obiekt czysto
sprzętowy, zazwyczaj z jednym ekranem, jednym czytnikiem RFID albo wspólnym interfejsem użytkownika
dla wszystkiego, co jest w nim zamontowane.

**Uwaga strukturalna — kluczowa dla implementacji, nie tylko terminologii:** mimo że w języku
fizycznym mówimy o „stacji ładowania”, **formalny model danych OCPI nie ma osobnego obiektu
„Charging Station”** — specyfikacja agreguje dane bezpośrednio w relacji `Location → EVSE` (Location
zawiera listę EVSE, bez pośredniego poziomu w schemacie JSON). „EVSE Pool”/„Charging Station” to
pojęcie **fizyczne i biznesowe**, używane przez systemy zarządzania (np. Hubject) do grupowania
punktów pod kątem wspólnej polityki cenowej, zarządzania mocą (smart charging) albo lokalizacji
komercyjnej — nie szukaj typu obiektu `Station`/`ChargingStation` w samym API OCPI, nie istnieje.

**Poziom 3 — EVSE (Electric Vehicle Supply Equipment).** Kluczowy element **logiczny** systemu —
niezależny podsystem zasilający **dokładnie jedno auto w danym momencie**. Jeśli samochód podjedzie
i zacznie ładować, blokuje całe to EVSE dla innych. Każde EVSE ma unikalny identyfikator (**EVSE
ID**, format `{kod kraju}*{party ID}*E{numer}*{sufiks}`, np. `PL*CPO*E12345*1`), widoczny na
fakturach i w aplikacji kierowcy. **To na poziomie EVSE uruchamia się i kończy sesję ładowania**, nie
na poziomie całego słupka.

*Przykład rozróżniający EVSE od fizycznego słupka:* słupek 150 kW ładujący tylko jedno auto naraz =
**1 EVSE**. Duży słupek 300 kW, który dynamicznie dzieli moc i ładuje dwa auta jednocześnie (dwie
niezależne sesje) = **2 EVSE** wewnątrz tego samego fizycznego urządzenia. Liczba EVSE ≠ liczba
fizycznych słupków — to częsty błąd przy liczeniu „ile mamy punktów ładowania”.

**Poziom 4 — Connector.** Najniższy poziom hierarchii: fizyczny kabel z wtyczką albo gniazdo, które
wpina się do samochodu. Jedno EVSE może mieć **kilka różnych złączy naraz** (np. jedno CCS do
szybkiego DC i jedno CHAdeMO) — ale w danym momencie **aktywny może być tylko jeden connector na
danym EVSE**: wybranie i wpięcie wtyczki CCS blokuje drugą wtyczkę (CHAdeMO) dla innych użytkowników,
bo to wciąż to samo, jedno EVSE pod spodem. W strukturze danych Connector niesie parametry
techniczne: typ wtyczki (Type 2, CCS1, CCS2, NACS), rodzaj prądu (AC/DC), maksymalne napięcie, moc
(np. 350 kW) — pełny katalog typów złączy: `infrastruktura-ladowania.md`.

**Reguła praktyczna do zapamiętania:** „ile wolnych miejsc do ładowania” pytasz na poziomie **EVSE**
(bo to jest jednostka „zajęte/wolne”), nie na poziomie Location (zbyt ogólne) ani Connector (zbyt
szczegółowe — dwa connectory na jednym EVSE nie oznaczają dwóch wolnych miejsc, tylko dwa sposoby
podłączenia do tego samego jednego miejsca).

## 3. Wersje protokołu

| Wersja | Rok | Kluczowe cechy |
|---|---|---|
| 2.0 | 2015 (do weryfikacji) | pierwsza wersja; połączenia bilateralne CPO↔eMSP |
| 2.1.1 | ok. 2017 (do weryfikacji) | szerokie przyjęcie; Locations, Sessions, CDRs, Tariffs, Tokens, **Commands** (zdalny start/stop, rezerwacja, odblokowanie złącza) |
| 2.2 | 2019 | **role zamiast sztywnego podziału CPO/eMSP** (platforma może pełnić kilka ról), obsługa **hubów** (Hub Client Info), moduł **Charging Profiles**, rozbudowane CDR i taryfy |
| **2.2.1** | 2021 (do weryfikacji) | poprawki 2.2; **w praktyce najczęściej wdrażana linia 2.2.x** — przykłady w `cykl-sesji-ladowania.md` odnoszą się do niej |
| **2.3.0** | 2025 (wg importu: luty) | **najnowsza wydana wersja wg importu** (branch `2.3.0/release/core`, tag `v2.3.0`); wsparcie wymogów AFIR; moduły dodatkowe Bookings i Payments (terminal płatniczy) |
| 2.3.0 Edition 2 | planowana (do weryfikacji) | poprawki core + moduł Invoice Reconciliation |
| 3.0 | w rozwoju (do weryfikacji) | Plug & Charge/Autocharge, wiadomości bezpośrednie, dynamiczne ceny, integracja z siecią — rozwijana w repo dostępnym dla członków EVRoaming Foundation |

Wersje archiwalne w repo: `release-2.2.1-bugfixes`, `release-2.2-bugfixes`, `release-2.1.1-bugfixes`.

Od 2020 protokół zarządzany przez **EVRoaming Foundation** (evroaming.org).

## 4. Role uczestników

- **CPO (Charge Point Operator)** — operuje stacjami ładowania; udostępnia dane o dostępności,
  lokalizacji, typach złączy.
- **eMSP (e-Mobility Service Provider)** — zarządza siecią kierowców EV; autoryzuje sesje ładowania;
  obsługuje aplikację mobilną/kartę kierowcy.
- **Hub roamingu** (np. Hubject, Gireve) — pośrednik centralizujący połączenia, redukujący liczbę
  wymaganych połączeń bilateralnych między wieloma CPO i wieloma eMSP naraz.

W terminologii samej specyfikacji role po stronie API nazywane są **Sender**/**Receiver** — kto
faktycznie jest Senderem/Receiverem dla danego modułu zależy od kierunku wywołania, nie jest
sztywno przypisane do CPO/eMSP.

## 5. Modele roamingu

1. **Roaming przez Hub** — połączenie centralne (Hubject/Gireve) zamiast wielu bezpośrednich węzłów;
   dobre przy dużej liczbie partnerów po obu stronach.
2. **Roaming peer-to-peer** — bezpośrednia komunikacja CPO↔eMSP z użyciem wymienionych tokenów
   dostępu; bez opłat pośrednika, większa elastyczność cen/danych, ale O(n×m) połączeń do utrzymania.
3. **Model hybrydowy** — połączenie huba i wybranych połączeń bezpośrednich dla największych
   partnerów w sieci.

**Architektura komunikacji:** ustalenie umowy dwustronnej między stronami → wymiana tokenów dostępu
OCPI (`credentials.asciidoc`) → komunikacja przez publiczne endpointy OCPI obu stron → regularne
synchronizacje danych (nie jeden, statyczny eksport).

## 6. Moduły specyfikacji (Core)

Źródło modułów: plik `mod_*.asciidoc` w `github.com/ocpi/ocpi` (branch `2.3.0/release/core`).

| Moduł | Plik źródłowy | Co przenosi |
|---|---|---|
| **Locations** | `mod_locations.asciidoc` | dane o punktach ładowania: adres, typ złącza, dostępność, metody płatności |
| **Sessions** | `mod_sessions.asciidoc` | start/koniec sesji ładowania, monitorowanie trwającej sesji |
| **CDRs** (Charge Detail Records) | `mod_cdrs.asciidoc` | szczegóły rozliczeniowe: energia dostarczona, czas, koszt — do fakturowania między CPO i eMSP |
| **Tariffs** | `mod_tariffs.asciidoc` | ceny statyczne/dynamiczne (za kWh, za minutę, za sesję), transparentne dla kierowcy przed startem |
| **Tokens** | `mod_tokens.asciidoc` | systemy autoryzacji — RFID, identyfikator aplikacji, Plug & Charge |
| **Commands** | `mod_commands.asciidoc` | zdalny start/stop sesji, rezerwacje punktu ładowania |
| **Charging Profiles** | `mod_charging_profiles.asciidoc` | profile smart charging — limity mocy, planowanie sesji (analogicznie do `SetChargingProfile` w OCPP, ale na poziomie roamingu) |
| **Hub Client Info** | `mod_hub_client_info.asciidoc` | informacje o klientach huba — status połączeń między stronami przez hub |
| **Invoice Reconciliation** | `mod_invoice_reconciliation.asciidoc` | uzgadnianie faktur między stronami — *wg importu: 2.3.0 Edition 2 (do weryfikacji)* |
| **Credentials / Versions** | `credentials.asciidoc`, `version_information_endpoint.asciidoc` | rejestracja partnera, wymiana tokenów, negocjacja wersji — zawsze pierwszy krok integracji |

**Moduły dodatkowe (poza core):**
- **Payments** (`2.3.0/release/payments`) — moduł płatności.
- **Bookings** (`2.3.0/release/bookings`, wersja 1.1) — rezerwacje, w tym dla flot pojazdów ciężkich.

**Pliki meta protokołu:** `transport_and_format.asciidoc` (transport/format danych),
`status_codes.asciidoc` (kody statusu), `version_information_endpoint.asciidoc` (endpoint informacji
o wersji), `credentials.asciidoc` (poświadczenia i rejestracja), `types.asciidoc` (uniwersalne typy
danych), `terminology.asciidoc`, `topology.asciidoc` (wspierane topologie sieci), `introduction.asciidoc`,
`version_history.asciidoc`, `changelog.asciidoc`.

## 6a. Kierunek komunikacji i adresowanie obiektów

Każdy moduł ma interfejs **Sender** i **Receiver**. Dla danych operatora (Locations, Sessions, CDRs, Tariffs) Senderem
jest CPO, a eMSP może je pobierać (GET z paginacją) albo odbierać **push** do swojego interfejsu Receiver. Przy push
obiekty adresuje trójka `{country_code}/{party_id}/{id}` (np. `PUT {sessions_receiver}/PL/ABC/{session_id}`) —
URL-e bazowe partner podaje w odpowiedzi endpointu wersji, nie są stałe. `Tokens` działa odwrotnie (Senderem jest
eMSP), a `Commands` wysyła eMSP, a CPO odpowiada asynchronicznie wynikiem na `response_url`.

## 7. Zgodność z AFIR (Alternative Fuels Infrastructure Regulation)

OCPI 2.3 wspiera wymogi unijnej regulacji AFIR (rozporządzenie (UE) 2023/1804, stosowane od 13 kwietnia 2024;
kolejne obowiązki wchodzą etapami — harmonogram do weryfikacji):
- **National Access Point (NAP)** — udostępnianie danych do krajowych rejestrów infrastruktury.
- **Transparencja taryf** — porównywalne ceny na wszystkich stacjach.
- **Płatności ad-hoc** — obsługa karty/QR code bezpośrednio na stacji, bez konieczności konta u eMSP.
- **Roaming transgraniczny** — ładowanie poza krajem macierzystym kierowcy.

## 8. Korzyści

**Dla CPO:** wyższe wykorzystanie stacji dzięki ruchowi z innych sieci; klienci innych eMSP mogą
ładować bez dodatkowej integracji; niezależność od producenta urządzenia (dowolna ładowarka zgodna z
OCPP nadal działa w warstwie OCPI ponad nią).

**Dla eMSP:** lojalność klientów (jedno konto, ładowanie u każdego zintegrowanego CPO); szersza
oferta dostępnych stacji bez budowania własnej infrastruktury; skalowalność partnerstw bez
integrowania się z każdym CPO od zera.

**Dla kierowców EV:** dane real-time o lokalizacji/dostępności; jedno konto/aplikacja/tag RFID
działające u wielu operatorów; transparentne ceny i czas ładowania przed startem sesji.

## 9. OCPI 3.0 — kierunek rozwoju (planowane, nie wydane)

| Funkcjonalność | Opis |
|---|---|
| Plug & Charge / Autocharge | automatyczna autoryzacja przez samo podłączenie pojazdu (bez RFID/appki) |
| Wiadomości bezpośrednie | powiadomienia o zmianach cen/problemach wyświetlane na stacji |
| Dynamiczne ceny i krypto | ad-hoc taryfy, wiele walut, możliwość płatności kryptowalutą |
| Integracja z siecią energetyczną | udostępnianie pomiarów operatorom systemu dystrybucji (DSO), balansowanie obciążenia |
| Narzędzia GDPR | ułatwione zarządzanie umowami i transferami danych kierowców między stronami |

## 10. Zarządzanie, licencja, kontrybucja

- **Organizacja:** EVRoaming Foundation (evroaming.org) — zarządza specyfikacją od 2020.
- **Repo:** github.com/ocpi/ocpi — issues (`/issues`) do zgłaszania problemów, pull requesty
  (`/pulls`) do proponowania zmian, `CONTRIBUTING.md` z wytycznymi.
- **OCPI 3** rozwijane w prywatnym repozytorium dostępnym tylko dla członków Fundacji — nie jest
  jeszcze publicznie dostępne do wglądu poza organizacją.
- Struktura repo: `.github/workflows` (CI/CD), `examples/`, `images/`, `plantuml/` (diagramy),
  `releases/`, `scripts/`.

## 11. Jak to się łączy z resztą tego skilla

- **OCPI a OCPP nie są zamienne, są komplementarne w stosie** — typowa architektura CPO ma: stacje
  ładowania mówiące OCPP do CPMS/CSMS operatora (`ocpp.md`), a CPMS/CSMS tego samego operatora mówi
  OCPI do CPMS/CSMS innych operatorów/eMSP dla roamingu. Pytanie „ten problem jest o urządzeniu czy o
  roamingu między firmami” rozstrzyga, czy sprawdzać `ocpp.md` czy ten plik.
- **Charging Profiles w OCPI vs `SetChargingProfile` w OCPP** — to dwa różne poziomy tego samego
  pojęcia: OCPI przenosi profil/politykę smart charging między CPO i eMSP (albo agregatorem
  energii), OCPP faktycznie dostarcza ten profil do konkretnej stacji. Nie są konkurencyjnymi
  wzorcami, są dwoma etapami tego samego przepływu.
- **Tokens (OCPI) vs Authorize/Local Authorization List (OCPP)** — OCPI `Tokens` to sposób, jak
  eMSP informuje CPO, jakie tagi/identyfikatory jego kierowców są autoryzowane; CPO potem
  wykorzystuje tę informację lokalnie przy `Authorize`/liście lokalnej po stronie OCPP. To kolejny
  przykład tej samej relacji „OCPI ustala politykę między firmami, OCPP wykonuje ją na sprzęcie”.
- **Hierarchia obiektów (§2 wyżej) to ten sam EVSE/Connector, co w mapie pojęć `SKILL.md` i w
  `ocpp.md`/`infrastruktura-ladowania.md`** — tam opisane bardziej ogólnie/od strony sprzętu i OCPP,
  tu — dokładny model danych, w którym te same obiekty żyją w API OCPI (`Location.evses[]`,
  `EVSE.connectors[]`). Jeśli pytanie jest „jak to jest ustrukturyzowane w JSON-ie OCPI” — właściwe
  miejsce to §2, nie ogólna tabela terminologii.
