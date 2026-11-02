import { readdir, readFile, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ScanResult } from '../model.js';

/**
 * Security scan results as SARIF 2.1.0 (Z8c, docs/SECURITY-SCAN-PLAN.md): what Semgrep, CodeQL and most scanners write,
 * and what scripts/npm-audit-sarif.mjs makes of `npm audit --json`. Read: per run the tool name and rules, per result
 * the rule, level, message, first location and CWE. A file that is not such a log, or a run that says it did not run,
 * is an error with the reason, never zero results: a scan that did not run is not a clean scan.
 */

export const MAX_SARIF_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_SARIF_RESULTS = 20_000;

export class SarifError extends Error {}

export interface SarifProblem {
  path: string;
  message: string;
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json | undefined => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : undefined);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);
const LEVELS = new Set(['error', 'warning', 'note', 'none']);
const firstLine = (s: string) => s.replace(/^\s+/, '').split(/\r?\n/)[0]!.trim().slice(0, 300);

/** `CWE-78: …` (Semgrep), `external/cwe/cwe-078` (CodeQL), `CWE-22` (properties.cwe). */
function cwesOf(...props: (Json | undefined)[]): number[] {
  const out = new Set<number>();
  for (const p of props) {
    const texts = [...arr(p?.tags), ...(Array.isArray(p?.cwe) ? p!.cwe : [p?.cwe])].filter((t): t is string => typeof t === 'string');
    for (const t of texts) {
      const m = /^(?:external\/cwe\/)?cwe[-:]?\s*0*(\d+)\b/i.exec(t.trim());
      if (m) out.add(Number(m[1]));
    }
  }
  return [...out].sort((a, b) => a - b);
}

