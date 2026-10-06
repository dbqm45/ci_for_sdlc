import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { timingSafeEqual } from 'node:crypto';
import { DEMO_SCENARIOS, DEFAULT_MODELS, RULES, impactAnalysis, recordDecision, withdrawDecision, type Decision, type IssueType, type NewDecision } from '@ci/core';
import { Engine } from './engine.js';
import { deepMerge, Store, type Settings } from './store.js';

const ISSUE_LEVELS: IssueType[] = ['epic', 'feature', 'story', 'bug', 'task', 'subtask'];

/** Only leaf work items are approved; feature and epic readiness is derived from their stories. */
const APPROVABLE = new Set(['story', 'bug']);

export interface AppOptions {
  dataDir: string;
  webDir?: string;
  logger?: boolean;
}

export async function buildApp(opts: AppOptions): Promise<{ app: FastifyInstance; engine: Engine; store: Store }> {
  const store = new Store(opts.dataDir);
  await store.init();
  const engine = new Engine(store);
  const app = Fastify({ logger: opts.logger ?? false });

  const ensure = async () => engine.state.result ?? (await engine.analyze('initial'));
  const actor = (body: { by?: string; decidedBy?: string } | undefined) => (body?.by || body?.decidedBy || 'anonymous').slice(0, 80);

  app.setErrorHandler((err: Error & { statusCode?: number }, _req, reply) => {
    reply.status(err.statusCode ?? 500).send({ error: err.message });
  });

  // ------------------------------------------------------------------ analysis
  app.get('/api/health', async () => ({ ok: true, running: engine.state.running, lastError: engine.state.lastError }));

  app.get('/api/analysis', async () => {
    const result = await ensure();
    return { ...result, running: engine.state.running, lastReason: engine.state.lastReason };
  });

  app.post('/api/analyze', async () => engine.analyze('manual'));

  app.get<{ Params: { key: string } }>('/api/items/:key', async (req, reply) => {
    const result = await ensure();
    const item = result.items.find((i) => i.key === req.params.key);
    if (!item) return reply.status(404).send({ error: 'Not found' });
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

  app.get<{ Params: { key: string } }>('/api/items/:key/graph', async (req, reply) => {
    await ensure();
    const g = engine.state.graph!;
    const center = `jira:${req.params.key}`;
    if (!g.entities.has(center)) return reply.status(404).send({ error: 'Not found' });
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

  app.post<{ Params: { key: string } }>('/api/items/:key/ai-review', async (req) => {
    const s = await store.settings();
    if (s.ai.provider === 'none') throw Object.assign(new Error('No AI provider configured. Choose one in Settings → AI Provider.'), { statusCode: 400 });
    const result = await engine.analyze(`AI review of ${req.params.key}`, { aiKeys: [req.params.key] });
    return { item: result.items.find((i) => i.key === req.params.key), errors: result.ai.errors };
  });

  app.post<{ Params: { key: string }; Body: { by?: string; force?: boolean; reason?: string } }>('/api/items/:key/approve', async (req) => {
    const result = await ensure();
    const item = result.items.find((i) => i.key === req.params.key);
    if (!item) throw Object.assign(new Error('Not found'), { statusCode: 404 });
    if (!APPROVABLE.has(item.type)) throw Object.assign(new Error(`${item.key} is a ${item.type}; its readiness is derived from its stories and cannot be approved directly.`), { statusCode: 409 });
    let forced: { reason: string } | undefined;
    // Drift alone (P4 review_required) is cleared by re-approving; anything else blocking needs a forced approval.
    if (item.readiness === 'not_ready' && item.findings.some((f) => f.blocks && f.origin !== 'drift')) {
      if (!req.body?.force) throw Object.assign(new Error(`${item.key} has blocking issues and cannot be approved.`), { statusCode: 409 });
      const reason = req.body.reason?.trim();
      if (!reason) throw Object.assign(new Error('A forced approval requires a reason.'), { statusCode: 400 });
      forced = { reason: reason.slice(0, 2000) };
    }
    await engine.approve(item.key, actor(req.body), forced);
    return engine.analyze(`approval of ${item.key}`);
  });

  app.delete<{ Params: { key: string } }>('/api/items/:key/approve', async (req) => {
    await store.updateApprovals((all) => all.filter((a) => a.itemKey !== req.params.key));
    await store.audit({ at: new Date().toISOString(), kind: 'approval_removed', actor: 'user', summary: `Approval of ${req.params.key} withdrawn` });
    return engine.analyze(`approval withdrawn for ${req.params.key}`);
  });

  // ------------------------------------------------------------------ decisions
  app.get('/api/decisions', async () => store.decisions());

  app.post<{ Body: Partial<NewDecision> & { by?: string; reason?: string } }>('/api/decisions', async (req) => {
    const b = req.body;
    if (!b?.questionId || !b.itemKey || !b.answer?.trim()) throw Object.assign(new Error('questionId, itemKey and answer are required'), { statusCode: 400 });
    const input: NewDecision = {
      questionId: b.questionId,
      findingId: b.findingId ?? b.questionId,
      itemKey: b.itemKey,
      topic: (b.topic ?? 'general').slice(0, 80),
      question: (b.question ?? '').slice(0, 500),
      answer: b.answer.trim().slice(0, 500),
      note: b.note?.trim().slice(0, 2000) || undefined,
      decidedBy: actor(b),
      decidedAt: new Date().toISOString(),
      effect: (['accept_risk', 'dismiss', 'confirm'] as const).find((e) => e === b.effect) ?? 'resolve',
      changeReason: (b.reason ?? b.changeReason)?.trim().slice(0, 2000),
    };
    let decision!: Decision;
    await store.updateDecisions((all) => {
      const r = recordDecision(all, input);
      decision = r.decision;
      return r.all;
    });
    const change = decision.supersedes && decision.changeReason ? ` [v${decision.version}, replaces previous answer: ${decision.changeReason}]` : decision.version > 1 ? ` [v${decision.version}]` : '';
    await store.audit({ at: decision.decidedAt, kind: 'decision', actor: decision.decidedBy, summary: `${decision.itemKey}: "${decision.question}" → ${decision.answer} (${decision.effect})${change}` });
    const result = await engine.analyze(`decision on ${decision.itemKey}`);
    return { decision, item: result.items.find((i) => i.key === decision.itemKey) };
  });

  /** Decisions are never deleted: DELETE withdraws the active version and re-opens its finding. */
  app.delete<{ Params: { id: string }; Body: { by?: string; reason?: string } | undefined }>('/api/decisions/:id', async (req) => {
    const at = new Date().toISOString();
    const by = actor(req.body ?? undefined);
    let d: Decision | undefined;
    await store.updateDecisions((all) => {
      const r = withdrawDecision(all, req.params.id, by, at, req.body?.reason?.slice(0, 2000));
      d = r.decision;
      return r.all;
    });
    if (!d) throw Object.assign(new Error('No active decision with this id'), { statusCode: 404 });
    await store.audit({ at, kind: 'decision_withdrawn', actor: by, summary: `Decision withdrawn: ${d.itemKey} "${d.question}" (was: ${d.answer})${d.withdrawReason ? ` — ${d.withdrawReason}` : ''}` });
    return engine.analyze('decision withdrawn');
  });

  // ------------------------------------------------------------------ impact, drift, audit, rules
  app.get<{ Querystring: { q?: string } }>('/api/impact', async (req) => {
    const result = await ensure();
    const q = (req.query.q ?? '').trim();
    if (!q) throw Object.assign(new Error('q is required'), { statusCode: 400 });
    return impactAnalysis(engine.state.graph!, result, q);
  });

  app.get('/api/drift', async () => (await store.driftLog()).slice(-300).reverse());
  app.get('/api/history', async () => store.history());
  app.get('/api/audit', async () => store.auditLog());
  app.get('/api/rules', async () => RULES.map(({ id, name, description, appliesTo }) => ({ id, name, description, appliesTo })));

  // ------------------------------------------------------------------ settings
  app.get('/api/settings', async () => {
    const s = await store.settings();
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
        AWS_CREDENTIALS: !!(process.env.AWS_ACCESS_KEY_ID || process.env.AWS_PROFILE || process.env.AWS_BEARER_TOKEN_BEDROCK),
        CI_ENCRYPTION_KEY: !!process.env.CI_ENCRYPTION_KEY,
      },
      defaultModels: DEFAULT_MODELS,
    };
  });

  app.put<{ Body: Partial<Settings> }>('/api/settings', async (req) => {
    const current = await store.settings();
    const typeMap = req.body?.integrations?.jira?.issueTypeMap;
    if (typeMap !== undefined) {
      const bad = Object.entries(typeMap ?? {}).filter(([k, v]) => !k.trim() || !ISSUE_LEVELS.includes(v));
      if (typeMap === null || typeof typeMap !== 'object' || bad.length)
        throw Object.assign(new Error(`Invalid issue type mapping: ${bad.map(([k, v]) => `${k} → ${v}`).join(', ') || 'expected an object'}. Levels: ${ISSUE_LEVELS.join(', ')}.`), { statusCode: 400 });
    }
    const next = deepMerge(current, req.body ?? {});
    // A mapping is replaced as a whole, so removing a Jira type from it works.
    if (typeMap) next.integrations.jira.issueTypeMap = Object.fromEntries(Object.entries(typeMap).map(([k, v]) => [k.trim(), v]));
    if (next.ai.provider !== 'none' && !next.ai.model) next.ai.model = DEFAULT_MODELS[next.ai.provider];
    if (next.security.encryptStoredContext && !process.env.CI_ENCRYPTION_KEY) throw Object.assign(new Error('Set CI_ENCRYPTION_KEY on the server before enabling encryption at rest.'), { statusCode: 400 });
    await store.saveSettings(next);
    await store.audit({ at: new Date().toISOString(), kind: 'settings', actor: 'admin', summary: 'Settings updated', details: req.body });
    await engine.reschedule();
    return { settings: next };
  });

  app.post('/api/settings/test-connections', async () => {
    const s = await store.settings();
    const out: Record<string, string> = {};
    try {
      const ctx = await engine.loadContext({ ...s, mode: 'live' });
      if (s.integrations.jira.enabled) out.jira = `OK — ${ctx.requirements.length} issues`;
      if (s.integrations.confluence.enabled) out.confluence = `OK — ${ctx.documents.length} pages`;
      if (s.integrations.figma.enabled) out.figma = `OK — ${ctx.frames.length} frames`;
    } catch (e) {
      out.error = (e as Error).message;
    }
    return out;
  });

  // ------------------------------------------------------------------ demo
  app.get('/api/demo/scenarios', async () => DEMO_SCENARIOS.map(({ id, title, description }) => ({ id, title, description })));
  app.post<{ Params: { id: string } }>('/api/demo/scenarios/:id', async (req) => {
    if ((await store.settings()).mode !== 'demo') throw Object.assign(new Error('Demo scenarios are only available in demo mode'), { statusCode: 400 });
    await engine.applyDemoScenario(req.params.id);
    return engine.analyze(`change: ${req.params.id}`);
  });
  app.post('/api/demo/reset', async () => {
    await engine.resetDemo();
    return engine.analyze('demo reset');
  });

  // ------------------------------------------------------------------ webhooks (Jira / Confluence / Figma)
  app.post<{ Params: { source: string } }>('/api/webhooks/:source', async (req, reply) => {
    const secret = process.env.CI_WEBHOOK_SECRET;
    const given = String(req.headers['x-ci-webhook-secret'] ?? (req.query as Record<string, string>)?.secret ?? '');
    if (secret && (given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret)))) return reply.status(401).send({ error: 'Invalid webhook secret' });
    const s = await store.settings();
    const enabled = { jira: s.schedule.onJiraChange, confluence: s.schedule.onConfluenceChange, figma: s.schedule.onFigmaChange }[req.params.source];
    if (enabled === undefined) return reply.status(404).send({ error: 'Unknown source' });
    await store.audit({ at: new Date().toISOString(), kind: 'webhook', actor: req.params.source, summary: `Change notification from ${req.params.source}${enabled ? '' : ' (ignored by settings)'}` });
    if (enabled) void engine.analyze(`${req.params.source} change`).catch(() => undefined);
    return reply.status(202).send({ accepted: enabled });
  });

  // ------------------------------------------------------------------ live updates (SSE)
  app.get('/api/events', (req, reply) => {
    reply.raw.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
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
  });

  // ------------------------------------------------------------------ web UI
  if (opts.webDir && existsSync(opts.webDir)) {
    await app.register(fastifyStatic, { root: opts.webDir });
    app.setNotFoundHandler((req, reply) => (req.url.startsWith('/api/') ? reply.status(404).send({ error: 'Not found' }) : reply.sendFile('index.html')));
  } else if (opts.webDir) {
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

  await engine.reschedule();
  app.addHook('onClose', async () => engine.stop());
  return { app, engine, store };
}
