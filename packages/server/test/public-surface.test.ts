import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ADA, browser, fakeAtlassian, login, removeDir, startAccounts, tempDir, type App } from './accounts-helpers.js';

/**
 * T9 (docs/SECURITY-REVIEW.md): what answers without a session in accounts mode, as production runs. Every route
 * the server registers is called without a session or token; only the routes listed in PUBLIC may answer, each with
 * the status pinned here. A new route that answers to anyone fails this test until it is listed (and reviewed).
 */

/** Method and path → what it answers to a stranger, and why it may. */
const PUBLIC: Record<string, { status: number; why: string }> = {
  'GET /api/health': { status: 200, why: 'uptime monitor and Render health check; version and booleans only' },
  'GET /api/auth/me': { status: 200, why: 'tells the web app whether to show the login screen; no data without a session' },
  'GET /api/auth/login': { status: 302, why: 'starts the Atlassian login' },
  'GET /api/connections/atlassian/callback': { status: 302, why: 'OAuth return; checks its one-time state' },
  'GET /api/beta': { status: 200, why: 'whether the beta form is open' },
  'POST /api/beta/apply': { status: 422, why: 'the beta form: validated, rate limited, stored for an operator only' },
  'POST /api/webhooks/pdi': { status: 404, why: 'pdi events: absent without the pdi link; with it, refused without the HMAC signature (pdi tests)' },
  'POST /api/webhooks/:source': { status: 401, why: 'source change notifications: refused without CI_WEBHOOK_SECRET' },
  'POST /api/w/:ws/webhooks/:source': { status: 401, why: 'the same, per workspace' },
};

/** Every route from Fastify's route tree, as `METHOD /path` (HEAD and OPTIONS left out). */
function routesOf(tree: string): string[] {
  const out: string[] = [];
  const stack: string[] = [];
  for (const line of tree.split('\n')) {
    const m = /^((?:│ {3}| {4})*)(?:├── |└── )(\S*)(?: \(([^)]*)\))?/.exec(line);
    if (!m) continue;
    const depth = m[1]!.length / 4;
    stack.length = depth;
    stack.push(m[2]!);
    for (const method of (m[3] ?? '').split(', ').filter((x) => x && x !== 'HEAD' && x !== 'OPTIONS')) out.push(`${method} ${stack.join('')}`);
  }
  return out;
}

const fill = (path: string) => path.replace(':ws', 'default').replace(':source', 'jira').replace(/:[a-zA-Z]+/g, 'x').replace('*', 'index.html');

