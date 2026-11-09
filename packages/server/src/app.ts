import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifySwagger from '@fastify/swagger';
import { existsSync } from 'node:fs';
import { APPROVE_GATE, RULES, changeKeyOf, changeReadiness, mergeChangeReadiness, parseGateDecided, workspacePath, type AnalysisResult, type ChangeReadiness } from '@ci/core';
import { Accounts, SESSION_COOKIE, LOGIN_COOKIE, type InvitedRole } from './accounts.js';
import { ROLES, type Role } from './roles.js';
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
export async function buildApp(opts: AppOptions): Promise<{ app: FastifyInstance; engine: Engine; store: Store; pdi: PdiLink; workspaces: Workspaces; accounts: Accounts }> {
  const authMode = opts.authMode ?? process.env.CI_AUTH_MODE ?? 'token';
  if (authMode !== 'token' && authMode !== 'accounts') throw new Error(`CI_AUTH_MODE must be "token" or "accounts", not "${authMode}".`);
  const connect = opts.connect ?? connectConfigFromEnv();
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
  });
  if (accounts.enabled) await accounts.init();

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

  const env = guardConfigFromEnv();
  const guard: GuardConfig = { adminToken: opts.adminToken ?? env.adminToken, readToken: opts.readToken ?? env.readToken, allowedHosts: opts.allowedHosts ?? env.allowedHosts, allowedOrigins: opts.allowedOrigins ?? env.allowedOrigins,
    mode: authMode,
    session: (req) => accounts.session(cookieValue(req.headers.cookie, SESSION_COOKIE)),
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
    const { url, cookie } = accounts.start({ bootstrap: req.query.bootstrap, invite: req.query.invite });
    reply.header('set-cookie', cookie);
    return reply.redirect(url);
  });

  app.get('/api/auth/me', { schema: { summary: 'The auth mode and the logged-in person with their organization, if any' } }, async (req) => {
    const a = req.account;
    if (!a) return { mode: authMode, user: null };
    const org = accounts.org(a.orgId);
    const mine = workspaces.all().filter((w) => visible(req, w));
    return {
      mode: authMode,
      user: { id: a.userId, name: a.name, email: a.email, role: a.role, operator: a.operator },
      org: org ? { id: org.id, name: org.name } : null,
      // Where the app opens: `default` when the person sees it, else their organization's first workspace.
      home: mine.some((w) => w.id === DEFAULT_WORKSPACE) ? DEFAULT_WORKSPACE : (mine[0]?.id ?? null),
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

  /** Accounts mode: the browser comes back from a login (not from connecting a workspace). */
  const loginCallback = async (req: FastifyRequest<{ Querystring: { code?: string; state?: string; error?: string } }>, reply: FastifyReply) => {
    reply.header('set-cookie', accounts.loginCookie('', 0));
    try {
      const { id, joined } = await accounts.complete({ ...req.query, cookieState: cookieValue(req.headers.cookie, LOGIN_COOKIE) });
      if (joined) await auditOf(joined.orgId).audit({ at: new Date().toISOString(), kind: 'member', actor: joined.name, via: 'session', summary: `${joined.name} joined as ${joined.role}` });
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
      const { actor, via } = who(req, null);
      if (workspaces.get(req.body.workspace.id)) throw httpError(409, `Workspace ${req.body.workspace.id} already exists`);
      const org = await accounts.createOrg(req.body.name);
      const at = new Date().toISOString();
      const w = await workspaces.create(req.body.workspace.id, req.body.workspace.name ?? req.body.name, at, org.id);
      const invitation = await accounts.invite(actor ?? 'operator', 'owner', req.body.ownerEmail, org.id);
      const summary = `Organization ${org.name} opened with workspace ${w.id}; Owner invitation for ${invitation.email}`;
      await w.store.audit({ at, kind: 'member', actor, via, summary });
      await main.store.audit({ at, kind: 'member', actor, via, summary });
      return reply.code(201).send({ org, workspace: { id: w.id, name: w.name }, invitation });
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
      await pool.end();
    });
  return { app, engine: main.engine, store: main.store, pdi, workspaces, accounts };
}
