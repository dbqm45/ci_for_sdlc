import { describe, expect, it } from 'vitest';
import { CLAIM_PACKS, EV_CLAIM_PACK, GENERAL_CLAIM_PACK, analyzeProject, claimPackOf, extractClaims, type ClaimPackId, type DocumentItem, type ProjectContext, type RequirementItem } from '../src/index.js';

// Claim vocabulary per domain (pdi plan "one SDLC flow", F2, §6; docs/CLAIM-PACKS-PLAN.md). The EV pack comes from tf's
// dom-ev-glossary (pack-ev 1.1.0) with the connector statuses of dom-ev-ocpp-16/2x and the uptime definitions of
// dom-ev-kpi-analytics. The default "general" pack is today's checkout vocabulary.

const ev = { source: 'confluence' as const, entityId: 'confluence:1', title: 'Spec' };
const claims = (text: string, pack = EV_CLAIM_PACK) => extractClaims(text, ev, { defaultSubject: 'general', pack }).map((c) => [c.subject, c.attribute, c.value, c.unit]);

describe('the EV claim pack', () => {
  it.each([
    { id: 'EV-01', text: 'The charging station delivers 22 kW.', expected: [['charging station', 'power', 22, 'kW']] },
    { id: 'EV-02', text: 'The charger delivers 22000 W.', expected: [['charging station', 'power', 22, 'kW']] },
    { id: 'EV-03', text: 'Stacja ładowania ma moc 3,7 kW.', expected: [['charging station', 'power', 3.7, 'kW']] },
    { id: 'EV-04', text: 'The site connection is limited to 0,5 MW at the location.', expected: [['location', 'power', 500, 'kW']] },
    { id: 'EV-05', text: 'AC charging in the vehicle is typically 3,7–22 kW.', expected: [] },
    { id: 'EV-06', text: 'A session stops after delivering 40 kWh.', expected: [['session', 'energy', 40, 'kWh']] },
    { id: 'EV-07', text: 'Sesja kończy się po 40000 Wh.', expected: [['session', 'energy', 40, 'kWh']] },
    { id: 'EV-08', text: 'The battery holds 0,077 MWh.', expected: [['battery', 'energy', 77, 'kWh']] },
    { id: 'EV-09', text: 'A 50 kW charger delivered 30 kWh in the session.', expected: [['charging station', 'power', 50, 'kW'], ['charging station', 'energy', 30, 'kWh']] },
  ])('$id: power and energy, normalized to kW and kWh — $text', ({ text, expected }) => {
    expect(claims(text)).toEqual(expected);
  });

  it.each([
    { id: 'EV-10', text: 'Stations connect to the CSMS over OCPP 1.6J.', expected: '1.6' },
    { id: 'EV-11', text: 'The charger supports OCPP 2.0.1.', expected: '2.0.1' },
    { id: 'EV-12', text: 'Wallbox obsługuje OCPP 1.6 oraz 2.0.1.', expected: '1.6 and 2.0.1' },
    { id: 'EV-13', text: 'We speak OCPP version 2.1 with the stations.', expected: '2.1' },
  ])('$id: the OCPP version of the charging station — $text', ({ text, expected }) => {
    expect(claims(text)).toEqual([['charging station', 'ocpp_version', expected, undefined]]);
  });

  it('EV-14: a migration names two versions, not one supported set, so it states no version', () => {
    expect(claims('Migrate the stations from OCPP 1.6 to 2.0.1 in Q3.')).toEqual([]);
    expect(claims('Migracja stacji z OCPP 1.6 na 2.0.1.')).toEqual([]);
  });

  it.each([
    { id: 'EV-15', text: 'Uptime of each charging point must be at least 97%.', expected: [['charging point', 'uptime_target', 97, '%']] },
    { id: 'EV-16', text: 'Dostępność punktu ładowania co najmniej 99,5 %.', expected: [['charging point', 'uptime_target', 99.5, '%']] },
    { id: 'EV-17', text: 'Uptime counts planned maintenance as downtime.', expected: [['charging point', 'uptime_definition', 'counts planned maintenance as downtime', undefined]] },
    { id: 'EV-18', text: 'Uptime excludes planned maintenance.', expected: [['charging point', 'uptime_definition', 'excludes planned maintenance', undefined]] },
    { id: 'EV-19', text: 'Planned maintenance is not counted in the uptime.', expected: [['charging point', 'uptime_definition', 'excludes planned maintenance', undefined]] },
    { id: 'EV-20', text: 'Do dostępności wliczamy planowany serwis jako przestój.', expected: [['charging point', 'uptime_definition', 'counts planned maintenance as downtime', undefined]] },
  ])('$id: uptime target and definition — $text', ({ text, expected }) => {
    expect(claims(text)).toEqual(expected);
  });

  it.each([
    { id: 'EV-21', text: 'When the cable is plugged in before authorization, the connector status is Preparing.', expected: [['connector (cable plugged in)', 'connector_status', 'Preparing', undefined]] },
    { id: 'EV-22', text: 'After the transaction ends with the cable still plugged in, the connector goes to Finishing.', expected: [['connector (session ended)', 'connector_status', 'Finishing', undefined]] },
    { id: 'EV-23', text: 'Po zakończeniu sesji złącze ma status Finishing.', expected: [['connector (session ended)', 'connector_status', 'Finishing', undefined]] },
    { id: 'EV-24', text: 'On a fault the connector status changes from Charging to Faulted.', expected: [['connector (fault)', 'connector_status', 'Faulted', undefined]] },
    { id: 'EV-25', text: 'A reserved connector reports the status Reserved.', expected: [['connector (reserved)', 'connector_status', 'Reserved', undefined]] },
    { id: 'EV-25b', text: 'W OCPP 2.0.1 złącze z rezerwacją ma stan Reserved, a podczas ładowania Occupied.', expected: [['charging station', 'ocpp_version', '2.0.1', undefined]] },
  ])('$id: connector status in a situation, from the OCPP status lists — $text', ({ text, expected }) => {
    expect(claims(text)).toEqual(expected);
  });

  it('EV-26: a status without a situation, or a capitalized word that is no status, states nothing', () => {
    expect(claims('The connector status is Available.')).toEqual([]);
    expect(claims('Charging starts when the driver taps the card.')).toEqual([]);
  });

  it('EV-27: synonyms and Polish forms map to one subject per level of the hierarchy', () => {
    const subject = (text: string) => claims(text)[0]?.[0];
    expect(['The charger delivers 50 kW.', 'The wallbox delivers 11 kW.', 'Charge point power is 22 kW.', 'Ładowarka ma 22 kW.', 'Słupek daje 22 kW.'].map(subject)).toEqual(Array(5).fill('charging station'));
    expect(['Each EVSE delivers 22 kW.', 'Punkt ładowania ma 22 kW.'].map(subject)).toEqual(['charging point', 'charging point']);
    expect(['The CCS2 connector delivers 150 kW.', 'Złącze Type 2 ma 22 kW.'].map(subject)).toEqual(['connector', 'connector']);
    expect(['The onboard charger of the car limits AC to 11 kW.', 'Pojazd przyjmuje 11 kW.'].map(subject)).toEqual(['vehicle', 'vehicle']);
    // "charging" is not a payment in the EV pack, but a payment still is.
    expect(claims('The payment API timeout is 30 seconds.')).toEqual([['payment', 'timeout', 30, 's']]);
  });

  it('EV-28: the general pack is the default and states nothing about EV', () => {
    expect(CLAIM_PACKS).toEqual(['general', 'ev']);
    expect(claimPackOf(undefined)).toBe(GENERAL_CLAIM_PACK);
    expect(claimPackOf('ev')).toBe(EV_CLAIM_PACK);
    const text = 'The charging station delivers 22 kW over OCPP 1.6. Uptime must be at least 97%.';
    expect(claims(text, GENERAL_CLAIM_PACK)).toEqual([]);
    expect(extractClaims(text, ev, { defaultSubject: 'general' })).toEqual([]);
    expect(extractClaims('The payment API timeout is 30 seconds.', ev, { defaultSubject: 'general' }).map((c) => c.subject)).toEqual(['payment']);
  });
});

