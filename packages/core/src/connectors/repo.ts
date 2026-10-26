import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { RequirementItem } from '../model.js';
import { isRecord, records, str } from '../guards.js';
import { CHANGE_LABEL_PREFIX } from '../pdi.js';

/**
 * Connector for changes kept in a repository (pdi plan "one SDLC flow", step F2; docs/PDI-F2-PLAN.md):
 * `docs/project/changes/CHG-n/` with `intent.md`, `plan.md` and `release.yaml` as tf writes them (pdi contract 0.5.0),
 * read from a checkout. A change is an epic; its slices (TSK) are stories under it, with the release line and flags
 * of `release.yaml` (else of the plan's columns), so the release rules REL-001…006 work on it as on a Jira epic. Every
 * item is labelled `change:CHG-n`, so the change's readiness goes to pdi as in Jira mode (F4). A file that cannot be
 * read is a problem naming the file and why, never its content, and only that change is left out.
 */

export const CHANGES_DIR = 'docs/project/changes';
/** A change file is a page of text; anything larger is not one. */
export const MAX_CHANGE_FILE_BYTES = 256 * 1024;
export const MAX_CHANGES = 200;

const KEY = /^[A-Z][A-Z0-9]+-[0-9]+$/;
const LINE = /^R[0-9]+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TASK_STATUSES = ['planned', 'in_progress', 'in_review', 'done', 'dropped'] as const;
const FILES = ['intent.md', 'plan.md', 'release.yaml'] as const;
type ChangeFile = (typeof FILES)[number];

/** A change file that cannot be used: `file` is its name in the change's folder; the message never quotes it. */
export class RepoFileError extends Error {
  constructor(
    readonly file: ChangeFile,
    message: string,
  ) {
    super(message);
  }
}

export interface RepoProblem {
  /** The file, relative to the repository root. */
  path: string;
  message: string;
}

export interface RepoChanges {
  requirements: RequirementItem[];
  problems: RepoProblem[];
}

/** The YAML header (`---` … `---`) and the body after it. */
function frontMatter(text: string, file: ChangeFile): { header: Record<string, unknown>; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!m) throw new RepoFileError(file, 'no YAML header (--- … ---) at the top');
  let header: unknown;
  try {
    header = parseYaml(m[1] ?? '');
  } catch {
    throw new RepoFileError(file, 'the header is not valid YAML');
  }
  if (!isRecord(header)) throw new RepoFileError(file, 'the header is not a YAML mapping');
  return { header, body: m[2] ?? '' };
}

function checkHeader(header: Record<string, unknown>, file: ChangeFile, folder: string): void {
  const change = str(header.change);
  if (change !== folder) throw new RepoFileError(file, `the header names change ${change ?? '(none)'}, but the folder is ${folder}`);
}

