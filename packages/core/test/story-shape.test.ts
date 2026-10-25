import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_POLICY, DEFAULT_STORY_SHAPE, analyzeProject, jiraIssueToRequirement, type ProjectContext, type StoryShapePolicy } from '../src/index.js';

// The rules STORY-001…003 and AC-001…004 against the pdi contract 0.4.0 story-shape set (same copy as acceptance.test.ts):
// every story fires exactly the rules listed in expected.json. A mismatch is a rule bug or a change request to pdi.
const FIXTURES = new URL('./fixtures/pdi-contract/0.4.0/story-shape/', import.meta.url);
const read = <T>(name: string): T => JSON.parse(readFileSync(new URL(name, FIXTURES), 'utf8')) as T;

interface Story {
  id: string;
  title: string;
  description: string;
  acceptance_criteria: string;
  story_points?: number;
}
interface Case {
  fire: string[];
  policy?: Partial<StoryShapePolicy>;
}

const { stories } = read<{ stories: Story[] }>('stories.json');
const expected = read<{ policy: StoryShapePolicy; rules: Record<string, string>; cases: Record<string, Case> }>('expected.json');
const SHAPE_RULES = Object.keys(expected.rules);

async function fired(s: Story, policy: Partial<StoryShapePolicy> = {}) {
  const item = jiraIssueToRequirement(
    { key: `SS-${s.id.slice(3)}`, fields: { summary: s.title, description: s.description, issuetype: { name: 'Story' }, customfield_ac: s.acceptance_criteria, customfield_sp: s.story_points } },
    'https://example.atlassian.net',
    { acceptanceCriteriaField: 'customfield_ac', storyPointsField: 'customfield_sp' },
  );
  const ctx: ProjectContext = { project: { key: 'SS', name: 'Story shape' }, requirements: [item], documents: [], frames: [], fetchedAt: '2026-10-25T00:00:00Z' };
  const run = await analyzeProject(ctx, { policy: { ...DEFAULT_POLICY, storyShape: { ...DEFAULT_STORY_SHAPE, ...policy } }, now: new Date('2026-10-25T00:00:00Z') });
  const findings = run.result.items.find((i) => i.key === item.key)!.findings;
  return { ids: [...new Set(findings.map((f) => f.ruleId).filter((id) => SHAPE_RULES.includes(id)))].sort(), findings };
}

describe('story-shape rules (pdi contract 0.4.0)', () => {
  it('SHP-00: default policy matches the contract', () => {
    expect(DEFAULT_STORY_SHAPE).toEqual(expected.policy);
  });

  for (const s of stories) {
    const c = expected.cases[s.id]!;
    it(`SHP-01 ${s.id}: fires ${c.fire.length ? c.fire.join(', ') : 'nothing'}`, async () => {
      expect((await fired(s, c.policy)).ids).toEqual([...c.fire].sort());
    });
  }

  it('SHP-02: acFormat off silences AC-001 even on free text', async () => {
    const s = stories.find((x) => x.id === 'SS-02')!;
    expect((await fired(s, { acFormat: 'off' })).ids).not.toContain('AC-001');
  });

  it('SHP-03: each finding names the AC unit or the signal it is about', async () => {
    const { findings } = await fired(stories.find((x) => x.id === 'SS-02')!);
    const ac2 = findings.filter((f) => f.ruleId === 'AC-002');
    expect(ac2.map((f) => f.title)).toEqual(expect.arrayContaining([expect.stringContaining('AC-1'), expect.stringContaining('AC-3')]));
    expect(findings.find((f) => f.ruleId === 'STORY-001')!.explanation).toMatch(/dodać.*edytować.*usunąć.*ustawić/);
  });
});
