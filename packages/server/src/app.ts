import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifySwagger from '@fastify/swagger';
import { existsSync } from 'node:fs';
import { APPROVE_GATE, RULES, changeKeyOf, changeReadiness, mergeChangeReadiness, parseGateDecided, workspacePath, type AnalysisResult, type ChangeReadiness } from '@ci/core';
import { Accounts, SESSION_COOKIE, LOGIN_COOKIE, type InvitedRole } from './accounts.js';
import { ROLES, type Role } from './roles.js';
import { BETA_REAL_DATA, BETA_REFERENCE, BETA_SOURCES, BetaEnrollments, applicationLimiter, betaView, entrySurveyPending, measured, statusAt, surveyStates, type BetaApplication } from './beta.js';
import { SURVEYS } from './beta-surveys.js';
import { betaMails, runBetaJob } from './beta-job.js';
import { PAUSE_AFTER_DAYS } from './beta-lifecycle.js';
import { mailerFromEnv, type Mailer } from './mailer.js';
import { LOCAL_PEOPLE, MemoryMailer, localBetaMode, shiftedClock } from './beta-local.js';
import { PostHogSink, Usage, triggerOf, usageReport, type UsageEventName, type UsageSink } from './usage.js';
import { CALLBACK_PATH, ConnectError, STATE_COOKIE, connectConfigFromEnv, cookieValue, stateCookie, type ConnectConfig } from './connections.js';
import type { Engine } from './engine.js';
import { PdiLink, pdiSignatureProblem, type PdiOptions } from './pdi.js';
import { guardConfigFromEnv, httpError, notFound, registerGuards, registerProblemHandler, type GuardConfig } from './http.js';
import { ensure, who, workspaceRoutes } from './routes-workspace.js';
import { MUTATION, WORKSPACE_ID_PATTERN, approvalRequestBody, changeParams, errors, oauthCallbackQuery, problem, workspaceBody, workspaceDeleteBody, workspaceParams, workspaceRenameBody } from './schemas.js';
import type { Store } from './store.js';
import { APP_VERSION } from './version.js';
import pg from 'pg';
import { migrate } from './backend.js';
import { DEFAULT_WORKSPACE, FileStorage, PgStorage, WorkspaceExistsError, WorkspaceRefusedError, Workspaces, type Workspace } from './workspaces.js';

export { awsCredentialsConfigured } from './routes-workspace.js';

export interface AppOptions {
  dataDir: string;
  webDir?: string;
  logger?: boolean;
  /** Defaults to CI_ADMIN_TOKEN. */
  adminToken?: string;
  /** Defaults to CI_READ_TOKEN. */
  readToken?: string;
  /** Defaults to CI_ALLOWED_HOSTS (comma-separated). */
  allowedHosts?: string[];
  /** Defaults to CI_ALLOWED_ORIGINS (comma-separated). */
  allowedOrigins?: string[];
  /** Defaults to CI_CONNECT_MODE, CI_PUBLIC_URL and the ATLASSIAN_* variables. */
  connect?: ConnectConfig;
  /** pdi link (F4); defaults to PDI_EVENTS_URL and PDI_SIGNING_SECRET. */
  pdi?: PdiOptions;
  /** Postgres instead of files (F5); defaults to CI_DATABASE_URL. Empty = files in `dataDir`. */
  databaseUrl?: string;
  /** Defaults to CI_AUTH_MODE: `token` (machines and loopback) or `accounts` (people log in with Atlassian). */
  authMode?: 'token' | 'accounts';
  /** Defaults to CI_BOOTSTRAP_EMAIL: the Atlassian e-mail of the first Owner. */
  bootstrapEmail?: string;
  /** Defaults to CI_OPERATOR_EMAILS (comma-separated): who may open organizations (docs/ORGANIZATIONS-PLAN.md). */
  operatorEmails?: string[];
  /** Closed beta (docs/BETA-ENROLLMENT-PLAN.md): its length, default CI_BETA_WEEKS or 8. */
  betaWeeks?: number;
  /** Whether teams may apply; default true unless CI_BETA_APPLICATIONS=closed. */
  betaApplicationsOpen?: boolean;
  /** Days a survey may be past due before analyses pause; default CI_BETA_PAUSE_AFTER_DAYS or 7. */
  betaPauseAfterDays?: number;
  /** Where the beta's mails go; default Resend with RESEND_API_KEY and CI_MAIL_FROM, else the log. */
  mailer?: Mailer;
  /** Where usage events go besides our own log (T8); default PostHog with POSTHOG_API_KEY, else none. */
  usageSink?: UsageSink;
  /** The local beta walkthrough (docs/BETA-LOCAL.md); default CI_BETA_LOCAL=1. Only on loopback outside production. */
  betaLocal?: boolean;
}

/** A workspace's part of the pdi changes: its analysis and the changes of its stories. */
interface ChangePart {
  w: Workspace;
  result: AnalysisResult;
  changes: ChangeReadiness[];
}

/**
 * The server. `engine` and `store` are those of the `default` workspace (F5, docs/WORKSPACES-F5-PLAN.md); the others
 * are in `workspaces`.
 */
