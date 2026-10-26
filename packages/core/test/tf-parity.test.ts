import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_POLICY, DEFAULT_STORY_SHAPE, DEMO_SCENARIOS, analyzeProject, demoProject, jiraIssueToRequirement, type ProjectContext, type RequirementItem, type StoryShapePolicy } from '../src/index.js';

// Plan G1/G2 §4.8: the story-shape rules give the same result in tf (requirements_lint.py, Python) and here. Both pass
// the pdi contract set on their own; this test runs both on the same corpus — that set plus the demo stories — and
// fails on any difference not listed in KNOWN. It needs a checkout of dbqm45/tf: TF_DIR=../tf npm run test:parity -w
// @ci/core (the nightly regression runs it on a pinned tf commit). Without TF_DIR it is skipped.
const TF_DIR = process.env.TF_DIR;
const LINT = TF_DIR && join(TF_DIR, 'packs/pack-it/skills/proc-requirements-shaping/scripts/requirements_lint.py');
const RULES = ['STORY-001', 'STORY-002', 'STORY-003', 'AC-001', 'AC-002', 'AC-003', 'AC-004'];

interface Story {
  id: string;
  title: string;
  description: string;
  ac: string;
  story_points?: number;
  policy?: Partial<StoryShapePolicy>;
}

/**
 * Differences both sides decided on. Each explains a rule that fires on one side only; any other difference fails.
 * `on` receives the story and says whether the explanation applies to it.
 */
export const KNOWN: { rule: string; side: 'ci' | 'tf'; why: string; on: (s: Story, policy: StoryShapePolicy) => boolean }[] = [
  {
    rule: 'STORY-002',
    side: 'ci',
    why: 'tf does not judge size by story points (decision at G2.4); ci_for_sdlc does (maxStoryPoints)',
    on: (s, p) => s.story_points !== undefined && s.story_points >= p.maxStoryPoints,
  },
];

const FIX = new URL('./fixtures/pdi-contract/0.4.0/story-shape/', import.meta.url);
const readFix = <T>(name: string): T => JSON.parse(readFileSync(new URL(name, FIX), 'utf8')) as T;

/** The corpus: the pdi contract set as it comes from Jira, then every demo story (base world and each scenario). */
function corpus(): { stories: Story[]; items: Map<string, RequirementItem> } {
  const items = new Map<string, RequirementItem>();
  const stories: Story[] = [];
  const contract = readFix<{ stories: { id: string; title: string; description: string; acceptance_criteria: string; story_points?: number }[] }>('stories.json');
  const cases = readFix<{ cases: Record<string, { policy?: Partial<StoryShapePolicy> }> }>('expected.json').cases;
  for (const s of contract.stories) {
    const key = `SS-${s.id.slice(3)}`;
    stories.push({ id: key, title: s.title, description: s.description, ac: s.acceptance_criteria, story_points: s.story_points, policy: cases[s.id]?.policy });
    items.set(key, jiraIssueToRequirement({ key, fields: { summary: s.title, description: s.description, issuetype: { name: 'Story' }, customfield_ac: s.acceptance_criteria, customfield_sp: s.story_points } }, 'https://example.atlassian.net', { acceptanceCriteriaField: 'customfield_ac', storyPointsField: 'customfield_sp' }));
  }
  for (const world of [{ id: 'demo', apply: () => {} }, ...DEMO_SCENARIOS]) {
    const ctx = demoProject();
    world.apply(ctx);
    for (const r of ctx.requirements) {
      if (r.type !== 'story' || items.has(r.key)) continue;
      items.set(r.key, r);
      stories.push({ id: r.key, title: r.title, description: r.description, ac: r.acceptanceCriteria.join('\n'), story_points: r.storyPoints });
    }
  }
  return { stories, items };
}

async function ours(s: Story, item: RequirementItem): Promise<string[]> {
  const ctx: ProjectContext = { project: { key: 'P', name: 'Parity' }, requirements: [item], documents: [], frames: [], fetchedAt: '2026-10-26T00:00:00Z' };
  const { result } = await analyzeProject(ctx, { policy: { ...DEFAULT_POLICY, storyShape: { ...DEFAULT_STORY_SHAPE, ...s.policy } }, now: new Date('2026-10-26T00:00:00Z') });
  return [...new Set(result.items[0]!.findings.map((f) => f.ruleId).filter((id) => RULES.includes(id)))].sort();
}

function theirs(stories: Story[]): Record<string, string[]> {
  const script = `
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location("requirements_lint", sys.argv[1])
lint = importlib.util.module_from_spec(spec); spec.loader.exec_module(lint)
out = {}
for s in json.load(sys.stdin):
    res = lint.check_story(s["title"], s["description"], s["ac"], s.get("story_points"), {**lint.DEFAULT_POLICY, **s["policy"]})
    out[s["id"]] = sorted({f["rule"] for f in res["findings"]})
json.dump(out, sys.stdout)`;
  const input = JSON.stringify(stories.map((s) => ({ ...s, policy: { ...DEFAULT_STORY_SHAPE, ...s.policy } })));
  return JSON.parse(execFileSync('python3', ['-I', '-c', script, LINT!], { input, encoding: 'utf8' })) as Record<string, string[]>;
}

describe.skipIf(!TF_DIR)('story-shape parity with tf (plan G1/G2 §4.8)', () => {
  it('PAR-01: tf and ci_for_sdlc fire the same STORY/AC rules on every story, apart from the known differences', async () => {
    expect(existsSync(LINT!), `${LINT} not found: is TF_DIR a checkout of dbqm45/tf?`).toBe(true);
    const { stories, items } = corpus();
    const tf = theirs(stories);
    const unexplained: string[] = [];
    const used = new Set<(typeof KNOWN)[number]>();
    for (const s of stories) {
      const ci = await ours(s, items.get(s.id)!);
      const tfRules = (tf[s.id] ?? []).filter((r) => RULES.includes(r));
      const policy = { ...DEFAULT_STORY_SHAPE, ...s.policy };
      for (const [rule, side] of [...ci.filter((r) => !tfRules.includes(r)).map((r) => [r, 'ci'] as const), ...tfRules.filter((r) => !ci.includes(r)).map((r) => [r, 'tf'] as const)]) {
        const known = KNOWN.find((k) => k.rule === rule && k.side === side && k.on(s, policy));
        if (known) {
          used.add(known);
          continue;
        }
        unexplained.push(`${s.id} "${s.title}": ${rule} only in ${side === 'ci' ? 'ci_for_sdlc' : 'tf'}`);
      }
    }
    expect(unexplained, `Differences between tf and ci_for_sdlc (${stories.length} stories):\n${unexplained.join('\n')}`).toEqual([]);
    // A known difference that no story shows any more has been closed: remove it from KNOWN.
    expect(KNOWN.filter((k) => !used.has(k)).map((k) => `${k.rule} (${k.side}): ${k.why}`)).toEqual([]);
  }, 60_000);
});