// A charging project where the Jira story and its Confluence page disagree on every EV attribute.
function evProject(claimPack?: ClaimPackId): ProjectContext {
  const story: RequirementItem = {
    key: 'EV-12',
    type: 'story',
    title: 'Driver charges at a public charging station',
    description: [
      'The charging station delivers 22 kW.',
      'A session stops after delivering 40 kWh.',
      'Stations connect to the CSMS over OCPP 1.6J.',
      'Uptime of each charging point must be at least 97%.',
      'Uptime counts planned maintenance as downtime.',
      'When the cable is plugged in before authorization, the connector status is Preparing.',
    ].join('\n'),
    acceptanceCriteria: ['Given a free charging point, when the driver taps the card, then the session starts.'],
    businessRules: [],
    status: 'To Do',
    labels: [],
    components: [],
    links: [],
    remoteLinks: [],
    updatedAt: '2026-10-20T00:00:00Z',
  };
  const page: DocumentItem = {
    id: '501',
    title: 'Charging specification',
    space: 'EV',
    labels: [],
    updatedAt: '2026-10-21T00:00:00Z',
    body: [
      'Requirements for EV-12.',
      'Charging station max power is 11 kW.',
      'Session energy limit: 30 kWh.',
      'The charger supports OCPP 2.0.1.',
      'Target availability (uptime) is 99%.',
      'Uptime excludes planned maintenance.',
      'Connector status stays Available when the cable is plugged in until the driver is authorized.',
    ].join('\n'),
  };
  return { project: { key: 'EV', name: 'Charging', ...(claimPack && { claimPack }) }, requirements: [story], documents: [page], frames: [], fetchedAt: '2026-10-26T00:00:00Z' };
}

