# Infrastruktura ładowania — terminologia, złącza, instalacja

> **Spis treści:** 1. EVCI (Electric Vehicle Charging Infrastructure) · 2. Punkt ładowania vs. stacja ładowania (częsta pomyłka… · 3. kW vs kWh — różnica, którą trzeba znać na pamięć · 4. Prąd przemienny (AC) vs prąd stały (DC) · 5. Typy złączy ładowania · 6. Instalacja i zarządzanie — dom · 7. Instalacja i zarządzanie — komercyjne · 8. Jak to się łączy z resztą tego skilla

Źródła (import): driveco.com — „Electric mobility: 5 key concepts to know”; Renewable Energy Institute — sekcja
o instalacji i zarządzaniu infrastrukturą ładowania. Stan wiedzy: 2024–2025, włączone 2026-09-27; programy dotacji
i liczby rynkowe — do weryfikacji przez `researcher`.

## 1. EVCI (Electric Vehicle Charging Infrastructure)

Skrót obejmujący **wszystkie** urządzenia niezbędne do naładowania samochodu elektrycznego: stacje
ładowania, akcesoria, obwody zasilania, szafki sterujące, urządzenia transmisji danych i płatności.
Funkcjonalny odpowiednik stacji benzynowych dla pojazdów spalinowych — ale jako kategoria
obejmująca całą infrastrukturę, nie jedno urządzenie.

## 2. Punkt ładowania vs. stacja ładowania (częsta pomyłka terminologiczna)

- **Punkt ładowania (charging point)** — urządzenie **stałe**, połączone z zasilaniem, faktycznie
  dostarczające energię do akumulatora pojazdu. Może mieć jedno lub wiele gniazd/złączy, plus
  wyposażenie (komunikacja, płatności).
- **Stacja ładowania (charging station)** — **ogólna instalacja** na terenie publicznym, parkingu
  handlowym czy autostradzie, zazwyczaj zawierająca **kilka punktów ładowania**. Odpowiada
  dedykowanemu obszarowi parkingowemu dla EV, nie jednemu urządzeniu.

**Reguła:** stacja **zawiera** punkty, punkt **jest** urządzeniem ładującym. Nie używaj tych dwóch
terminów wymiennie w dokumentacji/kodzie — to różne poziomy hierarchii (podobnie jak `Charging
Station` zawiera wiele `EVSE`/`Connector` w terminologii OCPP — patrz mapa pojęć w `SKILL.md`
i `ocpp.md`).

## 3. kW vs kWh — różnica, którą trzeba znać na pamięć

- **kW (kilowat)** — **moc** elektryczna dostarczana przez urządzenie (np. stację ładowania) w danym
  momencie.
- **kWh (kilowatogodzina)** — **energia** dostarczona/zmagazynowana/zużyta w danym okresie.
- **Zależność:** 1 kWh = energia wyprodukowana przez urządzenie o mocy 1 kW przez jedną godzinę.
- **Znaczenie praktyczne:** wyższa moc stacji (kW) → szybsze ładowanie akumulatora o danej
  kapacyjności (kWh). Pojemność akumulatora pojazdu podaje się w kWh, moc stacji/ładowarki w kW —
  mylenie tych dwóch jednostek to częsty błąd nawet w treściach branżowych.

## 4. Prąd przemienny (AC) vs prąd stały (DC)

- **AC (prąd przemienny)** — dostarczany przez sieć elektryczną; elektrony zmieniają kierunek
  przepływu cyklicznie.
- **DC (prąd stały)** — wymagany do faktycznego zasilania/ładowania akumulatora pojazdu; elektrony
  płyną w jednym kierunku.
- **Ładowanie AC:** stacja dostarcza AC → **ładowarka pokładowa** (onboard charger, komponent
  pojazdu — patrz `pojazdy-elektryczne.md`, sekcja 2) konwertuje AC→DC; moc ładowarki
  pokładowej typowo **3,7–22 kW** — to ona, nie stacja, jest tu ograniczeniem prędkości ładowania.
- **Ładowanie DC:** stacja DC dostarcza prąd stały **bezpośrednio** do akumulatora, z pominięciem
  ładowarki pokładowej pojazdu → znacznie krótszy czas ładowania (to są stacje szybkiego/DC fast
  charging).

**Dlaczego to ważne przy projektowaniu/ocenie systemu:** limit szybkości ładowania AC nie jest
właściwością samej stacji, tylko **iloczynem** mocy stacji i mocy ładowarki pokładowej pojazdu —
stacja 22 kW nie naładuje szybciej pojazdu, którego onboard charger obsługuje tylko 7,4 kW.

## 5. Typy złączy ładowania

### Prąd przemienny (AC)

| Złącze | Region | Moc |
|---|---|---|
| **Type 1** | Ameryka Północna, Japonia | 3–7 kW |
| **Type 2** (IEC 62196-2) | Europa — **najpowszechniejszy standard AC w Europie** | typowo 3,7–22 kW (1- lub 3-fazowo); 43 kW AC to rzadki przypadek wymagający obsługi po stronie auta |

### Prąd stały (DC)

| Złącze | Region | Uwaga |
|---|---|---|
| **CCS1** | Ameryka Północna | wariant CCS łączący Type 1 + piny DC |
| **CCS2** | Europa — **standard dominujący w UE** | wariant CCS łączący Type 2 + piny DC — to jest „CCS” w kontekście europejskim |
| **CHAdeMO** | głównie producenci azjatyccy (japońscy) | popularność systematycznie spada na rzecz CCS |
| **NACS** (North American Charging Standard, znormalizowany jako SAE J3400) | Ameryka Północna — pierwotnie złącze Tesli, obecnie coraz szerzej adoptowane przez innych producentów/CPO | mniejsze, jednoportowe złącze wspierające AC i DC; nie mylić z Type 2 (inna geometria wtyczki) |

**Uwaga terminologiczna:** „CCS” bez dopisku w tekście europejskim/w tym repo praktycznie zawsze
znaczy **CCS2** — dopisek 1/2 ma znaczenie głównie przy pracy z globalnym/amerykańskim kontekstem
albo z modelem danych OCPI (`ocpi.md`, §2 — pole `standard` na obiekcie `Connector` rozróżnia je
jawnie).

## 6. Instalacja i zarządzanie — dom

**Proces instalacji:** standardowa instalacja domowego chargera trwa **2–4 godziny**: kontrole
bezpieczeństwa elektrycznego → potwierdzenie umiejscowienia chargera → okablowanie od rozdzielnicy
do punktu ładowania. Prosta instalacja = jedna wizyta; złożone przypadki (długie trasy kabli, prace
budowlane, wykopy zewnętrzne, modernizacja instalacji elektrycznej) mogą wymagać więcej czasu/wizyt,
czasem też wzmocnienia przyłącza sieciowego.

**Wybór chargera — kluczowe kryteria:** budżet, prędkość ładowania (kW), funkcje smart (kontrola z
apki, load balancing, integracja z fotowoltaiką), zgodność ze złączem/mocą pojazdu, certyfikacja
bezpieczeństwa i profesjonalny montaż (wymagane, nie opcjonalne), długość kabla, tethered vs
untethered, możliwość aktualizacji software/funkcji w przyszłości.

**Zarządzanie na co dzień:** typowo przez apkę/software producenta chargera — planowanie ładowania w
godzinach poza szczytem, monitoring zużycia, optymalizacja kosztów. **Load balancing** automatycznie
dostosowuje prędkość ładowania, żeby nie przeciążyć instalacji elektrycznej budynku. Przy obecności
paneli fotowoltaicznych/magazynu energii — charger można skonfigurować, by priorytetyzował energię
odnawialną.

## 7. Instalacja i zarządzanie — komercyjne

**Faza oceny/planowania (przed instalacją):** lokalizacja i dostępność miejsca, ocena pojemności
przyłącza elektrycznego, projekt układu parkingu, zgodność z wymogami bezpieczeństwa/regulacyjnymi.
Wybór sprzętu: typ chargera (**Level 1**, **Level 2**, albo **DC fast charging**), moc wyjściowa,
dostępność integracji sieciowej/smart. Infrastruktura elektryczna: może wymagać modernizacji
rozdzielnic, dodatkowego okablowania, systemów zarządzania obciążeniem, ochrony przeciwprzepięciowej.

**Finansowanie (przykład UK):** **Workplace Charging Scheme** — granty per gniazdo + finansowanie
infrastruktury dla kwalifikujących się małych/średnich firm, pod warunkiem zatwierdzonego
instalatora. (Uwaga: to konkretny program brytyjski w konkretnym czasie — sprawdź aktualność i
lokalny odpowiednik przed cytowaniem w innym kontekście geograficznym/czasowym.)

**Instalacja:** montaż urządzeń → połączenia elektryczne → zabezpieczenie okablowania → pełne
testowanie systemów przed uruchomieniem (commissioning).

**Zarządzanie ciągłe:** planowanie utrzymania pod kątem: przerw w zasilaniu, awarii sprzętu, awarii
systemu płatności, problemów z łącznością — **to ostatnie (problemy z łącznością) to właśnie
domena OCPP/OCPI tego skilla**: jeśli punkt ładowania „nie odpowiada”/„nie synchronizuje danych”,
sprawdź `ocpp.md` (połączenie Charge Point↔CPMS) zamiast traktować to wyłącznie jako problem
fizyczny/elektryczny.

## 8. Jak to się łączy z resztą tego skilla

- **EVCI** (ten plik) to warstwa fizyczna/biznesowa infrastruktury; **OCPP** (`ocpp.md`) to warstwa
  komunikacji tej infrastruktury z backendem; **OCPI** (`ocpi.md`) to warstwa roamingu między
  operatorami tej infrastruktury. Trzy różne, uzupełniające się poziomy tego samego systemu.
- **Level 1/Level 2/DC fast charging** (terminologia amerykańska, z tego źródła) odpowiada z grubsza
  europejskiemu rozróżnieniu AC (Level 1/2) vs DC (DC fast) z sekcji 4–5 tego pliku — różne
  nazewnictwo regionalne dla tego samego podziału technicznego.
- **Connector** w mapie pojęć `SKILL.md` — teraz masz konkretne standardy wypełniające tę
  definicję: Type 1/Type 2 (AC), CCS/CHAdeMO (DC).
