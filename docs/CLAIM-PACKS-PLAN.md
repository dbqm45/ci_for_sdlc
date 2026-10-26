# Słownik claims per domena — pakiet EV

Ostatnia część kroku F2 planu „jeden flow SDLC” (pdi `docs/plan-jeden-flow-sdlc.md` §6): „Słownik claims per domena —
`analysis/claims.ts`, `analysis/vocabulary.ts`; pakiet EV zasilony z dom-ev-glossary (moc w kW, wersja OCPP, definicja
uptime, status złącza); dziś typy claims pasują do demo checkoutu”.

Cel: konflikty w wymaganiach EV są wykrywane tak, jak dziś w checkoucie — „Jira mówi 22 kW, Confluence 11 kW”,
„OCPP 1.6 vs 2.0.1”, „uptime z planowanym serwisem vs bez niego”, „status złącza Available vs Preparing” — z dowodami
i bez AI (reguła CON-001).

## Stan dziś
- `analysis/claims.ts`: jedna stała lista `SUBJECTS` (refund, payment, session, upload, card, order) i jedna lista
  `EXTRACTORS` (timeout, retry_limit, idempotent, processing_mode, session_lifetime, max_items, max_file_size).
  `analysis/vocabulary.ts` nie ma słownika claims (stany UI, cechy, słowa niejasne), więc go nie ruszamy.
- `extractClaims()` woła `analysis/context.ts` (Jira, Confluence, kod tf, Figma, decyzje) i
  `analysis/fingerprint.ts` (odcisk znaczenia dla driftu), `normalizeSubject()` — nazwę domeny z grafu.

## Model
- **Pakiet claims** (`ClaimPack`, `analysis/claims.ts`): `id`, `label`, `subjects` (nazwa → wzorzec, kolejność ma
  znaczenie), `extractors` (atrybut, wzorzec, normalizacja; opcjonalnie stały podmiot). Dzisiejsze listy to pakiet
  **`general`** (domyślny, bez zmian w treści), więc wyniki dla obecnych projektów się nie zmieniają.
- **Pakiet `ev`** (`analysis/claim-pack-ev.ts`): podmioty i atrybuty EV przed listą ogólną. W liście ogólnej
  wzorzec `payment` traci słowo `charge…`, bo w EV „charging” to ładowanie, nie płatność.
- `extractClaims(text, evidence, { …, pack })` i `normalizeSubject(x, pack)`: domyślnie `general`.
  `claimPackOf(id)` (`analysis/claim-packs.ts`) zamienia ustawienie na pakiet.
- **Wybór pakietu**: ustawienie projektu `settings.project.claimPack` (`general` | `ev`, domyślnie `general`),
  walidowane w `/api/settings` (`settingsBody`), w UI w karcie *Workspace* („Domain vocabulary”). Silnik przenosi je do
  `ProjectContext.project.claimPack` (też w trybie demo i `--repo`); graf (odciski znaczenia) i `createEnv` (claims)
  czytają je stamtąd.

## Pakiet EV (źródło: tf `packs/pack-ev` 1.1.0, commit `d4d848f`)
Terminy skopiowane do kodu z komentarzem o źródle; tf nie jest czytany w czasie działania.

| Podmiot | Synonimy i formy (EN / PL) | Źródło |
|---|---|---|
| `charging station` | charging station, charge point (OCPP 1.6), charger, wallbox, stacja ładowania, ładowarka, słupek | dom-ev-glossary: Hierarchia, mapa-nazw-protokolow |
| `charging point` (EVSE) | EVSE, charging point, punkt ładowania, port | dom-ev-glossary: Hierarchia, „punkt ładowania” = EVSE |
| `connector` | connector, złącze, gniazdo, wtyczka, plug, Type 2, CCS2, CHAdeMO, NACS | dom-ev-glossary |
| `location` | location, lokalizacja, parking | dom-ev-glossary |
| `csms` | CSMS, CPMS, Central System | dom-ev-glossary: „CSMS, CPMS, Central System” |
| `vehicle` | vehicle, car, pojazd, samochód, onboard charger, ładowarka pokładowa | dom-ev-glossary: AC / DC, pułapka 22 kW |
| `transaction` / `session` | transaction, transakcja / session, sesja (osobno — glosariusz zabrania mieszać) | dom-ev-glossary: Sesja, transakcja |
| `tariff`, `battery` | tariff, taryfa / battery, bateria, akumulator, SoC, SoH | dom-ev-glossary: skróty |

