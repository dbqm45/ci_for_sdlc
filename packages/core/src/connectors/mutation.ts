import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Mutation testing reports (Z7b-1b, docs/TARGETS-PLAN.md): StrykerJS (mutation-testing-report-schema v1/v2) and
 * mutmut (its JSON export). Only the mutants and their statuses are read — survived / killed / timeout / no_coverage;
 * the schema version is sniffed. A file that is not such a report is a problem with the reason, never zero mutants:
 * an absent report is not a perfect score.
 *
 * Sources checked 2026-11-06:
 *   - StrykerJS mutation-testing-report-schema (github.com/stryker-mutator/mutation-testing-elements, package
 *     report-schema): `{ schemaVersion, files: { "<path>": { mutants: [{ status, location: { start: { line } } }] } } }`.
 *     Status values (TitleCase): Killed, Survived, NoCoverage, Timeout, CompileError, Ignored, Pending, RuntimeError.
 *   - mutmut (mutmut.readthedocs.io, 3.x): a JSON object `{ "<path>": [{ status, line_number }] }` with lower-case
 *     statuses: killed, survived, suspicious, timeout, no_tests (mutmut's "no tests cover this line").
 */

export const MAX_MUTATION_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_MUTANTS = 200_000;

export class MutationError extends Error {}

export interface MutationProblem {
  path: string;
  message: string;
}

export type MutantStatus = 'killed' | 'survived' | 'timeout' | 'no_coverage' | 'error' | 'ignored' | 'pending';

export interface Mutant {
  status: MutantStatus;
  line: number;
  mutator?: string;
}

export interface FileMutants {
  path: string;
  mutants: Mutant[];
  reports: string[];
}

export interface MutationRead {
  files: Map<string, FileMutants>;
  problems: MutationProblem[];
}

/** Statuses that count against the mutation score (mutants expected to be killed). */
export const SCORED: ReadonlySet<MutantStatus> = new Set<MutantStatus>(['killed', 'survived', 'timeout']);

const STRYKER_STATUS: Record<string, MutantStatus> = {
  Killed: 'killed',
  Survived: 'survived',
  Timeout: 'timeout',
  NoCoverage: 'no_coverage',
  CompileError: 'error',
  RuntimeError: 'error',
  Ignored: 'ignored',
  Pending: 'pending',
};

const MUTMUT_STATUS: Record<string, MutantStatus> = {
  killed: 'killed',
  survived: 'survived',
  suspicious: 'survived',
  timeout: 'timeout',
  no_tests: 'no_coverage',
  skipped: 'ignored',
};

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.\/+/, '');
}

interface StrykerMutant {
  status?: string;
  location?: { start?: { line?: number } };
  mutatorName?: string;
}

/** Parses a StrykerJS mutation report (schema v1/v2). */
export function parseStryker(json: unknown, report: string): { path: string; mutants: Mutant[] }[] {
  if (!json || typeof json !== 'object') throw new MutationError(`Not a StrykerJS report: ${report}`);
  const files = (json as { files?: Record<string, { mutants?: StrykerMutant[] }> }).files;
  if (!files || typeof files !== 'object') throw new MutationError(`Not a StrykerJS report (no files): ${report}`);
  const out: { path: string; mutants: Mutant[] }[] = [];
  let total = 0;
  for (const [path, entry] of Object.entries(files)) {
    const mutants: Mutant[] = [];
    for (const m of entry.mutants ?? []) {
      const status = STRYKER_STATUS[m.status ?? ''];
      const line = m.location?.start?.line;
      if (!status || typeof line !== 'number' || line <= 0) continue;
      mutants.push({ status, line, ...(m.mutatorName && { mutator: m.mutatorName }) });
      if (++total > MAX_MUTANTS) throw new MutationError(`More than ${MAX_MUTANTS} mutants`);
    }
    if (mutants.length) out.push({ path: normalizePath(path), mutants });
  }
  return out;
}

interface MutmutMutant {
  status?: string;
  line_number?: number;
  line?: number;
  mutation?: string;
}

