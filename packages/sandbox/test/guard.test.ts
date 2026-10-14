import { describe, expect, it } from 'vitest';
import { RULES } from '@ci/core';
import { checkRuleCoverage, checkScenarioEffects, checkScenarioParity, derivedRuleIds, verifyExpectations } from '../src/guard.js';
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
});
