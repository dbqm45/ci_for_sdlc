import { describe, expect, it } from 'vitest';
import { DEFAULT_ISSUE_TYPE_MAP, analyzeProject, demoProject, jiraIssueToRequirement, resolveIssueType, type ProjectContext } from '../src/index.js';

const issue = (key: string, type: string, parent?: { key: string; type: string }) => ({
  key,
  fields: { summary: key, issuetype: { name: type }, ...(parent && { parent: { key: parent.key, fields: { issuetype: { name: parent.type } } } }) },
});

describe('issue type mapping (P1)', () => {
  it('maps Epic, Feature and Story by default; unknown types become stories', () => {
    expect(DEFAULT_ISSUE_TYPE_MAP).toMatchObject({ epic: 'epic', feature: 'feature', story: 'story' });
    expect(resolveIssueType('Feature')).toBe('feature');
    expect(resolveIssueType('Epic')).toBe('epic');
    expect(resolveIssueType('User Story')).toBe('story');
    expect(resolveIssueType('Improvement')).toBe('story');
    expect(resolveIssueType('Sub-task', { subtask: true })).toBe('subtask');
  });

  it('does not treat Object.prototype keys as known issue types', () => {
    expect(resolveIssueType('constructor')).toBe('story');
    expect(resolveIssueType('toString')).toBe('story');
    expect(resolveIssueType('constructor', {}, { Other: 'epic' })).toBe('story');
  });

  it('uses a configured mapping, case-insensitively, and ignores invalid levels', () => {
    const map = { Initiative: 'epic', Capability: 'feature', Feature: 'story', Weird: 'nonsense' } as Record<string, string>;
    expect(resolveIssueType('initiative', {}, map)).toBe('epic');
    expect(resolveIssueType('Capability', {}, map)).toBe('feature');
    expect(resolveIssueType('Feature', {}, map)).toBe('story');
    expect(resolveIssueType('Weird', {}, map)).toBe('story');
  });

  it('links a story to its feature and a feature to its epic', () => {
    const f = jiraIssueToRequirement(issue('F-1', 'Feature', { key: 'E-1', type: 'Epic' }), 'https://x');
    expect(f).toMatchObject({ type: 'feature', epicKey: 'E-1', parentKey: undefined });
    const s = jiraIssueToRequirement(issue('S-1', 'Story', { key: 'F-1', type: 'Feature' }), 'https://x');
    expect(s).toMatchObject({ type: 'story', parentKey: 'F-1', epicKey: undefined });
    const custom = jiraIssueToRequirement(issue('S-2', 'Story', { key: 'I-1', type: 'Initiative' }), 'https://x', { issueTypeMap: { Initiative: 'epic' } });
    expect(custom.epicKey).toBe('I-1');
  });
});

/** Demo with a Feature between epic PAY-100 and its stories. */
const withFeature = (): ProjectContext => {
  const ctx = demoProject();
  const epic = ctx.requirements.find((r) => r.key === 'PAY-100')!;
  ctx.requirements.push({ ...epic, key: 'PAY-105', type: 'feature', title: 'Saved cards', epicKey: 'PAY-100', parentKey: undefined, remoteLinks: [], links: [] });
  for (const r of ctx.requirements.filter((x) => x.epicKey === 'PAY-100' && x.key !== 'PAY-105')) {
    r.epicKey = undefined;
    r.parentKey = 'PAY-105';
  }
  return ctx;
};

describe('feature level (P1)', () => {
  it('aggregates readiness from its stories and passes stories through to the epic', async () => {
    const { result } = await analyzeProject(withFeature());
    const feature = result.items.find((i) => i.key === 'PAY-105')!;
    const epic = result.items.find((i) => i.key === 'PAY-100')!;
    const stories = result.items.filter((i) => i.featureKey === 'PAY-105');
    expect(stories.length).toBeGreaterThan(0);
    expect(stories.every((s) => s.epicKey === 'PAY-100')).toBe(true);
    expect(feature.rollup?.stories).toBe(stories.length);
    expect(epic.rollup?.stories).toBe(stories.length);
    if (stories.some((s) => s.readiness !== 'ready')) expect(feature.readiness).not.toBe('ready');
    expect(result.counts.features).toBe(1);
  });

  it('without features the hierarchy stays epic → story', async () => {
    const { result } = await analyzeProject(demoProject());
    expect(result.counts.features).toBe(0);
    expect(result.items.find((i) => i.key === 'PAY-123')!.featureKey).toBeUndefined();
  });
});
