import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { isRecord, str } from '../guards.js';
import type { ApiOperationFacts, DocumentItem } from '../model.js';

/**
 * OpenAPI 3.x contracts as a source (docs/OPENAPI-PLAN.md). Each operation becomes a document with `source: 'api'`, the
 * facts of the contract (`api`) and a body that summarizes them in sentences: people read it, the AI reviewer gets it,
 * and the claim extractors already understand "202 Accepted", "Idempotency-Key" and "at most N items". Only local
 * `$ref`s (`#/…`) are resolved; a file that is not an OpenAPI 3 document is an error with the reason, never zero
 * operations.
 */

export const MAX_OPENAPI_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_API_OPERATIONS = 5_000;

export class OpenApiError extends Error {}

export interface OpenApiProblem {
  path: string;
  message: string;
}

const METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'] as const;
const KEY = /^[A-Z][A-Z0-9]+-\d+$/;
const REASONS: Record<string, string> = { '200': 'OK', '201': 'Created', '202': 'Accepted', '204': 'No Content' };

type Json = Record<string, unknown>;

/** Follows a local `$ref` (`#/components/…`) chain; an external or broken one gives undefined. */
function deref(doc: Json, value: unknown, depth = 0): Json | undefined {
  if (!isRecord(value)) return undefined;
  const ref = str(value.$ref);
  if (ref === undefined) return value;
  if (!ref.startsWith('#/') || depth > 20) return undefined;
  let node: unknown = doc;
  for (const part of ref.slice(2).split('/')) node = isRecord(node) ? node[part.replace(/~1/g, '/').replace(/~0/g, '~')] : undefined;
  return deref(doc, node, depth + 1);
}

/** The largest `maxItems` of an array at the top of the schema or one level of properties down. */
function maxItemsOf(doc: Json, schema: unknown): number | undefined {
  const s = deref(doc, schema);
  if (!s) return undefined;
  const own = s.type === 'array' && typeof s.maxItems === 'number' ? [s.maxItems] : [];
  const props = isRecord(s.properties) ? Object.values(s.properties).map((p) => deref(doc, p)) : [];
  const nested = props.flatMap((p) => (p?.type === 'array' && typeof p.maxItems === 'number' ? [p.maxItems] : []));
  const all = [...own, ...nested];
  return all.length ? Math.max(...all) : undefined;
}

const keysOf = (v: unknown): string[] => (Array.isArray(v) ? v : typeof v === 'string' ? [v] : []).filter((k): k is string => typeof k === 'string' && KEY.test(k));

function summary(f: ApiOperationFacts, title: string, description: string | undefined): string {
  const lines = [`${title}.`];
  if (description) lines.push(description.trim());
  const ok = f.successCodes.map((c) => `${c}${REASONS[c] ? ` ${REASONS[c]}` : ''}`);
  if (ok.length) lines.push(`Responds ${ok.join(', ')}${f.successCodes.includes('202') ? ': the request is processed asynchronously' : ''}.`);
  if (f.idempotencyKey) lines.push('Requests carry an Idempotency-Key header.');
  if (f.maxItems !== undefined) lines.push(`At most ${f.maxItems} items per request.`);
  if (f.errorCodes.length) lines.push(`Errors: ${f.errorCodes.map((e) => `${e.code}${e.description ? ` ${e.description}` : ''}`).join('; ')}.`);
  if (f.requirements.length) lines.push(`Requirements: ${f.requirements.join(', ')}.`);
  return lines.join('\n');
}

/**
 * The operations of one OpenAPI 3.x file (JSON or YAML).
 *
 * @param text the file's content
 * @param file its path, kept in each operation's id and facts
 * @param opts `updatedAt` of the documents (the file's modification time)
 */
