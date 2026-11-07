import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Line coverage reports (Z7b-1b, docs/TARGETS-PLAN.md): lcov tracefiles or Cobertura XML. Only line hits are read;
 * branch and function sections are ignored. A file that is not such a report is a problem with the reason, never zero
 * lines: a coverage run that did not produce a report is not perfect coverage.
 *
 * Sources checked 2026-11-06:
 *   - lcov tracefile (`geninfo` manpage, ltp.sourceforge.net/coverage/lcov/geninfo.1.php): `SF:<file>` opens a
 *     per-file section; `DA:<line>,<hits>[,<checksum>]` gives one line; `end_of_record` closes it.
 *   - Cobertura XML (coverage-04.dtd, github.com/cobertura/cobertura): `<class filename="...">` with
 *     `<line number="..." hits="..." />` entries. One class per source file; same `filename` across classes aggregates.
 */

export const MAX_COVERAGE_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_COVERAGE_LINES = 500_000;

export class CoverageError extends Error {}

export interface CoverageProblem {
  path: string;
  message: string;
}

/** One file's line hits, aggregated when a path appears in more than one report. `hits > 0` means "covered". */
export interface FileCoverage {
  path: string;
  lines: Map<number, number>;
  reports: string[];
}

/** The line-hits read from the given paths and the problems. */
export interface CoverageRead {
  files: Map<string, FileCoverage>;
  problems: CoverageProblem[];
}

const LCOV_FIRST = /^(TN:|SF:|DA:|LH:|LF:|BRDA:|FN:|end_of_record)/m;
const XML_FIRST = /<coverage\b/;

/** Returns `lcov`, `cobertura` or null when the content fits neither. */
function sniff(content: string): 'lcov' | 'cobertura' | null {
  if (XML_FIRST.test(content)) return 'cobertura';
  if (LCOV_FIRST.test(content)) return 'lcov';
  return null;
}

/** Parses an lcov tracefile into `[path, { line: hits }]` pairs. */
export function parseLcov(text: string, report: string): { path: string; lines: Map<number, number> }[] {
  const out: { path: string; lines: Map<number, number> }[] = [];
  let current: { path: string; lines: Map<number, number> } | null = null;
  let totalLines = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('SF:')) {
      current = { path: normalizePath(line.slice(3).trim()), lines: new Map() };
      continue;
    }
    if (line === 'end_of_record') {
      if (current) out.push(current);
      current = null;
      continue;
    }
    if (line.startsWith('DA:')) {
      if (!current) throw new CoverageError(`DA before SF in ${report}`);
      const parts = line.slice(3).split(',');
      const lineNo = Number(parts[0]);
      const hits = Number(parts[1]);
      if (!Number.isFinite(lineNo) || !Number.isFinite(hits) || lineNo <= 0) {
        throw new CoverageError(`Bad DA line in ${report}: ${line}`);
      }
      current.lines.set(lineNo, (current.lines.get(lineNo) ?? 0) + Math.max(0, hits));
      totalLines++;
      if (totalLines > MAX_COVERAGE_LINES) throw new CoverageError(`More than ${MAX_COVERAGE_LINES} lines`);
      continue;
    }
    // TN, LH, LF, BRDA, FN, FNDA, FNH, FNF, VER, etc. — ignored.
  }
  if (current) throw new CoverageError(`end_of_record missing in ${report}`);
  return out;
}

const ATTR = /([\w:-]+)\s*=\s*"([^"]*)"/g;

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(ATTR)) out[m[1]!] = m[2]!;
  return out;
}

