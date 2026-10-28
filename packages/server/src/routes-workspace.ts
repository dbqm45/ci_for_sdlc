import type { FastifyInstance, FastifyRequest } from 'fastify';
import { AUTO_CLOSE_DECISION_TYPE, acceptanceStats, autoCloseDecision, DEMO_SCENARIOS, DEFAULT_MODELS, clearFigmaCache, errorMessage, impactAnalysis, recordDecision, withdrawDecision, type ActiveDecision, type AnalysisResult, type DecisionEffect, type NewDecision, type WithdrawnDecision } from '@ci/core';
import { createHash, timingSafeEqual } from 'node:crypto';
import { ConnectError, stateCookie, type ConnectConfig } from './connections.js';
import { proposalEvent, recordAutoClose } from './auto-close.js';
import type { Engine } from './engine.js';
import { actorOf, httpError } from './http.js';
import { MUTATION, answerActionBody, answerParams, approveBody, atlassianSiteBody, decisionBody, errors, idParams, impactQuery, itemKeyParams, settingsBody, withdrawBody } from './schemas.js';
import { deepMerge, type Settings } from './store.js';
import type { Workspace } from './workspaces.js';

/** Weak validator for optimistic concurrency on settings (API-07). */
const etagOf = (s: Settings) => `"${createHash('sha256').update(JSON.stringify(s)).digest('hex').slice(0, 20)}"`;

/**
 * Whether the AWS SDK default credential chain has a source to use for Bedrock: access keys, a shared profile or SSO,
 * a Bedrock API key, or an IAM role (EKS web identity, ECS/Fargate/App Runner task role, EKS Pod Identity).
 * An EC2 instance profile is only reachable through IMDS and is not detected here.
 */
export const awsCredentialsConfigured = (env: Record<string, string | undefined> = process.env) =>
  [
    'AWS_ACCESS_KEY_ID',
    'AWS_PROFILE',
    'AWS_BEARER_TOKEN_BEDROCK',
    'AWS_WEB_IDENTITY_TOKEN_FILE',
    'AWS_CONTAINER_CREDENTIALS_RELATIVE_URI',
    'AWS_CONTAINER_CREDENTIALS_FULL_URI',
  ].some((name) => !!env[name]);

/** Only leaf work items are approved; feature and epic readiness is derived from their stories. */
const APPROVABLE = new Set(['story', 'bug']);

/** The analysis of a workspace, run once if there is none yet. */
export const ensure = async (engine: Engine): Promise<AnalysisResult> => engine.state.result ?? (await engine.analyze('initial'));

/** Who acted and how they were authorized, for audit entries. */
export const who = (req: FastifyRequest, body?: { by?: string; decidedBy?: string } | null) => ({ actor: actorOf(req, body), via: req.principal ?? undefined });

export interface WorkspaceRouteDeps {
  /** The workspace a request addresses (`default` under /api, `:ws` under /api/w/:ws). */
  of: (req: FastifyRequest) => Workspace;
  connect: ConnectConfig;
}

/**
 * The routes of one workspace (F5, docs/WORKSPACES-F5-PLAN.md): analysis, items, decisions, approvals, settings,
 * connections, drift, audit, demo, source webhooks and live updates. Registered under `/api` for `default` and under
 * `/api/w/:ws` for every workspace.
 */
