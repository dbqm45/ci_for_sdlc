import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { ChangeTargets, CoverageTarget, EvaluationTarget, MutationTarget, PerformanceTarget, TargetExclusion } from '../model.js';

/**
 * Read `targets` from the `release.yaml` of every change in a repo (Z7b-1b, docs/TARGETS-PLAN.md). Shape matches pdi
 * contract 0.12.0 `release_plan.targets` — see the pinned copy at
 * packages/core/test/fixtures/pdi-contract/0.12.0/release-plan.schema.json. A change without `targets` is skipped
 * (no entry in the result); a malformed `release.yaml` or a `targets` block that does not match the shape becomes a
 * problem with the path and the reason.
 */

export const MAX_RELEASE_PLAN_FILE_BYTES = 1 * 1024 * 1024;

export class ReleasePlanError extends Error {}

export interface ReleasePlanProblem {
  path: string;
  message: string;
}

export interface TargetsRead {
  targetsByChange: Map<string, ChangeTargets>;
  problems: ReleasePlanProblem[];
}

const CHG_DIR_RE = /^docs\/project\/changes\/(CHG-[^/]+)\/release\.yaml$/;

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function asString(v: unknown, field: string, where: string): string {
  if (typeof v !== 'string' || !v) throw new ReleasePlanError(`${where}.${field}: non-empty string expected`);
  return v;
}

function asNumberInRange(v: unknown, field: string, where: string, min: number, max: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) {
    throw new ReleasePlanError(`${where}.${field}: number in [${min}, ${max}] expected`);
  }
  return v;
}

function asNumber(v: unknown, field: string, where: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new ReleasePlanError(`${where}.${field}: number expected`);
  return v;
}

const EXCLUSION_KEYS = new Set(['pattern', 'reason']);
function readExclusion(v: unknown, where: string): TargetExclusion {
  if (!isObj(v)) throw new ReleasePlanError(`${where}: object expected`);
  const extra = Object.keys(v).filter((k) => !EXCLUSION_KEYS.has(k));
  if (extra.length) throw new ReleasePlanError(`${where}: unknown fields ${extra.join(', ')}`);
  return { pattern: asString(v.pattern, 'pattern', where), reason: asString(v.reason, 'reason', where) };
}

const COV_KEYS = new Set(['kind', 'min_percent', 'tool', 'exclusions']);
function readCoverage(v: unknown): CoverageTarget {
  if (!isObj(v)) throw new ReleasePlanError('targets.coverage: object expected');
  const extra = Object.keys(v).filter((k) => !COV_KEYS.has(k));
  if (extra.length) throw new ReleasePlanError(`targets.coverage: unknown fields ${extra.join(', ')}`);
  const out: CoverageTarget = { min_percent: asNumberInRange(v.min_percent, 'min_percent', 'targets.coverage', 0, 100) };
  if (v.kind !== undefined) {
    if (v.kind !== 'changed_lines' && v.kind !== 'whole_project') throw new ReleasePlanError(`targets.coverage.kind: 'changed_lines' or 'whole_project'`);
    out.kind = v.kind;
  }
  if (v.tool !== undefined) out.tool = asString(v.tool, 'tool', 'targets.coverage');
  if (v.exclusions !== undefined) {
    if (!Array.isArray(v.exclusions)) throw new ReleasePlanError('targets.coverage.exclusions: array expected');
    out.exclusions = v.exclusions.map((e, i) => readExclusion(e, `targets.coverage.exclusions[${i}]`));
  }
  return out;
}

const MUT_KEYS = new Set(['kind', 'min_score', 'tool', 'exclusions']);
function readMutation(v: unknown): MutationTarget {
  if (!isObj(v)) throw new ReleasePlanError('targets.mutation: object expected');
  const extra = Object.keys(v).filter((k) => !MUT_KEYS.has(k));
  if (extra.length) throw new ReleasePlanError(`targets.mutation: unknown fields ${extra.join(', ')}`);
  const out: MutationTarget = { min_score: asNumberInRange(v.min_score, 'min_score', 'targets.mutation', 0, 100) };
  if (v.kind !== undefined) {
    if (v.kind !== 'changed_lines' && v.kind !== 'whole_project') throw new ReleasePlanError(`targets.mutation.kind: 'changed_lines' or 'whole_project'`);
    out.kind = v.kind;
  }
  if (v.tool !== undefined) out.tool = asString(v.tool, 'tool', 'targets.mutation');
  if (v.exclusions !== undefined) {
    if (!Array.isArray(v.exclusions)) throw new ReleasePlanError('targets.mutation.exclusions: array expected');
    out.exclusions = v.exclusions.map((e, i) => readExclusion(e, `targets.mutation.exclusions[${i}]`));
  }
  return out;
}

const PERF_KEYS = new Set(['name', 'metric', 'limit', 'note']);
function readPerformance(v: unknown, i: number): PerformanceTarget {
  if (!isObj(v)) throw new ReleasePlanError(`targets.performance[${i}]: object expected`);
  const extra = Object.keys(v).filter((k) => !PERF_KEYS.has(k));
  if (extra.length) throw new ReleasePlanError(`targets.performance[${i}]: unknown fields ${extra.join(', ')}`);
  return {
    name: asString(v.name, 'name', `targets.performance[${i}]`),
    metric: asString(v.metric, 'metric', `targets.performance[${i}]`),
    limit: asString(v.limit, 'limit', `targets.performance[${i}]`),
    ...(v.note !== undefined && { note: asString(v.note, 'note', `targets.performance[${i}]`) }),
  };
}

