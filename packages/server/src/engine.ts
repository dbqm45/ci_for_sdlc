import { EventEmitter } from 'node:events';
import {
  DEMO_SCENARIOS,
  analyzeProject,
  approvalBaseline,
  createSemanticAnalyzer,
  demoProject,
  fetchConfluence,
  fetchFigma,
  fetchJira,
  type AnalysisResult,
  type Approval,
  type ContextGraph,
  type ProjectContext,
  type SemanticOutput,
} from '@ci/core';
import type { Settings, Store } from './store.js';

export interface EngineState {
  result?: AnalysisResult;
  graph?: ContextGraph;
  context?: ProjectContext;
  running: boolean;
  lastError?: string;
  lastReason?: string;
}

/**
 * The Continuous Intelligence loop: Context → Analyze → Questions → Decide →
 * Detect drift → Analyze. Runs on demand, on a schedule, or on webhooks.
 */
export class Engine extends EventEmitter {
  state: EngineState = { running: false };
  private queue: Promise<unknown> = Promise.resolve();
  private timer?: NodeJS.Timeout;
  private aiCache?: Map<string, SemanticOutput>;

  constructor(private store: Store) {
    super();
  }

  async loadContext(settings: Settings): Promise<ProjectContext> {
    if (settings.mode === 'demo') {
      const saved = await this.store.demoContext();
      return saved ?? demoProject();
    }
    const { jira, confluence, figma } = settings.integrations;
    const ctx: ProjectContext = { project: settings.project, requirements: [], documents: [], frames: [], fetchedAt: new Date().toISOString() };
    const token = (name: string) => {
      const v = process.env[name];
      if (!v) throw new Error(`Missing environment variable ${name}`);
      return v;
    };
    const tasks: Promise<void>[] = [];
    if (jira.enabled) tasks.push(fetchJira({ ...jira, apiToken: token('JIRA_API_TOKEN') }).then((r) => void (ctx.requirements = r)));
    if (confluence.enabled)
      tasks.push(fetchConfluence({ ...confluence, apiToken: process.env.CONFLUENCE_API_TOKEN ?? token('JIRA_API_TOKEN') }).then((d) => void (ctx.documents = d)));
    if (figma.enabled) tasks.push(fetchFigma({ token: token('FIGMA_TOKEN'), fileKeys: figma.fileKeys }).then((f) => void (ctx.frames = f)));
    await Promise.all(tasks);
    return ctx;
  }