/** Parses Cobertura XML into `[path, { line: hits }]` pairs; sums hits when a filename appears in several classes. */
export function parseCobertura(xml: string, report: string): { path: string; lines: Map<number, number> }[] {
  if (!XML_FIRST.test(xml)) throw new CoverageError(`Not a Cobertura XML report: ${report}`);
  const body = xml.replace(/<!--[\s\S]*?-->/g, '');
  const byPath = new Map<string, Map<number, number>>();
  let totalLines = 0;
  const classRe = /<class\b([^>]*)(\/>|>([\s\S]*?)<\/class>)/g;
  for (const c of body.matchAll(classRe)) {
    const a = attrs(c[1]!);
    const file = a.filename;
    if (!file) continue;
    const path = normalizePath(file);
    const lines = byPath.get(path) ?? new Map<number, number>();
    const inner = c[3] ?? '';
    const lineRe = /<line\b([^>]*)\/?>/g;
    for (const l of inner.matchAll(lineRe)) {
      const la = attrs(l[1]!);
      if (la.branch === 'true' && la.hits === undefined) continue; // branch-only entries without line hits
      const n = Number(la.number);
      const h = Number(la.hits);
      if (!Number.isFinite(n) || n <= 0 || !Number.isFinite(h)) continue;
      lines.set(n, (lines.get(n) ?? 0) + Math.max(0, h));
      totalLines++;
      if (totalLines > MAX_COVERAGE_LINES) throw new CoverageError(`More than ${MAX_COVERAGE_LINES} lines`);
    }
    byPath.set(path, lines);
  }
  return [...byPath.entries()].map(([path, lines]) => ({ path, lines }));
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.\/+/, '');
}

async function filesUnder(path: string, exts: readonly string[]): Promise<string[]> {
  const info = await stat(path);
  if (!info.isDirectory()) return [path];
  const out: string[] = [];
  for (const e of await readdir(path, { withFileTypes: true })) {
    const p = join(path, e.name);
    if (e.isDirectory()) out.push(...(await filesUnder(p, exts)));
    else if (exts.some((x) => e.name.endsWith(x))) out.push(p);
  }
  return out.sort();
}

/**
 * The line hits of coverage reports. For a directory, `.info` is read as lcov and `.xml` as Cobertura; a single file
 * is sniffed by content. A file that cannot be read is a problem with its path and the reason; the others are still
 * read. The same source file may appear in more than one report — hits are summed.
 *
 * @param paths files or directories
 */
export async function readCoverage(paths: string[]): Promise<CoverageRead> {
  const files = new Map<string, FileCoverage>();
  const problems: CoverageProblem[] = [];
  const merge = (path: string, lines: Map<number, number>, report: string) => {
    const got = files.get(path) ?? { path, lines: new Map<number, number>(), reports: [] };
    for (const [ln, hits] of lines) got.lines.set(ln, (got.lines.get(ln) ?? 0) + hits);
    if (!got.reports.includes(report)) got.reports.push(report);
    files.set(path, got);
  };
  for (const root of paths) {
    let fileList: string[];
    try {
      fileList = await filesUnder(root, ['.info', '.xml']);
    } catch {
      problems.push({ path: root, message: 'Cannot read the file' });
      continue;
    }
    for (const file of fileList) {
      try {
        if ((await stat(file)).size > MAX_COVERAGE_FILE_BYTES) {
          throw new CoverageError(`Larger than ${MAX_COVERAGE_FILE_BYTES / 1024 / 1024} MB`);
        }
        const content = await readFile(file, 'utf8');
        const kind = sniff(content);
        if (!kind) throw new CoverageError(`Not a coverage report (expected lcov or Cobertura XML)`);
        const entries = kind === 'lcov' ? parseLcov(content, file) : parseCobertura(content, file);
        for (const { path, lines } of entries) merge(path, lines, file);
      } catch (e) {
        problems.push({ path: file, message: e instanceof CoverageError ? e.message : 'Cannot read the file' });
      }
    }
  }
  problems.sort((a, b) => a.path.localeCompare(b.path));
  return { files, problems };
}

/** Percent of lines in `changedLines` that have `hits > 0`, rounded to one decimal; returns 100 for an empty set. */
export function coveragePercentOfChanged(file: FileCoverage | undefined, changedLines: Iterable<number>): number {
  const lines = [...changedLines];
  if (!lines.length) return 100;
  if (!file) return 0;
  let covered = 0;
  for (const l of lines) if ((file.lines.get(l) ?? 0) > 0) covered++;
  return Math.round((covered / lines.length) * 1000) / 10;
}
