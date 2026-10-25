import { describe, expect, it } from 'vitest';
import { RULES } from '@ci/core';
import {
  checkEndpointCoverage,
  checkKits,
  checkRuleCoverage,
  checkScenarioEffects,
  checkScenarioParity,
  derivedRuleIds,
  endpointCalls,
  verifyExpectations,
} from '../src/guard.js';
import { KITS } from '../src/kits/registry.js';
import { EXPECTATIONS } from '../src/world/expectations.js';
import { SCENARIOS } from '../src/world/scenarios.js';

// docs/TEST-DATA-GENERATOR.md, 5.3: the sandbox world must keep covering every rule and every change scenario.
// A red test here names what to add to the world, the expectations or the scenario descriptions.
describe('coverage guard on the sandbox world', () => {
  it('GRD-01: every rule has an item it fires on and one it stays silent on', () => {
    expect(checkRuleCoverage()).toEqual([]);
  });

  it('GRD-02: the analysis of the world agrees with every fires and silent case', async () => {
    expect(await verifyExpectations()).toEqual([]);
  });

  it('GRD-03: scenarios.ts describes exactly the scenarios of DEMO_SCENARIOS', () => {
    expect(checkScenarioParity()).toEqual([]);
  });

  it('GRD-04: every scenario names its source and touches exactly the objects it declares', () => {
    expect(checkScenarioEffects()).toEqual([]);
  });

  it('GRD-12: every kit has objects in the world, an API mock, a contract test against it and a seeder', () => {
    expect(checkKits()).toEqual([]);
  });

  it('GRD-13: every endpoint of the OpenAPI contract is called by at least one API or e2e test', () => {
    expect(checkEndpointCoverage()).toEqual([]);
  });
});

