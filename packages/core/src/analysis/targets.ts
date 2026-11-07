import type { ChangeTargets, Evidence, ProjectContext, RequirementItem, Severity, TargetExclusion } from '../model.js';
import type { FileCoverage } from '../connectors/coverage.js';
import type { FileMutants } from '../connectors/mutation.js';
import type { ItemCtx } from './context.js';
import type { FindingDraft, Rule } from './rules.js';

/**
 * Change-targets rules (Z7b-1b, docs/TARGETS-PLAN.md):
 *   - TGT-001 coverage of changed code below the target (blocking)
 *   - TGT-002 mutation score of changed code below the target (blocking)
 *   - TGT-003 performance budget exceeded (warning; pomiar w Z10e)
 *   - TGT-004 evaluation threshold not met for an AI feature (blocking)
 *
 * "Changed code" = files the change touched (sliceFiles of its slices, plus the pull request's files when `--base`
 * was given, plus files under `docs/project/changes/CHG-n/`). A file outside those is ignored. Exclusions from the
 * target skip files whose path matches a glob pattern (`*` = non-slash segment, `**` = any including slashes).
 *
 * A missing report for a set target is a `not_met` finding with status `unknown`: a check that did not run is never
 * "met".
 */

const CHANGE_FILE = /^docs\/project\/changes\/(CHG-[^/]+)\/(.*)$/;

export interface TargetSummary {
  changeKey: string;
  touchedFiles: string[];
  coverage?: { percent: number | undefined; missingReport: boolean; filesConsidered: number };
  mutation?: { score: number | undefined; missingReport: boolean; mutantsConsidered: number };
}

/** For every change (epic) in the project: files it touched and target scores. */
export function targetsByItem(ctx: ProjectContext): Map<string, TargetSummary> | undefined {
  if (!ctx.targetsByChange?.size) return undefined;
  const epics = ctx.requirements.filter((r) => r.type === 'epic');
  const slicesByChange = new Map<string, string[]>();
  for (const r of ctx.requirements) {
    if (r.type === 'task' || r.type === 'subtask') continue;
    const change = r.type === 'epic' ? r.key : r.epicKey ?? r.parentKey;
    if (change && epics.find((e) => e.key === change)) {
      (slicesByChange.get(change) ?? slicesByChange.set(change, []).get(change)!).push(r.key);
    }
  }
  const scan = ctx.securityScan; // same sliceFiles map as SEC (Z8c): no need for a separate git read.
  const coverage = ctx.targetReports?.coverage?.files;
  const mutation = ctx.targetReports?.mutation?.files;
  const out = new Map<string, TargetSummary>();
  for (const epic of epics) {
    const targets = ctx.targetsByChange.get(epic.key);
    if (!targets) continue;
    const touched = new Set<string>();
    // Slice files (commits with `Change: TSK-n`).
    for (const s of slicesByChange.get(epic.key) ?? []) {
      for (const f of scan?.sliceFiles[s] ?? []) touched.add(f);
    }
    // PR files whose location is under docs/project/changes/<this change>/.
    for (const f of scan?.pr?.files ?? []) {
      const owned = CHANGE_FILE.exec(f)?.[1];
      if (owned === epic.key) touched.add(f);
    }
    // When the PR touches slices of this change, their files also count.
    for (const s of scan?.pr?.slices ?? []) {
      if ((slicesByChange.get(epic.key) ?? []).includes(s)) {
        for (const f of scan?.sliceFiles[s] ?? []) touched.add(f);
      }
    }
    const summary: TargetSummary = { changeKey: epic.key, touchedFiles: [...touched].sort() };
    if (targets.coverage) {
      summary.coverage = coverageOfChange(summary.touchedFiles, targets.coverage.exclusions, coverage);
    }
    if (targets.mutation) {
      summary.mutation = mutationOfChange(summary.touchedFiles, targets.mutation.exclusions, mutation);
    }
    out.set(epic.key, summary);
  }
  return out;
}

function coverageOfChange(touched: string[], exclusions: TargetExclusion[] | undefined, byFile: Map<string, FileCoverage> | undefined): NonNullable<TargetSummary['coverage']> {
  if (!byFile) return { percent: undefined, missingReport: true, filesConsidered: 0 };
  const files = filtered(touched, exclusions);
  let covered = 0;
  let total = 0;
  for (const path of files) {
    const data = byFile.get(path);
    if (!data) continue;
    for (const hits of data.lines.values()) {
      total++;
      if (hits > 0) covered++;
    }
  }
  if (!total) return { percent: 100, missingReport: false, filesConsidered: files.length };
  return { percent: Math.round((covered / total) * 1000) / 10, missingReport: false, filesConsidered: files.length };
}

