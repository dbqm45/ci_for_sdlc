import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_POLICY, errorMessage, normalizeDecision, type Approval, type Decision, type StoredDecision, type DriftEvent, type IssueType, type PdiEvent, type ProjectContext, type SemanticOutput, type Settings, type Snapshot } from '@ci/core';
import type { Principal } from './http.js';
import { pruneToSchema, settingsBody } from './schemas.js';

export type { Settings };

const isErrno = (e: unknown): e is NodeJS.ErrnoException => e instanceof Error && 'code' in e;

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Top-level shape checks for state files; deeper fields are normalized by their readers. */
type Shape<T> = (v: unknown) => v is T;
const anyJson: Shape<unknown> = (_v): _v is unknown => true;
const listOf = <T>(): Shape<T[]> => (v): v is T[] => Array.isArray(v);
const recordOf = <T>(): Shape<Record<string, T>> => (v): v is Record<string, T> => isRecord(v);
const recordOrNull = <T extends object>(): Shape<T | null> => (v): v is T | null => v === null || isRecord(v);

interface EncEnvelope {
  __enc: number;
  iv: string;
  tag: string;
  data: string;
}
const isEncrypted = (v: unknown): v is { __enc: unknown } => isRecord(v) && '__enc' in v && !!v.__enc;
const isEncEnvelope = (v: unknown): v is EncEnvelope =>
  isRecord(v) && typeof v.__enc === 'number' && typeof v.iv === 'string' && typeof v.tag === 'string' && typeof v.data === 'string';

/** Shown in Settings (P1); unmapped Jira types still fall back to the core defaults and then to story. */
export const DEFAULT_JIRA_ISSUE_TYPES: Record<string, IssueType> = { Epic: 'epic', Feature: 'feature', Story: 'story' };

export interface PdiState {
  sent: Record<string, string>;
  seen: string[];
}
const pdiStateShape: Shape<PdiState> = (v): v is PdiState => isRecord(v);
export interface PdiOutboxEntry {
  event: PdiEvent;
  attempts: number;
  nextAt: string;
  lastError?: string;
}

export const DEFAULT_SETTINGS: Settings = {
  mode: 'demo',
  project: { key: 'CHK', name: 'Checkout' },
  integrations: {
    jira: { enabled: false, baseUrl: '', email: '', projectKey: '' },
    confluence: { enabled: false, baseUrl: '', email: '', spaceKeys: [] },
    figma: { enabled: false, fileKeys: [] },
  },
  ai: { provider: 'none', model: '', effort: 'high', temperature: 0.2, runOn: 'on_demand' },
  security: {
    organizationManagedAi: true,
    redactPersonalData: true,
    maxCharsPerSource: 6000,
    localCacheOnly: true,
    encryptStoredContext: false,
    auditAiDecisions: true,
    recordEvidenceSources: true,
  },
  schedule: { mode: 'on_demand', intervalMinutes: 30, onJiraChange: true, onConfluenceChange: true, onFigmaChange: true },
  policy: DEFAULT_POLICY,
};

export interface AuditEntry {
  at: string;
  kind: 'ai_call' | 'decision' | 'decision_removed' | 'decision_withdrawn' | 'approval' | 'approval_removed' | 'analysis' | 'settings' | 'webhook' | 'demo_change' | 'connection' | 'pdi';
  /** A display name; `via` is how the change was authorized (admin token or a loopback client). */
  actor: string;
  via?: Principal;
  summary: string;
  details?: unknown;
}

export interface HistoryPoint {
  at: string;
  healthy: number;
  needsAttention: number;
  critical: number;
  readiness: number;
  specificationHealth: number;
  decisionDebt: number;
}

/** A state file exists but cannot be read, parsed or decrypted. */
export class StoreReadError extends Error {
  readonly statusCode = 500;
  constructor(readonly file: string, cause: string) {
    super(`Cannot read ${file}: ${cause}. The file was left untouched; fix it (or CI_ENCRYPTION_KEY) and retry.`);
    this.name = 'StoreReadError';
  }
}

/**
 * File-based persistence (local-first). Sensitive state (context snapshot,
 * decisions, AI cache) can be encrypted at rest with AES-256-GCM using
 * CI_ENCRYPTION_KEY.
 *
 * Fail-closed: a missing file yields the default value, but a file that exists
 * and cannot be read, parsed or decrypted throws StoreReadError instead of
 * being treated as empty (which would let the next write erase it). Only the
 * AI cache, which can always be rebuilt, falls back silently.
 *
 * Writes are serialized through one queue, and read-modify-write goes through
 * the update* methods so concurrent requests cannot overwrite each other.
 */
export class Store {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(readonly dir: string) {}

  async init() {
    await mkdir(this.dir, { recursive: true });
    await this.migrateSettings();
  }