describe('the guard goes red with a useful message', () => {
  it('GRD-05: finds the rules raised by the cross-item pass', () => {
    expect(derivedRuleIds()).toEqual(expect.arrayContaining(['DEP-001', 'BUG-004', 'EPIC-003']));
    expect(derivedRuleIds("findingFromDraft('NEW-001', d)")).toEqual(['NEW-001']);
  });

  it('GRD-06: a new rule without cases, and an entry for a rule that no longer exists', () => {
    const rules = [...RULES, { id: 'NEW-001', appliesTo: ['story' as const] }];
    const expectations = [...EXPECTATIONS, { rule: 'OLD-001', fires: ['PAY-123'], silent: ['PAY-124'] }];
    expect(checkRuleCoverage(rules, undefined, expectations)).toEqual([
      'NEW-001: no entry in EXPECTATIONS — add the item it fires on and one it stays silent on',
      'OLD-001: in EXPECTATIONS, but no such rule — remove it or rename it',
    ]);
  });

  it('GRD-07: a new derived rule without cases', () => {
    expect(checkRuleCoverage(undefined, [...derivedRuleIds(), 'NEW-002'])).toEqual([
      'NEW-002: no entry in DERIVED_EXPECTATIONS — add the item it fires on and one it stays silent on',
    ]);
  });

  it('GRD-08: a case the analysis contradicts, an unknown item and an item of the wrong type', async () => {
    const problems = await verifyExpectations(undefined, [
      { rule: 'ERR-001', fires: ['PAY-128'], silent: ['PAY-125'] },
      { rule: 'EPIC-001', fires: ['NOPE-1'], silent: ['PAY-123'] },
    ]);
    expect(problems).toEqual([
      'ERR-001: expected to fire on PAY-128, but it does not',
      'ERR-001: expected to stay silent on PAY-125, but it fires',
      'EPIC-001: NOPE-1 is not in the world',
      expect.stringMatching(/^EPIC-001: PAY-123 is a story, the rule applies to /),
    ]);
  });

  it('GRD-09: a scenario missing from scenarios.ts', () => {
    expect(checkScenarioParity(SCENARIOS.filter((s) => s.id !== 'timeout-change'))).toEqual([
      'timeout-change: in DEMO_SCENARIOS, but not in scenarios.ts — describe its source and the objects it touches',
    ]);
  });

  it('GRD-10: a scenario with the wrong source or the wrong objects', () => {
    const scenario = SCENARIOS.find((s) => s.id === 'timeout-change')!;
    expect(checkScenarioEffects([{ ...scenario, source: 'jira', touches: { documents: ['1001'] } }])).toEqual([
      expect.stringMatching(/^timeout-change: source is "jira", but the title says "Confluence:/),
      'timeout-change: touches documents [1001], but the change touches [1001, 2001]',
    ]);
  });

  it('GRD-11: a known gap that the world has closed, and a gap next to real cases', async () => {
    expect(await verifyExpectations(undefined, [{ rule: 'ERR-001', fires: [], silent: ['PAY-128'], gap: 'none yet' }])).toContain(
      'ERR-001: fires on PAY-125 — add it as a "fires" case and remove the gap',
    );
    const expectations = EXPECTATIONS.map((e) => (e.rule === 'ERR-001' ? { ...e, gap: 'none yet' } : e));
    expect(checkRuleCoverage(undefined, undefined, expectations)).toEqual(['ERR-001: has "fires" cases and a gap in EXPECTATIONS — remove the gap']);
  });

  it('GRD-14: a kit without objects, mock, contract test or seeder, and a scenario source without a kit', () => {
    const figma = KITS.find((k) => k.id === 'figma')!;
    const files: Record<string, string> = { 'mock.ts': '', 'contract.test.ts': "import { startX } from './other-mock.js';" };
    const kits = [{ ...figma, objects: () => [], mock: 'mock.ts', contract: 'contract.test.ts', seeder: 'nope.ts' }];
    expect(checkKits(kits, undefined, undefined, (p) => files[p])).toEqual([
      'figma: no objects in the world — add them to world/checkout.ts',
      'figma: the contract test contract.test.ts does not use the mock mock.ts',
      'figma: the seeder nope.ts is missing',
      'timeout-change: source "confluence" has no kit — add it to kits/registry.ts',
      'figma-remove-error: source "figma" has no kit — add it to kits/registry.ts',
      'story-card-limit: source "jira" has no kit — add it to kits/registry.ts',
      'backlog-intake: source "jira" has no kit — add it to kits/registry.ts',
      'api-idempotency: source "confluence" has no kit — add it to kits/registry.ts',
      'release-planning: source "jira" has no kit — add it to kits/registry.ts',
    ].filter((p) => !p.includes('"figma" has no kit')));
    expect(checkKits([{ ...figma, mock: 'gone.ts', contract: 'gone.test.ts' }], undefined, [], () => undefined)).toEqual([
      'figma: the API mock gone.ts is missing',
      'figma: the contract test gone.test.ts is missing',
      'figma: the seeder packages/sandbox/src/kits/figma.ts is missing',
    ]);
  });

  it('GRD-15: finds the API calls of a test and names an endpoint that no test calls', () => {
    const source = [
      "await json('GET', '/api/items/PAY-125/graph');",
      "app.inject({ method: 'DELETE', url: `/api/decisions/${id}` });",
      "await request.post('/api/settings/test-connections?x=1', {});",
      "new EventSource('/api/events');",
    ].join('\n');
    expect(endpointCalls(source)).toEqual([
      { method: 'GET', path: '/api/items/PAY-125/graph' },
      { method: 'DELETE', path: '/api/decisions/${id}' },
      { method: 'POST', path: '/api/settings/test-connections' },
      { method: 'GET', path: '/api/events' },
    ]);
    const contract = { paths: { '/api/items/{key}/graph': { get: {} }, '/api/decisions/{id}': { get: {}, delete: {} } } };
    expect(checkEndpointCoverage(contract, { 'a.test.ts': source })).toEqual([
      'GET /api/decisions/{id}: no API or e2e test calls it — add one to packages/server/test or e2e',
    ]);
  });
});
