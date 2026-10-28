import { ISSUE_TYPES, type IssueType } from '@ci/core';

/**
 * Coverage matrix (docs/TEST-DATA-GENERATOR.md, 5.3): for every rule, an item of the world on which it must fire and
 * one of a type it applies to on which it must stay silent. A case is a Jira key in the base world, or an item that a
 * change scenario adds or changes ({ item, after }). guard.ts checks that every rule has both cases and that the
 * analysis really gives these results.
 */
export type Case = string | { item: string; after: string };

export interface RuleExpectation {
  rule: string;
  fires: Case[];
  silent: Case[];
  /**
   * Why no item of the world fires the rule yet. Allowed only with an empty `fires`; the guard fails once the rule
   * fires somewhere, so the gap is closed by a real case, not forgotten.
   */
  gap?: string;
}

/** Rules raised outside RULES, in the cross-item pass of the analysis; they declare the issue types themselves. */
export interface DerivedRuleExpectation extends RuleExpectation {
  appliesTo: IssueType[];
}

const intake = (item: string): Case => ({ item, after: 'backlog-intake' });
const planned = (item: string): Case => ({ item, after: 'release-planning' });

export const EXPECTATIONS: RuleExpectation[] = [
  { rule: 'REQ-001', fires: [intake('GFT-401')], silent: ['PAY-123'] },
  { rule: 'REQ-002', fires: [intake('GFT-401')], silent: ['PAY-123'] },
  { rule: 'REQ-003', fires: [intake('GFT-402')], silent: ['PAY-123'] },
  { rule: 'REQ-004', fires: [intake('GFT-402')], silent: ['PAY-128'] },
  { rule: 'ERR-001', fires: ['PAY-125'], silent: ['PAY-128'] },
  { rule: 'ERR-002', fires: ['ACC-301'], silent: ['PAY-123'] },
  { rule: 'ERR-003', fires: ['PAY-124'], silent: ['PAY-123'] },
  { rule: 'ERR-004', fires: ['PAY-124'], silent: ['PAY-123'] },
  { rule: 'ERR-005', fires: ['PAY-125'], silent: ['PAY-123'] },
  { rule: 'ARCH-001', fires: ['PAY-125'], silent: ['PAY-123'] },
  { rule: 'ARCH-002', fires: ['PAY-125'], silent: ['PAY-123'] },
  { rule: 'ARCH-003', fires: ['CHK-202'], silent: ['PAY-123'] },
  { rule: 'DES-001', fires: ['ACC-301'], silent: ['PAY-123'] },
  { rule: 'DES-002', fires: ['PAY-123'], silent: ['CHK-201'] },
  { rule: 'DOC-001', fires: [intake('GFT-401')], silent: ['PAY-123'] },
  { rule: 'DOC-002', fires: ['PAY-125'], silent: ['PAY-123'] },
  { rule: 'CON-001', fires: ['PAY-125'], silent: ['PAY-123'] },
  // Task coverage (taskCoverage): PAY-124 has tasks for 2 of its 3 acceptance criteria.
  { rule: 'COV-001', fires: ['PAY-124'], silent: ['PAY-123'] },
  { rule: 'BUG-001', fires: ['PAY-127'], silent: [intake('GFT-420')] },
  { rule: 'BUG-002', fires: [intake('GFT-421')], silent: ['PAY-127'] },
  { rule: 'BUG-003', fires: ['PAY-127'], silent: [intake('GFT-420')] },
  { rule: 'EPIC-001', fires: ['PAY-110'], silent: ['PAY-100'] },
  { rule: 'EPIC-002', fires: [intake('GFT-410')], silent: ['PAY-100'] },
  // Story shape (pdi contract 0.4.0): draft stories of the backlog intake; the base world writes AC as lists (AC-001).
  { rule: 'STORY-001', fires: [intake('GFT-403')], silent: ['PAY-123'] },
  { rule: 'STORY-002', fires: [intake('GFT-405')], silent: ['PAY-123'] },
  { rule: 'STORY-003', fires: [intake('GFT-404')], silent: ['PAY-123'] },
  { rule: 'AC-001', fires: ['PAY-123'], silent: [intake('GFT-403')] },
  { rule: 'AC-002', fires: [intake('GFT-405')], silent: ['PAY-123'] },
  { rule: 'AC-003', fires: [intake('GFT-404')], silent: ['PAY-123'] },
  { rule: 'AC-004', fires: [intake('GFT-405')], silent: [intake('GFT-403')] },
  // Release plan (G1.2): epics of 3+ stories have no R1 in the base world; release-planning gives Checkout Experience
  // a sound plan and Payment Reliability one that breaks REL-002…006.
  { rule: 'REL-001', fires: ['CHK-200'], silent: [planned('CHK-200')] },
  { rule: 'REL-002', fires: [planned('PAY-110')], silent: [planned('CHK-200')] },
  { rule: 'REL-003', fires: [planned('PAY-110')], silent: [planned('CHK-200')] },
  { rule: 'REL-004', fires: [planned('PAY-110')], silent: [planned('CHK-200')] },
  { rule: 'REL-005', fires: [planned('PAY-110')], silent: [planned('CHK-200')] },
  { rule: 'REL-006', fires: [planned('PAY-110')], silent: [planned('CHK-200')] },
  // G1.4: repository mode only (a change's release.yaml and plan.md); the world is Jira, where both stay silent.
  { rule: 'REL-007', fires: [], silent: [planned('CHK-200')], gap: 'repository mode only; fires on packages/core/test/fixtures/repo-changes (CHG-1)' },
  { rule: 'REL-008', fires: [], silent: [planned('CHK-200')], gap: 'repository mode only; fires on packages/core/test/fixtures/repo-changes (CHG-1)' },
  // G4: only with test results (`analyze --tests`); the world has none, so all three stay silent.
  { rule: 'TEST-001', fires: [], silent: ['PAY-123'], gap: 'test results only; fires on the demo project with packages/core/test/fixtures/junit/results.xml (PAY-124)' },
  { rule: 'TEST-002', fires: [], silent: ['PAY-123'], gap: 'test results only; fires on the demo project with packages/core/test/fixtures/junit/results.xml (PAY-124)' },
  { rule: 'TEST-003', fires: [], silent: ['PAY-123'], gap: 'test results only; fires on the demo project with packages/core/test/fixtures/junit/results.xml (PAY-126)' },
  // docs/OPENAPI-PLAN.md: only with an API contract (`analyze --openapi`); the world has none, so the rule stays silent.
  { rule: 'API-001', fires: [], silent: ['PAY-123'], gap: 'API contract only; fires on the demo project with packages/core/test/fixtures/openapi/cards.yaml (PAY-124)' },
];

export const DERIVED_EXPECTATIONS: DerivedRuleExpectation[] = [
  // Any item with an "is blocked by" or "depends on" link.
  { rule: 'DEP-001', appliesTo: [...ISSUE_TYPES], fires: ['PAY-128'], silent: ['PAY-123'] },
  { rule: 'BUG-004', appliesTo: ['bug'], fires: ['PAY-127'], silent: [intake('GFT-420')] },
  { rule: 'EPIC-003', appliesTo: ['epic', 'feature'], fires: ['ACC-300'], silent: ['PAY-100'] },
  {
    rule: 'EPIC-004',
    appliesTo: ['epic', 'feature'],
    // GFT-401 says a gift order holds at most 3 items, GFT-402 says at most 5.
    fires: [intake('GFT-400')],
    silent: ['PAY-100'],
  },
];
