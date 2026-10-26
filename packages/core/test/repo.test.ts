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
/** A plan with tf's kinds (S-NN / F-NN), "Odblokowuje" and requirement ids: two foundations and one slice break REL-008. */
const KINDS = `${header('plan', 'tasks: [TSK-55, TSK-56, TSK-57, TSK-58, TSK-59]\n')}# Plan zmiany CHG-12

| Cięcie | Rodzaj | Wydanie | Flaga | Wartość | Wymagania | Odblokowuje | Weryfikacja | Status |
|---|---|---|---|---|---|---|---|---|
| TSK-55 | F-01 | R1 | — | (fundament) Retry queue is ready | — | — | the queue accepts a job | done |
| TSK-56 | foundation | R1 | — | Payment log table exists | — | TSK-99 | the log keeps 30 days | planned |
| TSK-57 | S-01 | R1 | payment-retry | Customer retries a failed payment from the receipt screen | US-02 | — | npm test retry passes | in_progress |
| TSK-58 | cięcie | R1 | payment-retry | Idempotency key stops a double charge | — | — | | planned |
| TSK-59 | slice | R2 | — | Failed retries are counted per day | AC-3, FR-007 | the retry metric can be measured | | planned |
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
      - { stage: internal, min_days: 3, exit: no double charge in 3 days }
      - { stage: "100%", exit: recovered payments at least 25% }
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

// G1.4 (pdi plan G1/G2 §5.3): REL-007 and REL-008 check the plan of a change from a repository only.
const C = `${CHANGES_DIR}/CHG-12`;
const lineOf = (text: string, re: RegExp) => text.split('\n').findIndex((l) => re.test(l)) + 1;

describe('the plan of a change: flags and slices (G1.4)', () => {
  const findings = async (release: string | undefined, plan = PLAN) => {
    const root = repo({ 'CHG-12/intent.md': INTENT, 'CHG-12/plan.md': plan, ...(release !== undefined && { 'CHG-12/release.yaml': release }) });
    const { requirements, problems } = await readRepoChanges(root);
    expect(problems).toEqual([]);
    const ctx: ProjectContext = { project: { key: 'PAY', name: 'Payments' }, requirements, documents: [], frames: [], fetchedAt: '2026-10-26T00:00:00.000Z' };
    const { result } = await analyzeProject(ctx, {});
    return result.items.find((i) => i.key === 'CHG-12')!.findings;
  };
  const rel = async (id: string, release: string | undefined, plan = PLAN) => (await findings(release, plan)).filter((f) => f.ruleId === id);

  it('REPO-07: the connector keeps each flag\'s plan and each slice\'s kind, unblocks and requirements', () => {
    const [epic, ...stories] = parseChange('CHG-12', { intent: INTENT, plan: KINDS, release: RELEASE }) as [RequirementItem, ...RequirementItem[]];
    expect(epic.repo).toEqual({
      path: `${C}/intent.md`,
      plan: { path: `${C}/plan.md` },
      release: {
        path: `${C}/release.yaml`,
        flags: [
          {
            key: 'payment-retry',
            tasks: ['TSK-57', 'TSK-58'],
            owner: 'PO Payments',
            removeBy: '2026-12-31',
            rollout: [
              { stage: 'internal', minDays: 3, exit: 'no double charge in 3 days' },
              { stage: '100%', exit: 'recovered payments at least 25%' },
            ],
            line: lineOf(RELEASE, /key: payment-retry/),
          },
        ],
      },
    });
    expect(stories.map((s) => [s.key, s.repo?.kind, s.repo?.unblocks, s.repo?.requirements, s.repo?.line])).toEqual([
      ['TSK-55', 'foundation', undefined, [], lineOf(KINDS, /\| TSK-55 /)],
      ['TSK-56', 'foundation', 'TSK-99', [], lineOf(KINDS, /\| TSK-56 /)],
      ['TSK-57', 'slice', undefined, ['US-02'], lineOf(KINDS, /\| TSK-57 /)],
      ['TSK-58', 'slice', undefined, [], lineOf(KINDS, /\| TSK-58 /)],
      ['TSK-59', 'slice', 'the retry metric can be measured', ['AC-3', 'FR-007'], lineOf(KINDS, /\| TSK-59 /)],
      ['TSK-61', undefined, undefined, undefined, undefined],
    ]);
    // A plan without the new columns: every row is a slice with no unblocks and no requirement ids.
    expect(parseChange('CHG-12', { intent: INTENT, plan: PLAN }).slice(1).map((s) => [s.repo?.kind, s.repo?.requirements])).toEqual([
      ['slice', []],
      ['slice', []],
      ['slice', []],
    ]);
    // English headers and the "(foundation)" outcome of tf's plan mark a foundation too.
    const english = KINDS.replace('| Cięcie | Rodzaj | Wydanie | Flaga | Wartość | Wymagania | Odblokowuje | Weryfikacja | Status |', '| Slice | Kind | Release | Flag | Value | Requirements | Unblocks | Verification | Status |');
    expect(parseChange('CHG-12', { intent: INTENT, plan: english }).slice(1).map((s) => [s.repo?.kind, s.repo?.unblocks])).toEqual(stories.slice(0, 5).map((s) => [s.repo?.kind, s.repo?.unblocks]));
    const noKind = `${header('plan')}| Cięcie | Wartość | Odblokowuje |\n|---|---|---|\n| TSK-57 | (fundament) Retry queue is ready | TSK-58 |\n| TSK-58 | Customer retries | — |\n`;
    expect(parseChange('CHG-12', { intent: INTENT, plan: noKind }).slice(1).map((s) => [s.repo?.kind, s.repo?.unblocks])).toEqual([
      ['foundation', 'TSK-58'],
      ['slice', undefined],
    ]);
  });

  describe('REL-007: a flag without a plan', () => {
    it('REL007-01: a flag with stages, exits, an owner and a removal date gives no finding', async () => {
      expect(await rel('REL-007', RELEASE)).toEqual([]);
      expect(await rel('REL-007', undefined)).toEqual([]);
    });

    it.each([
      { id: 'REL007-02', what: 'no rollout stages', release: RELEASE.replace(/    rollout:\n(      - .*\n)+/, ''), missing: /no rollout stages/ },
      { id: 'REL007-03', what: 'a stage without exit', release: RELEASE.replace(', exit: no double charge in 3 days', ''), missing: /stage "internal" has no exit criterion/ },
      { id: 'REL007-04', what: 'no owner', release: RELEASE.replace('    owner: PO Payments\n', ''), missing: /no owner/ },
      { id: 'REL007-05', what: 'no remove_by', release: RELEASE.replace('    remove_by: 2026-12-31\n', ''), missing: /no removal date \(remove_by\)/ },
    ])('$id: $what', async ({ release, missing }) => {
      const [f, ...more] = await rel('REL-007', release);
      expect(more).toEqual([]);
      expect(f).toMatchObject({ category: 'GAP', severity: 'info', dimension: 'delivery', title: 'Flag payment-retry has no plan' });
      expect(f!.explanation).toMatch(missing);
      expect(f!.evidence[0]).toMatchObject({ path: `${C}/release.yaml`, line: lineOf(release, /key: payment-retry/) });
    });

    it('REL007-06: one finding per flag, naming everything it lacks', async () => {
      const release = `${RELEASE}  - key: saved-cards\n    tasks: [TSK-59]\n`.replace('    owner: PO Payments\n', '');
      const fs = await rel('REL-007', release);
      expect(fs.map((f) => f.title)).toEqual(['Flag payment-retry has no plan', 'Flag saved-cards has no plan']);
      expect(fs[1]!.explanation).toMatch(/no rollout stages, no owner and no removal date \(remove_by\)/);
      expect(fs[1]!.evidence[0]!.line).toBe(lineOf(release, /key: saved-cards/));
    });
  });

  describe('REL-008: the plan\'s self-check (foundations and slices)', () => {
    it('REL008-01: a clean plan gives no finding; a plan without the new columns is read as before', async () => {
      const clean = KINDS.replace(/\| TSK-55 (.*?)\| — \| — \|/, '| TSK-55 $1| — | TSK-57 |').replace('| TSK-99 |', '| TSK-57, TSK-58 |').replace(/\| TSK-58 (.*?)\| — \| — \| \|/, '| TSK-58 $1| US-03 | — | |');
      expect(await rel('REL-008', RELEASE, clean)).toEqual([]);
      expect(await rel('REL-008', RELEASE)).toEqual([]);
    });

    it('REL008-02: a foundation without unblocks, unblocks naming no task of the change, a slice without a requirement', async () => {
      const fs = await rel('REL-008', RELEASE, KINDS);
      expect(fs.map((f) => [f.title, f.severity, f.category, f.dimension, f.evidence[0]?.path, f.evidence[0]?.line])).toEqual([
        ['Foundation TSK-55 does not say what it unblocks', 'warning', 'GAP', 'delivery', `${C}/plan.md`, lineOf(KINDS, /\| TSK-55 /)],
        ['Foundation TSK-56 unblocks TSK-99, which is not in the change', 'warning', 'GAP', 'delivery', `${C}/plan.md`, lineOf(KINDS, /\| TSK-56 /)],
        ['Slice TSK-58 has no requirement', 'warning', 'GAP', 'delivery', `${C}/plan.md`, lineOf(KINDS, /\| TSK-58 /)],
      ]);
    });

    it('REL008-03: Jira mode is unaffected: the same items without what the repository gives fire neither rule', async () => {
      const ids = (await analyzeStripped()).map((f) => f.ruleId);
      expect(ids).not.toContain('REL-007');
      expect(ids).not.toContain('REL-008');
    });
  });

  /** The change with what only the repository gives dropped, as an epic and stories from Jira look. */
  const analyzeStripped = async () => {
    const root = repo({ 'CHG-12/intent.md': INTENT, 'CHG-12/plan.md': KINDS, 'CHG-12/release.yaml': RELEASE.replace(/    rollout:\n(      - .*\n)+/, '') });
    const { requirements } = await readRepoChanges(root);
    const ctx: ProjectContext = { project: { key: 'PAY', name: 'Payments' }, requirements: requirements.map(({ repo: _, ...r }) => r), documents: [], frames: [], fetchedAt: '2026-10-26T00:00:00.000Z' };
    return (await analyzeProject(ctx, {})).result.items.find((i) => i.key === 'CHG-12')!.findings;
  };
});