export function parseOpenApi(text: string, file: string, opts: { updatedAt: string }): DocumentItem[] {
  let doc: unknown;
  try {
    doc = parseYaml(text, { maxAliasCount: 100 });
  } catch {
    throw new OpenApiError('The file is not valid JSON or YAML');
  }
  if (isRecord(doc) && doc.swagger !== undefined) throw new OpenApiError('Swagger 2.0 is not supported; convert the file to OpenAPI 3');
  if (!isRecord(doc) || typeof doc.openapi !== 'string' || !doc.openapi.startsWith('3.')) throw new OpenApiError('The file is not an OpenAPI 3 document (field "openapi")');
  const info = isRecord(doc.info) ? doc.info : {};
  const specTitle = str(info.title) ?? file;
  const spec = [specTitle, str(info.version)].filter(Boolean).join(' ');
  const out: DocumentItem[] = [];
  for (const [path, rawItem] of Object.entries(isRecord(doc.paths) ? doc.paths : {})) {
    const item = deref(doc, rawItem);
    if (!item) continue;
    const shared = Array.isArray(item.parameters) ? item.parameters : [];
    for (const m of METHODS) {
      const operation = deref(doc, item[m]);
      if (!operation) continue;
      const params = [...shared, ...(Array.isArray(operation.parameters) ? operation.parameters : [])].map((p) => deref(doc, p)).filter((p): p is Json => !!p);
      const responses = isRecord(operation.responses) ? operation.responses : {};
      const codes = Object.keys(responses);
      const body = deref(doc, operation.requestBody);
      const media = isRecord(body?.content) ? Object.values(body.content).map((c) => (isRecord(c) ? c.schema : undefined)) : [];
      const maxItems = media.map((s) => maxItemsOf(doc as Json, s)).find((n) => n !== undefined);
      const description = str(operation.description);
      const facts: ApiOperationFacts = {
        file,
        spec,
        method: m.toUpperCase(),
        path,
        ...(str(operation.operationId) && { operationId: str(operation.operationId) }),
        successCodes: codes.filter((c) => /^2/.test(c)),
        errorCodes: codes.filter((c) => /^[45]/.test(c)).map((code) => ({ code, description: str(deref(doc as Json, responses[code])?.description)?.trim() ?? '' })),
        idempotencyKey: params.some((p) => p.in === 'header' && typeof p.name === 'string' && p.name.toLowerCase() === 'idempotency-key'),
        ...(maxItems !== undefined && { maxItems }),
        requirements: [...new Set([...keysOf(operation['x-requirements']), ...keysOf(operation['x-jira'])])],
      };
      const title = `${facts.method} ${path}${str(operation.summary) ? ` — ${str(operation.summary)!.trim()}` : ''}`;
      out.push({
        id: `${file}#${facts.method} ${path}`,
        title,
        space: specTitle,
        body: summary(facts, title, description),
        labels: Array.isArray(operation.tags) ? operation.tags.filter((t): t is string => typeof t === 'string') : [],
        updatedAt: opts.updatedAt,
        source: 'api',
        api: facts,
      });
      if (out.length > MAX_API_OPERATIONS) throw new OpenApiError(`More than ${MAX_API_OPERATIONS} operations`);
    }
  }
  if (!out.length) throw new OpenApiError('The file has no operations (field "paths")');
  return out;
}

async function specFiles(path: string): Promise<string[]> {
  const info = await stat(path);
  if (!info.isDirectory()) return [path];
  const out: string[] = [];
  for (const e of await readdir(path, { withFileTypes: true })) {
    const p = join(path, e.name);
    if (e.isDirectory()) out.push(...(await specFiles(p)));
    else if (/\.(json|ya?ml)$/i.test(e.name)) out.push(p);
  }
  return out.sort();
}

/**
 * The operations of OpenAPI files and of the `*.json`, `*.yaml` and `*.yml` files under directories. A file that cannot
 * be read is a problem with its path and the reason; the others are still read.
 *
 * @param paths files or directories
 */
export async function readOpenApi(paths: string[]): Promise<{ documents: DocumentItem[]; problems: OpenApiProblem[] }> {
  const documents: DocumentItem[] = [];
  const problems: OpenApiProblem[] = [];
  for (const root of paths) {
    let files: string[];
    try {
      files = await specFiles(root);
    } catch {
      problems.push({ path: root, message: 'File not found or not readable' });
      continue;
    }
    for (const file of files) {
      try {
        const info = await stat(file);
        if (info.size > MAX_OPENAPI_FILE_BYTES) throw new OpenApiError(`Larger than ${MAX_OPENAPI_FILE_BYTES / 1024 / 1024} MB`);
        documents.push(...parseOpenApi(await readFile(file, 'utf8'), file, { updatedAt: info.mtime.toISOString() }));
      } catch (e) {
        problems.push({ path: file, message: e instanceof OpenApiError ? e.message : 'Cannot read the file' });
      }
    }
  }
  problems.sort((a, b) => a.path.localeCompare(b.path));
  return { documents, problems };
}