/** Parses a mutmut JSON report. mutmut's export maps a source file path to a list of mutants. */
export function parseMutmut(json: unknown, report: string): { path: string; mutants: Mutant[] }[] {
  if (!json || typeof json !== 'object' || Array.isArray(json)) throw new MutationError(`Not a mutmut report: ${report}`);
  const out: { path: string; mutants: Mutant[] }[] = [];
  let total = 0;
  for (const [path, entries] of Object.entries(json as Record<string, MutmutMutant[]>)) {
    if (!Array.isArray(entries)) continue;
    const mutants: Mutant[] = [];
    for (const m of entries) {
      const status = MUTMUT_STATUS[m.status ?? ''];
      const line = typeof m.line_number === 'number' ? m.line_number : typeof m.line === 'number' ? m.line : undefined;
      if (!status || typeof line !== 'number' || line <= 0) continue;
      mutants.push({ status, line, ...(m.mutation && { mutator: m.mutation }) });
      if (++total > MAX_MUTANTS) throw new MutationError(`More than ${MAX_MUTANTS} mutants`);
    }
    if (mutants.length) out.push({ path: normalizePath(path), mutants });
  }
  if (!out.length) throw new MutationError(`Not a mutmut report (no mutants recognised): ${report}`);
  return out;
}

/** Sniffs StrykerJS vs mutmut. A StrykerJS report has either `schemaVersion` or a `files` object with `mutants`. */
function sniff(json: unknown): 'stryker' | 'mutmut' {
  if (json && typeof json === 'object' && !Array.isArray(json)) {
    const o = json as { schemaVersion?: unknown; files?: unknown };
    if (o.schemaVersion !== undefined) return 'stryker';
    if (o.files && typeof o.files === 'object') return 'stryker';
  }
  return 'mutmut';
}

async function filesUnder(path: string): Promise<string[]> {
  const info = await stat(path);
  if (!info.isDirectory()) return [path];
  const out: string[] = [];
  for (const e of await readdir(path, { withFileTypes: true })) {
    const p = join(path, e.name);
    if (e.isDirectory()) out.push(...(await filesUnder(p)));
    else if (e.name.endsWith('.json')) out.push(p);
  }
  return out.sort();
}

/**
 * The mutants of mutation reports. For a directory, every `*.json` file is read; the content is sniffed as StrykerJS
 * or mutmut. A file that cannot be read is a problem with its path and the reason; the others are still read. The
 * same source file may appear in more than one report — mutants are merged.
 */
export async function readMutation(paths: string[]): Promise<MutationRead> {
  const files = new Map<string, FileMutants>();
  const problems: MutationProblem[] = [];
  const merge = (path: string, mutants: Mutant[], report: string) => {
    const got = files.get(path) ?? { path, mutants: [], reports: [] };
    got.mutants.push(...mutants);
    if (!got.reports.includes(report)) got.reports.push(report);
    files.set(path, got);
  };
  for (const root of paths) {
    let list: string[];
    try {
      list = await filesUnder(root);
    } catch {
      problems.push({ path: root, message: 'Cannot read the file' });
      continue;
    }
    for (const file of list) {
      try {
        if ((await stat(file)).size > MAX_MUTATION_FILE_BYTES) {
          throw new MutationError(`Larger than ${MAX_MUTATION_FILE_BYTES / 1024 / 1024} MB`);
        }
        let json: unknown;
        try {
          json = JSON.parse(await readFile(file, 'utf8'));
        } catch (e) {
          throw new MutationError(`Not valid JSON: ${(e as Error).message}`);
        }
        const kind = sniff(json);
        const entries = kind === 'stryker' ? parseStryker(json, file) : parseMutmut(json, file);
        for (const { path, mutants } of entries) merge(path, mutants, file);
      } catch (e) {
        problems.push({ path: file, message: e instanceof MutationError ? e.message : 'Cannot read the file' });
      }
    }
  }
  problems.sort((a, b) => a.path.localeCompare(b.path));
  return { files, problems };
}

/** Mutation score of mutants whose line is in `changedLines`, rounded to one decimal; 100 for an empty set. */
export function mutationScoreOfChanged(file: FileMutants | undefined, changedLines: Iterable<number>): number {
  const lines = new Set(changedLines);
  if (!lines.size) return 100;
  if (!file) return 0;
  let scored = 0;
  let killed = 0;
  for (const m of file.mutants) {
    if (!lines.has(m.line)) continue;
    if (!SCORED.has(m.status)) continue;
    scored++;
    if (m.status === 'killed' || m.status === 'timeout') killed++;
  }
  if (!scored) return 100;
  return Math.round((killed / scored) * 1000) / 10;
}
