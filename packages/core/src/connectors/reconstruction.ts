import { readFile, stat } from 'node:fs/promises';
import type { CodeFacts, DocumentItem } from '../model.js';
import { isRecord, oneOf, records, str } from '../guards.js';

/**
 * Connector for tf's reconstruction from code (pdi plan "one SDLC flow", step F2): `reconstruction.json`, written by
 * tf's `recon_export.py` next to `rules.md`, `requirements.md` and `domain.md` (format `tf-reconstruction`, version 1,
 * schema in test/fixtures/tf-reconstruction). Each rule, requirement and domain term becomes a document with
 * `source: 'code'`: the current state of the code, so CON-001 can report "the specification says X, the code does Y"
 * without ci_for_sdlc reading code itself. Only items backed by evidence that was not refuted (`verified: false`) carry
 * claims (analysis/context.ts); assumptions and questions are context only.
 */

export const RECONSTRUCTION_FORMAT = 'tf-reconstruction';
export const RECONSTRUCTION_VERSION = 1;
/** A reconstruction is a summary of the code; anything larger is not one. */
export const MAX_RECONSTRUCTION_BYTES = 5_000_000;

const KINDS = ['rules', 'requirements', 'domain'] as const;
const STATUSES = ['evidence', 'assumption', 'unverified', 'question'] as const;

export interface Reconstruction {
  generatedAt: string;
  commit: string | null;
  modules: { module: string; purpose: string | null }[];
  items: (CodeFacts & { id: string; text: string; section: string | null; source: string })[];
}

/** Errors name the field, never the file's content. */
export class ReconstructionError extends Error {}

const positive = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 1;

/** Checks the fields ci_for_sdlc reads and returns them typed; anything else in the file is ignored. */
export function parseReconstruction(json: unknown): Reconstruction {
  if (!isRecord(json) || json.format !== RECONSTRUCTION_FORMAT) throw new ReconstructionError(`not a ${RECONSTRUCTION_FORMAT} export (field "format")`);
  if (json.format_version !== RECONSTRUCTION_VERSION) throw new ReconstructionError(`unsupported format_version (expected ${RECONSTRUCTION_VERSION})`);
  const commit = json.commit === null ? null : str(json.commit);
  if (commit === undefined) throw new ReconstructionError('field "commit" must be a string or null');
  const items: Reconstruction['items'] = [];
  for (const kind of KINDS) {
    if (!Array.isArray(json[kind])) throw new ReconstructionError(`field "${kind}" must be a list`);
    records(json[kind]).forEach((it, i) => {
      const where = `${kind}[${i}]`;
      const id = str(it.id);
      const text = str(it.text);
      if (!id || !text?.trim()) throw new ReconstructionError(`${where}: "id" and "text" are required`);
      if (!oneOf(STATUSES, it.status)) throw new ReconstructionError(`${where}: unknown "status"`);
      if (!Array.isArray(it.evidence)) throw new ReconstructionError(`${where}: "evidence" must be a list`);
      const evidence = records(it.evidence).map((e, j) => {
        const path = str(e.path);
        if (!path || !positive(e.line) || !positive(e.line_end)) throw new ReconstructionError(`${where}.evidence[${j}]: "path", "line" and "line_end" are required`);
        return { path, line: e.line, lineEnd: e.line_end, ...(typeof e.verified === 'boolean' && { verified: e.verified }) };
      });
      const quote = str(it.quote);
      const confidence = str(it.confidence);
      items.push({
        id,
        kind,
        text: text.trim(),
        section: str(it.section) ?? null,
        module: str(it.module) ?? null,
        status: it.status,
        evidence,
        ...(quote && { quote }),
        ...(confidence && { confidence }),
        commit,
        source: str(it.source) ?? '',
      });
    });
  }
  const modules = records(json.modules).flatMap((m) => (str(m.module) ? [{ module: str(m.module)!, purpose: str(m.purpose) ?? null }] : []));
  return { generatedAt: str(json.generated_at) ?? '', commit, modules, items };
}

/** True when the item may state facts: backed by evidence, none of it refuted by tf's check against the code. */
export const isClaimable = (c: CodeFacts) => c.status === 'evidence' && c.evidence.length > 0 && c.evidence.every((e) => e.verified !== false);

const KIND_LABELS: Record<CodeFacts['kind'], string> = { rules: 'Rule', requirements: 'Requirement', domain: 'Term' };
const where = (e: CodeFacts['evidence'][number]) => `${e.path}:${e.line}${e.lineEnd > e.line ? `-${e.lineEnd}` : ''}`;

/**
 * One document per item. `repoUrl` (e.g. https://github.com/acme/shop) turns the first evidence into a link to that
 * commit's file and lines.
 */
export function reconstructionToDocuments(r: Reconstruction, opts: { repoUrl?: string } = {}): DocumentItem[] {
  const base = opts.repoUrl?.replace(/\/+$/, '');
  return r.items.map(({ id, text, section, source: _source, ...facts }) => {
    const first = facts.evidence[0];
    const lines = facts.evidence.map(where);
    const url = base && first && /^https:\/\//.test(base) ? `${base}/blob/${r.commit ?? 'HEAD'}/${first.path.split('/').map(encodeURIComponent).join('/')}#L${first.line}${first.lineEnd > first.line ? `-L${first.lineEnd}` : ''}` : undefined;
    return {
      id,
      source: 'code' as const,
      title: `${KIND_LABELS[facts.kind]}: ${text.length > 80 ? `${text.slice(0, 79)}…` : text}`,
      space: 'code',
      body: [text, facts.quote && `Code: "${facts.quote}"`, lines.length ? `Evidence: ${lines.join(', ')}` : `Status: ${facts.status}`].filter(Boolean).join('\n'),
      labels: [facts.module ?? section ?? 'general'],
      updatedAt: r.generatedAt ? `${r.generatedAt}T00:00:00.000Z` : new Date(0).toISOString(),
      ...(url && { url }),
      code: facts,
    };
  });
}

/** Reads and converts `reconstruction.json` from disk. Errors name the problem, never the file's content. */
export async function readReconstruction(path: string, opts: { repoUrl?: string } = {}): Promise<DocumentItem[]> {
  if (!path.endsWith('.json')) throw new ReconstructionError('the reconstruction path must point to a .json file');
  const size = (await stat(path)).size;
  if (size > MAX_RECONSTRUCTION_BYTES) throw new ReconstructionError(`reconstruction file is larger than ${MAX_RECONSTRUCTION_BYTES} bytes`);
  let json: unknown;
  try {
    json = JSON.parse(await readFile(path, 'utf8'));
  } catch {
    throw new ReconstructionError('reconstruction file is not valid JSON');
  }
  return reconstructionToDocuments(parseReconstruction(json), opts);
}
