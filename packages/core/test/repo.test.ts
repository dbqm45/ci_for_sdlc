import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { CHANGES_DIR, MAX_CHANGE_FILE_BYTES, RepoFileError, analyzeProject, parseChange, readRepoChanges, type ProjectContext, type RequirementItem } from '../src/index.js';

// Changes from a repository (pdi plan "one SDLC flow", F2; docs/PDI-F2-PLAN.md): docs/project/changes/CHG-n with
// intent.md, plan.md and release.yaml as tf writes them (pdi contract 0.5.0). A change is an epic, its slices (TSK)
// are stories under it, and the release plan comes from release.yaml.

const header = (artifact: string, extra = '') => `---\nartifact: ${artifact}\nphase: plan\nstatus: accepted\nversion: 1\ncreated: 2026-10-20\nupdated: 2026-10-21\nchange: CHG-12\n${extra}---\n\n`;
const INTENT = `${header('intent', 'source: PRB-3\n')}# Retry failed payments\n\n## Problem\nCustomers cannot retry a failed payment.\n\n## Metryki sukcesu\n- Recovered payments at least 25% within 30 days.\n`;
const PLAN = `${header('plan', 'tasks: [TSK-57, TSK-58, TSK-59, TSK-60]\n')}# Plan zmiany CHG-12

| Cięcie | Wydanie | Flaga | Wartość | Pliki | Weryfikacja | Status |
|---|---|---|---|---|---|---|
| TSK-57 | R1 | payment-retry | Customer retries a failed payment from the receipt screen | api/, web/ | npm test retry passes | done |
| TSK-58 | R1 | — | Idempotency key stops a double charge | api/ | a second charge with the same key returns 409 | in_progress |
| TSK-59 | R2 | — | Failed retries are counted per day | api/ | the count matches the failed retries | planned |
| TSK-60 | R2 | — | Old retry script | ops/ | | dropped |
`;
const RELEASE = `change: CHG-12
mvp:
  release: R1
  outcome: Customers retry a failed payment without a double charge
  metric: { name: recovered_payments, target: ">= 25%", horizon_days: 30 }
  guardrails: [double_charges = 0]
releases:
  - { id: R1, name: MVP, tasks: [TSK-57, TSK-58] }
  - { id: R2, tasks: [TSK-59, TSK-61] }
flags:
  - key: payment-retry
    tasks: [TSK-57, TSK-58]
    owner: PO Payments
    remove_by: 2026-12-31
    rollout:
      - { stage: internal, min_days: 3 }
      - { stage: "100%" }
`;