export async function workspaceRoutes(app: FastifyInstance, { of, connect }: WorkspaceRouteDeps) {
  // ------------------------------------------------------------------ analysis
  app.get('/analysis', async (req) => {
    const { engine } = of(req);
    const result = await ensure(engine);
    return { ...result, running: engine.state.running, lastReason: engine.state.lastReason };
  });

  app.post('/analyze', { schema: { summary: 'Run an analysis now', ...MUTATION } }, async (req) => {
    const { engine } = of(req);
    return engine.analyze('manual');
  });

  app.get<{ Params: { key: string } }>('/items/:key', { schema: { params: itemKeyParams, response: errors(404, 422) } }, async (req) => {
    const { store, engine } = of(req);
    const result = await ensure(engine);
    const item = result.items.find((i) => i.key === req.params.key);
    if (!item) throw httpError(404, `No work item ${req.params.key}`);
    const [decisions, approvals] = await Promise.all([store.decisions(), store.approvals()]);
    const req0 = engine.state.context?.requirements.find((r) => r.key === item.key);
    const children = result.items.filter((i) => i.epicKey === item.key || engine.state.context?.requirements.find((r) => r.key === i.key)?.parentKey === item.key);
    return {
      item,
      source: req0,
      children: children.map((c) => ({ key: c.key, type: c.type, title: c.title, health: c.health, healthStatus: c.healthStatus, readiness: c.readiness })),
      decisions: decisions.filter((d) => d.itemKey === item.key && d.status === 'active'),
      decisionHistory: decisions.filter((d) => d.itemKey === item.key && d.status !== 'active'),
      approval: approvals.find((a) => a.itemKey === item.key),
      drift: (await store.driftLog()).filter((d) => d.impactedItems.includes(item.key)).slice(-30).reverse(),
    };
  });

  app.get<{ Params: { key: string } }>('/items/:key/graph', { schema: { params: itemKeyParams, response: errors(404, 422) } }, async (req) => {
    const { engine } = of(req);
    await ensure(engine);
    const g = engine.state.graph!;
    const center = `jira:${req.params.key}`;
    if (!g.entities.has(center)) throw httpError(404, `No work item ${req.params.key}`);
    const hood = g.neighbourhood(center, 1);
    const ids = new Set(hood.keys());
    return {
      center,
      nodes: [...ids].map((id) => {
        const e = g.entities.get(id)!;
        return { id, kind: e.kind, source: e.source, title: e.title, url: e.url };
      }),
      edges: g.relations.filter((r) => ids.has(r.from) && ids.has(r.to)),
    };
  });

  app.post<{ Params: { key: string } }>('/items/:key/ai-review', { schema: { params: itemKeyParams, response: errors(400, 422), ...MUTATION } }, async (req) => {
    const { store, engine } = of(req);
    const s = await store.settings();
    if (s.ai.provider === 'none') throw httpError(400, 'No AI provider configured. Choose one in Settings → AI Provider.');
    const result = await engine.analyze(`AI review of ${req.params.key}`, { aiKeys: [req.params.key] });
    return { item: result.items.find((i) => i.key === req.params.key), errors: result.ai.errors };
  });

  app.post<{ Params: { key: string }; Body: { by?: string; force?: boolean; reason?: string } }>(
    '/items/:key/approve',
    { schema: { summary: 'Approve a story as ready for implementation', params: itemKeyParams, body: approveBody, response: errors(400, 404, 409, 422), ...MUTATION } },
    async (req) => {
    const { engine } = of(req);
    const result = await ensure(engine);
    const item = result.items.find((i) => i.key === req.params.key);
    if (!item) throw httpError(404, `No work item ${req.params.key}`);
    if (!APPROVABLE.has(item.type)) throw httpError(409, `${item.key} is a ${item.type}; its readiness is derived from its stories and cannot be approved directly.`);
    let forced: { reason: string } | undefined;
    // Drift alone (P4 review_required) is cleared by re-approving; anything else blocking needs a forced approval.
    if (item.readiness === 'not_ready' && item.findings.some((f) => f.blocks && f.origin !== 'drift')) {
      if (!req.body?.force) throw httpError(409, `${item.key} has blocking issues and cannot be approved.`);
      const reason = req.body.reason?.trim();
      if (!reason) throw httpError(400, 'A forced approval requires a reason.');
      forced = { reason: reason.slice(0, 2000) };
    }
    await engine.approve(item.key, who(req, req.body), forced);
    return engine.analyze(`approval of ${item.key}`);
    },
  );

  app.delete<{ Params: { key: string }; Body: { by?: string; reason?: string } | null }>('/items/:key/approve', { schema: { params: itemKeyParams, body: withdrawBody, response: errors(422), ...MUTATION } }, async (req) => {
    const { store, engine } = of(req);
    const reason = req.body?.reason?.trim().slice(0, 2000);
    await store.updateApprovals((all) => all.filter((a) => a.itemKey !== req.params.key));
    await store.audit({ at: new Date().toISOString(), kind: 'approval_removed', ...who(req, req.body), summary: `Approval of ${req.params.key} withdrawn${reason ? ` — ${reason}` : ''}` });
    return engine.analyze(`approval withdrawn for ${req.params.key}`);
  });

  // ------------------------------------------------------------------ decisions
  /** What `decisionBody` accepts; the server sets the rest. */
  interface DecisionBody {
    questionId: string;
    itemKey: string;
    answer: string;
    findingId?: string;
    topic?: string;
    question?: string;
    note?: string;
    decidedBy?: string;
    by?: string;
    effect?: DecisionEffect;
    reason?: string;
    changeReason?: string;
  }
  app.get('/decisions', async (req) => {
    const { store } = of(req);
    return store.decisions();
  });

  app.post<{ Body: DecisionBody }>('/decisions', { schema: { summary: 'Answer a question or confirm a finding', body: decisionBody, response: errors(400, 422), ...MUTATION } }, async (req) => {
    const { store, engine } = of(req);
    const b = req.body;
    const by = who(req, b);
    if (!b?.questionId || !b.itemKey || !b.answer?.trim()) throw httpError(400, 'questionId, itemKey and answer are required');
    const input: NewDecision = {
      questionId: b.questionId,
      findingId: b.findingId ?? b.questionId,
      itemKey: b.itemKey,
      topic: (b.topic ?? 'general').slice(0, 80),
      question: (b.question ?? '').slice(0, 500),
      answer: b.answer.trim(),
      note: b.note?.trim() || undefined,
      decidedBy: by.actor,
      decidedAt: new Date().toISOString(),
      effect: b.effect ?? 'resolve',
      changeReason: (b.reason ?? b.changeReason)?.trim(),
    };
    let decision!: ActiveDecision;
    await store.updateDecisions((all) => {
      const r = recordDecision(all, input);
      decision = r.decision;
      return r.all;
    });
    const change = decision.supersedes && decision.changeReason ? ` [v${decision.version}, replaces previous answer: ${decision.changeReason}]` : decision.version > 1 ? ` [v${decision.version}]` : '';
    await store.audit({ at: decision.decidedAt, kind: 'decision', ...by, summary: `${decision.itemKey}: "${decision.question}" → ${decision.answer} (${decision.effect})${change}` });
    const result = await engine.analyze(`decision on ${decision.itemKey}`);
    return { decision, item: result.items.find((i) => i.key === decision.itemKey) };
  });

  // ------------------------------------------------------------------ answers found in sources (A2a, docs/AUTO-CLOSE-A2A-PLAN.md)
  /** Accept, edit or reject an answer proposal; accept and edit record the decision (`finding.auto_close`). */
  app.post<{ Params: { key: string; proposalId: string }; Body: { action: 'accept' | 'edit' | 'reject'; answer?: string; by?: string } }>(
    '/items/:key/answers/:proposalId',
    { schema: { summary: 'Accept, edit or reject an answer found in a source', params: answerParams, body: answerActionBody, response: errors(400, 404, 422), ...MUTATION } },
    async (req) => {
    const { store, engine, sink } = of(req);
      const result = await ensure(engine);
      const f = result.items.find((i) => i.key === req.params.key)?.findings.find((x) => x.answer?.id === req.params.proposalId);
      if (!f?.answer || !f.question) throw httpError(404, `No answer proposal ${req.params.proposalId} on ${req.params.key}`);
      const { action } = req.body;
      if (action === 'edit' && !req.body.answer?.trim()) throw httpError(400, 'An edited answer needs its text');
      const by = who(req, req.body);
      const at = new Date().toISOString();
      if (action === 'reject') {
        await recordAutoClose(store, [{ event: proposalEvent(f, 'rejected', at, { by: by.actor }), question: f.question.text, ...by }], sink);
        return { item: (await engine.analyze(`answer rejected on ${f.itemKey}`)).items.find((i) => i.key === f.itemKey) };
      }
      const input = autoCloseDecision(f, { by: by.actor, at, answer: action === 'edit' ? req.body.answer : undefined });
      let decision!: ActiveDecision;
      await store.updateDecisions((all) => {
        const r = recordDecision(all, input);
        decision = r.decision;
        return r.all;
      });
      await recordAutoClose(store, [{ event: proposalEvent(f, decision.draftEdited ? 'edited' : 'accepted', at, { by: by.actor, decisionId: decision.id }), question: f.question.text, answer: decision.answer, ...by }], sink);
      const next = await engine.analyze(`answer accepted on ${f.itemKey}`);
      return { decision, item: next.items.find((i) => i.key === f.itemKey) };
    },
  );

  /** Reopen an auto-closed finding: withdraws its decision; the proposal counts as rejected and is not made again. */
  app.post<{ Params: { id: string }; Body: { by?: string; reason?: string } | null }>(
    '/decisions/:id/reopen',
    { schema: { summary: 'Reopen a finding closed with an answer found in a source', params: idParams, body: withdrawBody, response: errors(404, 409, 422), ...MUTATION } },
    async (req) => {
    const { store, engine, sink } = of(req);
      const d = (await store.decisions()).find((x) => x.id === req.params.id && x.status === 'active');
      if (!d) throw httpError(404, 'No active decision with this id');
      if (d.decisionType !== AUTO_CLOSE_DECISION_TYPE) throw httpError(409, 'Only auto-closed decisions can be reopened; withdraw this decision instead.');
      const at = new Date().toISOString();
      const by = who(req, req.body);
      await store.updateDecisions((all) => withdrawDecision(all, d.id, by.actor, at, req.body?.reason?.slice(0, 2000)).all);
      const source = d.evidence?.[0];
      await recordAutoClose(store, [
        {
          event: { at, proposalId: d.proposalId ?? d.id, outcome: 'reopened', decisionType: AUTO_CLOSE_DECISION_TYPE, itemKey: d.itemKey, findingId: d.findingId, questionId: d.questionId, ...(source && { source: { source: source.source, entityId: source.entityId, title: source.title, ...(source.url && { url: source.url }) }, quote: source.excerpt }), decisionId: d.id, by: by.actor },
          question: d.question,
          ...by,
          ...(req.body?.reason?.trim() && { why: req.body.reason.trim().slice(0, 2000) }),
        },
      ], sink);
      return engine.analyze(`auto-closed answer reopened on ${d.itemKey}`);
    },
  );

  /** A2a: acceptance of the AI's drafts per decision type, against pdi's thresholds; it never changes the policy. */
  app.get('/decisions/acceptance', async (req) => {
    const { store } = of(req);
    return [acceptanceStats(await store.autoCloseLog())];
  });

  /** Decisions are never deleted: DELETE withdraws the active version and re-opens its finding. */
  app.delete<{ Params: { id: string }; Body: { by?: string; reason?: string } | null }>('/decisions/:id', { schema: { params: idParams, body: withdrawBody, response: errors(404, 422), ...MUTATION } }, async (req) => {
    const { store, engine } = of(req);
    const at = new Date().toISOString();
    const { actor: by, via } = who(req, req.body);
    let d: WithdrawnDecision | undefined;
    await store.updateDecisions((all) => {
      const r = withdrawDecision(all, req.params.id, by, at, req.body?.reason?.slice(0, 2000));
      d = r.decision;
      return r.all;
    });
    if (!d) throw httpError(404, 'No active decision with this id');
    await store.audit({ at, kind: 'decision_withdrawn', actor: by, via, summary: `Decision withdrawn: ${d.itemKey} "${d.question}" (was: ${d.answer})${d.withdrawReason ? ` — ${d.withdrawReason}` : ''}` });
    return engine.analyze('decision withdrawn');
  });

  // ------------------------------------------------------------------ impact, drift, audit, rules
  app.get<{ Querystring: { q?: string } }>('/impact', { schema: { querystring: impactQuery, response: errors(400, 422) } }, async (req) => {
    const { engine } = of(req);
    const result = await ensure(engine);
    const q = (req.query.q ?? '').trim();
    if (!q) throw httpError(400, 'q is required');
    return impactAnalysis(engine.state.graph!, result, q);
  });

  app.get('/drift', async (req) => {
    const { store } = of(req);
    return (await store.driftLog()).slice(-300).reverse();
  });
  app.get('/history', async (req) => {
    const { store } = of(req);
    return store.history();
  });
  app.get('/audit', async (req) => {
    const { store } = of(req);
    return store.auditLog();
  });
  app.get('/ai/usage', async (req) => {
    const { store } = of(req);
    return store.aiUsage();
  });

  // ------------------------------------------------------------------ settings
  app.get('/settings', async (req, reply) => {
    const { store, atlassian } = of(req);
    const s = await store.settings();
    reply.header('etag', etagOf(s));
    return {
      settings: s,
      secrets: {
        JIRA_API_TOKEN: !!process.env.JIRA_API_TOKEN,
        CONFLUENCE_API_TOKEN: !!(process.env.CONFLUENCE_API_TOKEN ?? process.env.JIRA_API_TOKEN),
        FIGMA_TOKEN: !!process.env.FIGMA_TOKEN,
        ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
        OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
        AZURE_OPENAI_API_KEY: !!process.env.AZURE_OPENAI_API_KEY,
        CUSTOM_AI_API_KEY: !!process.env.CUSTOM_AI_API_KEY,
        AWS_CREDENTIALS: awsCredentialsConfigured(),
        CI_ENCRYPTION_KEY: !!process.env.CI_ENCRYPTION_KEY,
        ATLASSIAN_CLIENT_ID: !!connect.atlassian.clientId,
        ATLASSIAN_CLIENT_SECRET: !!connect.atlassian.clientSecret,
      },
      connectMode: connect.mode,
      defaultModels: DEFAULT_MODELS,
    };
  });

  app.put<{ Body: Partial<Settings> }>(
    '/settings',
    {
      schema: {
        summary: 'Update settings (partial). Requires If-Match with the ETag from GET /api/settings.',
        headers: { type: 'object', properties: { 'if-match': { type: 'string' } } },
        body: settingsBody,
        response: errors(400, 412, 422, 428),
        ...MUTATION,
      },
    },
    async (req, reply) => {
    const { store, engine } = of(req);
    const current = await store.settings();
    const ifMatch = req.headers['if-match'];
    if (!ifMatch) throw httpError(428, 'Send If-Match with the ETag from GET /api/settings, so concurrent edits are not lost.');
    if (ifMatch !== '*' && ifMatch !== etagOf(current)) throw httpError(412, 'Settings were changed by someone else. Reload them and apply your change again.');
    const typeMap = req.body?.integrations?.jira?.issueTypeMap;
    const next = deepMerge(current, req.body ?? {});
    // A mapping is replaced as a whole, so removing a Jira type from it works.
    if (typeMap) next.integrations.jira.issueTypeMap = Object.fromEntries(Object.entries(typeMap).map(([k, v]) => [k.trim(), v]));
    if (next.ai.provider !== 'none' && !next.ai.model) next.ai.model = DEFAULT_MODELS[next.ai.provider];
    if (next.security.encryptStoredContext && !process.env.CI_ENCRYPTION_KEY) throw httpError(400, 'Set CI_ENCRYPTION_KEY on the server before enabling encryption at rest.');
    await store.saveSettings(next);
    await store.audit({ at: new Date().toISOString(), kind: 'settings', ...who(req), summary: 'Settings updated', details: req.body });
    await engine.reschedule();
    reply.header('etag', etagOf(await store.settings()));
    return { settings: next };
    },
  );

  app.post('/settings/test-connections', { schema: MUTATION }, async (req) => {
    const { store, engine } = of(req);
    const s = await store.settings();
    const out: Record<string, string> = {};
    try {
      const ctx = await engine.loadContext({ ...s, mode: 'live' });
      if (s.integrations.jira.enabled) out.jira = `OK — ${ctx.requirements.length} issues`;
      const code = ctx.documents.filter((d) => d.source === 'code').length;
      if (s.integrations.confluence.enabled) out.confluence = `OK — ${ctx.documents.length - code} pages`;
      if (s.integrations.code.enabled) out.code = `OK — ${code} items reconstructed from code`;
      if (s.integrations.tests?.enabled && ctx.tests) {
        const t = ctx.tests;
        out.tests = `OK — ${t.length} test cases, ${t.filter((x) => x.status === 'failed').length} failed, ${t.filter((x) => x.refs.length).length} naming a criterion`;
      }
      if (s.integrations.figma.enabled) out.figma = `OK — ${ctx.frames.length} frames`;
    } catch (e) {
      out.error = errorMessage(e);
    }
    return out;
  });

  // ------------------------------------------------------------------ connections (CI_CONNECT_MODE=oauth)
  const connectFailed = (e: unknown) => {
    if (e instanceof ConnectError) throw httpError(e.code === 'mode' || e.code === 'config' ? 409 : 400, e.message);
    throw e;
  };
  app.get('/connections', async (req) => {
    const { atlassian } = of(req);
    return { mode: connect.mode, atlassian: await atlassian.status() };
  });

  app.post('/connections/atlassian/start', { schema: { summary: 'Start connecting Atlassian (Jira and Confluence); returns the consent URL to open', response: errors(409, 422), ...MUTATION } }, async (req, reply) => {
    const { atlassian } = of(req);
    try {
      const { url, state } = atlassian.start(who(req).actor);
      reply.header('set-cookie', stateCookie(state, connect.publicUrl));
      return { url };
    } catch (e) {
      return connectFailed(e);
    }
  });

  app.put<{ Body: { cloudId: string } }>('/connections/atlassian/site', { schema: { summary: 'Choose the Atlassian site the analysis reads', body: atlassianSiteBody, response: errors(400, 409, 422), ...MUTATION } }, async (req) => {
    const { store, atlassian } = of(req);
    try {
      const site = await atlassian.selectSite(req.body.cloudId);
      await store.audit({ at: new Date().toISOString(), kind: 'connection', ...who(req), summary: `Atlassian site changed to ${site.name}` });
      return atlassian.status();
    } catch (e) {
      return connectFailed(e);
    }
  });

  app.delete('/connections/atlassian', { schema: { summary: 'Forget the Atlassian connection (revoke the app in Atlassian account settings too)', response: errors(409), ...MUTATION } }, async (req) => {
    const { store, atlassian } = of(req);
    await atlassian.disconnect().catch(connectFailed);
    await store.audit({ at: new Date().toISOString(), kind: 'connection', ...who(req), summary: 'Atlassian disconnected' });
    return atlassian.status();
  });

  // ------------------------------------------------------------------ demo
  app.get('/demo/scenarios', async () => DEMO_SCENARIOS.map(({ id, title, description }) => ({ id, title, description })));
  app.post<{ Params: { id: string } }>('/demo/scenarios/:id', { schema: { params: idParams, response: errors(400, 404, 422), ...MUTATION } }, async (req) => {
    const { store, engine } = of(req);
    if ((await store.settings()).mode !== 'demo') throw httpError(400, 'Demo scenarios are only available in demo mode');
    if (!DEMO_SCENARIOS.some((x) => x.id === req.params.id)) throw httpError(404, `No demo scenario ${req.params.id}`);
    await engine.applyDemoScenario(req.params.id);
    return engine.analyze(`change: ${req.params.id}`);
  });
  app.post('/demo/reset', { schema: MUTATION }, async (req) => {
    const { engine } = of(req);
    await engine.resetDemo();
    return engine.analyze('demo reset');
  });

  // ------------------------------------------------------------------ webhooks (Jira / Confluence / Figma)
  app.post<{ Params: { source: string } }>('/webhooks/:source', async (req, reply) => {
    const { store, engine } = of(req);
    const secret = process.env.CI_WEBHOOK_SECRET;
    const given = String(req.headers['x-ci-webhook-secret'] ?? (req.query as Record<string, string>)?.secret ?? '');
    if (secret && (given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret)))) throw httpError(401, 'Invalid webhook secret');
    const s = await store.settings();
    const sources: Record<string, boolean> = { jira: s.schedule.onJiraChange, confluence: s.schedule.onConfluenceChange, figma: s.schedule.onFigmaChange };
    if (!Object.hasOwn(sources, req.params.source)) throw httpError(404, 'Unknown source');
    const enabled = sources[req.params.source];
    await store.audit({ at: new Date().toISOString(), kind: 'webhook', actor: req.params.source, summary: `Change notification from ${req.params.source}${enabled ? '' : ' (ignored by settings)'}` });
    if (enabled && req.params.source === 'figma') {
      // The connector caches Figma responses for rate limits; the change just announced must not be read from it.
      const fileKey = (req.body as { file_key?: unknown } | undefined)?.file_key;
      clearFigmaCache(typeof fileKey === 'string' && fileKey !== '' ? fileKey : undefined);
    }
    if (enabled) void engine.analyze(`${req.params.source} change`).catch(() => undefined);
    return reply.status(202).send({ accepted: enabled });
  });

  // ------------------------------------------------------------------ live updates (SSE)
  app.get('/events', (req, reply) => {
    const { engine } = of(req);
    reply.raw.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
    // Send the headers now: otherwise they wait for the first event or ping, and the client sees no connection until then.
    reply.raw.flushHeaders();
    const send = (event: string) => (data: unknown) => reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    const onAnalysis = send('analysis');
    const onStatus = send('status');
    engine.on('analysis', onAnalysis);
    engine.on('status', onStatus);
    const ping = setInterval(() => reply.raw.write(': ping\n\n'), 25_000);
    req.raw.on('close', () => {
      clearInterval(ping);
      engine.off('analysis', onAnalysis);
      engine.off('status', onStatus);
    });
  });}
