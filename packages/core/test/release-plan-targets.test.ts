import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ReleasePlanError, changeOfReleasePlan, parseTargets, parseReleasePlanTargets, readRepoTargets } from '../src/index.js';

const OK_YAML = `change: CHG-12
mvp: { release: R1 }
releases:
  - { id: R1, tasks: [TSK-57] }
targets:
  coverage: { kind: changed_lines, min_percent: 90, tool: pytest-cov }
  mutation: { kind: changed_lines, tool: mutmut, min_score: 70 }
  performance:
    - { name: p95, metric: response_time_p95_ms, limit: "<= 400" }
  evaluations: []
`;

describe('parseTargets', () => {
  it('reads coverage, mutation, performance and evaluations', () => {
    const t = parseTargets({
      coverage: { kind: 'changed_lines', min_percent: 90 },
      mutation: { min_score: 70 },
      performance: [{ name: 'p', metric: 'ms', limit: '< 400' }],
      evaluations: [{ name: 'e', dataset: 'x.jsonl', metric: 'acc', min: 0.9 }],
    });
    expect(t.coverage?.min_percent).toBe(90);
    expect(t.mutation?.min_score).toBe(70);
    expect(t.performance?.[0]?.name).toBe('p');
    expect(t.evaluations?.[0]?.min).toBe(0.9);
  });

  it('rejects unknown top-level fields', () => {
    expect(() => parseTargets({ foo: 1 })).toThrow(ReleasePlanError);
  });

  it('rejects an out-of-range coverage threshold', () => {
    expect(() => parseTargets({ coverage: { min_percent: 120 } })).toThrow(ReleasePlanError);
    expect(() => parseTargets({ coverage: { min_percent: -1 } })).toThrow(ReleasePlanError);
  });

  it('rejects an exclusion without a reason', () => {
    expect(() => parseTargets({ coverage: { min_percent: 90, exclusions: [{ pattern: 'x' }] } })).toThrow(ReleasePlanError);
  });

  it('rejects an evaluation without a dataset', () => {
    expect(() => parseTargets({ evaluations: [{ name: 'e', metric: 'm', min: 1 }] })).toThrow(ReleasePlanError);
  });
});

describe('parseReleasePlanTargets', () => {
  it('reads targets from a release.yaml body', () => {
    const targets = parseReleasePlanTargets(OK_YAML, 'docs/.../release.yaml');
    expect(targets?.coverage?.min_percent).toBe(90);
  });

  it('returns undefined when the file has no targets', () => {
    expect(parseReleasePlanTargets('change: CHG-12\nreleases:\n  - { id: R1, tasks: [] }\n', 'x')).toBeUndefined();
  });

  it('throws when the YAML itself is broken', () => {
    expect(() => parseReleasePlanTargets('change: CHG-12\ntargets: [\n', 'bad')).toThrow(ReleasePlanError);
  });
});

describe('readRepoTargets', () => {
  async function sample(files: Record<string, string>): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), 'repo-'));
    for (const [rel, content] of Object.entries(files)) {
      const abs = join(root, rel);
      await mkdir(join(abs, '..'), { recursive: true });
      await writeFile(abs, content);
    }
    return root;
  }

  it('reads targets from every CHG folder, skipping changes without targets', async () => {
    const root = await sample({
      'docs/project/changes/CHG-1/release.yaml': OK_YAML,
      'docs/project/changes/CHG-2/release.yaml': 'change: CHG-2\nreleases:\n  - { id: R1, tasks: [] }\n',
    });
    const { targetsByChange, problems } = await readRepoTargets(root);
    expect(problems).toEqual([]);
    expect([...targetsByChange.keys()]).toEqual(['CHG-1']);
  });

  it('records a problem for a malformed release.yaml', async () => {
    const root = await sample({
      'docs/project/changes/CHG-3/release.yaml': 'targets: { coverage: { min_percent: 999 } }\n',
    });
    const { targetsByChange, problems } = await readRepoTargets(root);
    expect(targetsByChange.size).toBe(0);
    expect(problems[0]?.message).toMatch(/min_percent/);
  });

  it('returns empty when there is no changes/ directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'repo-'));
    const { targetsByChange, problems } = await readRepoTargets(root);
    expect(targetsByChange.size).toBe(0);
    expect(problems).toEqual([]);
  });
});

describe('changeOfReleasePlan', () => {
  it('matches a CHG release.yaml path and returns the change key', () => {
    expect(changeOfReleasePlan('docs/project/changes/CHG-12/release.yaml')).toBe('CHG-12');
    expect(changeOfReleasePlan('docs/project/changes/CHG-12/plan.md')).toBeNull();
    expect(changeOfReleasePlan('src/retry.ts')).toBeNull();
  });
});
