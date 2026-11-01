import { EventEmitter } from 'node:events';
import {
  AUTO_CLOSE_ACTOR,
  DEMO_SCENARIOS,
  activeDecisions,
  autoCloseDecision,
  autoCloseOf,
  recordDecision,
  analyzeProject,
  approvalBaseline,
  errorMessage,
  createSemanticAnalyzer,
  demoProject,
  fetchConfluence,
  fetchFigma,
  fetchJira,
  readReconstruction,
  readRepoChanges,
  readOpenApi,
  readTestResults,
  type RepoProblem,
  type AnalysisResult,
  type Approval,
  type ContextGraph,
  type AiAuditRecord,
  type DocumentItem,
  type ProjectContext,
  type SemanticOutput,
  type TestCase,
} from '@ci/core';
import { proposalEvent, recordAutoClose, type AutoCloseSink } from './auto-close.js';
import type { AtlassianConnection } from './connections.js';
import type { Principal } from './http.js';
import type { Settings, Store } from './store.js';

export interface EngineState {
  result?: AnalysisResult;
  graph?: ContextGraph;
  context?: ProjectContext;
  running: boolean;
  lastError?: string;
  lastReason?: string;
  /** With a repository source: the change files that could not be read in the last analysis. */
  repoProblems?: RepoProblem[];
}

/** Changes read from a checkout's docs/project/changes instead of the configured sources (F2, the PR gate). */
export interface RepoSource {
  path: string;
  repoUrl?: string;
}

/**
 * The Continuous Intelligence loop: Context → Analyze → Questions → Decide →
 * Detect drift → Analyze. Runs on demand, on a schedule, or on webhooks.
 */
/**
 * PRB-16: a decision in the repository (the change's decisions.md) answers its question in place of a stored one; it
 * is reviewed with the change, so it is the one a pull request's gate and the server agree on.
 */
export function withRepoDecisions<D extends { questionId: string }>(stored: D[], context: Pick<ProjectContext, 'decisions'>): (D | NonNullable<ProjectContext['decisions']>[number])[] {
  const fromRepo = context.decisions ?? [];
  if (!fromRepo.length) return stored;
  const asked = new Set(fromRepo.map((d) => d.questionId));
  return [...stored.filter((d) => !asked.has(d.questionId)), ...fromRepo];
}

export class Engine extends EventEmitter {
  state: EngineState = { running: false };
  private queue: Promise<unknown> = Promise.resolve();
  private timer?: NodeJS.Timeout;
  private aiCache?: Map<string, SemanticOutput>;
  /** A2b: where the automat's decisions go besides the log (pdi's registry); set by buildApp. */
  autoCloseSink?: AutoCloseSink;

  /** `atlassian`: set in CI_CONNECT_MODE=oauth; Jira and Confluence then use its token instead of JIRA_API_TOKEN. */
  constructor(
    private store: Store,
    private atlassian?: AtlassianConnection,
    private repo?: RepoSource,
    /** Test results of `analyze --tests` (G4), attached to the context of every run. */
    private tests?: TestCase[],
    /** API operations of `analyze --openapi` (docs/OPENAPI-PLAN.md), attached to the context of every run. */
    private api?: DocumentItem[],
  ) {
    super();
  }

  async loadContext(settings: Settings): Promise<ProjectContext> {
    const loaded = this.repo ? await this.loadRepo(settings, this.repo) : settings.mode === 'demo' ? ((await this.store.demoContext()) ?? demoProject()) : await this.loadSources(settings);
    // The claim vocabulary is the project's setting in every mode, the demo workspace included.
    // Test results (G4): `analyze --tests` wins over the setting; a report that cannot be read stops the analysis.
    const tests = this.tests ?? (await this.loadTests(settings));
    const ctx: ProjectContext = { ...loaded, project: { ...loaded.project, claimPack: settings.project.claimPack ?? 'general' }, ...(tests && { tests }) };
    // The API contract (OpenAPI): `analyze --openapi` wins over the setting; a file that cannot be read stops the analysis.
    const api = this.api ?? (await this.loadApi(settings)) ?? [];
    // tf's reconstruction from code is the current state of the code, next to the specification in either mode.
    const { code } = settings.integrations;
    const reconstructed = code.enabled ? await readReconstruction(code.reconstructionPath, { repoUrl: code.repoUrl }) : [];
    return api.length || reconstructed.length ? { ...ctx, documents: [...ctx.documents, ...reconstructed, ...api] } : ctx;
  }