const tmp = mkdtempSync(join(tmpdir(), 'ci-repo-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));
let n = 0;
/** A checkout with the given files under docs/project/changes. */
function repo(files: Record<string, string>): string {
  const root = join(tmp, `r${n++}`);
  for (const [path, text] of Object.entries(files)) {
    const full = join(root, CHANGES_DIR, path);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, text);
  }
  return root;
}

describe('a change from a repository', () => {
  it('REPO-01: the change is an epic and its slices are stories with their line, flag and verification', () => {
    const items = parseChange('CHG-12', { intent: INTENT, plan: PLAN, release: RELEASE });
    const [epic, ...stories] = items as [RequirementItem, ...RequirementItem[]];
    expect([epic.key, epic.type, epic.title, epic.status]).toEqual(['CHG-12', 'epic', 'Retry failed payments', 'accepted']);
    expect(epic.description).toContain('Customers cannot retry a failed payment.');
    expect(epic.mvp).toBe('Customers retry a failed payment without a double charge. Metric recovered_payments >= 25% within 30 days. Guardrails: double_charges = 0.');
    expect(stories.map((s) => [s.key, s.type, s.epicKey, s.parentKey, s.releaseLine, s.flagKeys, s.status])).toEqual([
      ['TSK-57', 'story', 'CHG-12', 'CHG-12', 'R1', ['payment-retry'], 'done'],
      ['TSK-58', 'story', 'CHG-12', 'CHG-12', 'R1', ['payment-retry'], 'in_progress'],
      ['TSK-59', 'story', 'CHG-12', 'CHG-12', 'R2', [], 'planned'],
      ['TSK-61', 'story', 'CHG-12', 'CHG-12', 'R2', [], 'planned'],
    ]);
    expect(stories[0]!.title).toBe('Customer retries a failed payment from the receipt screen');
    expect(stories[0]!.acceptanceCriteria).toEqual(['npm test retry passes']);
    expect(stories[3]!.title).toBe('TSK-61');
    for (const i of items) expect(i.labels).toContain('change:CHG-12');
  });

  it('REPO-02: without release.yaml the plan\'s columns give the line and flag, and the intent\'s metrics the MVP', () => {
    const [epic, ...stories] = parseChange('CHG-12', { intent: INTENT, plan: PLAN }) as [RequirementItem, ...RequirementItem[]];
    expect(epic.mvp).toBe('Recovered payments at least 25% within 30 days.');
    expect(stories.map((s) => [s.key, s.releaseLine, s.flagKeys])).toEqual([
      ['TSK-57', 'R1', ['payment-retry']],
      ['TSK-58', 'R1', []],
      ['TSK-59', 'R2', []],
    ]);
    const english = PLAN.replace('| Cięcie | Wydanie | Flaga | Wartość | Pliki | Weryfikacja | Status |', '| Slice | Release | Flag | Value | Files | Verification | Status |');
    expect(parseChange('CHG-12', { intent: INTENT, plan: english }).slice(1).map((s) => s.title)).toEqual(stories.map((s) => s.title));
    expect(parseChange('CHG-12', { intent: INTENT })).toHaveLength(1);
  });

  it('REPO-03: a bad file is an error naming the file and the reason, never its content', () => {
    const bad = (files: { intent: string; plan?: string; release?: string }, file: string, reason: RegExp) => {
      try {
        parseChange('CHG-12', files);
        expect.unreachable();
      } catch (err) {
        expect(err).toBeInstanceOf(RepoFileError);
        expect((err as RepoFileError).file).toBe(file);
        expect((err as Error).message).toMatch(reason);
        expect((err as Error).message).not.toContain('s3cr3t');
      }
    };
    bad({ intent: '# no header\n' }, 'intent.md', /header/);
    bad({ intent: INTENT.replace('change: CHG-12', 'change: CHG-13') }, 'intent.md', /CHG-13.*CHG-12/);
    bad({ intent: INTENT, release: 'change: [unclosed\n  secret: s3cr3t' }, 'release.yaml', /not valid YAML/);
    bad({ intent: INTENT, release: RELEASE.replace('id: R1, name', 'id: MVP, name') }, 'release.yaml', /releases\[0\]\.id/);
    bad({ intent: INTENT, release: RELEASE.replace('change: CHG-12', 'change: CHG-9') }, 'release.yaml', /CHG-9/);
    bad({ intent: INTENT, release: RELEASE.replace('tasks: [TSK-57, TSK-58] }', 'tasks: [tsk-57] }') }, 'release.yaml', /releases\[0\]\.tasks/);
    bad({ intent: INTENT, plan: PLAN.replace('change: CHG-12', 'change: CHG-1') }, 'plan.md', /CHG-1/);
  });
});

describe('reading docs/project/changes from a checkout', () => {
  it('REPO-04: every change folder, a broken one reported and left out, links to the files with --repo-url', async () => {
    const root = repo({
      'CHG-12/intent.md': INTENT,
      'CHG-12/plan.md': PLAN,
      'CHG-12/release.yaml': RELEASE,
      'CHG-13/intent.md': INTENT.replaceAll('CHG-12', 'CHG-13').replace('# Retry failed payments', '# Saved cards'),
      'CHG-14/intent.md': INTENT.replaceAll('CHG-12', 'CHG-14'),
      'CHG-14/release.yaml': 'releases: nope',
      'CHG-15/plan.md': PLAN.replaceAll('CHG-12', 'CHG-15'),
      'README.md': 'not a change',
    });
    const { requirements, problems } = await readRepoChanges(root, { repoUrl: 'https://github.com/acme/pay/' });
    expect(requirements.filter((r) => r.type === 'epic').map((r) => [r.key, r.title])).toEqual([['CHG-12', 'Retry failed payments'], ['CHG-13', 'Saved cards']]);
    expect(problems).toEqual([
      { path: `${CHANGES_DIR}/CHG-14/release.yaml`, message: expect.stringMatching(/releases/) },
      { path: `${CHANGES_DIR}/CHG-15/intent.md`, message: 'missing: a change needs its intent.md' },
    ]);
    const epic = requirements.find((r) => r.key === 'CHG-12')!;
    expect(epic.url).toBe(`https://github.com/acme/pay/blob/HEAD/${CHANGES_DIR}/CHG-12/intent.md`);
    expect(requirements.find((r) => r.key === 'TSK-57')!.url).toBe(`https://github.com/acme/pay/blob/HEAD/${CHANGES_DIR}/CHG-12/plan.md`);
    expect((await readRepoChanges(root)).requirements.every((r) => r.url === undefined)).toBe(true);
  });

  it('REPO-05: limits and a missing folder', async () => {
    const big = repo({ 'CHG-12/intent.md': INTENT + 'x'.repeat(MAX_CHANGE_FILE_BYTES) });
    expect((await readRepoChanges(big)).problems).toEqual([{ path: `${CHANGES_DIR}/CHG-12/intent.md`, message: expect.stringMatching(/larger than/) }]);
    const none = join(tmp, 'empty');
    mkdirSync(none);
    await expect(readRepoChanges(none)).rejects.toThrow(/no docs\/project\/changes/);
  });
});

describe('the release rules on a change from a repository', () => {
  const analyze = async (release: string) => {
    const root = repo({ 'CHG-12/intent.md': INTENT, 'CHG-12/plan.md': PLAN, 'CHG-12/release.yaml': release });
    const { requirements } = await readRepoChanges(root);
    const ctx: ProjectContext = { project: { key: 'PAY', name: 'Payments' }, requirements, documents: [], frames: [], fetchedAt: '2026-10-26T00:00:00.000Z' };
    const { result } = await analyzeProject(ctx, {});
    return result.items.find((i) => i.key === 'CHG-12')!;
  };

  it('REPO-06: the release rules read the plan: R2 without a flag, an MVP of everything, an MVP without a metric', async () => {
    const sound = await analyze(RELEASE);
    const rel = sound.findings.filter((f) => f.ruleId.startsWith('REL-'));
    expect(rel.map((f) => f.ruleId)).toEqual(['REL-006']);
    expect(rel[0]!.explanation).toMatch(/^TSK-59 \(R2\), TSK-61 \(R2\) reach users without a flag/);
    expect(sound.releasePlan).toMatchObject({ lines: [{ id: 'R1', stories: ['TSK-57', 'TSK-58'] }, { id: 'R2', stories: ['TSK-59', 'TSK-61'] }], mvpPercent: 50 });

    const everything = await analyze(RELEASE.replace('tasks: [TSK-57, TSK-58] }', 'tasks: [TSK-57, TSK-58, TSK-59] }').replace('tasks: [TSK-59, TSK-61] }', 'tasks: [TSK-61] }'));
    expect(everything.findings.map((f) => f.ruleId)).toContain('REL-003');

    const noMetric = await analyze(RELEASE.replace(/  metric: .*\n/, ''));
    expect(noMetric.findings.map((f) => f.ruleId)).toContain('REL-002');
  });
});
