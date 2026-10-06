import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_POLICY, normalizeDecision, type AiProviderConfig, type AnalysisPolicy, type Approval, type Decision, type DriftEvent, type IssueType, type ProjectContext, type SemanticOutput, type Snapshot } from '@ci/core';

export interface Settings {
  mode: 'demo' | 'live';
  project: { key: string; name: string };
  integrations: {
    jira: { enabled: boolean; baseUrl: string; email: string; projectKey: string; acceptanceCriteriaField?: string; jqlFilter?: string; issueTypeMap?: Record<string, IssueType> };
    confluence: { enabled: boolean; baseUrl: string; email: string; spaceKeys: string[] };
    figma: { enabled: boolean; fileKeys: string[] };
  };
  ai: AiProviderConfig & { runOn: 'every_analysis' | 'on_demand' };
  security: {
    organizationManagedAi: boolean;
    redactPersonalData: boolean;
    maxCharsPerSource: number;
    localCacheOnly: boolean;
    encryptStoredContext: boolean;
    auditAiDecisions: boolean;
    recordEvidenceSources: boolean;
  };
  schedule: {
    mode: 'on_demand' | 'interval' | 'continuous';
    intervalMinutes: number;
    onJiraChange: boolean;
    onConfluenceChange: boolean;
    onFigmaChange: boolean;
  };
  policy: AnalysisPolicy;
}

/** Shown in Settings (P1); unmapped Jira types still fall back to the core defaults and then to story. */
export const DEFAULT_JIRA_ISSUE_TYPES: Record<string, IssueType> = { Epic: 'epic', Feature: 'feature', Story: 'story' };

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
  kind: 'ai_call' | 'decision' | 'decision_removed' | 'decision_withdrawn' | 'approval' | 'approval_removed' | 'analysis' | 'settings' | 'webhook' | 'demo_change';
  actor: string;
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

  private async readJson<T>(name: string, fallback: T): Promise<T> {
    const p = join(this.dir, name);
    let raw: string;
    try {
      raw = await readFile(p, 'utf8');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
      throw new StoreReadError(name, (e as Error).message);
    }
    try {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.__enc) {
        const key = this.key();
        if (!key) throw new Error('the file is encrypted but CI_ENCRYPTION_KEY is not set');
        const d = createDecipheriv('aes-256-gcm', key, Buffer.from(parsed.iv, 'base64'));
        d.setAuthTag(Buffer.from(parsed.tag, 'base64'));
        return JSON.parse(Buffer.concat([d.update(Buffer.from(parsed.data, 'base64')), d.final()]).toString('utf8')) as T;
      }
      return parsed as T;
    } catch (e) {
      throw new StoreReadError(name, (e as Error).message);
    }
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
  private update<T>(name: string, fallback: T, fn: (current: T) => T | void, encrypted: boolean) {
    return this.serialized(async () => {
      const current = await this.readJson<T>(name, fallback);
      const next = (fn(current) ?? current) as T;
      await this.writeJson(name, next, encrypted && (await this.encrypt));
      return next;
    });
  }

  async settings(): Promise<Settings> {
    const s = await this.readJson<Partial<Settings>>('settings.json', {});
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
    return (await this.readJson<Decision[]>('decisions.json', [])).map(normalizeDecision);
  }
  updateDecisions(fn: (all: Decision[]) => Decision[] | void) {
    return this.update<Decision[]>('decisions.json', [], (all) => {
      const list = all.map(normalizeDecision);
      return fn(list) ?? list;
    }, true);
  }
  approvals() {
    return this.readJson<Approval[]>('approvals.json', []);
  }
  updateApprovals(fn: (all: Approval[]) => Approval[] | void) {
    return this.update<Approval[]>('approvals.json', [], fn, true);
  }
  snapshot() {
    return this.readJson<Snapshot | null>('snapshot.json', null);
  }
  async saveSnapshot(s: Snapshot) {
    return this.write('snapshot.json', s, await this.encrypt);
  }
  demoContext() {
    return this.readJson<ProjectContext | null>('demo-context.json', null);
  }
  saveDemoContext(c: ProjectContext | null) {
    return this.write('demo-context.json', c);
  }
  updateDemoContext(fn: (c: ProjectContext | null) => ProjectContext | null | void) {
    return this.update<ProjectContext | null>('demo-context.json', null, fn, false);
  }
  async aiCache(): Promise<Map<string, SemanticOutput>> {
    try {
      return new Map(Object.entries(await this.readJson<Record<string, SemanticOutput>>('ai-cache.json', {})));
    } catch (e) {
      // A cache can always be rebuilt; losing it only costs extra AI calls.
      console.warn(`[store] ${(e as Error).message} Starting with an empty AI cache.`);
      return new Map();
    }
  }
  async saveAiCache(m: Map<string, SemanticOutput>) {
    return this.write('ai-cache.json', Object.fromEntries([...m].slice(-2000)), await this.encrypt);
  }
  driftLog() {
    return this.readJson<DriftEvent[]>('drift.json', []);
  }
  appendDriftLog(events: DriftEvent[]) {
    return this.update<DriftEvent[]>('drift.json', [], (d) => [...d, ...events].slice(-1000), false);
  }
  history() {
    return this.readJson<HistoryPoint[]>('history.json', []);
  }
  appendHistory(point: HistoryPoint) {
    return this.update<HistoryPoint[]>('history.json', [], (h) => [...h, point].slice(-200), false);
  }

  async audit(e: AuditEntry) {
    await appendFile(join(this.dir, 'audit.jsonl'), JSON.stringify(e) + '\n');
  }
  async auditLog(limit = 300): Promise<AuditEntry[]> {
    const p = join(this.dir, 'audit.jsonl');
    if (!existsSync(p)) return [];
    const lines = (await readFile(p, 'utf8')).trim().split('\n').filter(Boolean);
    return lines.slice(-limit).reverse().map((l) => JSON.parse(l) as AuditEntry);
  }
}

export function deepMerge<T extends Record<string, any>>(base: T, patch: Record<string, any>): T {
  for (const [k, v] of Object.entries(patch ?? {})) {
    // JSON.parse turns "__proto__" into an own key; merging it would pollute Object.prototype.
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) deepMerge(base[k], v);
    else if (v !== undefined) (base as any)[k] = v;
  }
  return base;
}