function mutationOfChange(touched: string[], exclusions: TargetExclusion[] | undefined, byFile: Map<string, FileMutants> | undefined): NonNullable<TargetSummary['mutation']> {
  if (!byFile) return { score: undefined, missingReport: true, mutantsConsidered: 0 };
  const files = filtered(touched, exclusions);
  let scored = 0;
  let killed = 0;
  for (const path of files) {
    const data = byFile.get(path);
    if (!data) continue;
    for (const m of data.mutants) {
      if (m.status === 'killed' || m.status === 'timeout') {
        scored++;
        killed++;
      } else if (m.status === 'survived') {
        scored++;
      }
    }
  }
  if (!scored) return { score: 100, missingReport: false, mutantsConsidered: 0 };
  return { score: Math.round((killed / scored) * 1000) / 10, missingReport: false, mutantsConsidered: scored };
}

function filtered(touched: string[], exclusions: TargetExclusion[] | undefined): string[] {
  if (!exclusions?.length) return touched;
  return touched.filter((p) => !exclusions.some((x) => globMatch(x.pattern, p)));
}

/** Minimal glob: `**` matches any (including `/`), `*` matches anything but `/`, `?` matches one char but `/`. */
export function globMatch(pattern: string, path: string): boolean {
  // Build a regex from the glob.
  const re = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '::DS::')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/::DS::/g, '.*');
  return new RegExp(`^${re}$`).test(path);
}

function evOfTarget(changeKey: string): Evidence[] {
  return [{ source: 'code', entityId: `release-plan:${changeKey}`, title: `${changeKey} release.yaml targets`, path: `docs/project/changes/${changeKey}/release.yaml` }];
}

function draft(severity: Severity, title: string, explanation: string, ev: Evidence[]): FindingDraft {
  return { category: 'CONFLICT', dimension: 'delivery', severity, title, explanation, evidence: ev };
}

function tgtOnEpic(c: ItemCtx, run: (summary: TargetSummary, targets: ChangeTargets) => FindingDraft | null): FindingDraft[] {
  if (c.r.type !== 'epic') return [];
  const summary = c.env.ctx.targetsByChange ? (c.env.targetsByItem?.get(c.r.key)) : undefined;
  const targets = c.env.ctx.targetsByChange?.get(c.r.key);
  if (!summary || !targets) return [];
  const out = run(summary, targets);
  return out ? [out] : [];
}

/** TGT-001: coverage of changed code vs `targets.coverage.min_percent`. */
export const TGT_001: Rule = {
  id: 'TGT-001',
  name: 'Coverage of changed code below target',
  description: 'Line coverage of the files the change touched, from --coverage, is below release.yaml targets.coverage.min_percent (pdi contract 0.12.0).',
  appliesTo: ['epic'],
  run: (c) =>
    tgtOnEpic(c, (s, t) => {
      const cov = s.coverage;
      const tgt = t.coverage;
      if (!tgt || !cov) return null;
      const ev = evOfTarget(s.changeKey);
      if (cov.missingReport) {
        return draft(
          'critical',
          `Coverage report missing for ${s.changeKey}`,
          `Target coverage is ${tgt.min_percent}% but no --coverage report was given to analyze. A check that did not run is never "met"; attach the report or waive the target in release.yaml.`,
          ev,
        );
      }
      if (cov.percent === undefined || cov.percent < tgt.min_percent) {
        return draft(
          'critical',
          `Coverage ${cov.percent ?? 0}% below target ${tgt.min_percent}%`,
          `${s.changeKey} touched ${cov.filesConsidered} file${cov.filesConsidered === 1 ? '' : 's'} with coverage; line coverage over them is ${cov.percent ?? 0}%, under the ${tgt.min_percent}% target from release.yaml.`,
          ev,
        );
      }
      return null;
    }),
};

/** TGT-002: mutation score of changed code vs `targets.mutation.min_score`. */
export const TGT_002: Rule = {
  id: 'TGT-002',
  name: 'Mutation score on changed code below target',
  description: 'Mutation score on the files the change touched, from --mutation, is below release.yaml targets.mutation.min_score (pdi contract 0.12.0).',
  appliesTo: ['epic'],
  run: (c) =>
    tgtOnEpic(c, (s, t) => {
      const mut = s.mutation;
      const tgt = t.mutation;
      if (!tgt || !mut) return null;
      const ev = evOfTarget(s.changeKey);
      if (mut.missingReport) {
        return draft(
          'critical',
          `Mutation report missing for ${s.changeKey}`,
          `Target mutation score is ${tgt.min_score}% but no --mutation report was given to analyze.`,
          ev,
        );
      }
      if (mut.score === undefined || mut.score < tgt.min_score) {
        return draft(
          'critical',
          `Mutation score ${mut.score ?? 0}% below target ${tgt.min_score}%`,
          `${s.changeKey}: ${mut.mutantsConsidered} scored mutant${mut.mutantsConsidered === 1 ? '' : 's'}; mutation score is ${mut.score ?? 0}%, under the ${tgt.min_score}% target.`,
          ev,
        );
      }
      return null;
    }),
};

/**
 * TGT-003: performance budget. Z7b-1b does not take measurements yet (Z10e adds them). The rule fires as a warning
 * telling the human that a budget is set, and is not met by default until Z10e feeds a measurement in.
 */
