import { describe, expect, it } from 'vitest';
import type { ChangeTargets, ProjectContext, RequirementItem } from '../src/model.js';
import { TGT_001, TGT_002, TGT_003, TGT_004, globMatch, targetsByItem, targetsStatusOf } from '../src/index.js';
import type { ItemCtx } from '../src/analysis/context.js';

function epic(key: string, title = 'Payment retries'): RequirementItem {
  return {
    key,
    type: 'epic',
    title,
    description: '',
    acceptanceCriteria: [],
    businessRules: [],
    labels: [],
    url: '',
    updatedAt: '2026-11-07',
  } as unknown as RequirementItem;
}

function story(key: string, epicKey: string): RequirementItem {
  return { ...epic(key, `Story ${key}`), type: 'story', epicKey } as RequirementItem;
}

function ctxOf(
  targets: ChangeTargets | undefined,
  touched: string[],
  coverage?: Map<string, { path: string; lines: Map<number, number>; reports: string[] }>,
  mutation?: Map<string, { path: string; mutants: { status: 'killed' | 'survived' | 'timeout' | 'no_coverage' | 'error' | 'ignored' | 'pending'; line: number }[]; reports: string[] }>,
): ProjectContext {
  const sliceKey = 'TSK-57';
  return {
    project: { key: 'PAY', name: 'Payments' },
    requirements: [epic('CHG-1'), story(sliceKey, 'CHG-1')],
    documents: [],
    frames: [],
    fetchedAt: '2026-11-07T00:00:00Z',
    securityScan: { results: [], sliceFiles: { [sliceKey]: touched } },
    targetsByChange: targets ? new Map([['CHG-1', targets]]) : undefined,
    targetReports: {
      ...(coverage && { coverage: { files: coverage, problems: [] } }),
      ...(mutation && { mutation: { files: mutation, problems: [] } }),
    },
  };
}

function runRule(ruleId: typeof TGT_001, ctx: ProjectContext) {
  const summary = targetsByItem(ctx);
  const c = {
    r: ctx.requirements.find((r) => r.type === 'epic')!,
    env: {
      ctx,
      targetsByItem: summary,
    },
  } as unknown as ItemCtx;
  return ruleId.run(c);
}

describe('globMatch', () => {
  it('matches patterns with * and **', () => {
    expect(globMatch('src/*.ts', 'src/retry.ts')).toBe(true);
    expect(globMatch('src/*.ts', 'src/a/b.ts')).toBe(false);
    expect(globMatch('src/**/*.ts', 'src/a/b.ts')).toBe(true);
    expect(globMatch('docs/project/**', 'docs/project/changes/CHG-1/release.yaml')).toBe(true);
  });
});

describe('targetsByItem', () => {
  it('returns undefined when no targets are set', () => {
    expect(targetsByItem(ctxOf(undefined, []))).toBeUndefined();
  });

  it('collects touched files from the change\'s slices', () => {
    const ctx = ctxOf({ coverage: { min_percent: 90 } }, ['src/retry.ts', 'src/queue.ts']);
    expect(targetsByItem(ctx)?.get('CHG-1')?.touchedFiles).toEqual(['src/queue.ts', 'src/retry.ts']);
  });
});

describe('TGT-001 coverage rule', () => {
  it('fires when coverage is below the target', () => {
    const cov = new Map([
      ['src/retry.ts', { path: 'src/retry.ts', lines: new Map([[1, 1], [2, 0], [3, 0]]), reports: [] }],
    ]);
    const ctx = ctxOf({ coverage: { min_percent: 90 } }, ['src/retry.ts'], cov);
    const findings = runRule(TGT_001, ctx);
    expect(findings[0]?.title).toMatch(/below target/);
    expect(findings[0]?.severity).toBe('critical');
  });

  it('stays silent when coverage meets the target', () => {
    const cov = new Map([
      ['src/retry.ts', { path: 'src/retry.ts', lines: new Map([[1, 1], [2, 1]]), reports: [] }],
    ]);
    const ctx = ctxOf({ coverage: { min_percent: 90 } }, ['src/retry.ts'], cov);
    expect(runRule(TGT_001, ctx)).toEqual([]);
  });

  it('fires critical when the coverage report is missing', () => {
    const ctx = ctxOf({ coverage: { min_percent: 90 } }, ['src/retry.ts']);
    const findings = runRule(TGT_001, ctx);
    expect(findings[0]?.title).toMatch(/missing/);
  });

  it('skips files matched by an exclusion when scoring', () => {
    const cov = new Map([
      ['src/retry.ts', { path: 'src/retry.ts', lines: new Map([[1, 0]]), reports: [] }],
      ['src/queue.ts', { path: 'src/queue.ts', lines: new Map([[1, 1]]), reports: [] }],
    ]);
    const ctx = ctxOf(
      { coverage: { min_percent: 90, exclusions: [{ pattern: 'src/retry.ts', reason: 'legacy' }] } },
      ['src/retry.ts', 'src/queue.ts'],
      cov,
    );
    expect(runRule(TGT_001, ctx)).toEqual([]);
  });
});