  /** Serialized analysis run. `aiKeys` = items explicitly requested for AI review. */
  analyze(reason: string, opts: { aiKeys?: string[] } = {}): Promise<AnalysisResult> {
    const run = this.queue.then(() => this.doAnalyze(reason, opts));
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async doAnalyze(reason: string, opts: { aiKeys?: string[] }): Promise<AnalysisResult> {
    this.state.running = true;
    this.emit('status', { running: true, reason });
    try {
      const settings = await this.store.settings();
      const [context, decisions, approvals, previous] = await Promise.all([this.loadContext(settings), this.store.decisions(), this.store.approvals(), this.store.snapshot()]);

      const analyzer = createSemanticAnalyzer(settings.ai, {
        anthropicApiKey: process.env.ANTHROPIC_API_KEY,
        openaiApiKey: process.env.OPENAI_API_KEY,
        azureOpenaiApiKey: process.env.AZURE_OPENAI_API_KEY,
        customApiKey: process.env.CUSTOM_AI_API_KEY,
      });
      this.aiCache ??= await this.store.aiCache();
      const cacheSize = this.aiCache.size;
      const audits: Promise<void>[] = [];

      const { result, snapshot, graph } = await analyzeProject(context, {
        decisions,
        approvals,
        previous: previous ?? undefined,
        policy: settings.policy,
        ai: analyzer
          ? {
              analyzer,
              cache: this.aiCache,
              maxCharsPerSource: settings.security.maxCharsPerSource,
              redactPersonalData: settings.security.redactPersonalData,
              cacheOnly: settings.ai.runOn === 'on_demand',
              onlyKeys: new Set(opts.aiKeys ?? []),
              onAudit: (rec) => {
                if (settings.security.auditAiDecisions && !rec.cached) {
                  audits.push(
                    this.store.audit({
                      at: rec.at,
                      kind: 'ai_call',
                      actor: `${rec.provider}/${rec.model}`,
                      summary: rec.error ? `AI review of ${rec.itemKey} failed: ${rec.error}` : `AI reviewed ${rec.itemKey}: ${rec.findings} findings (${rec.discarded} discarded without evidence), ${rec.challenges} questions`,
                      details: settings.security.recordEvidenceSources ? rec : { inputHash: rec.inputHash },
                    }),
                  );
                }
              },
            }
          : undefined,
      });
      await Promise.all(audits);
      if (this.aiCache.size !== cacheSize) await this.store.saveAiCache(this.aiCache);

      await this.store.saveSnapshot(snapshot);
      if (result.drift.length) await this.store.appendDriftLog(result.drift);
      await this.store.appendHistory({
        at: result.analyzedAt,
        healthy: result.counts.healthy,
        needsAttention: result.counts.needsAttention,
        critical: result.counts.critical,
        readiness: result.metrics.readiness,
        specificationHealth: result.metrics.specificationHealth,
        decisionDebt: result.metrics.decisionDebt.critical + result.metrics.decisionDebt.important + result.metrics.decisionDebt.minor,
      });
      await this.store.audit({ at: result.analyzedAt, kind: 'analysis', actor: 'system', summary: `Analysis (${reason}): ${result.counts.critical} critical, ${result.counts.needsAttention} need attention, ${result.drift.length} drift events in ${result.durationMs} ms` });

      this.state = { result, graph, context, running: false, lastReason: reason };
      this.emit('analysis', { at: result.analyzedAt, reason, drift: result.drift.length });
      this.emit('status', { running: false });
      return result;
    } catch (e) {
      this.state.running = false;
      this.state.lastError = (e as Error).message;
      this.emit('status', { running: false, error: this.state.lastError });
      throw e;
    }
  }

  async approve(key: string, by: string, forced?: { reason: string }) {
    const { result, graph } = this.state;
    const item = result?.items.find((i) => i.key === key);
    if (!item || !graph) throw new Error(`Unknown item ${key}`);
    const approval: Approval = { itemKey: key, approvedAt: new Date().toISOString(), approvedBy: by, contextHashes: approvalBaseline(graph, item), ...(forced && { forced: true, reason: forced.reason }) };
    await this.store.updateApprovals((all) => [...all.filter((a) => a.itemKey !== key), approval]);
    const summary = forced
      ? `${key} force-approved despite blocking issues (${item.blockingIssues.join('; ') || 'none'}). Reason: ${forced.reason}`
      : `${key} approved as ready for implementation (health ${item.health})`;
    await this.store.audit({ at: approval.approvedAt, kind: 'approval', actor: by, summary });
  }

  async applyDemoScenario(id: string) {
    const s = DEMO_SCENARIOS.find((x) => x.id === id);
    if (!s) throw new Error(`Unknown scenario ${id}`);
    await this.store.updateDemoContext((saved) => {
      const ctx = saved ?? demoProject();
      s.apply(ctx);
      return ctx;
    });
    await this.store.audit({ at: new Date().toISOString(), kind: 'demo_change', actor: 'demo', summary: s.title });
  }

  async resetDemo() {
    await this.store.saveDemoContext(null);
  }

  /** (Re)configure the scheduler from settings. */
  async reschedule() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    const s = await this.store.settings();
    const minutes = s.schedule.mode === 'continuous' ? 5 : s.schedule.mode === 'interval' ? Math.max(1, s.schedule.intervalMinutes) : 0;
    if (minutes) this.timer = setInterval(() => void this.analyze(`scheduled (${minutes} min)`).catch(() => undefined), minutes * 60_000);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }
}
