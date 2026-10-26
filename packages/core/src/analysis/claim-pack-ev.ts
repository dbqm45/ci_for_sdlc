import { GENERAL_EXTRACTORS, GENERAL_SUBJECTS, type ClaimExtractor, type ClaimPack } from './claims.js';

/**
 * The EV charging claim pack (docs/CLAIM-PACKS-PLAN.md). Terms copied from tf `packs/pack-ev` 1.1.0 (commit d4d848f),
 * never read at run time:
 *  - dom-ev-glossary (SKILL.md "Hierarchia", "Mówimy / nie mówimy", "CSMS, CPMS, Central System", "Sesja, transakcja",
 *    and references/mapa-nazw-protokolow.md, references/skroty-a-z.md): subjects, synonyms and Polish forms, kW vs kWh;
 *  - dom-ev-ocpp-16 ("Statusy złącza") and dom-ev-ocpp-2x (references/device-model-i-transakcje.md §4): connector
 *    statuses;
 *  - dom-ev-kpi-analytics ("Uptime — trzy definicje"): uptime is per port (EVSE); raw uptime counts every outage,
 *    NEVI and SLA exclude planned maintenance.
 */

/** A pattern for whole words, Polish letters included (`\b` only knows ASCII). */
const word = (src: string) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${src})(?![\\p{L}\\p{N}])`, 'iu');

const EV_SUBJECTS: [string, RegExp][] = [
  // The vehicle first: its onboard charger limits AC power, which is not the station's power.
  ['vehicle', word('vehicles?|cars?|pojazd\\p{L}*|samoch\\p{L}*|on-?board chargers?|ładowark\\p{L}* pokładow\\p{L}*')],
  ['connector', word('connectors?|złącz\\p{L}*|gniazd\\p{L}*|wtyczk\\p{L}*|plugs?|type 2|ccs2?|chademo|nacs')],
  // "Punkt ładowania" (law, AFIR) is the EVSE: one vehicle at a time.
  ['charging point', word('evses?|charging points?|punkt\\p{L}* ładowania|ports?')],
  // OCPP 1.6 "Charge Point" and 2.0.1 "Charging Station" are the same device.
  ['charging station', word('charging stations?|charge points?|chargers?|wallbox\\p{L}*|stacj\\p{L}* ładowania|ładowark\\p{L}*|słup\\p{L}*')],
  ['location', word('locations?|lokalizacj\\p{L}*|parking\\p{L}*')],
  ['csms', word('csms|cpms|central system')],
  // Transaction (OCPP, the device) and session (OCPI, business) are different things.
  ['transaction', word('transactions?|transakcj\\p{L}*')],
  ['session', word('sessions?|sesj\\p{L}*')],
  ['tariff', word('tariffs?|taryf\\p{L}*')],
  ['battery', word('batter(?:y|ies)|bateri\\p{L}*|akumulator\\p{L}*|soc|soh')],
];

const num = (x: string) => Number(x.replace(',', '.'));
const round = (n: number) => Math.round(n * 1000) / 1000;

const POWER = /(\d+(?:[.,]\d+)?)\s*(MW|kW|KW|kw|W)(?![\p{L}\p{N}])/u;
const POWER_RANGE = /\d(?:[.,]\d+)?\s*(?:–|—|-|to|do)\s*\d+(?:[.,]\d+)?\s*(?:MW|kW|KW|kw|W)(?![\p{L}\p{N}])/u;
const ENERGY = /(\d+(?:[.,]\d+)?)\s*(MWh|kWh|KWh|kwh|Wh)(?![\p{L}\p{N}])/u;
const OCPP = /OCPP\s*(?:v\.?\s*|version\s*|wersj\p{L}*\s*)?\d\.\d(?:\.\d)?J?(?:\s*(?:,|\/|and|or|oraz|lub|i)\s*(?:OCPP\s*)?\d\.\d(?:\.\d)?J?)*/iu;
const MIGRATION = /migrat|migracj|upgrade|aktualizacj|przejści|(?<![\p{L}])from(?![\p{L}]).*(?<![\p{L}])to(?![\p{L}])/iu;
const UPTIME = word('uptime|availability|dostępnoś\\p{L}*');
const PLANNED_MAINTENANCE = /(?:planned|scheduled) (?:maintenance|service|downtime|works?)|maintenance windows?|planowan\p{L}* (?:serwis|konserwac|przegl|prac)\p{L}*/iu;
const EXCLUDED = /exclud|without|not (?:be )?count|does not count|except|(?<![\p{L}])bez(?![\p{L}])|wyłącz|nie wlicza|pomij/iu;
const COUNTED = /includ|counts?(?![\p{L}])|counted|(?<![\p{L}])with(?![\p{L}])|wlicza|łącznie|jako przest/iu;

/** Connector statuses of OCPP 1.6 StatusNotification and 2.0.1 `connectorStatus` (`Occupied`); case-sensitive. */
const STATUS = /(?<![\p{L}])(SuspendedEVSE|SuspendedEV|Available|Preparing|Charging|Finishing|Reserved|Unavailable|Faulted|Occupied)(?![\p{L}])/gu;
const STATUS_CONTEXT = /status|state(?![\p{L}])|stan(?![\p{L}])|goes to|changes to|switches to|moves to|przechodzi|zmienia/iu;
const TRANSITION = /(?<![\p{L}])(?:to|na|into)(?![\p{L}])|→|->/u;
/** The moment a status belongs to: two statuses of the same connector at different moments are no conflict. */
const SITUATIONS: [string, RegExp][] = [
  ['session ended', /(?:transaction|session|sesj\p{L}*|transakcj\p{L}*)[^.]{0,20}?(?:ends|ended|stops|stopped|finishes|finished|is over)|after (?:the )?(?:transaction|session)|zakończeni\p{L}* (?:sesji|transakcji)|po zakończeniu/iu],
  ['reserved', /reserv|rezerwac/iu],
  ['fault', /fault|error|awari|błęd|błąd/iu],
  ['vehicle paused', /(?:vehicle|car|pojazd)\p{L}* (?:pauses|suspends|stops drawing)|wstrzym/iu],
  ['cable plugged in', /plug(?:ged|s)? in|cable (?:is )?(?:connected|inserted)|wpię\p{L}*|podłącz\p{L}* kab/iu],
];

function connectorStatus(s: string): [string, undefined, string] | undefined {
  if (!STATUS_CONTEXT.test(s)) return undefined;
  const found = [...s.matchAll(STATUS)].filter((m) => m.index !== 0); // "Charging starts…" is no status
  if (!found.length) return undefined;
  const last = found.at(-1)!;
  if (found.length > 1) {
    const before = found.at(-2)!;
    if (!TRANSITION.test(s.slice(before.index + before[0].length, last.index))) return undefined;
  }
  const rest = s.replace(STATUS, ' ');
  const situation = SITUATIONS.find(([, re]) => re.test(rest))?.[0];
  return situation ? [last[1]!, undefined, `connector (${situation})`] : undefined;
}

const EV_EXTRACTORS: ClaimExtractor[] = [
  {
    attribute: 'power',
    match: (s) => {
      if (POWER_RANGE.test(s)) return undefined;
      const m = POWER.exec(s);
      if (!m) return undefined;
      const per = { MW: 1000, kW: 1, KW: 1, kw: 1, W: 0.001 }[m[2] as 'MW' | 'kW' | 'KW' | 'kw' | 'W'];
      return [round(num(m[1]!) * per), 'kW'];
    },
  },
  {
    attribute: 'energy',
    match: (s) => {
      const m = ENERGY.exec(s);
      if (!m) return undefined;
      const per = { MWh: 1000, kWh: 1, KWh: 1, kwh: 1, Wh: 0.001 }[m[2] as 'MWh' | 'kWh' | 'KWh' | 'kwh' | 'Wh'];
      return [round(num(m[1]!) * per), 'kWh'];
    },
  },
  {
    // The protocol between the charging station and the CSMS; 1.6J is 1.6 over JSON.
    attribute: 'ocpp_version',
    match: (s) => {
      const m = OCPP.exec(s);
      if (!m || MIGRATION.test(s)) return undefined;
      const versions = [...new Set(m[0].match(/\d\.\d(?:\.\d)?/g) ?? [])].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
      return versions.length ? [versions.join(' and '), undefined, 'charging station'] : undefined;
    },
  },
  {
    attribute: 'uptime_target',
    match: (s) => {
      const m = UPTIME.test(s) ? /(\d+(?:[.,]\d+)?)\s*%/.exec(s) : null;
      return m ? [num(m[1]!), '%', 'charging point'] : undefined;
    },
  },
  {
    attribute: 'uptime_definition',
    match: (s) => {
      if (!UPTIME.test(s) || !PLANNED_MAINTENANCE.test(s)) return undefined;
      if (EXCLUDED.test(s)) return ['excludes planned maintenance', undefined, 'charging point'];
      if (COUNTED.test(s)) return ['counts planned maintenance as downtime', undefined, 'charging point'];
      return undefined;
    },
  },
  { attribute: 'connector_status', match: connectorStatus },
];

/** EV subjects before the general ones; there "charge…" is charging, so `payment` no longer takes it. */
export const EV_CLAIM_PACK: ClaimPack = {
  id: 'ev',
  label: 'EV charging',
  subjects: [...EV_SUBJECTS, ...GENERAL_SUBJECTS.map(([name, re]): [string, RegExp] => (name === 'payment' ? [name, /\b(payment|checkout|pay)\w*/i] : [name, re]))],
  extractors: [...GENERAL_EXTRACTORS, ...EV_EXTRACTORS],
};