export async function buildApp(opts: AppOptions): Promise<{ app: FastifyInstance; engine: Engine; store: Store; pdi: PdiLink; workspaces: Workspaces; accounts: Accounts; betaJob: (now?: number) => Promise<void>; usage: Usage; settle: () => Promise<void> }> {
  const authMode = opts.authMode ?? process.env.CI_AUTH_MODE ?? 'token';
  if (authMode !== 'token' && authMode !== 'accounts') throw new Error(`CI_AUTH_MODE must be "token" or "accounts", not "${authMode}".`);
  const connect = opts.connect ?? connectConfigFromEnv();
  // The local beta walkthrough: fake login, in-app mailbox, a clock that moves forward. Refused off loopback.
  const local = localBetaMode({ ...process.env, ...(opts.betaLocal !== undefined && { CI_BETA_LOCAL: opts.betaLocal ? '1' : '0' }) }, { publicUrl: connect.publicUrl, authMode });
  if (local.refused) throw new Error(local.refused);
  const clock = local.enabled ? shiftedClock() : undefined;
  const localMail = local.enabled && !opts.mailer ? new MemoryMailer() : undefined;
  // Strict bodies: unknown properties and wrong types are rejected, not silently dropped or coerced.
  const app = Fastify({ logger: opts.logger ?? false, ajv: { customOptions: { removeAdditional: false, coerceTypes: false, allErrors: true } } });
  let pdi!: PdiLink;

  /** The pdi changes with the stories of every workspace (F5): each workspace is analysed first. */
  const changeParts = async (): Promise<ChangePart[]> =>
    Promise.all(
      pdiWorkspaces().map(async (w) => {
        const result = await ensure(w.engine);
        const prefix = (await w.store.settings()).integrations.jira.changeLabelPrefix || undefined;
        return { w, result, changes: changeReadiness(result.items, w.engine.state.context?.requirements ?? [], prefix) };
      }),
    );

  const databaseUrl = opts.databaseUrl ?? process.env.CI_DATABASE_URL ?? '';
  const pool = databaseUrl ? new pg.Pool({ connectionString: databaseUrl, max: 10 }) : undefined;
  if (pool) await migrate(pool);
  const storage = pool ? new PgStorage(pool) : new FileStorage(opts.dataDir);
  /** Resolves when the background work (e.g. the beta job after a join) is done; set below. */
  let settle: () => Promise<void> = async () => undefined;
  /** Usage measurement after each analysis (T8); set once the beta and the accounts are known. */
  let afterAnalysis: ((w: Workspace) => Promise<void>) | undefined;
  const workspaces = new Workspaces(storage, connect, async (w) => {
    /** A2b: decided A2a steps go to pdi's registry as decision.recorded, with the item's CHG from its `change:` label. */
    w.sink = async (steps) => {
      if (!pdi.enabled) return;
      const prefix = (await w.store.settings()).integrations.jira.changeLabelPrefix || undefined;
      const requirements = w.engine.state.context?.requirements ?? (await w.store.demoContext())?.requirements ?? [];
      await pdi.enqueueDecisions(steps, (key) => changeKeyOf(requirements.find((r) => r.key === key)?.labels ?? [], prefix), w.id === DEFAULT_WORKSPACE ? undefined : w.id);
      void pdi.deliver().catch((e) => app.log.error(e));
    };
    w.engine.autoCloseSink = w.sink;
    // After every analysis: readiness of the labelled changes across all workspaces to pdi, then whatever is due (F4).
    w.engine.on('analysis', () => {
      const work = afterAnalysis?.(w);
      if (work) void usage.watch(work).catch((e) => app.log.warn({ err: String(e) }, 'usage after analysis failed'));
    });
    w.engine.on('analysis', () => {
      if (!pdi.enabled || !w.engine.state.result) return;
      pdi.schedule(async () => pdi.enqueue(mergeChangeReadiness((await changeParts()).map((p) => p.changes))));
      void pdi.deliver().catch((e) => app.log.error(e));
    });
    if (pdi) await w.engine.reschedule();
  });
  await workspaces.init();
  const main = workspaces.default;
  // pdi's queue and state live with `default`; the hooks above read the link only once something happens.
  pdi = new PdiLink(main.store, { publicUrl: connect.publicUrl, ...opts.pdi });
  pdi.storeOf = (id) => workspaces.get(id)?.store;
  for (const w of workspaces.all()) await w.engine.reschedule();

  // People, their roles and sessions live outside every workspace (docs/ACCOUNTS-PLAN.md).
  const accounts = new Accounts(storage.backend('_platform'), {
    enabled: authMode === 'accounts',
    publicUrl: connect.publicUrl,
    clientId: connect.atlassian.clientId,
    clientSecret: connect.atlassian.clientSecret,
    bootstrapEmail: opts.bootstrapEmail ?? (process.env.CI_BOOTSTRAP_EMAIL || undefined),
    operatorEmails: opts.operatorEmails ?? (process.env.CI_OPERATOR_EMAILS ?? '').split(',').map((e) => e.trim()).filter(Boolean),
    sessionsNeverExpire: local.enabled,
  });
  if (accounts.enabled) await accounts.init();

  // The closed beta's applications and enrollments, beside the accounts (docs/BETA-ENROLLMENT-PLAN.md).
  const beta = new BetaEnrollments(storage.backend('_platform'), {
    weeks: opts.betaWeeks ?? (Number(process.env.CI_BETA_WEEKS) || 8),
    open: opts.betaApplicationsOpen ?? process.env.CI_BETA_APPLICATIONS !== 'closed',
    pauseAfterDays: opts.betaPauseAfterDays ?? (Number(process.env.CI_BETA_PAUSE_AFTER_DAYS) || PAUSE_AFTER_DAYS),
  });
  const pauseAfterDays = beta.cfg.pauseAfterDays!;

  // ------------------------------------------------------------------ usage measurement (T8, docs/BETA-PLAN.md §8)
  const usage = new Usage(storage.backend('_platform'), {
    enabled: authMode === 'accounts' && process.env.CI_USAGE !== 'off',
    sink: opts.usageSink ?? (process.env.POSTHOG_API_KEY ? new PostHogSink(process.env.POSTHOG_API_KEY, process.env.POSTHOG_HOST || undefined) : undefined),
    secret: process.env.CI_USAGE_SECRET || undefined,
    log: (o, msg) => app.log.warn(o, msg),
  });
  if (usage.cfg.enabled) await usage.init();
  const usageTimer = usage.cfg.sink ? setInterval(() => void usage.flush(), 30_000) : undefined;
  usageTimer?.unref();
  const mailer = opts.mailer ?? localMail ?? mailerFromEnv((o, msg) => app.log.info(o, msg));
  const operatorEmails = opts.operatorEmails ?? (process.env.CI_OPERATOR_EMAILS ?? '').split(',').map((e) => e.trim()).filter(Boolean);
  /** A beta mail that must not fail the request: a failure is logged (the job retries its own mails). */
  const mailNow = (m: Parameters<Mailer['send']>[0]) => void mailer.send(m).catch((err) => app.log.warn({ err: String(err), subject: m.subject }, 'beta mail failed'));
  if (accounts.enabled) await beta.init();

  // ------------------------------------------------------------------ organizations (docs/ORGANIZATIONS-PLAN.md)
  /** The organization a workspace belongs to; one without its own belongs to the first. Undefined in token mode. */
  const orgOf = (w: Workspace) => (accounts.enabled ? (w.orgId ?? accounts.homeOrgId) : undefined);
  /** The organization a request acts for: the person's, or the first one for a machine with a token. */
  const orgOfReq = (req: FastifyRequest) => req.account?.orgId ?? accounts.homeOrgId;
  /** Whether the request may see the workspace: machines and token mode see all, people only their organization's. */
  const visible = (req: FastifyRequest, w: Workspace) => !accounts.enabled || !req.account || orgOf(w) === req.account.orgId;
  /** The workspaces pdi's changes are made of: those of the first organization (the pdi link is the installation's). */
  function pdiWorkspaces() {
    return workspaces.all().filter((w) => orgOf(w) === (accounts.enabled ? accounts.homeOrgId : undefined));
  }
  /** Where the organization's own events (members, invitations, workspaces) are audited: its first workspace. */
  const auditOf = (orgId: string | undefined) => (accounts.enabled && orgId !== accounts.homeOrgId ? workspaces.all().find((w) => orgOf(w) === orgId)?.store : undefined) ?? main.store;
  /** pdi belongs to the first organization: a person of another one does not see it. */
  const pdiVisible = (req: FastifyRequest) => !accounts.enabled || !req.account || req.account.orgId === accounts.homeOrgId;
  const requirePdiVisible = (req: FastifyRequest) => {
    if (!pdiVisible(req)) throw httpError(404, `No API route ${req.method} ${req.url.split('?')[0]}`);
  };

  /** Records a usage event of a workspace whose organization takes part in the beta and measures (T8). */
  const track = <E extends UsageEventName>(w: Workspace, event: E, props: Parameters<Usage['track']>[2] & object, userId?: string, at?: string) => {
    const orgId = orgOf(w);
    if (!orgId || !usage.cfg.enabled || !measured(beta.forOrg(orgId))) return Promise.resolve();
    return usage.track(event, { orgId, workspace: w.id, userId, at }, props as never);
  };
  /** When each finding and drift event was first seen, per workspace (for `finding_shown` once and `age_hours`). */
  const seenDoc = (w: Workspace) => `usage-seen-${w.id}.json`;
  const platform = storage.backend('_platform');
  const seenOf = async (w: Workspace) => ((await platform.read(seenDoc(w))) as Record<string, string> | undefined) ?? {};
  afterAnalysis = async (w) => {
    const orgId = orgOf(w);
    const result = w.engine.state.result;
    if (!orgId || !result || !usage.cfg.enabled || !measured(beta.forOrg(orgId))) return;
    const findings = result.items.flatMap((i) => i.findings);
    const from = Date.parse(result.analyzedAt) - result.durationMs - 1000;
    const aiCalls = (await w.store.auditLog(500)).filter((e) => e.kind === 'ai_call' && Date.parse(e.at) >= from && Date.parse(e.at) <= Date.parse(result.analyzedAt) + 1000);
    const cost = aiCalls.reduce((sum, e) => sum + (typeof (e.details as { costUsd?: unknown } | undefined)?.costUsd === 'number' ? ((e.details as { costUsd: number }).costUsd) : 0), 0);
    await track(w, 'analysis_completed', { trigger: triggerOf(w.engine.state.lastReason), items: result.items.length, findings_open: findings.filter((f) => f.status === 'open').length, durationMs: result.durationMs, ai: result.ai.enabled, ai_calls: aiCalls.length, ai_cost_usd: cost }, undefined, result.analyzedAt);
    const seen = await seenOf(w);
    let changed = false;
    for (const f of findings) {
      if (seen[f.id]) continue;
      seen[f.id] = result.analyzedAt;
      changed = true;
      await track(w, 'finding_shown', { rule: f.ruleId, severity: f.severity, origin: f.origin }, undefined, result.analyzedAt);
    }
    for (const d of result.drift) {
      if (seen[`drift:${d.id}`]) continue;
      seen[`drift:${d.id}`] = result.analyzedAt;
      changed = true;
      await track(w, 'drift_detected', { kind: d.kind }, undefined, result.analyzedAt);
    }
    if (changed) await platform.write(seenDoc(w), seen);
  };

  /** Events from what people do, read from successful requests (the routes stay unaware of measurement). */
  const WS_PATH = /^\/api(?:\/w\/([^/]+))?\/(items\/([^/]+)(?:\/(approve|answers\/[^/]+))?|decisions)$/;
  app.addHook('onResponse', async (req, reply) => {
    if (!req.account || reply.statusCode >= 300 || !usage.cfg.enabled) return;
    await usage.watch(usageFromRequest(req));
  });
  async function usageFromRequest(req: FastifyRequest) {
    if (!req.account) return;
    const path = req.url.split('?')[0]!;
    try {
      if (req.method === 'POST' && /^\/api\/beta\/surveys\/[^/]+\/answers$/.test(path)) {
        const ws = workspaces.all().find((w) => orgOf(w) === req.account!.orgId);
        if (ws) await track(ws, 'survey_answered', { survey: path.split('/')[4]!.replace(/-\d+$/, '') }, req.account.userId);
        return;
      }
      const m = WS_PATH.exec(path);
      if (!m) return;
      const w = workspaces.get(m[1] ? decodeURIComponent(m[1]) : DEFAULT_WORKSPACE);
      if (!w) return;
      const items = w.engine.state.result?.items ?? [];
      const key = m[3] && decodeURIComponent(m[3]);
      const item = key ? items.find((i) => i.key === key) : undefined;
      const user = req.account.userId;
      if (req.method === 'GET' && key && !m[4]) return void (await track(w, 'item_viewed', { type: item?.type ?? 'unknown' }, user));
      if (req.method === 'POST' && m[4] === 'approve') {
        const body = (req.body ?? {}) as { force?: boolean };
        return void (await track(w, 'item_approved', { forced: !!body.force, blocking_findings: item?.findings.filter((f) => f.blocks).length ?? 0 }, user));
      }
      if (req.method === 'POST' && m[4]?.startsWith('answers/')) {
        const proposal = decodeURIComponent(m[4].slice('answers/'.length));
        const f = item?.findings.find((x) => x.answer?.id === proposal);
        return void (await track(w, 'answer_proposal_judged', { outcome: String((req.body as { action?: string } | undefined)?.action ?? ''), rule: f?.ruleId ?? 'unknown' }, user));
      }
      if (req.method === 'POST' && m[2] === 'decisions') {
        const b = (req.body ?? {}) as { findingId?: string; questionId?: string; itemKey?: string; effect?: string };
        const findingId = b.findingId ?? b.questionId ?? '';
        const f = items.find((i) => i.key === b.itemKey)?.findings.find((x) => x.id === findingId);
        const firstSeen = (await seenOf(w))[findingId];
        await track(w, 'finding_decided', {
          rule: f?.ruleId ?? findingId.split(':')[0] ?? 'unknown',
          severity: f?.severity ?? 'unknown',
          origin: f?.origin ?? 'unknown',
          effect: b.effect ?? 'resolve',
          ...(firstSeen && { age_hours: (Date.now() - Date.parse(firstSeen)) / 3_600_000 }),
        }, user);
      }
    } catch (err) {
      req.log.warn({ err: String(err) }, 'usage event failed');
    }
  }

  const env = guardConfigFromEnv();
  const guard: GuardConfig = { adminToken: opts.adminToken ?? env.adminToken, readToken: opts.readToken ?? env.readToken, allowedHosts: opts.allowedHosts ?? env.allowedHosts, allowedOrigins: opts.allowedOrigins ?? env.allowedOrigins,
    mode: authMode,
    session: (req) => accounts.session(cookieValue(req.headers.cookie, SESSION_COOKIE)),
    devOpen: local.enabled,
  };

  await app.register(fastifySwagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'Continuous Intelligence for the SDLC',
        version: APP_VERSION,
        description:
          'State-changing calls need the admin token when CI_ADMIN_TOKEN is set; without it only loopback clients may change state. Reads need the read token (or the admin token) when CI_READ_TOKEN is set, except /api/health. ' +
          'Workspaces: the routes of a workspace are under /api/w/{ws}/…; the same routes under /api/… address the workspace "default".',
      },
      components: { securitySchemes: { adminToken: { type: 'http', scheme: 'bearer', description: 'CI_ADMIN_TOKEN' }, readToken: { type: 'http', scheme: 'bearer', description: 'CI_READ_TOKEN (the admin token reads too)' } } },
    },
  });
  app.addSchema(problem);
  registerProblemHandler(app);
  registerGuards(app, guard);

  /** A beta team analyses and connects Atlassian only after its entry survey, the baseline (docs/BETA-ENROLLMENT-PLAN.md). */
  const ENTRY_SURVEY_GATED = /^\/api(?:\/w\/[^/]+)?\/(?:analyze|items\/[^/]+\/ai-review|connections\/atlassian\/start)$/;
  /** A paused or ended beta team reads and answers surveys, nothing else changes (docs/BETA-ENROLLMENT-PLAN.md). */
  const STILL_ALLOWED = /^\/api\/(?:beta|auth|dev)\//;
  app.addHook('preHandler', async (req) => {
    if (!req.account || req.method === 'GET' || req.method === 'HEAD') return;
    const path = req.url.split('?')[0]!;
    const e = beta.forOrg(req.account.orgId);
    if (!e?.startedAt || STILL_ALLOWED.test(path)) return;
    const status = statusAt(e, Date.now(), pauseAfterDays);
    if (status === 'paused') throw httpError(403, `Analyses and changes are paused in the beta until the overdue survey is answered (Beta surveys). Your data stays.`);
    if (status === 'ended') throw httpError(403, 'The beta has ended: Quorum is read-only for your team now.');
    if (req.method === 'POST' && ENTRY_SURVEY_GATED.test(path) && entrySurveyPending(e))
      throw httpError(403, `Fill in the entry survey first: it takes about ${SURVEYS.entry.minutes} minutes and gives the beta its starting point.`);
  });

  const pdiTimer = pdi.enabled ? setInterval(() => void pdi.deliver().catch(() => undefined), 60_000) : undefined;
  pdiTimer?.unref();
  app.addHook('onClose', async () => {
    if (pdiTimer) clearInterval(pdiTimer);
    await pdi.deliver().catch(() => undefined);
  });

  app.get('/api/openapi.json', { schema: { hide: true } }, async () => app.swagger());
  app.get('/api/health', async () => ({ ok: true, version: APP_VERSION, storage: storage.kind, running: main.engine.state.running, lastError: main.engine.state.lastError }));
  app.get('/api/rules', async () => RULES.map(({ id, name, description, appliesTo }) => ({ id, name, description, appliesTo })));

  // ------------------------------------------------------------------ workspaces (F5, docs/WORKSPACES-F5-PLAN.md)
  app.get('/api/workspaces', async (req) => workspaces.all().filter((w) => visible(req, w)).map(({ id, name }) => ({ id, name })));
  const visibleWorkspace = (req: FastifyRequest, id: string) => {
    const w = workspaces.get(id);
    if (!w || !visible(req, w)) throw httpError(404, `No workspace ${id}`);
    return w;
  };
  app.post<{ Body: { id: string; name?: string; by?: string } }>(
    '/api/workspaces',
    { schema: { summary: 'Create a workspace with its own sources, analysis and decisions', body: workspaceBody, response: errors(409, 422), ...MUTATION } },
    async (req, reply) => {
      const at = new Date().toISOString();
      try {
        const orgId = orgOfReq(req);
        const w = await workspaces.create(req.body.id, req.body.name ?? req.body.id, at, accounts.enabled ? orgId : undefined);
        await auditOf(orgId).audit({ at, kind: 'workspace', ...who(req, req.body), summary: `Workspace ${w.id} (${w.name}) created` });
        return reply.status(201).send({ id: w.id, name: w.name });
      } catch (e) {
        if (e instanceof WorkspaceExistsError) throw httpError(409, e.message);
        throw e;
      }
    },
  );

  app.patch<{ Params: { ws: string }; Body: { name: string; by?: string } }>(
    '/api/workspaces/:ws',
    { schema: { summary: 'Rename a workspace (its id and addresses stay)', params: workspaceParams, body: workspaceRenameBody, response: errors(404, 422), ...MUTATION } },
    async (req) => {
      const before = visibleWorkspace(req, req.params.ws).name;
      const at = new Date().toISOString();
      const w = await workspaces.rename(req.params.ws, req.body.name.slice(0, 100), at);
      await auditOf(orgOfReq(req)).audit({ at, kind: 'workspace', ...who(req, req.body), summary: `Workspace ${w.id} renamed from ${before} to ${w.name}` });
      return { id: w.id, name: w.name };
    },
  );

  /** Deleting moves the workspace's data aside (nothing is erased); the id must be typed back. */
  app.delete<{ Params: { ws: string }; Body: { confirm: string; by?: string } }>(
    '/api/workspaces/:ws',
    { schema: { summary: 'Delete a workspace: it stops and its data moves to workspaces-deleted/ in the data directory', params: workspaceParams, body: workspaceDeleteBody, response: errors(400, 404, 409, 422), ...MUTATION } },
    async (req) => {
      const id = req.params.ws;
      visibleWorkspace(req, id);
      if (id === DEFAULT_WORKSPACE) throw httpError(409, 'The default workspace cannot be deleted.');
      if (req.body.confirm !== id) throw httpError(400, `Type the workspace id (${id}) in confirm to delete it.`);
      const at = new Date().toISOString();
      try {
        const { archivedTo } = await workspaces.remove(id, at);
        await auditOf(orgOfReq(req)).audit({ at, kind: 'workspace', ...who(req, req.body), summary: `Workspace ${id} deleted; its data moved to ${archivedTo}` });
        return { deleted: id, archivedTo };
      } catch (e) {
        if (e instanceof WorkspaceRefusedError) throw httpError(409, e.message);
        throw e;
      }
    },
  );

  // ------------------------------------------------------------------ the routes of a workspace
  await app.register(
    async (scope) => {
      // `default` belongs to the first organization: for a person of another one it does not exist.
      scope.addHook('preHandler', async (req) => {
        if (!visible(req, main)) throw httpError(404, `No workspace ${DEFAULT_WORKSPACE}`);
      });
      await workspaceRoutes(scope, { of: () => main, connect });
    },
    { prefix: '/api' },
  );
  await app.register(
    async (scope) => {
      // Every route here also takes the workspace id; an unknown one is a 404 before the handler runs.
      scope.addHook('onRoute', (route) => {
        const schema = route.schema ?? {};
        // A route without a params schema keeps its other params unchecked, as under /api.
        const params = (schema.params ?? { type: 'object', properties: {} }) as { properties?: object; required?: string[] };
        route.schema = { ...schema, params: { ...params, properties: { ...workspaceParams.properties, ...params.properties }, required: [...new Set(['ws', ...(params.required ?? [])])] } };
      });
      scope.addHook('preHandler', async (req) => {
        const id = (req.params as { ws?: string }).ws ?? '';
        const w = workspaces.get(id);
        if (!w || !visible(req, w)) throw httpError(404, `No workspace ${id}`);
      });
      await workspaceRoutes(scope, { of: (req: FastifyRequest) => workspaces.get((req.params as { ws: string }).ws)!, connect });
    },
    { prefix: '/api/w/:ws' },
  );

  // ------------------------------------------------------------------ accounts (docs/ACCOUNTS-PLAN.md)
  const loginQuery = { type: 'object', properties: { bootstrap: { type: 'string', maxLength: 200 }, invite: { type: 'string', maxLength: 200 } } } as const;
  app.get<{ Querystring: { bootstrap?: string; invite?: string } }>('/api/auth/login', { schema: { hide: true, querystring: loginQuery } }, async (req, reply) => {
    if (!accounts.enabled) throw httpError(404, 'Login is off: CI_AUTH_MODE is not "accounts".');
    // Local walkthrough: no Atlassian; the local login page picks the person (an invitation rides along).
    if (local.enabled) return reply.redirect(`/#/dev/login${req.query.invite ? `?invite=${encodeURIComponent(req.query.invite)}` : ''}`);
    const { url, cookie } = accounts.start({ bootstrap: req.query.bootstrap, invite: req.query.invite });
    reply.header('set-cookie', cookie);
    return reply.redirect(url);
  });

  app.get('/api/auth/me', { schema: { summary: 'The auth mode and the logged-in person with their organization, if any' } }, async (req) => {
    const a = req.account;
    const localInfo = local.enabled ? { local: { offsetDays: Math.round((clock!.offsetMs / 86_400_000) * 10) / 10, now: new Date().toISOString() } } : {};
    if (!a) return { mode: authMode, user: null, ...localInfo };
    const org = accounts.org(a.orgId);
    const mine = workspaces.all().filter((w) => visible(req, w));
    return {
      mode: authMode,
      user: { id: a.userId, name: a.name, email: a.email, role: a.role, operator: a.operator },
      org: org ? { id: org.id, name: org.name } : null,
      // Where the app opens: `default` when the person sees it, else their organization's first workspace.
      home: mine.some((w) => w.id === DEFAULT_WORKSPACE) ? DEFAULT_WORKSPACE : (mine[0]?.id ?? null),
      beta: (() => {
        const e = beta.forOrg(a.orgId);
        return e ? betaView(e, Date.now(), pauseAfterDays) : null;
      })(),
      ...localInfo,
    };
  });

  app.post('/api/auth/logout', { schema: { summary: 'End this session', ...MUTATION } }, async (req, reply) => {
    await accounts.logout(cookieValue(req.headers.cookie, SESSION_COOKIE));
    reply.header('set-cookie', accounts.sessionCookie('', 0));
    return reply.code(204).send();
  });

  /** Who acts on the members: the person's role, or Owner for a machine with the admin token. */
  const actorRole = (req: FastifyRequest): Role => req.account?.role ?? 'owner';
  const memberParams = { type: 'object', required: ['id'], properties: { id: { type: 'string', minLength: 1, maxLength: 100 } } } as const;

  app.get('/api/members', { schema: { summary: 'The people of the organization with their roles (Admin)' } }, async (req) => accounts.members(orgOfReq(req)));

  app.patch<{ Params: { id: string }; Body: { role: Role } }>(
    '/api/members/:id',
    { schema: { summary: "Change a person's role (Admin; only an Owner gives or takes Owner)", params: memberParams, body: { type: 'object', required: ['role'], additionalProperties: false, properties: { role: { type: 'string', enum: ROLES } } }, response: errors(403, 404, 409, 422), ...MUTATION } },
    async (req) => {
      const orgId = orgOfReq(req);
      const name = await accounts.setRole(actorRole(req), req.params.id, req.body.role, orgId);
      await auditOf(orgId).audit({ at: new Date().toISOString(), kind: 'member', ...who(req, null), summary: `${name} is now ${req.body.role}` });
      return accounts.members(orgId).find((m) => m.id === req.params.id);
    },
  );

  app.delete<{ Params: { id: string } }>('/api/members/:id', { schema: { summary: 'Remove a person and end their sessions (Admin)', params: memberParams, response: errors(403, 404, 409), ...MUTATION } }, async (req, reply) => {
    const orgId = orgOfReq(req);
    const name = await accounts.remove(actorRole(req), req.params.id, orgId);
    await auditOf(orgId).audit({ at: new Date().toISOString(), kind: 'member', ...who(req, null), summary: `${name} removed from the organization` });
    return reply.code(204).send();
  });

  const invitationBody = {
    type: 'object',
    required: ['role'],
    additionalProperties: false,
    properties: { role: { type: 'string', enum: ROLES.filter((r) => r !== 'owner') }, email: { type: 'string', maxLength: 200, pattern: '^$|^[^\\s@]+@[^\\s@]+$' } },
  } as const;
  const invitationSummary = (inv: { role: string; email: string }) => `Invitation as ${inv.role}${inv.email ? ` for ${inv.email}` : ''}`;

  app.get('/api/invitations', { schema: { summary: 'Invitations that can still be used (Admin); never their links' } }, async (req) => accounts.openInvitations(orgOfReq(req)));

  app.post<{ Body: { role: InvitedRole; email?: string } }>(
    '/api/invitations',
    { schema: { summary: 'Create a one-time invitation link, valid 7 days (Admin)', body: invitationBody, response: errors(403, 422), ...MUTATION } },
    async (req, reply) => {
      const { actor, via } = who(req, null);
      const orgId = orgOfReq(req);
      const inv = await accounts.invite(actor ?? 'admin', req.body.role, req.body.email, orgId);
      await auditOf(orgId).audit({ at: new Date().toISOString(), kind: 'member', actor, via, summary: `${invitationSummary(inv)} created` });
      return reply.code(201).send(inv);
    },
  );

  app.delete<{ Params: { id: string } }>('/api/invitations/:id', { schema: { summary: 'Revoke an invitation (Admin)', params: memberParams, response: errors(403, 404), ...MUTATION } }, async (req, reply) => {
    const orgId = orgOfReq(req);
    const inv = await accounts.revoke(req.params.id, orgId);
    await auditOf(orgId).audit({ at: new Date().toISOString(), kind: 'member', ...who(req, null), summary: `${invitationSummary(inv)} revoked` });
    return reply.code(204).send();
  });

  /** Work that must not hold a response but must finish before the server closes. */
  const background = new Set<Promise<unknown>>();
  const inBackground = (work: Promise<unknown>) => {
    const p = work.catch((e) => app.log.error(e)).finally(() => background.delete(p));
    background.add(p);
  };
  settle = async () => {
    while (background.size) await Promise.allSettled([...background]);
  };
  app.addHook('onClose', () => settle());

  /** Someone joined through an invitation: audited; the Owner of an invited beta team starts its beta. */
  async function afterJoin(joined: { name: string; role: Role; orgId: string } | undefined) {
    if (!joined) return;
    const at = new Date().toISOString();
    await auditOf(joined.orgId).audit({ at, kind: 'member', actor: joined.name, via: 'session', summary: `${joined.name} joined as ${joined.role}` });
    const started = joined.role === 'owner' ? await beta.joined(joined.orgId, joined.name, at) : undefined;
    if (started) {
      await auditOf(joined.orgId).audit({ at, kind: 'member', actor: joined.name, via: 'session', summary: `Beta started; it ends on ${started.endsAt!.slice(0, 10)}` });
      // The entry survey's mail goes out now, not at the next hourly run (closing the server waits for it).
      inBackground(betaJob());
    }
  }

  // ------------------------------------------------------------------ local beta walkthrough (docs/BETA-LOCAL.md)
  if (local.enabled) {
    app.log.warn('CI_BETA_LOCAL=1: fake login, in-app mailbox and a movable clock are on. Never use this mode with real people or data.');
    app.get('/api/dev/beta', { schema: { hide: true } }, async () => ({
      people: LOCAL_PEOPLE,
      offsetDays: Math.round((clock!.offsetMs / 86_400_000) * 10) / 10,
      now: new Date().toISOString(),
      mails: localMail ? localMail.mails.length : null,
    }));
    const devLoginBody = {
      type: 'object',
      required: ['name', 'email'],
      additionalProperties: false,
      properties: { name: { type: 'string', minLength: 1, maxLength: 100 }, email: { type: 'string', maxLength: 200, pattern: '^[^\\s@]+@[^\\s@]+$' }, invite: { type: 'string', maxLength: 200 } },
    } as const;
    /** Logs in as any person, by the same rules as a real login (invitation, first Owner, known person). */
    app.post<{ Body: { name: string; email: string; invite?: string } }>('/api/dev/login', { schema: { hide: true, body: devLoginBody } }, async (req, reply) => {
      const email = req.body.email.trim().toLowerCase();
      try {
        const { id, joined } = await accounts.devLogin({ provider: 'atlassian', subject: `local:${email}`, name: req.body.name.trim(), email }, { invite: req.body.invite });
        await afterJoin(joined);
        reply.header('set-cookie', accounts.sessionCookie(id));
        return { ok: true };
      } catch (e) {
        if (e instanceof ConnectError) throw httpError(403, e.message);
        throw e;
      }
    });
    app.get('/api/dev/mails', { schema: { hide: true } }, async () => localMail?.mails ?? []);
    /** Moves the clock forward and runs the beta's job, as the hourly timer would have. */
    app.post<{ Body: { days?: number; hours?: number } }>(
      '/api/dev/clock',
      { schema: { hide: true, body: { type: 'object', additionalProperties: false, properties: { days: { type: 'number', minimum: 0, maximum: 120 }, hours: { type: 'number', minimum: 0, maximum: 72 } } } } },
      async (req) => {
        clock!.forward(((req.body.days ?? 0) * 24 + (req.body.hours ?? 0)) * 3_600_000);
        await betaJob();
        return { offsetDays: Math.round((clock!.offsetMs / 86_400_000) * 10) / 10, now: new Date().toISOString() };
      },
    );
    app.addHook('onClose', async () => clock!.restore());
  }

  /** Accounts mode: the browser comes back from a login (not from connecting a workspace). */
  const loginCallback = async (req: FastifyRequest<{ Querystring: { code?: string; state?: string; error?: string } }>, reply: FastifyReply) => {
    reply.header('set-cookie', accounts.loginCookie('', 0));
    try {
      const { id, joined } = await accounts.complete({ ...req.query, cookieState: cookieValue(req.headers.cookie, LOGIN_COOKIE) });
      await afterJoin(joined);
      reply.header('set-cookie', accounts.sessionCookie(id));
      return reply.redirect('/');
    } catch (e) {
      if (!(e instanceof ConnectError)) req.log.error(e);
      return reply.redirect(`/?login_error=${encodeURIComponent(e instanceof ConnectError ? e.message : 'The login failed. Details are in the server log.')}`);
    }
  };

  /** The browser comes back here from Atlassian, to the workspace that started the flow. Always a redirect to Settings. */
  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>(CALLBACK_PATH, { schema: { hide: true, querystring: oauthCallbackQuery } }, async (req, reply) => {
    if (accounts.enabled && (cookieValue(req.headers.cookie, LOGIN_COOKIE) !== undefined || accounts.issued(req.query.state))) return loginCallback(req, reply);
    reply.header('set-cookie', stateCookie('', connect.publicUrl, 0));
    const w = workspaces.all().find((x) => x.atlassian.issued(req.query.state)) ?? main;
    const back = (q: Record<string, string>) => reply.redirect(`/?${new URLSearchParams(q)}#${workspacePath(w.id)}/settings`);
    try {
      const { site, actor } = await w.atlassian.complete({ ...req.query, cookieState: cookieValue(req.headers.cookie, STATE_COOKIE) });
      await w.store.audit({ at: new Date().toISOString(), kind: 'connection', actor, summary: `Atlassian connected (${site?.name ?? 'no site'})` });
      await track(w, 'source_connected', { source: 'atlassian' }, req.account?.userId).catch(() => undefined);
      return back({ connected: 'atlassian' });
    } catch (e) {
      if (!(e instanceof ConnectError)) req.log.error(e);
      return back({ connect_error: e instanceof ConnectError ? e.message : 'Connecting Atlassian failed. Details are in the server log.' });
    }
  });

  // ------------------------------------------------------------------ organizations, for the operator
  /** Only an operator of the installation (CI_OPERATOR_EMAILS) or a machine with the admin token. */
  const requireOperator = (req: FastifyRequest) => {
    if (!accounts.enabled) throw httpError(404, 'Organizations exist only when people log in (CI_AUTH_MODE=accounts).');
    if (req.principal !== 'admin_token' && !req.account?.operator) throw httpError(403, 'Only an operator of this installation (CI_OPERATOR_EMAILS) may do this.');
  };

  app.get('/api/orgs', { schema: { summary: 'Every organization with its workspaces and people (operator)' } }, async (req) => {
    requireOperator(req);
    return accounts.allOrgs().map((o) => ({
      ...o,
      home: o.id === accounts.homeOrgId,
      workspaces: workspaces.all().filter((w) => orgOf(w) === o.id).map(({ id, name }) => ({ id, name })),
      members: accounts.members(o.id).length,
      invitations: accounts.openInvitations(o.id).length,
    }));
  });

  const orgBody = {
    type: 'object',
    required: ['name', 'workspace', 'ownerEmail'],
    additionalProperties: false,
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 100 },
      workspace: { type: 'object', required: ['id'], additionalProperties: false, properties: { id: { type: 'string', pattern: WORKSPACE_ID_PATTERN }, name: { type: 'string', maxLength: 100 } } },
      ownerEmail: { type: 'string', maxLength: 200, pattern: '^[^\\s@]+@[^\\s@]+$' },
    },
  } as const;

  /** A new organization with its first workspace and a one-time invitation for its Owner (the link is shown once). */
  app.post<{ Body: { name: string; workspace: { id: string; name?: string }; ownerEmail: string } }>(
    '/api/orgs',
    { schema: { summary: 'Open an organization: its first workspace and an invitation for its Owner (operator)', body: orgBody, response: errors(403, 404, 409, 422), ...MUTATION } },
    async (req, reply) => {
      requireOperator(req);
      return reply.code(201).send(await openOrg(req, req.body));
    },
  );

  /** Opens an organization with its first workspace and an Owner invitation; audited there and in the first organization. */
  async function openOrg(req: FastifyRequest, o: { name: string; workspace: { id: string; name?: string }; ownerEmail: string }) {
    const { actor, via } = who(req, null);
    if (workspaces.get(o.workspace.id)) throw httpError(409, `Workspace ${o.workspace.id} already exists`);
    const org = await accounts.createOrg(o.name);
    const at = new Date().toISOString();
    const w = await workspaces.create(o.workspace.id, o.workspace.name ?? o.name, at, org.id);
    const invitation = await accounts.invite(actor ?? 'operator', 'owner', o.ownerEmail, org.id);
    const summary = `Organization ${org.name} opened with workspace ${w.id}; Owner invitation for ${invitation.email}`;
    await w.store.audit({ at, kind: 'member', actor, via, summary });
    await main.store.audit({ at, kind: 'member', actor, via, summary });
    return { org, workspace: { id: w.id, name: w.name }, invitation };
  }

  // ------------------------------------------------------------------ closed beta (docs/BETA-ENROLLMENT-PLAN.md)
  const betaOff = () => httpError(404, 'The beta needs people to log in (CI_AUTH_MODE=accounts).');
  app.get('/api/beta', { schema: { summary: 'Whether teams may apply for the beta, and for how long it runs (public)' } }, async () => {
    if (!accounts.enabled) throw betaOff();
    return { open: beta.cfg.open, weeks: beta.cfg.weeks };
  });

  const text = (max: number) => ({ type: 'string', minLength: 1, maxLength: max, pattern: '\\S' }) as const;
  const applicationBody = {
    type: 'object',
    required: ['org', 'team', 'contactName', 'contactEmail', 'writers', 'builders', 'sources', 'realData', 'consents'],
    additionalProperties: false,
    properties: {
      org: text(100),
      team: text(100),
      contactName: text(100),
      contactEmail: { type: 'string', maxLength: 200, pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$' },
      contactRole: { type: 'string', maxLength: 100 },
      writers: { type: 'integer', minimum: 0, maximum: 1000 },
      builders: { type: 'integer', minimum: 0, maximum: 1000 },
      sources: { type: 'array', minItems: 1, maxItems: BETA_SOURCES.length, uniqueItems: true, items: { type: 'string', enum: BETA_SOURCES } },
      realData: { type: 'string', enum: BETA_REAL_DATA },
      reference: { type: 'string', enum: BETA_REFERENCE },
      consents: {
        type: 'object',
        required: ['terms', 'measurement', 'surveys'],
        additionalProperties: false,
        properties: { terms: { const: true }, measurement: { const: true }, surveys: { const: true } },
      },
      // Left empty by people; a bot that fills every field is answered the same and nothing is stored.
      website: { type: 'string', maxLength: 200 },
    },
  } as const;
  const allowApplication = applicationLimiter();

  /** The public application form. The answer is the same whether or not something was stored. */
  app.post<{ Body: BetaApplication & { consents: object; website?: string } }>(
    '/api/beta/apply',
    { schema: { summary: 'Apply for the closed beta (public; all three consents required)', body: applicationBody, response: errors(404, 410, 422, 429, 503) } },
    async (req, reply) => {
      if (!accounts.enabled) throw betaOff();
      if (!beta.cfg.open) throw httpError(410, 'Applications for the beta are closed.');
      if (!allowApplication(req.ip, Date.now())) throw httpError(429, 'Too many applications from this address. Please try again in an hour.', { 'retry-after': '3600' });
      const { consents: _c, website, ...application } = req.body;
      if (!website) {
        const r = await beta.apply({ ...application, sources: [...application.sources] }, new Date().toISOString());
        if (r.enrollment) {
          await main.store.audit({ at: r.enrollment.appliedAt, kind: 'member', actor: 'beta form', summary: `Beta application from ${application.org} (${application.team})` });
          mailNow(betaMails.applied(r.enrollment));
          if (operatorEmails.length) mailNow(betaMails.newApplication(r.enrollment, operatorEmails, connect.publicUrl));
        }
      }
      return reply.code(202).send({ received: true });
    },
  );

  app.get('/api/beta/enrollments', { schema: { summary: 'Beta applications and enrollments with their surveys, newest first (operator)' } }, async (req) => {
    requireOperator(req);
    const now = Date.now();
    return beta.enrollments().map((e) => ({ ...e, ...betaView(e, now, pauseAfterDays), surveySlots: surveyStates(e, now) }));
  });

  // ------------------------------------------------------------------ beta surveys (docs/BETA-SURVEYS.md)
  const enrollmentParams = { type: 'object', required: ['id'], properties: { id: { type: 'string', minLength: 1, maxLength: 100 } } } as const;
  /** The beta of the person's organization, or 404: surveys are for the people of a beta team. */
  const betaOfPerson = (req: FastifyRequest) => {
    if (!accounts.enabled) throw betaOff();
    const e = req.account && beta.forOrg(req.account.orgId);
    if (!e || !e.startedAt) throw httpError(404, 'Your organization does not take part in the beta.');
    return e;
  };

  app.get('/api/beta/surveys', { schema: { summary: "The surveys of the person's beta team; open ones with their questions" } }, async (req) => {
    const e = betaOfPerson(req);
    return surveyStates(e, Date.now(), req.account!.userId).map((x) => {
      const def = SURVEYS[x.kind];
      return { ...x, title: def.title, minutes: def.minutes, ...(x.state !== 'upcoming' && !x.mine && { version: def.version, questions: def.questions }) };
    });
  });

  const surveyParams = { type: 'object', required: ['id'], properties: { id: { type: 'string', pattern: '^(entry|exit|biweekly-[0-9]{1,2})$' } } } as const;
  const answersBody = {
    type: 'object',
    required: ['answers'],
    additionalProperties: false,
    properties: {
      answers: {
        type: 'object',
        maxProperties: 40,
        additionalProperties: { anyOf: [{ type: 'string', maxLength: 2000 }, { type: 'number' }, { type: 'array', maxItems: 20, items: { type: 'string', maxLength: 100 } }] },
      },
    },
  } as const;

  /** One person's answers; the questions are checked against the survey's definition (422 lists every problem). */
  app.post<{ Params: { id: string }; Body: { answers: Record<string, unknown> } }>(
    '/api/beta/surveys/:id/answers',
    { schema: { summary: 'Answer an open survey of your beta team (once per person)', params: surveyParams, body: answersBody, response: errors(404, 409, 422), ...MUTATION } },
    async (req, reply) => {
      const e = betaOfPerson(req);
      const at = new Date().toISOString();
      const saved = await beta.answer(e.id, req.params.id, { userId: req.account!.userId, name: req.account!.name }, req.body.answers, at);
      await auditOf(e.orgId).audit({ at, kind: 'member', actor: req.account!.name, via: 'session', summary: `${SURVEYS[saved.kind].title} answered (${saved.survey})` });
      return reply.code(201).send({ survey: saved.survey, at: saved.at, beta: betaView(beta.forOrg(e.orgId!)!, Date.now(), pauseAfterDays) });
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/beta/enrollments/:id/answers',
    { schema: { summary: "Every survey answer of a beta team, oldest first (operator)", params: enrollmentParams, response: errors(403, 404) } },
    async (req) => {
      requireOperator(req);
      if (!beta.enrollments().some((e) => e.id === req.params.id)) throw httpError(404, 'No such application.');
      return beta.answersOf(req.params.id);
    },
  );

  const approveBody = {
    type: 'object',
    required: ['workspace'],
    additionalProperties: false,
    properties: { workspace: orgBody.properties.workspace, orgName: { type: 'string', minLength: 1, maxLength: 100 } },
  } as const;

  /** Approving opens the team's organization and workspace and returns the Owner's invitation link (shown once). */
  app.post<{ Params: { id: string }; Body: { workspace: { id: string; name?: string }; orgName?: string } }>(
    '/api/beta/enrollments/:id/approve',
    { schema: { summary: "Approve an application: the team's organization, workspace and Owner invitation (operator)", params: enrollmentParams, body: approveBody, response: errors(403, 404, 409, 422), ...MUTATION } },
    async (req, reply) => {
      requireOperator(req);
      const e = beta.check(req.params.id, ['applied']);
      const opened = await openOrg(req, { name: req.body.orgName ?? e.application.org, workspace: { id: req.body.workspace.id, name: req.body.workspace.name ?? e.application.team }, ownerEmail: e.application.contactEmail });
      const { actor, via } = who(req, null);
      const at = new Date().toISOString();
      const enrollment = await beta.approve(e.id, { orgId: opened.org.id, workspace: opened.workspace.id, invitationId: opened.invitation.id, by: actor ?? 'operator', at });
      await main.store.audit({ at, kind: 'member', actor, via, summary: `Beta application from ${e.application.org} approved` });
      mailNow(betaMails.invited(enrollment, opened.invitation.link, beta.cfg.weeks));
      return reply.code(201).send({ enrollment, ...opened });
    },
  );

  app.post<{ Params: { id: string }; Body: { note?: string } | null }>(
    '/api/beta/enrollments/:id/reject',
    {
      schema: {
        summary: 'Reject an application (operator); the note stays with it, the team is not told here',
        params: enrollmentParams,
        body: { type: ['object', 'null'], additionalProperties: false, properties: { note: { type: 'string', maxLength: 500 } } },
        response: errors(403, 404, 409, 422),
        ...MUTATION,
      },
    },
    async (req) => {
      requireOperator(req);
      const { actor, via } = who(req, null);
      const at = new Date().toISOString();
      const e = await beta.reject(req.params.id, { by: actor ?? 'operator', at, note: req.body?.note?.trim() || undefined });
      await main.store.audit({ at, kind: 'member', actor, via, summary: `Beta application from ${e.application.org} rejected` });
      return e;
    },
  );

  /** A new Owner invitation for a team that has not joined yet; the old link stops working. */
  app.post<{ Params: { id: string } }>(
    '/api/beta/enrollments/:id/reinvite',
    { schema: { summary: 'Send the Owner invitation again; the previous link stops working (operator)', params: enrollmentParams, response: errors(403, 404, 409), ...MUTATION } },
    async (req) => {
      requireOperator(req);
      const e = beta.check(req.params.id, ['invited']);
      const { actor, via } = who(req, null);
      await accounts.revoke(e.invitationId!, e.orgId).catch(() => undefined);
      const invitation = await accounts.invite(actor ?? 'operator', 'owner', e.application.contactEmail, e.orgId);
      const at = new Date().toISOString();
      const enrollment = await beta.reinvite(e.id, { invitationId: invitation.id, by: actor ?? 'operator', at });
      await main.store.audit({ at, kind: 'member', actor, via, summary: `Beta invitation for ${e.application.org} sent again` });
      mailNow(betaMails.invited(enrollment, invitation.link, beta.cfg.weeks));
      return { enrollment, invitation };
    },
  );

  const daysBody = (max: number) =>
    ({ type: 'object', required: ['days'], additionalProperties: false, properties: { days: { type: 'integer', minimum: 1, maximum: max }, reason: { type: 'string', maxLength: 300 } } }) as const;

  /** Moves the end of a team's beta; a team that ended comes back while the new end is ahead. */
  app.post<{ Params: { id: string }; Body: { days: number; reason?: string } }>(
    '/api/beta/enrollments/:id/extend',
    { schema: { summary: "Move the end of a team's beta by some days (operator)", params: enrollmentParams, body: daysBody(60), response: errors(403, 404, 409, 422), ...MUTATION } },
    async (req) => {
      requireOperator(req);
      const { actor, via } = who(req, null);
      const at = new Date().toISOString();
      const e = await beta.extend(req.params.id, { days: req.body.days, by: actor ?? 'operator', at, reason: req.body.reason?.trim() || undefined });
      await main.store.audit({ at, kind: 'member', actor, via, summary: `Beta of ${e.application.org} extended to ${e.endsAt!.slice(0, 10)}` });
      await betaJob();
      return { ...beta.forOrg(e.orgId!)!, ...betaView(beta.forOrg(e.orgId!)!, Date.now(), pauseAfterDays) };
    },
  );

  /** Holds off the pause for some days (holiday, a change in the team); a paused team resumes at once. */
  app.post<{ Params: { id: string }; Body: { days: number; reason?: string } }>(
    '/api/beta/enrollments/:id/grace',
    { schema: { summary: 'Hold off the pause of a team for some days (operator)', params: enrollmentParams, body: daysBody(30), response: errors(403, 404, 409, 422), ...MUTATION } },
    async (req) => {
      requireOperator(req);
      const { actor, via } = who(req, null);
      const at = new Date().toISOString();
      const e = await beta.grace(req.params.id, { days: req.body.days, by: actor ?? 'operator', at, reason: req.body.reason?.trim() || undefined });
      await main.store.audit({ at, kind: 'member', actor, via, summary: `Beta of ${e.application.org}: no pause before ${e.graceUntil!.slice(0, 10)}` });
      await betaJob();
      return { ...beta.forOrg(e.orgId!)!, ...betaView(beta.forOrg(e.orgId!)!, Date.now(), pauseAfterDays) };
    },
  );

  /** The beta's job (docs/BETA-ENROLLMENT-PLAN.md): every hour, and right after an operator's change. */
  const betaJob = (now = Date.now()) =>
    accounts.enabled
      ? runBetaJob(
          {
            beta,
            mailer,
            operatorEmails,
            publicUrl: connect.publicUrl,
            pauseAfterDays,
            workspacesOf: (orgId) => workspaces.all().filter((w) => orgOf(w) === orgId),
            audit: async (orgId, summary, at) => auditOf(orgId).audit({ at, kind: 'member', actor: 'beta job', summary }),
            log: (o, msg) => app.log.warn(o, msg),
          },
          now,
        )
      : Promise.resolve();
  const betaTimer = accounts.enabled && process.env.CI_BETA_JOB !== 'off' && process.env.CI_DISABLE_SCHEDULE !== 'true' ? setInterval(() => void betaJob().catch((e) => app.log.error(e)), 3_600_000) : undefined;
  betaTimer?.unref();
  if (betaTimer) void betaJob().catch((e) => app.log.error(e));
  app.addHook('onClose', async () => {
    if (betaTimer) clearInterval(betaTimer);
    if (usageTimer) clearInterval(usageTimer);
    await usage.idle();
  });

  // ------------------------------------------------------------------ usage of the beta teams (T8)
  app.get<{ Params: { id: string } }>(
    '/api/beta/enrollments/:id/usage',
    { schema: { summary: "A beta team's usage measures, week by week (operator)", params: enrollmentParams, response: errors(403, 404) } },
    async (req) => {
      requireOperator(req);
      const e = beta.enrollments().find((x) => x.id === req.params.id);
      if (!e) throw httpError(404, 'No such application.');
      if (!e.startedAt || !e.orgId) return { measurement: false, report: null };
      return { measurement: e.measurement !== false, report: usageReport(await usage.eventsOf(e.orgId), e.startedAt, Date.now()) };
    },
  );

  /** The team's Admin switches usage measurement off or on again; the consent from the form starts it on. */
  app.put<{ Body: { on: boolean } }>(
    '/api/beta/measurement',
    { schema: { summary: "Switch your beta team's usage measurement on or off (Admin)", body: { type: 'object', required: ['on'], additionalProperties: false, properties: { on: { type: 'boolean' } } }, response: errors(403, 404, 422), ...MUTATION } },
    async (req) => {
      if (!req.account) throw httpError(404, 'Your organization does not take part in the beta.');
      const at = new Date().toISOString();
      const e = await beta.setMeasurement(req.account.orgId, req.body.on, { by: req.account.name, at });
      await auditOf(e.orgId).audit({ at, kind: 'settings', actor: req.account.name, via: 'session', summary: `Beta usage measurement switched ${req.body.on ? 'on' : 'off'}` });
      return { measurement: e.measurement !== false };
    },
  );

  // ------------------------------------------------------------------ pdi (F4, docs/PDI-F4-PLAN.md), across workspaces
  app.get('/api/pdi', async (req) => (requirePdiVisible(req), pdi.status()));

  /** The pdi changes (stories labelled `change:CHG-n`) of all workspaces with their readiness and the last request for approval. */
  app.get('/api/changes', async (req) => {
    requirePdiVisible(req);
    const [parts, state] = await Promise.all([changeParts(), main.store.pdiState()]);
    /** Where each story of a change is: the workspace whose part of the change lists it. */
    const workspacesOf = (change: string) => Object.fromEntries(parts.flatMap((p) => (p.changes.find((c) => c.change === change)?.items ?? []).map((k) => [k, p.w.id])));
    return {
      pdi: pdi.enabled,
      changes: mergeChangeReadiness(parts.map((p) => p.changes)).map((c) => ({ ...c, workspaces: workspacesOf(c.change), ...(state.requested?.[c.change] && { requested: state.requested[c.change] }) })),
    };
  });

  /** F4: ask pdi to decide "Approve for implementation" for a change that is not ready (`gate.requested`). */
  app.post<{ Params: { change: string }; Body: { by?: string; note?: string } | null }>(
    '/api/changes/:change/request-approval',
    { schema: { summary: 'Ask pdi to decide the approval of a change that is not ready', params: changeParams, body: approvalRequestBody, response: errors(404, 409, 422), ...MUTATION } },
    async (req) => {
      requirePdiVisible(req);
      if (!pdi.enabled) throw httpError(409, 'The pdi link is not configured (PDI_EVENTS_URL and PDI_SIGNING_SECRET).');
      const parts = await changeParts();
      const change = mergeChangeReadiness(parts.map((p) => p.changes)).find((c) => c.change === req.params.change);
      if (!change) throw httpError(404, `No stories labelled with change ${req.params.change}`);
      if (change.readiness === 'ready') throw httpError(409, `${change.change} is ready: pdi already has it as "Approve for implementation".`);
      const by = who(req, req.body);
      const stories = parts.flatMap((p) => p.changes.filter((c) => c.change === change.change).flatMap((c) => c.items.map((k) => p.result.items.find((i) => i.key === k)!).filter(Boolean)));
      const first = parts.find((p) => p.changes.some((c) => c.change === change.change));
      const event = await pdi.requestApproval({ change, stories, requestedBy: by.actor, note: req.body?.note, workspace: first?.w.id });
      await main.store.audit({ at: event.occurred_at, kind: 'pdi', ...by, summary: `Asked pdi to approve ${change.change} for implementation (${change.readiness})` });
      void pdi.deliver().catch((e) => app.log.error(e));
      return { event };
    },
  );

  /**
   * gate.decided from pdi. Outside the admin-token guard like the other webhooks, but signed: the raw body is needed
   * for the HMAC, so this route parses JSON itself. Without PDI_SIGNING_SECRET the route does not exist (404).
   */
  await app.register(async (scope) => {
    scope.addContentTypeParser('application/json', { parseAs: 'string', bodyLimit: 64 * 1024 }, (_req, body, done) => done(null, body));
    scope.post('/api/webhooks/pdi', { schema: { hide: true } }, async (req, reply) => {
      if (!pdi.secret) return notFound(req, reply);
      const raw = typeof req.body === 'string' ? req.body : '';
      const header = (name: string) => (typeof req.headers[name] === 'string' ? (req.headers[name] as string) : undefined);
      const problemWithSignature = pdiSignatureProblem(pdi.secret, header('x-pdi-timestamp'), raw, header('x-pdi-signature'), pdi.now());
      if (problemWithSignature) throw httpError(401, problemWithSignature);
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw httpError(400, 'The body is not valid JSON');
      }
      const event = parseGateDecided(parsed);
      if (typeof event === 'string') throw httpError(400, event);
      if (header('x-pdi-event') !== 'gate.decided') throw httpError(400, 'X-PDI-Event does not match the event type');
      if (!(await pdi.firstTime(event.id))) return { duplicate: true, approved: [], skipped: [] };
      const at = pdi.now().toISOString();
      if (event.gate !== APPROVE_GATE || event.outcome !== 'approved') {
        await main.store.audit({ at, kind: 'pdi', actor: 'pdi', via: 'pdi_signature', summary: `pdi decision ${event.decision} on ${event.change}: ${event.gate} ${event.outcome} (nothing to approve here)` });
        return { recorded: true, approved: [], skipped: [] };
      }
      const approved: string[] = [];
      const skipped: { key: string; reason: string }[] = [];
      // The change's stories in every workspace (F5); each approval is recorded where the story is.
      for (const { w, result, changes } of await changeParts()) {
        const mine: string[] = [];
        for (const key of changes.find((c) => c.change === event.change)?.items ?? []) {
          const item = result.items.find((i) => i.key === key)!;
          // Same rule as POST /api/items/:key/approve without force: forcing stays a human decision here.
          if (item.readiness === 'not_ready' && item.findings.some((f) => f.blocks && f.origin !== 'drift')) {
            skipped.push({ key, reason: `blocking issues: ${item.blockingIssues.join('; ') || 'see the item'}` });
            continue;
          }
          await w.engine.approve(key, { actor: 'pdi', via: 'pdi_signature' }, undefined, event.decision);
          mine.push(key);
        }
        approved.push(...mine);
        if (w !== main && mine.length) await w.store.audit({ at, kind: 'pdi', actor: 'pdi', via: 'pdi_signature', summary: `pdi decision ${event.decision}: ${event.change} approved for implementation — approved ${mine.join(', ')}` });
        if (mine.length) await w.engine.analyze(`approval of ${event.change} from pdi (${event.decision})`);
      }
      await main.store.audit({ at, kind: 'pdi', actor: 'pdi', via: 'pdi_signature', summary: `pdi decision ${event.decision}: ${event.change} approved for implementation — approved ${approved.join(', ') || 'none'}${skipped.length ? `, skipped ${skipped.map((s) => s.key).join(', ')}` : ''}` });
      return { approved, skipped };
    });
  });

  // ------------------------------------------------------------------ web UI
  if (opts.webDir && existsSync(opts.webDir)) {
    await app.register(fastifyStatic, { root: opts.webDir });
    app.setNotFoundHandler((req, reply) => (req.url.startsWith('/api/') ? notFound(req, reply) : reply.sendFile('index.html')));
  } else {
    app.setNotFoundHandler(notFound);
  }
  if (opts.webDir && !existsSync(opts.webDir)) {
    app.get('/', (_req, reply) =>
      reply
        .type('text/html')
        .send(
          '<!doctype html><meta charset="utf-8"><title>Continuous Intelligence</title><body style="font:15px system-ui;max-width:640px;margin:60px auto;line-height:1.5">' +
            '<h2>The web UI has not been built yet</h2><p>The API is running, but <code>packages/web/dist</code> is missing. Run:</p>' +
            '<pre style="background:#f1f3f6;padding:12px;border-radius:8px">npm run build\nnpm start</pre>' +
            '<p>or use <code>npm run dev</code> and open <a href="http://localhost:5173">http://localhost:5173</a>.</p></body>',
        ),
    );
  }

  app.addHook('onClose', async () => {
    for (const w of workspaces.all()) w.engine.stop();
  });
  // The pool closes last: whatever order the hooks run in, pdi's last delivery and the engines are done with it first.
  if (pool)
    app.addHook('onClose', async () => {
      for (const w of workspaces.all()) w.engine.stop();
      await pdi.deliver().catch(() => undefined);
      await usage.idle().catch(() => undefined);
      await pool.end();
    });
  return { app, engine: main.engine, store: main.store, pdi, workspaces, accounts, betaJob, usage, settle: () => settle() };
}
