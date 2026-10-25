import { describe, expect, it } from 'vitest';
import { DEFAULT_POLICY, DEFAULT_RELEASE, DEMO_SCENARIOS, analyzeProject, demoProject, type ProjectContext, type ReleasePolicy, type RequirementItem } from '../src/index.js';

// REL-001…006 (plan G1/G2 §5.3, step G1.2): the release plan of an epic read from its stories' release lines
// (`release:R1` labels), its MVP section and the stories' flags. Expected results come from the plan's table.

const MVP = 'Customers can retry a failed payment without being charged twice. Metric: at least 25% of failed payments recovered within 30 days.';

function issue(p: Partial<RequirementItem> & Pick<RequirementItem, 'key' | 'type' | 'title'>): RequirementItem {
  return { description: '', acceptanceCriteria: [], businessRules: [], status: 'To Do', labels: [], components: [], links: [], remoteLinks: [], updatedAt: '2026-10-01T00:00:00Z', ...p };
}
const epic = (p: Partial<RequirementItem> = {}) => issue({ key: 'REL-1', type: 'epic', title: 'Payment retry', description: 'Goal: fewer lost payments.', ...p });
/** A user-facing story of the epic; `line` sets its release line, `flag` its flag. */
const story = (n: number, line?: string, p: Partial<RequirementItem> & { flag?: string } = {}) => {
  const { flag, ...rest } = p;
  return issue({ key: `REL-${n}`, type: 'story', title: `Customer action ${n}`, epicKey: 'REL-1', ...(line && { releaseLine: line }), flagKeys: flag ? [flag] : [], ...rest });
};

async function run(requirements: RequirementItem[], release: Partial<ReleasePolicy> = {}) {
  const ctx: ProjectContext = { project: { key: 'REL', name: 'Release' }, requirements, documents: [], frames: [], fetchedAt: '2026-10-25T00:00:00Z' };
  const { result } = await analyzeProject(ctx, { policy: { ...DEFAULT_POLICY, release: { ...DEFAULT_RELEASE, ...release } }, now: new Date('2026-10-25T00:00:00Z') });
  const a = result.items.find((i) => i.key === 'REL-1')!;
  const rel = a.findings.filter((f) => f.ruleId.startsWith('REL-'));
  return { a, ids: [...new Set(rel.map((f) => f.ruleId))].sort(), rel, items: result.items };
}

/** A plan that no rule objects to: 2 of 4 stories in R1 with flags, MVP with outcome, threshold and horizon. */
const good = () => [epic({ mvp: MVP }), story(2, 'R1', { flag: 'payment-retry' }), story(3, 'R1', { flag: 'payment-retry' }), story(4, 'R2', { flag: 'retry-limit' }), story(5, 'R2', { flag: 'retry-limit' })];