/** The lines of a `## <name>` section (any of `names`), until the next heading; template placeholders `<…>` left out. */
function section(body: string, names: RegExp): string[] {
  const lines = body.split(/\r?\n/);
  const start = lines.findIndex((l) => /^##\s+/.test(l) && names.test(l.replace(/^##\s+/, '').trim()));
  if (start < 0) return [];
  const out: string[] = [];
  for (const l of lines.slice(start + 1)) {
    if (/^#{1,6}\s/.test(l)) break;
    const text = l.replace(/^\s*[-*]\s+/, '').trim();
    if (text && !/^<.*>$/.test(text)) out.push(text);
  }
  return out;
}

interface PlanRow {
  key: string;
  line?: string;
  flags: string[];
  value?: string;
  verification?: string;
  status: (typeof TASK_STATUSES)[number];
}

const COLUMNS: Record<string, RegExp> = {
  key: /^(cięcie|ciecie|slice|task|tsk)$/i,
  line: /^(wydanie|release|linia)$/i,
  flag: /^(flaga|flag|flags|flagi)$/i,
  value: /^(wartość|wartosc|value|title|tytuł)$/i,
  verification: /^(weryfikacja|verification)$/i,
  status: /^status$/i,
};
const cells = (row: string) => row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
const NONE = /^(—|-|–|none|brak)?$/i;

/** The slices of plan.md's table: the first table whose header names a slice column. */
function planRows(body: string): PlanRow[] {
  const lines = body.split(/\r?\n/);
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i] ?? '';
    if (!line.trim().startsWith('|') || !/^\s*\|?\s*:?-{3,}/.test(lines[i + 1] ?? '')) continue;
    const head = cells(line);
    const col: Record<string, number> = Object.fromEntries(Object.entries(COLUMNS).map(([k, re]) => [k, head.findIndex((h) => re.test(h))]));
    if ((col.key ?? -1) < 0) continue;
    const rows: PlanRow[] = [];
    for (const l of lines.slice(i + 2)) {
      if (!l.trim().startsWith('|')) break;
      const c = cells(l);
      const at = (k: string) => {
        const idx = col[k] ?? -1;
        return (idx >= 0 ? c[idx]?.trim() : undefined) || undefined;
      };
      const key = at('key');
      if (!key || !KEY.test(key)) continue;
      const line = at('line');
      const status = at('status')?.toLowerCase().replace(/\s+/g, '_');
      rows.push({
        key,
        line: line && LINE.test(line) ? line : undefined,
        flags: (at('flag') ?? '').split(/[,;\s]+/).filter((f) => f && !NONE.test(f)),
        value: at('value'),
        verification: at('verification'),
        status: TASK_STATUSES.find((s) => s === status) ?? 'planned',
      });
    }
    return rows;
  }
  return [];
}

interface ReleasePlan {
  mvp?: { release: string; outcome?: string; metric?: { name: string; target: string; horizon_days?: number }; guardrails: string[] };
  releases: { id: string; tasks: string[] }[];
  flags: { key: string; tasks: string[] }[];
}

/** release.yaml checked on the fields this connector reads (the contract's release-plan schema for them). */
function releasePlan(text: string, folder: string): ReleasePlan {
  const fail = (msg: string): never => {
    throw new RepoFileError('release.yaml', msg);
  };
  let doc: unknown;
  try {
    doc = parseYaml(text);
  } catch {
    fail('not valid YAML');
  }
  if (!isRecord(doc)) return fail('not a YAML mapping');
  if (!Array.isArray(doc.releases) || !doc.releases.length) fail('releases: a list of at least one line is required');
  const keys = (v: unknown, where: string) => {
    if (!Array.isArray(v)) fail(`${where}: a list of keys is required`);
    return (v as unknown[]).map((k, i) => (typeof k === 'string' && KEY.test(k) ? k : fail(`${where}[${i}]: not a key like TSK-57`)));
  };
  const releases = (doc.releases as unknown[]).map((r, i) => {
    if (!isRecord(r)) return fail(`releases[${i}]: not a mapping`);
    const id = str(r.id);
    if (!id || !LINE.test(id)) fail(`releases[${i}].id: not a line like R1`);
    return { id: id!, tasks: keys(r.tasks, `releases[${i}].tasks`) };
  });
  if (doc.change !== folder) fail(`change is ${str(doc.change) ?? '(none)'}, not ${folder}`);
  let mvp: ReleasePlan['mvp'];
  if (doc.mvp !== undefined) {
    if (!isRecord(doc.mvp) || !LINE.test(str(doc.mvp.release) ?? '')) fail('mvp.release: not a line like R1');
    const m = doc.mvp as Record<string, unknown>;
    let metric: { name: string; target: string; horizon_days?: number } | undefined;
    if (m.metric !== undefined) {
      if (!isRecord(m.metric) || !str(m.metric.name) || !str(m.metric.target)) fail('mvp.metric: name and target are required');
      const met = m.metric as Record<string, unknown>;
      const horizon = met.horizon_days;
      if (horizon !== undefined && !(Number.isInteger(horizon) && (horizon as number) >= 1)) fail('mvp.metric.horizon_days: a whole number of days');
      metric = { name: str(met.name)!, target: str(met.target)!, ...(horizon !== undefined && { horizon_days: horizon as number }) };
    }
    mvp = { release: str(m.release)!, outcome: str(m.outcome), metric, guardrails: Array.isArray(m.guardrails) ? (m.guardrails as unknown[]).filter((g): g is string => typeof g === 'string') : [] };
  }
  if (doc.flags !== undefined && !Array.isArray(doc.flags)) fail('flags: not a list');
  const flags = ((doc.flags as unknown[] | undefined) ?? []).map((f, i) => {
    if (!isRecord(f) || !str(f.key)) return fail(`flags[${i}].key: required`);
    if (f.remove_by !== undefined && !DATE.test(String(f.remove_by))) fail(`flags[${i}].remove_by: not a day YYYY-MM-DD`);
    if (f.rollout !== undefined && (!Array.isArray(f.rollout) || records(f.rollout).length !== f.rollout.length || !records(f.rollout).every((s) => str(s.stage)))) fail(`flags[${i}].rollout: each stage needs a name`);
    return { key: str(f.key)!, tasks: f.tasks === undefined ? [] : keys(f.tasks, `flags[${i}].tasks`) };
  });
  return { mvp, releases, flags };
}