  /** Rewrites settings.json from an older version without unknown or invalid fields (e.g. old secrets). */
  private async migrateSettings() {
    if (!existsSync(join(this.dir, 'settings.json'))) return;
    const raw = await this.readJson('settings.json', {}, anyJson);
    const pruned = pruneToSchema(raw, settingsBody) ?? {};
    const removed = removedPaths(raw, pruned);
    if (!removed.length) return;
    await this.write('settings.json', pruned);
    // Paths only: a removed field may hold an old secret.
    await this.audit({ at: new Date().toISOString(), kind: 'settings', actor: 'system', summary: 'Settings from an older version cleaned up on start', details: { removed } });
  }

  private key(): Buffer | undefined {
    const k = process.env.CI_ENCRYPTION_KEY;
    return k ? createHash('sha256').update(k).digest() : undefined;
  }

  /** Runs `fn` after every previously queued write has finished. */
  private serialized<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async readJson<T>(name: string, fallback: T, shape: Shape<T>): Promise<T> {
    const p = join(this.dir, name);
    let raw: string;
    try {
      raw = await readFile(p, 'utf8');
    } catch (e) {
      if (isErrno(e) && e.code === 'ENOENT') return fallback;
      throw new StoreReadError(name, errorMessage(e));
    }
    let value: unknown;
    try {
      value = this.decrypt(JSON.parse(raw));
    } catch (e) {
      throw new StoreReadError(name, errorMessage(e));
    }
    if (!shape(value)) throw new StoreReadError(name, 'unexpected content');
    return value;
  }

  private decrypt(parsed: unknown): unknown {
    if (!isEncrypted(parsed)) return parsed;
    if (!isEncEnvelope(parsed)) throw new Error('not a valid encrypted file');
    const key = this.key();
    if (!key) throw new Error('the file is encrypted but CI_ENCRYPTION_KEY is not set');
    const d = createDecipheriv('aes-256-gcm', key, Buffer.from(parsed.iv, 'base64'));
    d.setAuthTag(Buffer.from(parsed.tag, 'base64'));
    return JSON.parse(Buffer.concat([d.update(Buffer.from(parsed.data, 'base64')), d.final()]).toString('utf8'));
  }