describe('release plan rules (G1.2)', () => {
  it('REL-00: defaults follow the plan (MVP at most 60% of the epic, flags on user-facing stories)', () => {
    expect(DEFAULT_RELEASE).toEqual({ maxMvpPercent: 60, requireFlag: 'user_facing' });
  });

  it('REL-00: a good plan fires nothing and the epic has a delivery dimension', async () => {
    const { ids, a, items } = await run(good());
    expect(ids).toEqual([]);
    expect(a.dimensions.map((d) => d.dimension)).toContain('delivery');
    expect(items.find((i) => i.key === 'REL-2')!.dimensions.map((d) => d.dimension)).not.toContain('delivery');
  });

  it('REL-00: the epic carries its release plan: lines in order, stories without a line, MVP share', async () => {
    const { a } = await run([epic({ mvp: MVP }), story(2, 'R10'), story(3, 'R1'), story(4, 'R2'), story(5)]);
    expect(a.releasePlan).toEqual({ lines: [{ id: 'R1', stories: ['REL-3'] }, { id: 'R2', stories: ['REL-4'] }, { id: 'R10', stories: ['REL-2'] }], unassigned: ['REL-5'], stories: 4, mvpPercent: 25 });
  });

  describe('REL-001: MVP not designated', () => {
    it('fires on an epic with 3 stories and none in R1, with the question from the plan', async () => {
      const { ids, rel } = await run([epic(), story(2), story(3, 'R2'), story(4)]);
      expect(ids).toContain('REL-001');
      expect(rel.find((f) => f.ruleId === 'REL-001')!.question!.text).toBe('Which stories make up the MVP (release R1)?');
    });
    it('is silent below 3 stories', async () => {
      expect((await run([epic(), story(2), story(3)])).ids).toEqual([]);
    });
  });

  describe('REL-002: MVP without outcome or metric', () => {
    it('fires when R1 exists but the epic has no MVP section', async () => {
      const { rel } = await run([epic(), story(2, 'R1'), story(3, 'R2'), story(4, 'R2')]);
      expect(rel.find((f) => f.ruleId === 'REL-002')!.explanation).toMatch(/no "MVP" section/);
    });
    it.each([
      ['a threshold', 'Customers can retry a failed payment. Metric: recovered payments within 30 days.', /threshold/],
      ['a horizon', 'Customers can retry a failed payment. Metric: at least 25% of failed payments recovered.', /horizon/],
    ])('fires when the metric has no %s', async (_, mvp, why) => {
      const { rel } = await run([epic({ mvp }), story(2, 'R1'), story(3, 'R2'), story(4, 'R2')]);
      expect(rel.find((f) => f.ruleId === 'REL-002')!.explanation).toMatch(why);
    });
    it('reads Polish metrics too', async () => {
      const mvp = 'Klient ponawia nieudaną płatność bez podwójnego obciążenia. Metryka: co najmniej 25% odzyskanych płatności w ciągu 30 dni.';
      expect((await run([epic({ mvp }), story(2, 'R1'), story(3, 'R2'), story(4, 'R2')])).ids).not.toContain('REL-002');
    });
    it('is silent while no MVP is designated at all (REL-001 asks for it)', async () => {
      expect((await run([epic(), story(2), story(3)])).ids).not.toContain('REL-002');
    });
  });

  describe('REL-003: MVP is everything', () => {
    it('fires when R1 holds more than 60% of the stories, naming the share', async () => {
      const { rel } = await run([epic({ mvp: MVP }), story(2, 'R1'), story(3, 'R1'), story(4, 'R1'), story(5, 'R2')]);
      expect(rel.find((f) => f.ruleId === 'REL-003')!.title).toBe('MVP holds 3 of 4 stories (75%)');
    });
    it('follows the policy threshold', async () => {
      expect((await run([epic({ mvp: MVP }), story(2, 'R1'), story(3, 'R1'), story(4, 'R1'), story(5, 'R2')], { maxMvpPercent: 80 })).ids).not.toContain('REL-003');
    });
  });

  it('REL-004: fires when R1 holds a technical-layer story, and not for one in a later line', async () => {
    const layer = (line: string) => story(6, line, { title: 'BE: store retry attempts', flag: 'payment-retry' });
    const fire = await run([...good(), layer('R1')]);
    expect(fire.rel.find((f) => f.ruleId === 'REL-004')!.explanation).toContain('REL-6');
    expect((await run([...good(), layer('R2')])).ids).not.toContain('REL-004');
  });

  describe('REL-005: dependency against the release order', () => {
    const blockedBy = (key: string) => ({ links: [{ type: 'is blocked by', key }] });
    it.each([
      ['a story in a later line', 'REL-4'],
      ['a story without a line', 'REL-6'],
    ])('a story in R1 blocked by %s is critical and the epic is NOT READY', async (_, blocker) => {
      const plan = good();
      plan[1] = story(2, 'R1', { flag: 'payment-retry', ...blockedBy(blocker) });
      const { rel, a } = await run([...plan, story(6)]);
      const f = rel.find((x) => x.ruleId === 'REL-005')!;
      expect([f.severity, f.category, f.dimension]).toEqual(['critical', 'CONFLICT', 'delivery']);
      expect(f.title).toBe(`REL-2 (R1) is blocked by ${blocker} (${blocker === 'REL-4' ? 'R2' : 'no release line'})`);
      expect(a.readiness).toBe('not_ready');
    });
    it.each([
      ['a story of the same line', 'REL-3', 'To Do'],
      ['a done story', 'REL-4', 'Done'],
      ['an issue that is not loaded', 'OTHER-9', 'To Do'],
    ])('is silent when the blocker is %s', async (_, blocker, status) => {
      const plan = good();
      plan[1] = story(2, 'R1', { flag: 'payment-retry', ...blockedBy(blocker) });
      if (status === 'Done') plan[3] = story(4, 'R2', { flag: 'retry-limit', status: 'Done' });
      expect((await run(plan)).ids).not.toContain('REL-005');
    });
  });

  describe('REL-006: user-facing story without a flag', () => {
    const noFlag = (p: Partial<RequirementItem> = {}) => [...good(), story(6, 'R2', p)];
    it('fires for a user-facing story in a release line', async () => {
      expect((await run(noFlag())).rel.find((f) => f.ruleId === 'REL-006')!.explanation).toContain('REL-6');
    });
    it.each<[string, Partial<RequirementItem>, ReleasePolicy['requireFlag']]>([
      ['a backend story', { labels: ['backend'] }, 'user_facing'],
      ['a technical-layer story', { title: 'API: expose retry state' }, 'user_facing'],
      ['any story when the policy is off', {}, 'off'],
    ])('is silent for %s', async (_, p, requireFlag) => {
      expect((await run(noFlag(p), { requireFlag })).ids).not.toContain('REL-006');
    });
    it('with requireFlag "all" also wants a flag on a backend story', async () => {
      expect((await run(noFlag({ labels: ['backend'] }), { requireFlag: 'all' })).ids).toContain('REL-006');
    });
    it('does not check stories without a release line', async () => {
      expect((await run([...good(), story(6)])).ids).toEqual([]);
    });
  });

  it('REL-00: disabling a rule in the policy silences it', async () => {
    const ctx: ProjectContext = { project: { key: 'REL', name: 'Release' }, requirements: [epic(), story(2), story(3), story(4)], documents: [], frames: [], fetchedAt: '2026-10-25T00:00:00Z' };
    const { result } = await analyzeProject(ctx, { policy: { ...DEFAULT_POLICY, disabledRules: ['REL-001'] }, now: new Date('2026-10-25T00:00:00Z') });
    expect(result.items.find((i) => i.key === 'REL-1')!.findings.map((f) => f.ruleId)).not.toContain('REL-001');
  });

  it('REL-00: demo scenario release-planning: Checkout Experience has a sound plan, Payment Reliability breaks REL-002…006', async () => {
    const ctx = demoProject();
    DEMO_SCENARIOS.find((x) => x.id === 'release-planning')!.apply(ctx);
    const { result } = await analyzeProject(ctx, { now: new Date('2026-10-25T00:00:00Z') });
    const rel = (key: string) => [...new Set(result.items.find((i) => i.key === key)!.findings.filter((f) => f.ruleId.startsWith('REL-')).map((f) => f.ruleId))].sort();
    expect(rel('CHK-200')).toEqual([]);
    expect(rel('PAY-110')).toEqual(['REL-002', 'REL-003', 'REL-004', 'REL-005', 'REL-006']);
    expect(result.items.find((i) => i.key === 'PAY-110')!.readiness).toBe('not_ready');
  });

  it('REL-00: in the plain demo epics with 3 or more stories and no R1 get REL-001 only', async () => {
    const { result } = await analyzeProject(demoProject(), { now: new Date('2026-10-25T00:00:00Z') });
    const withRel = result.items.filter((i) => i.findings.some((f) => f.ruleId.startsWith('REL-'))).map((i) => [i.key, [...new Set(i.findings.filter((f) => f.ruleId.startsWith('REL-')).map((f) => f.ruleId))]]);
    expect(withRel).toEqual([['PAY-110', ['REL-001']], ['CHK-200', ['REL-001']]]);
  });
});
