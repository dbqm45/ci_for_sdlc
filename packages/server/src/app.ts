import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifySwagger from '@fastify/swagger';
import { existsSync } from 'node:fs';
import { APPROVE_GATE, RULES, changeKeyOf, changeReadiness, mergeChangeReadiness, parseGateDecided, workspacePath, type AnalysisResult, type ChangeReadiness } from '@ci/core';
import { CALLBACK_PATH, ConnectError, STATE_COOKIE, connectConfigFromEnv, cookieValue, stateCookie, type ConnectConfig } from './connections.js';
import type { Engine } from './engine.js';
import { PdiLink, pdiSignatureProblem, type PdiOptions } from './pdi.js';
import { guardConfigFromEnv, httpError, notFound, registerGuards, registerProblemHandler, type GuardConfig } from './http.js';
import { ensure, who, workspaceRoutes } from './routes-workspace.js';
import { MUTATION, approvalRequestBody, changeParams, errors, oauthCallbackQuery, problem, workspaceBody, workspaceDeleteBody, workspaceParams, workspaceRenameBody } from './schemas.js';
import type { Store } from './store.js';
import { APP_VERSION } from './version.js';
import { DEFAULT_WORKSPACE, WorkspaceExistsError, WorkspaceRefusedError, Workspaces, type Workspace } from './workspaces.js';

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
export async function buildApp(opts: AppOptions): Promise<{ app: FastifyInstance; engine: Engine; store: Store; pdi: PdiLink; workspaces: Workspaces }> {
  const connect = opts.connect ?? connectConfigFromEnv();
  // Strict bodies: unknown properties and wrong types are rejected, not silently dropped or coerced.
  const app = Fastify({ logger: opts.logger ?? false, ajv: { customOptions: { removeAdditional: false, coerceTypes: false, allErrors: true } } });
  let pdi!: PdiLink;

  /** The pdi changes with the stories of every workspace (F5): each workspace is analysed first. */
  const changeParts = async (): Promise<ChangePart[]> =>
    Promise.all(
      workspaces.all().map(async (w) => {
        const result = await ensure(w.engine);
        const prefix = (await w.store.settings()).integrations.jira.changeLabelPrefix || undefined;
        return { w, result, changes: changeReadiness(result.items, w.engine.state.context?.requirements ?? [], prefix) };
      }),
    );

  const workspaces = new Workspaces(opts.dataDir, connect, async (w) => {
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

  const env = guardConfigFromEnv();
  const guard: GuardConfig = { adminToken: opts.adminToken ?? env.adminToken, readToken: opts.readToken ?? env.readToken, allowedHosts: opts.allowedHosts ?? env.allowedHosts, allowedOrigins: opts.allowedOrigins ?? env.allowedOrigins };

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

  const pdiTimer = pdi.enabled ? setInterval(() => void pdi.deliver().catch(() => undefined), 60_000) : undefined;
  pdiTimer?.unref();
  app.addHook('onClose', async () => {
    if (pdiTimer) clearInterval(pdiTimer);
    await pdi.deliver().catch(() => undefined);
  });

  app.get('/api/openapi.json', { schema: { hide: true } }, async () => app.swagger());
  app.get('/api/health', async () => ({ ok: true, version: APP_VERSION, running: main.engine.state.running, lastError: main.engine.state.lastError }));
  app.get('/api/rules', async () => RULES.map(({ id, name, description, appliesTo }) => ({ id, name, description, appliesTo })));

  // ------------------------------------------------------------------ workspaces (F5, docs/WORKSPACES-F5-PLAN.md)
  app.get('/api/workspaces', async () => workspaces.list());
  app.post<{ Body: { id: string; name?: string; by?: string } }>(
    '/api/workspaces',
    { schema: { summary: 'Create a workspace with its own sources, analysis and decisions', body: workspaceBody, response: errors(409, 422), ...MUTATION } },
    async (req, reply) => {
      const at = new Date().toISOString();
      try {
        const w = await workspaces.create(req.body.id, req.body.name ?? req.body.id, at);
        await main.store.audit({ at, kind: 'workspace', ...who(req, req.body), summary: `Workspace ${w.id} (${w.name}) created` });
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
      if (!workspaces.get(req.params.ws)) throw httpError(404, `No workspace ${req.params.ws}`);
      const at = new Date().toISOString();
      const before = workspaces.get(req.params.ws)!.name;
      const w = await workspaces.rename(req.params.ws, req.body.name.slice(0, 100), at);
      await main.store.audit({ at, kind: 'workspace', ...who(req, req.body), summary: `Workspace ${w.id} renamed from ${before} to ${w.name}` });
      return { id: w.id, name: w.name };
    },
  );

  /** Deleting moves the workspace's data aside (nothing is erased); the id must be typed back. */
  app.delete<{ Params: { ws: string }; Body: { confirm: string; by?: string } }>(
    '/api/workspaces/:ws',
    { schema: { summary: 'Delete a workspace: it stops and its data moves to workspaces-deleted/ in the data directory', params: workspaceParams, body: workspaceDeleteBody, response: errors(400, 404, 409, 422), ...MUTATION } },
    async (req) => {
      const id = req.params.ws;
      if (!workspaces.get(id)) throw httpError(404, `No workspace ${id}`);
      if (id === DEFAULT_WORKSPACE) throw httpError(409, 'The default workspace cannot be deleted.');
      if (req.body.confirm !== id) throw httpError(400, `Type the workspace id (${id}) in confirm to delete it.`);
      const at = new Date().toISOString();
      try {
        const { archivedTo } = await workspaces.remove(id, at);
        await main.store.audit({ at, kind: 'workspace', ...who(req, req.body), summary: `Workspace ${id} deleted; its data moved to ${archivedTo}` });
        return { deleted: id, archivedTo };
      } catch (e) {
        if (e instanceof WorkspaceRefusedError) throw httpError(409, e.message);
        throw e;
      }
    },
  );

  // ------------------------------------------------------------------ the routes of a workspace
  await app.register(async (scope) => workspaceRoutes(scope, { of: () => main, connect }), { prefix: '/api' });
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
        if (!workspaces.get(id)) throw httpError(404, `No workspace ${id}`);
      });
      await workspaceRoutes(scope, { of: (req: FastifyRequest) => workspaces.get((req.params as { ws: string }).ws)!, connect });
    },
    { prefix: '/api/w/:ws' },
  );

  /** The browser comes back here from Atlassian, to the workspace that started the flow. Always a redirect to Settings. */
  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>(CALLBACK_PATH, { schema: { hide: true, querystring: oauthCallbackQuery } }, async (req, reply) => {
    reply.header('set-cookie', stateCookie('', connect.publicUrl, 0));
    const w = workspaces.all().find((x) => x.atlassian.issued(req.query.state)) ?? main;
    const back = (q: Record<string, string>) => reply.redirect(`/?${new URLSearchParams(q)}#${workspacePath(w.id)}/settings`);
    try {
      const { site, actor } = await w.atlassian.complete({ ...req.query, cookieState: cookieValue(req.headers.cookie, STATE_COOKIE) });
      await w.store.audit({ at: new Date().toISOString(), kind: 'connection', actor, summary: `Atlassian connected (${site?.name ?? 'no site'})` });
      return back({ connected: 'atlassian' });
    } catch (e) {
      if (!(e instanceof ConnectError)) req.log.error(e);
      return back({ connect_error: e instanceof ConnectError ? e.message : 'Connecting Atlassian failed. Details are in the server log.' });
    }
  });

  // ------------------------------------------------------------------ pdi (F4, docs/PDI-F4-PLAN.md), across workspaces
  app.get('/api/pdi', async () => pdi.status());

  /** The pdi changes (stories labelled `change:CHG-n`) of all workspaces with their readiness and the last request for approval. */
  app.get('/api/changes', async () => {
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
  return { app, engine: main.engine, store: main.store, pdi, workspaces };
}