describe('TGT-002 mutation rule', () => {
  it('fires when mutation score is below the target', () => {
    const mut = new Map([
      ['src/retry.ts', { path: 'src/retry.ts', mutants: [
        { status: 'killed' as const, line: 1 },
        { status: 'survived' as const, line: 2 },
        { status: 'survived' as const, line: 3 },
      ], reports: [] }],
    ]);
    const ctx = ctxOf({ mutation: { min_score: 70 } }, ['src/retry.ts'], undefined, mut);
    const findings = runRule(TGT_002, ctx);
    expect(findings[0]?.title).toMatch(/below target/);
  });

  it('fires critical when the mutation report is missing', () => {
    const ctx = ctxOf({ mutation: { min_score: 70 } }, ['src/retry.ts']);
    expect(runRule(TGT_002, ctx)[0]?.title).toMatch(/missing/);
  });
});

describe('TGT-003 performance rule', () => {
  it('fires warning for each unmeasured budget', () => {
    const ctx = ctxOf(
      { performance: [{ name: 'login', metric: 'ms', limit: '< 400' }, { name: 'bundle', metric: 'kb', limit: '<= 250' }] },
      [],
    );
    const findings = runRule(TGT_003, ctx);
    expect(findings.length).toBe(2);
    expect(findings[0]?.severity).toBe('warning');
  });
});

describe('TGT-004 evaluation rule', () => {
  it('fires critical for each unmeasured AI evaluation', () => {
    const ctx = ctxOf({ evaluations: [{ name: 'rag', dataset: 'e.jsonl', metric: 'faith', min: 0.9 }] }, []);
    const findings = runRule(TGT_004, ctx);
    expect(findings[0]?.severity).toBe('critical');
    expect(findings[0]?.title).toMatch(/unmeasured/);
  });
});

describe('targetsStatusOf', () => {
  it('reports met when coverage and mutation both meet their thresholds', () => {
    const status = targetsStatusOf(
      'CHG-1',
      { coverage: { min_percent: 90 }, mutation: { min_score: 70 } },
      { changeKey: 'CHG-1', touchedFiles: [], coverage: { percent: 92, missingReport: false, filesConsidered: 1 }, mutation: { score: 75, missingReport: false, mutantsConsidered: 10 } },
      '2026-11-07T10:00:00Z',
    );
    expect(status.overall).toBe('met');
    expect(status.details.map((d) => d.status)).toEqual(['met', 'met']);
  });

  it('reports not_met when any detail is not_met', () => {
    const status = targetsStatusOf(
      'CHG-1',
      { coverage: { min_percent: 90 } },
      { changeKey: 'CHG-1', touchedFiles: [], coverage: { percent: 82, missingReport: false, filesConsidered: 1 } },
      '2026-11-07T10:00:00Z',
    );
    expect(status.overall).toBe('not_met');
  });

  it('reports unknown when a report is missing', () => {
    const status = targetsStatusOf(
      'CHG-1',
      { coverage: { min_percent: 90 } },
      { changeKey: 'CHG-1', touchedFiles: [], coverage: { percent: undefined, missingReport: true, filesConsidered: 0 } },
      '2026-11-07T10:00:00Z',
    );
    expect(status.overall).toBe('unknown');
    expect(status.details[0]?.status).toBe('unknown');
  });
});