  private async writeJson(name: string, value: unknown, encrypt = false) {
    let body = JSON.stringify(value, null, 2);
    if (encrypt) {
      const key = this.key();
      if (!key) throw new Error(`Refusing to write ${name} unencrypted: encryption at rest is on but CI_ENCRYPTION_KEY is not set`);
      const iv = randomBytes(12);
      const c = createCipheriv('aes-256-gcm', key, iv);
      const data = Buffer.concat([c.update(body, 'utf8'), c.final()]);
      body = JSON.stringify({ __enc: 1, iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), data: data.toString('base64') });
    }
    const p = join(this.dir, name);
    const tmp = `${p}.${randomBytes(6).toString('hex')}.tmp`;
    await writeFile(tmp, body);
    await rename(tmp, p);
  }

  private write(name: string, value: unknown, encrypt = false) {
    return this.serialized(() => this.writeJson(name, value, encrypt));
  }

  /** Read-modify-write under the write queue; `fn` may mutate and/or return the new value. */
  private update<T>(name: string, fallback: T, shape: Shape<T>, fn: (current: T) => T | void, encrypted: boolean) {
    return this.serialized(async () => {
      const current = await this.readJson(name, fallback, shape);
      const result = fn(current);
      const next = result === undefined ? current : result;
      await this.writeJson(name, next, encrypted && (await this.encrypt));
      return next;
    });
  }

  async settings(): Promise<Settings> {
    const s = (pruneToSchema(await this.readJson('settings.json', {}, anyJson), settingsBody) ?? {}) as Partial<Settings>;
    const merged = deepMerge(structuredClone(DEFAULT_SETTINGS), s) as Settings;
    // Kept out of DEFAULT_SETTINGS so a saved mapping replaces it instead of being merged with it.
    merged.integrations.jira.issueTypeMap ??= { ...DEFAULT_JIRA_ISSUE_TYPES };
    return merged;
  }
  saveSettings(s: Settings) {
    return this.write('settings.json', s);
  }

  private get encrypt() {
    return this.settings().then((s) => s.security.encryptStoredContext);
  }

  /** All decision versions, including superseded and withdrawn ones. */
  async decisions() {
    return (await this.readJson('decisions.json', [], listOf<StoredDecision>())).map(normalizeDecision);
  }
  updateDecisions(fn: (all: Decision[]) => Decision[] | void) {
    return this.update('decisions.json', [], listOf<StoredDecision>(), (all) => {
      const list = all.map(normalizeDecision);
      return fn(list) ?? list;
    }, true);
  }
  approvals() {
    return this.readJson('approvals.json', [], listOf<Approval>());
  }
  updateApprovals(fn: (all: Approval[]) => Approval[] | void) {
    return this.update('approvals.json', [], listOf<Approval>(), fn, true);
  }
  snapshot() {
    return this.readJson('snapshot.json', null, recordOrNull<Snapshot>());
  }
  async saveSnapshot(s: Snapshot) {
    return this.write('snapshot.json', s, await this.encrypt);
  }
  demoContext() {
    return this.readJson('demo-context.json', null, recordOrNull<ProjectContext>());
  }
  saveDemoContext(c: ProjectContext | null) {
    return this.write('demo-context.json', c);
  }
  updateDemoContext(fn: (c: ProjectContext | null) => ProjectContext | null | void) {
    return this.update('demo-context.json', null, recordOrNull<ProjectContext>(), fn, false);
  }
  async aiCache(): Promise<Map<string, SemanticOutput>> {
    try {
      return new Map(Object.entries(await this.readJson('ai-cache.json', {}, recordOf<SemanticOutput>())));
    } catch (e) {
      // A cache can always be rebuilt; losing it only costs extra AI calls.
      console.warn(`[store] ${errorMessage(e)} Starting with an empty AI cache.`);
      return new Map();
    }
  }
  async saveAiCache(m: Map<string, SemanticOutput>) {
    return this.write('ai-cache.json', Object.fromEntries([...m].slice(-2000)), await this.encrypt);
  }
  /** OAuth connections (refresh tokens): always encrypted with CI_ENCRYPTION_KEY, whatever the at-rest setting says. */
  connections() {
    return this.readJson('connections.json', {}, recordOf<unknown>());
  }
  updateConnections(fn: (all: Record<string, unknown>) => Record<string, unknown> | void) {
    return this.serialized(async () => {
      const current = await this.readJson('connections.json', {}, recordOf<unknown>());
      const next = fn(current) ?? current;
      await this.writeJson('connections.json', next, true);
      return next;
    });
  }
  driftLog() {
    return this.readJson('drift.json', [], listOf<DriftEvent>());
  }
  appendDriftLog(events: DriftEvent[]) {
    return this.update('drift.json', [], listOf<DriftEvent>(), (d) => [...d, ...events].slice(-1000), false);
  }
  history() {
    return this.readJson('history.json', [], listOf<HistoryPoint>());
  }
  appendHistory(point: HistoryPoint) {
    return this.update('history.json', [], listOf<HistoryPoint>(), (h) => [...h, point].slice(-200), false);
  }

  /** pdi link (F4): readiness last sent per change and the ids of gate.decided events already handled. */
  pdiState() {
    return this.readJson('pdi-state.json', { sent: {}, seen: [] }, pdiStateShape);
  }
  updatePdiState(fn: (s: PdiState) => PdiState | void) {
    return this.update('pdi-state.json', { sent: {}, seen: [] }, pdiStateShape, fn, false);
  }
  /** Events waiting for delivery to pdi, with their retry state. */
  pdiOutbox() {
    return this.readJson('pdi-outbox.json', [], listOf<PdiOutboxEntry>());
  }
  updatePdiOutbox(fn: (all: PdiOutboxEntry[]) => PdiOutboxEntry[] | void) {
    return this.update('pdi-outbox.json', [], listOf<PdiOutboxEntry>(), fn, false);
  }

  async audit(e: AuditEntry) {
    await appendFile(join(this.dir, 'audit.jsonl'), JSON.stringify(e) + '\n');
  }
  async auditLog(limit = 300): Promise<AuditEntry[]> {
    const p = join(this.dir, 'audit.jsonl');
    if (!existsSync(p)) return [];
    const lines = (await readFile(p, 'utf8')).trim().split('\n').filter(Boolean);
    // Append-only log: one torn or hand-edited line must not hide the rest.
    return lines.slice(-limit).reverse().flatMap((l) => {
      try {
        const entry: unknown = JSON.parse(l);
        return isRecord(entry) && typeof entry.at === 'string' && typeof entry.kind === 'string' ? [entry as unknown as AuditEntry] : [];
      } catch {
        return [];
      }
    });
  }
}

/** Dotted paths present in `before` but missing from `after` (a changed leaf counts as removed). */
export function removedPaths(before: unknown, after: unknown, prefix = ''): string[] {
  if (!isRecord(before)) return JSON.stringify(before) === JSON.stringify(after) ? [] : [prefix || '(root)'];
  if (!isRecord(after)) return [prefix || '(root)'];
  return Object.keys(before).flatMap((k) => {
    const path = prefix ? `${prefix}.${k}` : k;
    return Object.hasOwn(after, k) ? removedPaths(before[k], after[k], path) : [path];
  });
}

export function deepMerge<T extends object>(base: T, patch: object): T {
  const target = base as Record<string, unknown>;
  for (const [k, v] of Object.entries(patch ?? {})) {
    // JSON.parse turns "__proto__" into an own key; merging it would pollute Object.prototype.
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    const current = target[k];
    if (isRecord(v) && isRecord(current)) deepMerge(current, v);
    else if (v !== undefined) target[k] = v;
  }
  return base;
}