/** The MVP as one paragraph REL-002 reads: outcome, metric with threshold and horizon, guardrails. */
function mvpText(mvp: NonNullable<ReleasePlan['mvp']>): string | undefined {
  const parts = [
    mvp.outcome && `${mvp.outcome.replace(/\.$/, '')}.`,
    mvp.metric && `Metric ${mvp.metric.name} ${mvp.metric.target}${mvp.metric.horizon_days ? ` within ${mvp.metric.horizon_days} days` : ''}.`,
    mvp.guardrails.length ? `Guardrails: ${mvp.guardrails.join(', ')}.` : undefined,
  ].filter(Boolean);
  return parts.length ? parts.join(' ') : undefined;
}

/**
 * One change's items: the change as an epic first, then its slices in plan order (slices only in release.yaml after).
 *
 * @throws {RepoFileError} a file that cannot be used
 */
export function parseChange(folder: string, files: { intent: string; plan?: string; release?: string }, opts: { urlOf?: (file: ChangeFile) => string | undefined } = {}): RequirementItem[] {
  const intent = frontMatter(files.intent, 'intent.md');
  checkHeader(intent.header, 'intent.md', folder);
  const plan = files.plan === undefined ? undefined : frontMatter(files.plan, 'plan.md');
  if (plan) checkHeader(plan.header, 'plan.md', folder);
  const release = files.release === undefined ? undefined : releasePlan(files.release, folder);

  const label = `${CHANGE_LABEL_PREFIX}${folder}`;
  const updatedAt = (h: Record<string, unknown>) => (DATE.test(String(h.updated ?? h.created ?? '')) ? `${String(h.updated ?? h.created)}T00:00:00.000Z` : new Date(0).toISOString());
  const base = { acceptanceCriteria: [], businessRules: [], labels: [label], components: [], links: [], remoteLinks: [] };
  const title = /^#\s+(.+)$/m.exec(intent.body)?.[1]?.trim() || folder;
  const metrics = section(intent.body, /^(metryki sukcesu|success metrics|metryki|metrics)$/i);
  const mvp = (release?.mvp && mvpText(release.mvp)) ?? (metrics.length ? metrics.join(' ') : undefined);
  const intentUrl = opts.urlOf?.('intent.md');
  const epic: RequirementItem = {
    ...base,
    key: folder,
    type: 'epic',
    title,
    description: intent.body.trim(),
    status: str(intent.header.status) ?? 'draft',
    ...(mvp && { mvp }),
    updatedAt: updatedAt(intent.header),
    ...(intentUrl && { url: intentUrl }),
  };

  const lineOf = new Map<string, string>();
  for (const r of release?.releases ?? []) for (const t of r.tasks) if (!lineOf.has(t)) lineOf.set(t, r.id);
  const flagsOf = new Map<string, string[]>();
  for (const f of release?.flags ?? []) for (const t of f.tasks) flagsOf.set(t, [...(flagsOf.get(t) ?? []), f.key]);
  const rows = plan ? planRows(plan.body) : [];
  const planUrl = opts.urlOf?.('plan.md');
  const releaseUrl = opts.urlOf?.('release.yaml');
  const story = (row: PlanRow | undefined, key: string): RequirementItem => ({
    ...base,
    labels: [label],
    key,
    type: 'story',
    title: row?.value || key,
    description: row?.value ?? '',
    acceptanceCriteria: row?.verification && !/^<.*>$/.test(row.verification) ? [row.verification] : [],
    status: row?.status ?? 'planned',
    epicKey: folder,
    parentKey: folder,
    releaseLine: release ? lineOf.get(key) : row?.line,
    flagKeys: release ? flagsOf.get(key) ?? [] : row?.flags ?? [],
    updatedAt: updatedAt(plan?.header ?? intent.header),
    ...((row ? planUrl : releaseUrl) && { url: row ? planUrl : releaseUrl }),
  });
  const stories = rows.filter((r) => r.status !== 'dropped').map((r) => story(r, r.key));
  const listed = new Set(rows.map((r) => r.key));
  for (const key of lineOf.keys()) if (!listed.has(key)) stories.push(story(undefined, key));
  return [epic, ...stories];
}

