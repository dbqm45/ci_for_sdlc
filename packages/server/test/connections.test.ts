import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { AtlassianConnection, connectConfigFromEnv, cookieValue, DEFAULT_ATLASSIAN_SCOPES, type ConnectConfig } from '../src/connections.js';
import { Store } from '../src/store.js';
import { putSettings } from './helpers.js';

const ENV = ['CI_ENCRYPTION_KEY', 'JIRA_API_TOKEN', 'CONFLUENCE_API_TOKEN', 'CI_DISABLE_SCHEDULE'] as const;
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));

const oauthCfg: ConnectConfig = {
  mode: 'oauth',
  publicUrl: 'http://localhost:4317',
  atlassian: { clientId: 'dummy-client', clientSecret: 'dummy-secret', scopes: DEFAULT_ATLASSIAN_SCOPES },
};

const SITES = [
  { id: 'cloud-1', name: 'acme', url: 'https://acme.atlassian.net', scopes: ['read:jira-work'] },
  { id: 'cloud-1', name: 'acme', url: 'https://acme.atlassian.net', scopes: ['read:page:confluence'] },
  { id: 'cloud-2', name: 'beta', url: 'https://beta.atlassian.net/', scopes: ['read:jira-work'] },
];

/** Fake Atlassian: the token endpoint hands out numbered tokens; `refuseRefresh` answers refreshes with invalid_grant. */
function fakeAtlassian(opts: { refuseRefresh?: boolean; noRefreshToken?: boolean } = {}) {
  const calls: { url: string; body?: Record<string, string>; auth: string | null }[] = [];
  let n = 0;
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, string>) : undefined;
      calls.push({ url, body, auth: new Headers(init?.headers).get('authorization') });
      if (url === 'https://auth.atlassian.com/oauth/token') {
        if (body?.grant_type === 'refresh_token' && opts.refuseRefresh) return reply({ error: 'invalid_grant' }, 403);
        n++;
        return reply({ access_token: `dummy-access-${n}`, expires_in: 3600, ...(!opts.noRefreshToken && { refresh_token: `dummy-refresh-${n}` }) });
      }
      if (url === 'https://api.atlassian.com/oauth/token/accessible-resources') return reply(SITES);
      if (url.includes('/rest/api/3/search/jql')) return reply({ issues: [{ key: 'PAY-1', fields: { summary: 'One', issuetype: { name: 'Story' } } }] });
      if (url.includes('/remotelink')) return reply([]);
      return new Response('not found', { status: 404 });
    }),
  );
  return calls;
}

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ci-conn-'));
  process.env.CI_ENCRYPTION_KEY = 'dummy-encryption-key';
  process.env.CI_DISABLE_SCHEDULE = 'true';
  delete process.env.JIRA_API_TOKEN;
  delete process.env.CONFLUENCE_API_TOKEN;
});
afterEach(() => {
  vi.unstubAllGlobals();
  rmSync(dir, { recursive: true, force: true });
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

/** The message Settings shows after a failed callback. */
const connectError = (location: unknown) => new URL(String(location), 'http://localhost').searchParams.get('connect_error') ?? '';

/** Runs the whole consent flow through the API and returns the callback response. */
async function connect(app: Awaited<ReturnType<typeof buildApp>>['app']) {
  const start = await app.inject({ method: 'POST', url: '/api/connections/atlassian/start', headers: { 'x-ci-actor': 'Ada' } });
  const url = new URL(start.json().url);
  const cookie = String(start.headers['set-cookie']).split(';')[0]!;
  const back = await app.inject({ method: 'GET', url: `/api/connections/atlassian/callback?code=dummy-code&state=${url.searchParams.get('state')}`, headers: { cookie } });
  return { start, url, back };
}

describe('CI_CONNECT_MODE configuration', () => {
  it('CN-01: token is the default; an unknown mode is refused; the public URL and scopes have defaults', () => {
    expect(connectConfigFromEnv({})).toMatchObject({ mode: 'token', publicUrl: 'http://localhost:4317', atlassian: { scopes: DEFAULT_ATLASSIAN_SCOPES } });
    expect(connectConfigFromEnv({ CI_CONNECT_MODE: 'oauth', CI_PUBLIC_URL: 'https://ci.example.test/', ATLASSIAN_SCOPES: 'read:jira-work offline_access' })).toMatchObject({
      mode: 'oauth',
      publicUrl: 'https://ci.example.test',
      atlassian: { scopes: ['read:jira-work', 'offline_access'] },
    });
    expect(() => connectConfigFromEnv({ CI_CONNECT_MODE: 'sso' })).toThrow('CI_CONNECT_MODE must be "token" or "oauth"');
  });

  it('CN-02: in token mode the connect button is refused and settings report the mode', async () => {
    const { app } = await buildApp({ dataDir: dir, connect: { ...oauthCfg, mode: 'token' } });
    expect((await app.inject({ method: 'GET', url: '/api/connections' })).json()).toMatchObject({ mode: 'token', atlassian: { connected: false } });
    const start = await app.inject({ method: 'POST', url: '/api/connections/atlassian/start' });
    expect(start.statusCode).toBe(409);
    expect(start.json().detail).toContain('CI_CONNECT_MODE=oauth');
    expect((await app.inject({ method: 'GET', url: '/api/settings' })).json().connectMode).toBe('token');
    await app.close();
  });

  it('CN-03: without client id, secret or encryption key the status lists what is missing and start is refused', async () => {
    delete process.env.CI_ENCRYPTION_KEY;
    const { app } = await buildApp({ dataDir: dir, connect: { ...oauthCfg, atlassian: { ...oauthCfg.atlassian, clientSecret: '' } } });
    expect((await app.inject({ method: 'GET', url: '/api/connections' })).json().atlassian).toMatchObject({ configured: false, missing: ['ATLASSIAN_CLIENT_SECRET', 'CI_ENCRYPTION_KEY'] });
    expect((await app.inject({ method: 'POST', url: '/api/connections/atlassian/start' })).statusCode).toBe(409);
    await app.close();
  });
});

describe('Connect Atlassian (OAuth 2.0 3LO)', () => {
  it('CN-04: start returns the consent URL and binds the state to this browser with an HttpOnly cookie', async () => {
    fakeAtlassian();
    const { app } = await buildApp({ dataDir: dir, connect: oauthCfg });
    const { start, url } = await connect(app);
    expect(url.origin + url.pathname).toBe('https://auth.atlassian.com/authorize');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      audience: 'api.atlassian.com',
      client_id: 'dummy-client',
      scope: DEFAULT_ATLASSIAN_SCOPES.join(' '),
      redirect_uri: 'http://localhost:4317/api/connections/atlassian/callback',
      response_type: 'code',
      prompt: 'consent',
    });
    expect(url.searchParams.get('state')).toMatch(/^[\w-]{32}$/);
    expect(String(start.headers['set-cookie'])).toMatch(/^ci_oauth_atlassian=[\w-]+; Path=\/api\/connections\/atlassian\/callback; Max-Age=600; HttpOnly; SameSite=Lax$/);
    await app.close();
  });

  it('CN-05: the callback exchanges the code, stores only an encrypted refresh token and returns to Settings', async () => {
    const calls = fakeAtlassian();
    const { app } = await buildApp({ dataDir: dir, connect: oauthCfg });
    const { back } = await connect(app);
    expect(back.statusCode).toBe(302);
    expect(back.headers.location).toBe('/?connected=atlassian#/settings');
    expect(String(back.headers['set-cookie'])).toContain('Max-Age=0');
    expect(calls[0]?.body).toEqual({ grant_type: 'authorization_code', client_id: 'dummy-client', client_secret: 'dummy-secret', code: 'dummy-code', redirect_uri: 'http://localhost:4317/api/connections/atlassian/callback' });
    const file = readFileSync(join(dir, 'connections.json'), 'utf8');
    expect(file).toContain('"__enc":1');
    expect(file).not.toContain('dummy-refresh');
    expect(file).not.toContain('dummy-access');
    const status = (await app.inject({ method: 'GET', url: '/api/connections' })).json().atlassian;
    expect(status).toMatchObject({ connected: true, connectedBy: 'Ada', site: { id: 'cloud-1', name: 'acme' } });
    // Jira and Confluence of one site come as two entries with one cloud id: merged into one site.
    expect(status.sites.map((s: { id: string; scopes: string[] }) => [s.id, s.scopes])).toEqual([
      ['cloud-1', ['read:jira-work', 'read:page:confluence']],
      ['cloud-2', ['read:jira-work']],
    ]);
    expect(JSON.stringify(status)).not.toContain('dummy-refresh');
    expect((await app.inject({ method: 'GET', url: '/api/audit' })).json()[0]).toMatchObject({ kind: 'connection', actor: 'Ada', summary: 'Atlassian connected (acme)' });
    await app.close();
  });

  it.each([
    { id: 'CN-06', name: 'no cookie', cookie: undefined, state: 'issued' },
    { id: 'CN-07', name: 'a cookie from another attempt', cookie: 'ci_oauth_atlassian=other', state: 'issued' },
    { id: 'CN-08', name: 'a state the server never issued', cookie: 'ci_oauth_atlassian=forged', state: 'forged' },
  ])('$id: the callback with $name connects nothing and calls no Atlassian endpoint', async ({ cookie, state }) => {
    const calls = fakeAtlassian();
    const { app } = await buildApp({ dataDir: dir, connect: oauthCfg });
    const issued = new URL((await app.inject({ method: 'POST', url: '/api/connections/atlassian/start' })).json().url).searchParams.get('state')!;
    const back = await app.inject({ method: 'GET', url: `/api/connections/atlassian/callback?code=dummy-code&state=${state === 'issued' ? issued : state}`, headers: cookie ? { cookie } : {} });
    expect(back.statusCode).toBe(302);
    expect(connectError(back.headers.location)).toContain('Click Connect again');
    expect(calls).toEqual([]);
    expect((await app.inject({ method: 'GET', url: '/api/connections' })).json().atlassian.connected).toBe(false);
    await app.close();
  });

  it('CN-09: a state works once; declining consent in Atlassian is reported back to Settings', async () => {
    fakeAtlassian();
    const { app } = await buildApp({ dataDir: dir, connect: oauthCfg });
    const start = await app.inject({ method: 'POST', url: '/api/connections/atlassian/start' });
    const state = new URL(start.json().url).searchParams.get('state')!;
    const cookie = String(start.headers['set-cookie']).split(';')[0]!;
    const denied = await app.inject({ method: 'GET', url: `/api/connections/atlassian/callback?error=access_denied&state=${state}`, headers: { cookie } });
    expect(connectError(denied.headers.location)).toBe('Access was not granted in Atlassian.');
    const replay = await app.inject({ method: 'GET', url: `/api/connections/atlassian/callback?code=dummy-code&state=${state}`, headers: { cookie } });
    expect(connectError(replay.headers.location)).toContain('Click Connect again');
    await app.close();
  });

  it('CN-10: no refresh token (offline_access missing) is refused with what to fix', async () => {
    fakeAtlassian({ noRefreshToken: true });
    const { app } = await buildApp({ dataDir: dir, connect: oauthCfg });
    const { back } = await connect(app);
    expect(connectError(back.headers.location)).toContain('offline_access');
    await app.close();
  });

  it('CN-11: the site can be changed only to one of the connection; disconnect forgets it', async () => {
    fakeAtlassian();
    const { app } = await buildApp({ dataDir: dir, connect: oauthCfg });
    await connect(app);
    expect((await app.inject({ method: 'PUT', url: '/api/connections/atlassian/site', payload: { cloudId: 'cloud-2' } })).json().site).toMatchObject({ id: 'cloud-2', url: 'https://beta.atlassian.net' });
    expect((await app.inject({ method: 'PUT', url: '/api/connections/atlassian/site', payload: { cloudId: 'cloud-9' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'DELETE', url: '/api/connections/atlassian' })).json()).toMatchObject({ connected: false, sites: [] });
    await app.close();
  });
});

describe('Access tokens', () => {
  it('CN-12: a cached access token is reused; a refresh stores the rotated refresh token', async () => {
    const calls = fakeAtlassian();
    const store = new Store(dir);
    await store.init();
    let now = 1_000_000;
    const conn = new AtlassianConnection(store, oauthCfg, () => now);
    const { state } = conn.start('Ada');
    await conn.complete({ code: 'dummy-code', state, cookieState: state });
    expect(await conn.accessFor()).toEqual({ cloudId: 'cloud-1', siteUrl: 'https://acme.atlassian.net', accessToken: 'dummy-access-1' });
    expect(calls.filter((c) => c.body?.grant_type === 'refresh_token')).toHaveLength(0);

    now += 3600_000;
    // Two analyses at once: one refresh, both get the new token.
    const [a, b] = await Promise.all([conn.accessFor(), conn.accessFor()]);
    expect([a.accessToken, b.accessToken]).toEqual(['dummy-access-2', 'dummy-access-2']);
    const refreshes = calls.filter((c) => c.body?.grant_type === 'refresh_token');
    expect(refreshes.map((c) => c.body?.refresh_token)).toEqual(['dummy-refresh-1']);

    now += 3600_000;
    await conn.accessFor();
    expect(calls.filter((c) => c.body?.grant_type === 'refresh_token').map((c) => c.body?.refresh_token)).toEqual(['dummy-refresh-1', 'dummy-refresh-2']);
  });

  it('CN-13: a refused refresh marks the connection for reconnecting instead of retrying', async () => {
    const calls = fakeAtlassian({ refuseRefresh: true });
    const store = new Store(dir);
    await store.init();
    let now = 1_000_000;
    const conn = new AtlassianConnection(store, oauthCfg, () => now);
    const { state } = conn.start('Ada');
    await conn.complete({ code: 'dummy-code', state, cookieState: state });
    now += 3600_000;
    await expect(conn.accessFor()).rejects.toThrow('Reconnect Atlassian');
    await expect(conn.accessFor()).rejects.toThrow('Reconnect Atlassian');
    expect(calls.filter((c) => c.body?.grant_type === 'refresh_token')).toHaveLength(1);
    expect(await conn.status()).toMatchObject({ connected: false, lastError: 'Atlassian token endpoint → HTTP 403 (invalid_grant)' });
  });

  it('CN-14: in oauth mode the analysis reads Jira through the gateway without JIRA_API_TOKEN', async () => {
    const calls = fakeAtlassian();
    const { app } = await buildApp({ dataDir: dir, connect: oauthCfg });
    await connect(app);
    await putSettings(app, { mode: 'live', integrations: { jira: { enabled: true, projectKey: 'PAY' } } });
    const res = await app.inject({ method: 'POST', url: '/api/settings/test-connections' });
    expect(res.json()).toEqual({ jira: 'OK — 1 issues' });
    const jira = calls.filter((c) => c.url.includes('/rest/api/3/'));
    expect(jira.length).toBeGreaterThan(0);
    expect(jira.every((c) => c.url.startsWith('https://api.atlassian.com/ex/jira/cloud-1/') && c.auth === 'Bearer dummy-access-1')).toBe(true);
    await app.close();
  });
});

describe('cookieValue', () => {
  it('CN-15: reads one cookie among others', () => {
    expect(cookieValue('a=1; ci_oauth_atlassian=xyz; b=2', 'ci_oauth_atlassian')).toBe('xyz');
    expect(cookieValue(undefined, 'ci_oauth_atlassian')).toBeUndefined();
    expect(cookieValue('ci_oauth_atlassian=', 'ci_oauth_atlassian')).toBeUndefined();
  });
});
