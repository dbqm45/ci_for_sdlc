import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_POLICY, type AiProviderConfig, type AnalysisPolicy, type Approval, type Decision, type DriftEvent, type ProjectContext, type SemanticOutput, type Snapshot } from '@ci/core';

export interface Settings {
  mode: 'demo' | 'live';
  project: { key: string; name: string };
  integrations: {
    jira: { enabled: boolean; baseUrl: string; email: string; projectKey: string; acceptanceCriteriaField?: string; jqlFilter?: string };
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
  kind: 'ai_call' | 'decision' | 'decision_removed' | 'approval' | 'approval_removed' | 'analysis' | 'settings' | 'webhook' | 'demo_change';
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

/**
 * File-based persistence (local-first). Sensitive state (context snapshot,
 * decisions, AI cache) can be encrypted at rest with AES-256-GCM using
 * CI_ENCRYPTION_KEY.
 */
export class Store {
  constructor(readonly dir: string) {}

  async init() {
    await mkdir(this.dir, { recursive: true });
  }

  private key(): Buffer | undefined {
    const k = process.env.CI_ENCRYPTION_KEY;
    return k ? createHash('sha256').update(k).digest() : undefined;
  }

  private async readJson<T>(name: string, fallback: T): Promise<T> {
    const p = join(this.dir, name);
    if (!existsSync(p)) return fallback;
    const raw = await readFile(p, 'utf8');
    try {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.__enc) {
        const key = this.key();
        if (!key) throw new Error(`${name} is encrypted but CI_ENCRYPTION_KEY is not set`);
        const d = createDecipheriv('aes-256-gcm', key, Buffer.from(parsed.iv, 'base64'));
        d.setAuthTag(Buffer.from(parsed.tag, 'base64'));
        return JSON.parse(Buffer.concat([d.update(Buffer.from(parsed.data, 'base64')), d.final()]).toString('utf8')) as T;
      }
      return parsed as T;
    } catch (e) {
      console.warn(`[store] could not read ${name}: ${(e as Error).message}`);
      return fallback;
    }
  }

  private async writeJson(name: string, value: unknown, encrypt = false) {
    let body = JSON.stringify(value, null, 2);
    const key = encrypt ? this.key() : undefined;
    if (key) {
      const iv = randomBytes(12);
      const c = createCipheriv('aes-256-gcm', key, iv);
      const data = Buffer.concat([c.update(body, 'utf8'), c.final()]);
      body = JSON.stringify({ __enc: 1, iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), data: data.toString('base64') });
    }
    const p = join(this.dir, name);
    await writeFile(`${p}.tmp`, body);
    await rename(`${p}.tmp`, p);
  }

  async settings(): Promise<Settings> {
    const s = await this.readJson<Partial<Settings>>('settings.json', {});
    return deepMerge(structuredClone(DEFAULT_SETTINGS), s) as Settings;
  }
  saveSettings(s: Settings) {
    return this.writeJson('settings.json', s);
  }

  private get encrypt() {
    return this.settings().then((s) => s.security.encryptStoredContext);
  }

  decisions() {
    return this.readJson<Decision[]>('decisions.json', []);
  }
  async saveDecisions(d: Decision[]) {
    return this.writeJson('decisions.json', d, await this.encrypt);
  }
  approvals() {
    return this.readJson<Approval[]>('approvals.json', []);
  }
  async saveApprovals(a: Approval[]) {
    return this.writeJson('approvals.json', a, await this.encrypt);
  }
  snapshot() {
    return this.readJson<Snapshot | null>('snapshot.json', null);
  }
  async saveSnapshot(s: Snapshot) {
    return this.writeJson('snapshot.json', s, await this.encrypt);
  }
  demoContext() {
    return this.readJson<ProjectContext | null>('demo-context.json', null);
  }
  saveDemoContext(c: ProjectContext | null) {
    return this.writeJson('demo-context.json', c);
  }
  async aiCache(): Promise<Map<string, SemanticOutput>> {
    return new Map(Object.entries(await this.readJson<Record<string, SemanticOutput>>('ai-cache.json', {})));
  }
  async saveAiCache(m: Map<string, SemanticOutput>) {
    return this.writeJson('ai-cache.json', Object.fromEntries([...m].slice(-2000)), await this.encrypt);
  }
  driftLog() {
    return this.readJson<DriftEvent[]>('drift.json', []);
  }
  saveDriftLog(d: DriftEvent[]) {
    return this.writeJson('drift.json', d.slice(-1000));
  }
  history() {
    return this.readJson<HistoryPoint[]>('history.json', []);
  }
  saveHistory(h: HistoryPoint[]) {
    return this.writeJson('history.json', h.slice(-200));
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
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) deepMerge(base[k], v);
    else if (v !== undefined) (base as any)[k] = v;
  }
  return base;
}