let dir: string;
let app: App;
const saved = { secret: process.env.CI_WEBHOOK_SECRET, schedule: process.env.CI_DISABLE_SCHEDULE };
beforeAll(async () => {
  dir = tempDir();
  process.env.CI_DISABLE_SCHEDULE = 'true';
  // As in production (render.yaml): webhooks need their secret.
  process.env.CI_WEBHOOK_SECRET = 'dummy-webhook-secret';
  fakeAtlassian();
  app = await startAccounts(dir, { bootstrapEmail: ADA.email, adminToken: 'dummy-admin-token', allowedHosts: ['quorum.example.com'] });
  await app.app.ready();
});
afterAll(async () => {
  await app.app.close();
  vi.unstubAllGlobals();
  removeDir(dir);
  for (const [k, v] of [['CI_WEBHOOK_SECRET', saved.secret], ['CI_DISABLE_SCHEDULE', saved.schedule]] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe('the public surface (T9)', () => {
  it('SEC-PUB-01: without a session, every API route but the listed ones refuses (401/403), and the listed ones answer as pinned', async () => {
    const routes = routesOf(app.app.printRoutes({ commonPrefix: false })).filter((r) => r.split(' ')[1]!.startsWith('/api/'));
    expect(routes.length).toBeGreaterThan(80);
    const answered: Record<string, number> = {};
    for (const route of routes) {
      const [method, path] = route.split(' ') as [string, string];
      const r = await app.app.inject({
        method: method as 'GET',
        url: fill(path),
        // A browser on the right host and origin, only without a session: the checks left are the ones that matter.
        headers: { host: 'quorum.example.com', origin: 'https://quorum.example.com' },
        ...(method !== 'GET' && { payload: {} }),
      });
      answered[route] = r.statusCode;
    }
    const open = Object.entries(answered).filter(([route, status]) => !PUBLIC[route] && status !== 401 && status !== 403);
    expect(open, 'routes that answer to anyone; review them and list them in PUBLIC').toEqual([]);
    for (const [route, { status }] of Object.entries(PUBLIC)) {
      if (route.startsWith('GET /api/dev/')) continue;
      expect([route, answered[route]]).toEqual([route, status]);
    }
  });

  it('SEC-PUB-02: the local walkthrough routes do not exist in production', async () => {
    const routes = routesOf(app.app.printRoutes({ commonPrefix: false }));
    expect(routes.filter((r) => r.includes('/api/dev/'))).toEqual([]);
  });

  it("SEC-PUB-03: a Host outside CI_ALLOWED_HOSTS is refused everywhere but the health check", async () => {
    for (const url of ['/api/auth/me', '/api/beta', '/api/w/default/analysis']) {
      expect((await app.app.inject({ method: 'GET', url, headers: { host: 'evil.example' } })).statusCode, url).toBe(403);
    }
    expect((await app.app.inject({ method: 'GET', url: '/api/health', headers: { host: 'quorum-abcd.onrender.com' } })).statusCode).toBe(200);
  });
});

describe('change notifications (T9)', () => {
  const start = async () => {
    const { buildApp } = await import('../src/app.js');
    return buildApp({ dataDir: tempDir(), adminToken: 'dummy-admin-token', allowedHosts: [], allowedOrigins: [], pdi: { eventsUrl: '', secret: '' } });
  };
  const env = { secret: process.env.CI_WEBHOOK_SECRET, node: process.env.NODE_ENV };
  afterAll(() => {
    if (env.secret === undefined) delete process.env.CI_WEBHOOK_SECRET;
    else process.env.CI_WEBHOOK_SECRET = env.secret;
    process.env.NODE_ENV = env.node;
  });

  it("SEC-WH-01: each workspace has its own secret; another workspace's is refused, the operator's global one works", async () => {
    process.env.CI_WEBHOOK_SECRET = 'dummy-webhook-secret';
    const { workspaceWebhookSecret } = await import('../src/routes-workspace.js');
    const ctx = await start();
    try {
      const admin = { authorization: 'Bearer dummy-admin-token', origin: 'http://localhost:4317', host: 'localhost:4317' };
      await ctx.app.inject({ method: 'POST', url: '/api/workspaces', headers: admin, payload: { id: 'mobile', name: 'Mobile' } });
      const hook = (ws: string, secret: string) => ctx.app.inject({ method: 'POST', url: `/api/w/${ws}/webhooks/jira?secret=${secret}`, payload: {} });
      expect((await hook('mobile', workspaceWebhookSecret('dummy-webhook-secret', 'mobile'))).statusCode).toBe(202);
      expect((await hook('mobile', workspaceWebhookSecret('dummy-webhook-secret', 'default'))).statusCode).toBe(401);
      expect((await hook('mobile', 'dummy-webhook-secret')).statusCode).toBe(202);
      expect((await hook('mobile', '')).statusCode).toBe(401);
      // An Admin (here the admin token) sees the workspace's own URLs; a plain reader does not.
      const settings = (await ctx.app.inject({ method: 'GET', url: '/api/w/mobile/settings', headers: admin })).json();
      expect(settings.webhooks.jira).toBe(`http://localhost:4317/api/w/mobile/webhooks/jira?secret=${workspaceWebhookSecret('dummy-webhook-secret', 'mobile')}`);
      expect((await ctx.app.inject({ method: 'GET', url: '/api/w/mobile/settings', headers: { host: 'localhost:4317' } })).json()).not.toHaveProperty('webhooks');
    } finally {
      await ctx.app.close();
    }
  });

  it('SEC-WH-02: in production without CI_WEBHOOK_SECRET notifications are refused, not open', async () => {
    delete process.env.CI_WEBHOOK_SECRET;
    process.env.NODE_ENV = 'production';
    const ctx = await start();
    try {
      expect((await ctx.app.inject({ method: 'POST', url: '/api/webhooks/jira', payload: {} })).statusCode).toBe(503);
    } finally {
      await ctx.app.close();
      process.env.NODE_ENV = env.node;
    }
  });

  it('SEC-WH-03: a secret in the query string never reaches the logs', async () => {
    const { withoutSecret } = await import('../src/routes-workspace.js');
    expect(withoutSecret('/api/w/a/webhooks/jira?secret=abc123&x=1')).toBe('/api/w/a/webhooks/jira?secret=[hidden]&x=1');
    expect(withoutSecret('/api/webhooks/jira?x=1&Secret=abc')).toBe('/api/webhooks/jira?x=1&Secret=[hidden]');
  });
});

describe('findings of the review (T9, docs/SECURITY-REVIEW.md)', () => {
  let d: string;
  let a: App;
  let fake: ReturnType<typeof fakeAtlassian>;
  const VIC = { account_id: 'acc-vic', name: 'Vic Viewer', email: 'vic@example.com' };
  beforeAll(async () => {
    d = tempDir();
    process.env.CI_DISABLE_SCHEDULE = 'true';
    fake = fakeAtlassian();
    a = await startAccounts(d, { bootstrapEmail: ADA.email, operatorEmails: [ADA.email!], adminToken: 'dummy-admin-token', readToken: 'dummy-read-token' });
  });
  afterAll(async () => {
    await a.app.close();
    vi.unstubAllGlobals();
    removeDir(d);
  });
  const session = async (who: typeof VIC) => {
    fake.state.as = who;
    return (await login(a.app)).session!;
  };

  it('SEC-F2: an encoded path is checked as the router serves it: a Viewer gets no Admin route by %-encoding it', async () => {
    await session(ADA as typeof VIC);
    await a.accounts.admit({ provider: 'atlassian', subject: VIC.account_id, name: VIC.name, email: VIC.email }, 'viewer');
    const vic = await session(VIC);
    for (const url of ['/api/members', '/api/member%73', '/api/invitation%73', '/api/%6dembers']) {
      expect((await a.app.inject({ method: 'GET', url, headers: browser(vic) })).statusCode, url).toBe(403);
    }
    expect((await a.app.inject({ method: 'GET', url: '/api/members%', headers: browser(vic) })).statusCode).toBe(400);
  });

  it('SEC-F1: a workspace may not make the server read or list files on its disk', async () => {
    const ada = await session(ADA as typeof VIC);
    const etag = String((await a.app.inject({ method: 'GET', url: '/api/settings', headers: browser(ada) })).headers.etag);
    for (const integrations of [{ openapi: { enabled: true, specPath: '/etc' } }, { tests: { enabled: true, reportsPath: '/' } }, { code: { enabled: true, reconstructionPath: '/proc' } }]) {
      const r = await a.app.inject({ method: 'PUT', url: '/api/settings', headers: { ...browser(ada), 'if-match': etag }, payload: { integrations } });
      expect(r.statusCode, JSON.stringify(integrations)).toBe(422);
      expect(r.json().detail).toMatch(/not available in the hosted service/);
    }
  });

  it('SEC-F3: an organization other than the first has at most 3 workspaces', async () => {
    const ada = await session(ADA as typeof VIC);
    const opened = (await a.app.inject({ method: 'POST', url: '/api/orgs', headers: browser(ada), payload: { name: 'Gamma', workspace: { id: 'gamma-1' }, ownerEmail: 'bea@gamma.example' } })).json();
    const BEA = { account_id: 'acc-bea', name: 'Bea', email: 'bea@gamma.example' };
    fake.state.as = BEA;
    const bea = (await login(a.app, `?invite=${encodeURIComponent(new URL(opened.invitation.link).searchParams.get('invite')!)}`)).session!;
    const create = (id: string) => a.app.inject({ method: 'POST', url: '/api/workspaces', headers: browser(bea), payload: { id } });
    expect((await create('gamma-2')).statusCode).toBe(201);
    expect((await create('gamma-3')).statusCode).toBe(201);
    const fourth = await create('gamma-4');
    expect(fourth.statusCode).toBe(409);
    expect(fourth.json().detail).toMatch(/at most 3 workspaces/);
  });

  it("SEC-F7: the read token sees only the first organization's workspaces", async () => {
    const list = (await a.app.inject({ method: 'GET', url: '/api/workspaces', headers: { authorization: 'Bearer dummy-read-token' } })).json() as { id: string }[];
    expect(list.map((w) => w.id)).toEqual(['default']);
    expect((await a.app.inject({ method: 'GET', url: '/api/w/gamma-1/analysis', headers: { authorization: 'Bearer dummy-read-token' } })).statusCode).toBe(404);
  });
});