  private async loadApi(settings: Settings): Promise<DocumentItem[] | undefined> {
    const o = settings.integrations.openapi;
    if (!o?.enabled) return undefined;
    const { documents, problems } = await readOpenApi([o.specPath]);
    if (problems.length) throw new Error(`API contract: ${problems.map((p) => `${p.path}: ${p.message}`).join('; ')}`);
    return documents;
  }

  private async loadTests(settings: Settings): Promise<TestCase[] | undefined> {
    const t = settings.integrations.tests;
    if (!t?.enabled) return undefined;
    const { tests, problems } = await readTestResults([t.reportsPath]);
    if (problems.length) throw new Error(`Test results: ${problems.map((p) => `${p.path}: ${p.message}`).join('; ')}`);
    return tests;
  }

  private async loadRepo(settings: Settings, repo: RepoSource): Promise<ProjectContext> {
    const { requirements, problems, decisions } = await readRepoChanges(repo.path, { repoUrl: repo.repoUrl });
    this.state.repoProblems = problems;
    return { project: settings.project, requirements, documents: [], frames: [], fetchedAt: new Date().toISOString(), ...(decisions.length && { decisions }) };
  }

  private async loadSources(settings: Settings): Promise<ProjectContext> {
    const { jira, confluence, figma } = settings.integrations;
    const ctx: ProjectContext = { project: settings.project, requirements: [], documents: [], frames: [], fetchedAt: new Date().toISOString() };
    const token = (name: string) => {
      const v = process.env[name];
      if (!v) throw new Error(`Missing environment variable ${name}`);
      return v;
    };
    // Read every token before the first request starts: a missing one must not leave earlier fetches rejecting unhandled.
    const oauth = this.atlassian && (jira.enabled || confluence.enabled) ? await this.atlassian.accessFor() : undefined;
    const jiraToken = jira.enabled && !oauth ? token('JIRA_API_TOKEN') : '';
    const confluenceToken = confluence.enabled && !oauth ? process.env.CONFLUENCE_API_TOKEN ?? token('JIRA_API_TOKEN') : '';
    const figmaToken = figma.enabled ? token('FIGMA_TOKEN') : '';
    const tasks: Promise<void>[] = [];
    if (jira.enabled) tasks.push(fetchJira({ ...jira, apiToken: jiraToken, oauth }).then((r) => void (ctx.requirements = r)));
    if (confluence.enabled) tasks.push(fetchConfluence({ ...confluence, apiToken: confluenceToken, oauth }).then((d) => void (ctx.documents = d)));
    if (figma.enabled) tasks.push(fetchFigma({ token: figmaToken, fileKeys: figma.fileKeys, apiBase: process.env.CI_FIGMA_API_BASE }).then((f) => void (ctx.frames = f)));
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
      const [context, stored, approvals, previous] = await Promise.all([this.loadContext(settings), this.store.decisions().then(activeDecisions), this.store.approvals(), this.store.snapshot()]);
      const decisions = withRepoDecisions(stored, context);

      const analyzer = createSemanticAnalyzer(settings.ai, {
        anthropicApiKey: process.env.ANTHROPIC_API_KEY,
        openaiApiKey: process.env.OPENAI_API_KEY,
        azureOpenaiApiKey: process.env.AZURE_OPENAI_API_KEY,
        customApiKey: process.env.CUSTOM_AI_API_KEY,
      });
      this.aiCache ??= await this.store.aiCache();
      const cacheSize = this.aiCache.size;
      const audits: Promise<void>[] = [];

      const autoCloseLog = await this.store.autoCloseLog();
      // A2a: a proposal a person rejected or reopened is not made again.
      const suppressedAnswers = autoCloseLog.filter((e) => e.outcome === 'rejected' || e.outcome === 'reopened').map((e) => e.proposalId);
      const runAnalysis = (decs: typeof decisions) => analyzeProject(context, {
        decisions: decs,
        approvals,
        previous: previous ?? undefined,
        policy: settings.policy,
        suppressedAnswers,
        ai: analyzer
          ? {
              analyzer,
              cache: this.aiCache!,
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
                      summary: rec.error
                        ? `AI review of ${rec.itemKey} failed: ${rec.error}`
                        : `AI reviewed ${rec.itemKey}: ${rec.findings} findings (${rec.discarded} discarded without evidence), ${rec.challenges} questions${usageNote(rec)}`,
                      // Telemetry is numbers, not source content, so it is kept when evidence sources are not recorded.
                      details: settings.security.recordEvidenceSources ? rec : pick(rec, ['inputHash', 'latencyMs', 'usage', 'costUsd']),
                    }),
                  );
                }
              },
            }
          : undefined,
      });
      let { result, snapshot, graph } = await runAnalysis(decisions);

      // A2a: log each new answer proposal once; under `apply` record it as the automat's decision and analyze again.
      const known = new Set(autoCloseLog.map((e) => e.proposalId));
      const proposals = result.items.flatMap((i) => i.findings.filter((f) => f.answer));
      await recordAutoClose(this.store, proposals.filter((f) => !known.has(f.answer!.id)).map((f) => ({ event: proposalEvent(f, 'proposed', result.analyzedAt), question: f.question!.text, actor: f.answer!.rule })));
      if (autoCloseOf(settings.policy) === 'apply' && proposals.length) {
        const at = new Date().toISOString();
        const applied: { f: (typeof proposals)[number]; id: string }[] = [];
        await this.store.updateDecisions((all) => {
          let next = all;
          for (const f of proposals) {
            const r = recordDecision(next, autoCloseDecision(f, { by: AUTO_CLOSE_ACTOR, at, automatic: true }));
            next = r.all;
            applied.push({ f, id: r.decision.id });
          }
          return next;
        });
        await recordAutoClose(this.store, applied.map(({ f, id }) => ({ event: proposalEvent(f, 'applied', at, { by: AUTO_CLOSE_ACTOR, decisionId: id }), question: f.question!.text, actor: f.answer!.rule })), this.autoCloseSink);
        ({ result, snapshot, graph } = await runAnalysis(withRepoDecisions(await this.store.decisions().then(activeDecisions), context)));
      }
      await Promise.all(audits);
      if (this.aiCache.size !== cacheSize) await this.store.saveAiCache(this.aiCache);

      if (result.invalidatedApprovals?.length) {
        const revoked = new Set(result.invalidatedApprovals);
        await this.store.updateApprovals((all) => all.filter((a) => !revoked.has(a.itemKey)));
        for (const key of revoked)
          await this.store.audit({ at: result.analyzedAt, kind: 'approval_removed', actor: 'system', summary: `Approval of ${key} revoked: its specification changed in meaning (drift reaction: invalidate)` });
      }
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

      this.state = { result, graph, context, running: false, lastReason: reason, repoProblems: this.state.repoProblems };
      this.emit('analysis', { at: result.analyzedAt, reason, drift: result.drift.length });
      this.emit('status', { running: false });
      return result;
    } catch (e) {
      this.state.running = false;
      this.state.lastError = errorMessage(e);
      this.emit('status', { running: false, error: this.state.lastError });
      throw e;
    }
  }

  async approve(key: string, { actor: by, via }: { actor: string; via?: Principal }, forced?: { reason: string }, pdiDecision?: string) {
    const { result, graph } = this.state;
    const item = result?.items.find((i) => i.key === key);
    if (!item || !graph) throw new Error(`Unknown item ${key}`);
    const approval: Approval = { itemKey: key, approvedAt: new Date().toISOString(), approvedBy: by, ...approvalBaseline(graph, item), ...(forced && { forced: true, reason: forced.reason }), ...(pdiDecision && { decision: pdiDecision }) };
    await this.store.updateApprovals((all) => [...all.filter((a) => a.itemKey !== key), approval]);
    const summary = forced
      ? `${key} force-approved despite blocking issues (${item.blockingIssues.join('; ') || 'none'}). Reason: ${forced.reason}`
      : `${key} approved as ready for implementation (health ${item.health})${pdiDecision ? ` by pdi decision ${pdiDecision}` : ''}`;
    await this.store.audit({ at: approval.approvedAt, kind: 'approval', actor: by, via, summary });
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
    if (process.env.CI_DISABLE_SCHEDULE === 'true') return;
    const s = await this.store.settings();
    const minutes = s.schedule.mode === 'continuous' ? 5 : s.schedule.mode === 'interval' ? Math.max(1, s.schedule.intervalMinutes) : 0;
    if (minutes) this.timer = setInterval(() => void this.analyze(`scheduled (${minutes} min)`).catch(() => undefined), minutes * 60_000);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }
}

const usageNote = (rec: AiAuditRecord) =>
  rec.usage ? `; ${rec.usage.inputTokens} input / ${rec.usage.outputTokens} output tokens${rec.costUsd === undefined ? '' : `, $${rec.costUsd.toFixed(4)}`}` : '';

const pick = <T extends object, K extends keyof T>(o: T, keys: K[]): Partial<Pick<T, K>> => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]])) as Partial<Pick<T, K>>;