const EVAL_KEYS = new Set(['name', 'dataset', 'metric', 'min', 'note']);
function readEvaluation(v: unknown, i: number): EvaluationTarget {
  if (!isObj(v)) throw new ReleasePlanError(`targets.evaluations[${i}]: object expected`);
  const extra = Object.keys(v).filter((k) => !EVAL_KEYS.has(k));
  if (extra.length) throw new ReleasePlanError(`targets.evaluations[${i}]: unknown fields ${extra.join(', ')}`);
  return {
    name: asString(v.name, 'name', `targets.evaluations[${i}]`),
    dataset: asString(v.dataset, 'dataset', `targets.evaluations[${i}]`),
    metric: asString(v.metric, 'metric', `targets.evaluations[${i}]`),
    min: asNumber(v.min, 'min', `targets.evaluations[${i}]`),
    ...(v.note !== undefined && { note: asString(v.note, 'note', `targets.evaluations[${i}]`) }),
  };
}

const TGT_KEYS = new Set(['coverage', 'mutation', 'performance', 'evaluations']);
/** Parses a `targets` block, mirroring the shape in pdi contract 0.12.0 release_plan.targets. */
export function parseTargets(targets: unknown): ChangeTargets {
  if (!isObj(targets)) throw new ReleasePlanError('targets: object expected');
  const extra = Object.keys(targets).filter((k) => !TGT_KEYS.has(k));
  if (extra.length) throw new ReleasePlanError(`targets: unknown fields ${extra.join(', ')}`);
  const out: ChangeTargets = {};
  if (targets.coverage !== undefined) out.coverage = readCoverage(targets.coverage);
  if (targets.mutation !== undefined) out.mutation = readMutation(targets.mutation);
  if (targets.performance !== undefined) {
    if (!Array.isArray(targets.performance)) throw new ReleasePlanError('targets.performance: array expected');
    out.performance = targets.performance.map((p, i) => readPerformance(p, i));
  }
  if (targets.evaluations !== undefined) {
    if (!Array.isArray(targets.evaluations)) throw new ReleasePlanError('targets.evaluations: array expected');
    out.evaluations = targets.evaluations.map((e, i) => readEvaluation(e, i));
  }
  return out;
}

/** Reads one release.yaml file and returns its `targets` block (or undefined when the file has no `targets`). */
export function parseReleasePlanTargets(yaml: string, report: string): ChangeTargets | undefined {
  let doc: unknown;
  try {
    doc = parseYaml(yaml);
  } catch (e) {
    throw new ReleasePlanError(`Invalid YAML in ${report}: ${(e as Error).message}`);
  }
  if (!isObj(doc)) throw new ReleasePlanError(`Invalid release.yaml in ${report}: object expected`);
  if (doc.targets === undefined) return undefined;
  try {
    return parseTargets(doc.targets);
  } catch (e) {
    throw new ReleasePlanError(`${report}: ${(e as ReleasePlanError).message}`);
  }
}

/**
 * Reads every `release.yaml` under `docs/project/changes/CHG-*` in the repository. A file that cannot be read
 * becomes a problem; a change without `targets` is skipped (no entry in the result).
 */
export async function readRepoTargets(root: string): Promise<TargetsRead> {
  const targetsByChange = new Map<string, ChangeTargets>();
  const problems: ReleasePlanProblem[] = [];
  const changesDir = join(root, 'docs', 'project', 'changes');
  let entries;
  try {
    entries = await readdir(changesDir, { withFileTypes: true });
  } catch {
    return { targetsByChange, problems }; // no changes/ directory → nothing to do
  }
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!e.isDirectory() || !/^CHG-/.test(e.name)) continue;
    const file = join(changesDir, e.name, 'release.yaml');
    const rel = `docs/project/changes/${e.name}/release.yaml`;
    try {
      const info = await stat(file).catch(() => undefined);
      if (!info) continue; // no release.yaml → skip
      if (info.size > MAX_RELEASE_PLAN_FILE_BYTES) {
        problems.push({ path: rel, message: `Larger than ${MAX_RELEASE_PLAN_FILE_BYTES / 1024 / 1024} MB` });
        continue;
      }
      const yaml = await readFile(file, 'utf8');
      const targets = parseReleasePlanTargets(yaml, rel);
      if (targets) targetsByChange.set(e.name, targets);
    } catch (err) {
      problems.push({ path: rel, message: err instanceof ReleasePlanError ? err.message : 'Cannot read the file' });
    }
  }
  problems.sort((a, b) => a.path.localeCompare(b.path));
  return { targetsByChange, problems };
}

/** Matches `docs/project/changes/CHG-n/release.yaml` and returns the change key, else null. */
export function changeOfReleasePlan(path: string): string | null {
  return CHG_DIR_RE.exec(path)?.[1] ?? null;
}
