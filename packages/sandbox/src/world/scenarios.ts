/**
 * Change scenarios (docs/TEST-DATA-GENERATOR.md, 5.4): what each one changes in which source. The change itself is
 * DEMO_SCENARIOS[].apply, which the demo mode and the API mocks already use; this list adds what the sandbox needs to
 * check it — the source that announces the change and the objects it must touch, nothing else.
 */
export type ScenarioSource = 'jira' | 'confluence' | 'figma';

export interface Scenario {
  id: string;
  source: ScenarioSource;
  /** Objects the scenario changes, adds or removes — by Jira key, Confluence page id or Figma frame id. */
  touches: { requirements?: string[]; documents?: string[]; frames?: string[] };
}

export const SCENARIOS: Scenario[] = [
  { id: 'timeout-change', source: 'confluence', touches: { documents: ['1001', '2001'] } },
  // The error frame goes away and the Saved cards page frame gets a new modification date.
  { id: 'figma-remove-error', source: 'figma', touches: { frames: ['1:1', '1:4'] } },
  { id: 'story-card-limit', source: 'jira', touches: { requirements: ['PAY-123'] } },
  { id: 'backlog-intake', source: 'jira', touches: { requirements: ['GFT-400', 'GFT-401', 'GFT-402', 'GFT-403', 'GFT-404', 'GFT-405', 'GFT-410', 'GFT-420', 'GFT-421'] } },
  { id: 'api-idempotency', source: 'confluence', touches: { documents: ['1002'] } },
  { id: 'release-planning', source: 'jira', touches: { requirements: ['CHK-200', 'CHK-201', 'CHK-202', 'CHK-203', 'CHK-204', 'PAY-125', 'PAY-126', 'PAY-128', 'PAY-129'] } },
];