| Atrybut | Wartość po normalizacji | Uwagi |
|---|---|---|
| `power` | kW (W/1000, MW×1000; przecinek dziesiętny) | nie łapie kWh ani zakresów „3,7–22 kW” |
| `energy` | kWh (Wh/1000, MWh×1000) | kW to moc, kWh energia (glosariusz) |
| `ocpp_version` | `1.6`, `2.0`, `2.0.1`, `2.1` (`1.6J` → `1.6`), kilka: „1.6 and 2.0.1” | podmiot stały: `charging station`; zdania o migracji pomija |
| `uptime_target` | % | podmiot stały: `charging point` (jednostką uptime jest port = EVSE, dom-ev-kpi-analytics) |
| `uptime_definition` | „counts planned maintenance as downtime” / „excludes planned maintenance” | dom-ev-kpi-analytics: definicja surowa vs NEVI/SLA |
| `connector_status` | status z listy OCPP 1.6 (9) lub 2.0.1 (`Occupied`) | podmiot = złącze w sytuacji (kabel wpięty, po zakończeniu sesji, rezerwacja, awaria, pojazd wstrzymał); bez sytuacji nie ma claimu, by nie porównywać różnych chwil |

Statusów złącza i definicji uptime nie ma w dom-ev-glossary — biorę je z dom-ev-ocpp-16 („Statusy złącza”),
dom-ev-ocpp-2x (`references/device-model-i-transakcje.md` §4) i dom-ev-kpi-analytics („Uptime — trzy definicje”).
To uwaga dla tf (niżej).

CON-001 bez zmian w logice: konflikt = ten sam podmiot i atrybut, różne wartości, dwa źródła. `ocpp_version` trafia do
wymiaru `architecture` (jak `idempotent`), reszta do `documentation`.

## Kolejność
1. Czerwone testy: `packages/core/test/claim-packs.test.ts`, test ustawień w `packages/server/test/api.test.ts`.
2. `ClaimPack` w `claims.ts` (lista ogólna jako `GENERAL_PACK`), parametr `pack` w `extractClaims`/`normalizeSubject`.
3. `claim-pack-ev.ts` i `claim-packs.ts`; nowe `ClaimAttribute` i etykiety.
4. Przekazanie pakietu: `ProjectContext.project.claimPack` → `createEnv`, `buildContextGraph`/odciski znaczenia.
5. Ustawienie: typ `Settings`, `DEFAULT_SETTINGS`, `settingsBody`, silnik, strona ustawień.
6. Dokumentacja: `FAQ.md` (jak wybrać pakiet, co wykrywa), `docs/ARCHITECTURE.md` (CON-001 i pakiety).

## Testy
- `claim-packs.test.ts`: ekstrakcja każdego atrybutu EV z normalizacją jednostek (W/kW/MW, Wh/kWh/MWh, przecinek
  dziesiętny, `1.6J`), zdania polskie i synonimy podmiotów; zakresy, migracje i statusy bez sytuacji nie dają claimów;
  pakiet `general` nie daje claimów EV; konflikt dwóch źródeł (Jira i Confluence) dla każdego atrybutu EV jako CON-001
  z dowodami z obu źródeł na zestawie testowym EV (`evProject()`, po jednym prawdziwym konflikcie na atrybut), a ten sam
  zestaw z pakietem `general` — bez tych konfliktów.
- Istniejące testy zostają bez zmian (dowód, że pakiet `general` daje te same wyniki).
- `api.test.ts`: `project.claimPack` — domyślnie `general`, zapis i odczyt `ev`, nieznana wartość = 422; silnik
  przenosi pakiet do kontekstu analizy.
- Bramki lokalnie: `npm test`, `npm run typecheck`, `npm run lint:commit` (GitHub Actions na tym koncie nie działają).

## Uwagi dla tf (poza zakresem tego PR)
- dom-ev-glossary nie ma listy statusów złącza (są w dom-ev-ocpp-16 i dom-ev-ocpp-2x) ani definicji uptime (jest w
  dom-ev-kpi-analytics); warto dodać hasła z odsyłaczem.
- Brak hasła „taryfa / tariff” i wersji OCPP (1.6, 2.0.1, 2.1) w skrótach A–Z.