/** A file URI or a path as a path relative to the repository root when it is inside it, with `/` separators. */
function pathOf(uri: string, base: string | undefined, root: string | undefined): string {
  let p = uri;
  if (base && !/^[a-z][a-z0-9+.-]*:/i.test(p) && !p.startsWith('/')) p = base.replace(/\/?$/, '/') + p;
  if (/^file:/i.test(p)) {
    try {
      p = fileURLToPath(p);
    } catch {
      p = p.replace(/^file:\/*/i, '/');
    }
  } else {
    try {
      p = decodeURIComponent(p);
    } catch {
      // kept as written
    }
  }
  if (root && isAbsolute(p)) {
    const rel = relative(root, p);
    if (rel && !rel.startsWith('..') && !isAbsolute(rel)) p = rel;
  }
  return p.split(sep).join('/').replace(/\\/g, '/').replace(/^(\.\/)+/, '');
}

/** Suppressed (`nosemgrep`, an accepted external suppression), unless some suppression is still under review or rejected. */
const suppressed = (r: Json) => {
  const s = arr(r.suppressions).map(obj);
  return s.length > 0 && !s.some((x) => x?.status === 'underReview' || x?.status === 'rejected');
};

/**
 * The results of one SARIF 2.1.0 log. Skipped: level `none`, a kind other than `fail`, suppressed results.
 *
 * @param text the log's content
 * @param report its path, kept on every result
 * @param opts `root`: the repository root that absolute paths are made relative to
 * @throws {SarifError} not JSON, not SARIF 2.1.0, a run that did not execute, a result without a rule, too many results
 */
export function parseSarif(text: string, report: string, opts: { root?: string } = {}): ScanResult[] {
  let doc: Json | undefined;
  try {
    doc = obj(JSON.parse(text));
  } catch {
    throw new SarifError('Not JSON');
  }
  if (!doc) throw new SarifError('Not JSON');
  if (doc.version !== '2.1.0') throw new SarifError(`Not SARIF 2.1.0: version is ${String(doc.version ?? 'missing')}`);
  if (!Array.isArray(doc.runs)) throw new SarifError('Not SARIF 2.1.0: no runs');
  const out: ScanResult[] = [];
  for (const run of doc.runs.map(obj)) {
    const driver = obj(obj(run?.tool)?.driver);
    const tool = str(driver?.name) ?? 'Scanner';
    for (const inv of arr(run?.invocations).map(obj)) {
      if (inv?.executionSuccessful !== false) continue;
      const why = arr(inv.toolExecutionNotifications)
        .map((n) => str(obj(obj(n)?.message)?.text))
        .find(Boolean);
      throw new SarifError(`The scan did not run (${tool})${why ? `: ${firstLine(why)}` : ''}`);
    }
    const rules = arr(driver?.rules).map(obj);
    const ruleById = new Map(rules.filter((r) => str(r?.id)).map((r) => [r!.id as string, r!]));
    const bases = obj(run?.originalUriBaseIds);
    for (const res of arr(run?.results).map(obj)) {
      if (!res) continue;
      if (str(res.kind) && res.kind !== 'fail') continue;
      if (suppressed(res)) continue;
      const ruleRef = obj(res.rule);
      const ruleId = str(res.ruleId) ?? str(ruleRef?.id);
      if (!ruleId) throw new SarifError('A result has no ruleId');
      const index = typeof res.ruleIndex === 'number' ? res.ruleIndex : typeof ruleRef?.index === 'number' ? ruleRef.index : undefined;
      const rule = (index !== undefined ? rules[index] : undefined) ?? ruleById.get(ruleId);
      const level = str(res.level) ?? str(obj(rule?.defaultConfiguration)?.level) ?? 'warning';
      if (!LEVELS.has(level) || level === 'none') continue;
      const loc = obj(obj(arr(res.locations)[0])?.physicalLocation);
      const art = obj(loc?.artifactLocation);
      const uri = str(art?.uri);
      const baseId = str(art?.uriBaseId);
      const base = baseId ? str(obj(bases?.[baseId])?.uri) : undefined;
      const line = obj(loc?.region)?.startLine;
      const helpUri = str(rule?.helpUri);
      out.push({
        tool,
        ruleId,
        level: level as ScanResult['level'],
        message: firstLine(str(obj(res.message)?.text) ?? str(obj(rule?.shortDescription)?.text) ?? ruleId),
        ...(uri && { path: pathOf(uri, base, opts.root) }),
        ...(typeof line === 'number' && line > 0 && { line }),
        cwes: cwesOf(obj(rule?.properties), obj(res.properties)),
        ...(helpUri && { helpUri }),
        report,
      });
      if (out.length > MAX_SARIF_RESULTS) throw new SarifError(`More than ${MAX_SARIF_RESULTS} results`);
    }
  }
  return out;
}

async function sarifFiles(path: string): Promise<string[]> {
  const info = await stat(path);
  if (!info.isDirectory()) return [path];
  const out: string[] = [];
  for (const e of await readdir(path, { withFileTypes: true })) {
    const p = join(path, e.name);
    if (e.isDirectory()) out.push(...(await sarifFiles(p)));
    else if (/\.sarif(\.json)?$/i.test(e.name)) out.push(p);
  }
  return out.sort();
}

/**
 * The results of SARIF files and of the `*.sarif` / `*.sarif.json` files under directories. A file that cannot be
 * read, and a directory with no such file, is a problem with its path and the reason; the others are still read.
 * `reports` counts the files read.
 *
 * @param paths files or directories
 * @param opts `root`: the repository root that absolute paths are made relative to
 */
export async function readSarif(paths: string[], opts: { root?: string } = {}): Promise<{ results: ScanResult[]; problems: SarifProblem[]; reports: number }> {
  const results: ScanResult[] = [];
  const problems: SarifProblem[] = [];
  let reports = 0;
  for (const root of paths) {
    let files: string[];
    try {
      files = await sarifFiles(root);
    } catch {
      problems.push({ path: root, message: 'Cannot read the file' });
      continue;
    }
    if (!files.length) problems.push({ path: root, message: 'No *.sarif file' });
    for (const file of files) {
      try {
        if ((await stat(file)).size > MAX_SARIF_FILE_BYTES) throw new SarifError(`Larger than ${MAX_SARIF_FILE_BYTES / 1024 / 1024} MB`);
        const read = parseSarif(await readFile(file, 'utf8'), file, opts);
        if (results.length + read.length > MAX_SARIF_RESULTS) throw new SarifError(`More than ${MAX_SARIF_RESULTS} results in all reports`);
        results.push(...read);
        reports++;
      } catch (e) {
        problems.push({ path: file, message: e instanceof SarifError ? e.message : 'Cannot read the file' });
      }
    }
  }
  problems.sort((a, b) => a.path.localeCompare(b.path));
  return { results, problems, reports };
}