export const TGT_003: Rule = {
  id: 'TGT-003',
  name: 'Performance budget set but unmeasured',
  description: 'release.yaml targets.performance lists a budget; Z7b-1b does not take measurements yet, Z10e will.',
  appliesTo: ['epic'],
  run: (c) => {
    if (c.r.type !== 'epic') return [];
    const targets = c.env.ctx.targetsByChange?.get(c.r.key);
    if (!targets?.performance?.length) return [];
    const ev = evOfTarget(c.r.key);
    return targets.performance.map((p) =>
      draft(
        'warning',
        `Performance budget "${p.name}" unmeasured`,
        `Target ${p.metric} ${p.limit} is set; no measurement wired yet (Z10e will add it). The budget stays visible for the human at B3.`,
        ev,
      ),
    );
  },
};

/**
 * TGT-004: evaluation threshold for an AI feature. The rule fires when a threshold is set; Z7b-1b has no evaluation
 * runner (Z7d will), so without external input the finding is critical ("not measured", no pass).
 */
export const TGT_004: Rule = {
  id: 'TGT-004',
  name: 'AI evaluation threshold set but unmeasured',
  description: 'release.yaml targets.evaluations lists an evaluation threshold; the AI evaluation runner comes in Z7d.',
  appliesTo: ['epic'],
  run: (c) => {
    if (c.r.type !== 'epic') return [];
    const targets = c.env.ctx.targetsByChange?.get(c.r.key);
    if (!targets?.evaluations?.length) return [];
    const ev = evOfTarget(c.r.key);
    return targets.evaluations.map((e) =>
      draft(
        'critical',
        `AI evaluation "${e.name}" unmeasured`,
        `Target ${e.metric} ≥ ${e.min} on dataset ${e.dataset} is set; no evaluation runner is wired yet (Z7d will). The target is mandatory for AI products (DZ7), so the change is not ready until it is measured.`,
        ev,
      ),
    );
  },
};

export const TARGET_RULES: Rule[] = [TGT_001, TGT_002, TGT_003, TGT_004];

/** Builds `TargetsStatus` for one change's readiness.changed event (pdi contract 0.12.0). */
export function targetsStatusOf(
  change: string,
  targets: ChangeTargets,
  summary: TargetSummary | undefined,
  checkedAt: string,
): { overall: 'met' | 'not_met' | 'unknown'; checked_at: string; summary?: string; details: { name: string; kind: 'coverage' | 'mutation' | 'performance' | 'evaluation' | 'other'; status: 'met' | 'not_met' | 'unknown'; observed?: string; required?: string }[] } {
  const details: { name: string; kind: 'coverage' | 'mutation' | 'performance' | 'evaluation' | 'other'; status: 'met' | 'not_met' | 'unknown'; observed?: string; required?: string }[] = [];
  if (targets.coverage) {
    const cov = summary?.coverage;
    const met = cov && cov.percent !== undefined && cov.percent >= targets.coverage.min_percent;
    details.push({
      name: 'coverage',
      kind: 'coverage',
      status: !cov || cov.missingReport ? 'unknown' : met ? 'met' : 'not_met',
      ...(cov?.percent !== undefined && { observed: `${cov.percent}%` }),
      required: `>= ${targets.coverage.min_percent}%`,
    });
  }
  if (targets.mutation) {
    const mut = summary?.mutation;
    const met = mut && mut.score !== undefined && mut.score >= targets.mutation.min_score;
    details.push({
      name: 'mutation',
      kind: 'mutation',
      status: !mut || mut.missingReport ? 'unknown' : met ? 'met' : 'not_met',
      ...(mut?.score !== undefined && { observed: `${mut.score}%` }),
      required: `>= ${targets.mutation.min_score}%`,
    });
  }
  for (const p of targets.performance ?? []) {
    details.push({ name: p.name, kind: 'performance', status: 'unknown', required: `${p.metric} ${p.limit}` });
  }
  for (const e of targets.evaluations ?? []) {
    details.push({ name: e.name, kind: 'evaluation', status: 'unknown', required: `${e.metric} >= ${e.min}` });
  }
  const overall: 'met' | 'not_met' | 'unknown' = details.some((d) => d.status === 'not_met')
    ? 'not_met'
    : details.every((d) => d.status === 'met')
      ? 'met'
      : 'unknown';
  const summaryText = summarize(change, details);
  return { overall, checked_at: checkedAt, ...(summaryText && { summary: summaryText }), details };
}

function summarize(change: string, details: ReturnType<typeof targetsStatusOf>['details']): string {
  if (!details.length) return `${change}: no targets`;
  const parts = details.map((d) => `${d.name} ${d.status}${d.observed ? ` (${d.observed})` : ''}`);
  return `${change}: ${parts.join(', ')}`;
}

/** Keeps requirements typed without pulling the type in rules.ts. */
export type { RequirementItem };