async function readSmall(path: string): Promise<string | undefined> {
  let size: number;
  try {
    size = (await stat(path)).size;
  } catch {
    return undefined;
  }
  if (size > MAX_CHANGE_FILE_BYTES) throw new Error(`larger than ${MAX_CHANGE_FILE_BYTES / 1024} KB`);
  return readFile(path, 'utf8');
}

/**
 * Every change under `<root>/docs/project/changes`, in key order. `repoUrl` (e.g. https://github.com/acme/pay) links
 * each item to its file on the default branch.
 *
 * @throws {Error} when the folder does not exist
 */
export async function readRepoChanges(root: string, opts: { repoUrl?: string } = {}): Promise<RepoChanges> {
  const dir = join(root, CHANGES_DIR);
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    throw new Error(`no ${CHANGES_DIR} folder in ${root}`);
  }
  const base = opts.repoUrl?.replace(/\/+$/, '');
  const folders = entries.filter((e) => e.isDirectory() && KEY.test(e.name)).map((e) => e.name);
  folders.sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  const requirements: RequirementItem[] = [];
  const problems: RepoProblem[] = [];
  if (folders.length > MAX_CHANGES) problems.push({ path: CHANGES_DIR, message: `more than ${MAX_CHANGES} changes; only the first ${MAX_CHANGES} were read` });
  for (const folder of folders.slice(0, MAX_CHANGES)) {
    const rel = (file: string) => `${CHANGES_DIR}/${folder}/${file}`;
    const texts: Partial<Record<ChangeFile, string>> = {};
    try {
      for (const file of FILES) {
        try {
          texts[file] = await readSmall(join(dir, folder, file));
        } catch (err) {
          throw new RepoFileError(file, (err as Error).message);
        }
      }
      if (texts['intent.md'] === undefined) throw new RepoFileError('intent.md', 'missing: a change needs its intent.md');
      const urlOf = (file: ChangeFile) => (base && /^https:\/\//.test(base) ? `${base}/blob/HEAD/${rel(file).split('/').map(encodeURIComponent).join('/')}` : undefined);
      requirements.push(...parseChange(folder, { intent: texts['intent.md'], plan: texts['plan.md'], release: texts['release.yaml'] }, { urlOf }));
    } catch (err) {
      if (!(err instanceof RepoFileError)) throw err;
      problems.push({ path: rel(err.file), message: err.message });
    }
  }
  return { requirements, problems };
}