describe('EV conflicts across sources (CON-001)', () => {
  const conflicts = async (pack?: ClaimPackId) => {
    const { result } = await analyzeProject(evProject(pack), {});
    return result.items.find((i) => i.key === 'EV-12')!.findings.filter((f) => f.ruleId === 'CON-001');
  };

  it.each([
    { id: 'EVC-01', title: 'Conflicting charging station power: 22 kW vs 11 kW' },
    { id: 'EVC-02', title: 'Conflicting session energy: 40 kWh vs 30 kWh' },
    { id: 'EVC-03', title: 'Conflicting charging station OCPP version: 1.6 vs 2.0.1' },
    { id: 'EVC-04', title: 'Conflicting charging point uptime target: 97 % vs 99 %' },
    { id: 'EVC-05', title: 'Conflicting charging point uptime definition: counts planned maintenance as downtime vs excludes planned maintenance' },
    { id: 'EVC-06', title: 'Conflicting connector (cable plugged in) connector status: Preparing vs Available' },
  ])('$id: $title, with the story and the page as evidence', async ({ title }) => {
    const f = (await conflicts('ev')).find((x) => x.title === title);
    expect(f, (await conflicts('ev')).map((x) => x.title).join('\n')).toBeDefined();
    expect(f!.severity).toBe('critical');
    expect(f!.evidence.map((e) => e.entityId).sort()).toEqual(['confluence:501', 'jira:EV-12']);
  });

  it('EVC-07: the OCPP version is an architecture conflict, the rest documentation', async () => {
    const fs = await conflicts('ev');
    expect(fs.find((f) => f.title.includes('OCPP'))!.dimension).toBe('architecture');
    expect(fs.find((f) => f.title.includes('power'))!.dimension).toBe('documentation');
  });

  it('EVC-08: with the general pack (the default) the same project has none of these conflicts', async () => {
    expect(await conflicts()).toEqual([]);
    expect(await conflicts('general')).toEqual([]);
  });
});
