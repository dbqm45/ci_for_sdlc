import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { CALLBACK_PATH } from '../src/connections.js';
import { ADA, allText, browser, cookieNamed, fakeAtlassian, login, loginCfg, loginError, removeDir, startAccounts, tempDir, type App } from './accounts-helpers.js';

const ENV = ['CI_DISABLE_SCHEDULE', 'CI_AUTH_MODE', 'CI_BOOTSTRAP_EMAIL'] as const;
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
const BOB = { account_id: 'acc-bob', name: 'Bob Stranger', email: 'bob@example.com' };

let dir: string;
let app: App | undefined;
beforeEach(() => {
  dir = tempDir();
  process.env.CI_DISABLE_SCHEDULE = 'true';
  delete process.env.CI_AUTH_MODE;
  delete process.env.CI_BOOTSTRAP_EMAIL;
});
afterEach(async () => {
  await app?.app.close();
  app = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  removeDir(dir);
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const me = (session?: string) => app!.app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: session ?? '' } });

describe('login with Atlassian', () => {
  it('AC-01: the login redirects to Atlassian asking only for read:me, with the state in its own short cookie', async () => {
    fakeAtlassian();
    app = await startAccounts(dir, { bootstrapEmail: ADA.email });
    const r = await app.app.inject({ method: 'GET', url: '/api/auth/login' });
    expect(r.statusCode).toBe(302);
    const url = new URL(String(r.headers.location));
    expect(url.origin + url.pathname).toBe('https://auth.atlassian.com/authorize');
    expect(url.searchParams.get('scope')).toBe('read:me');
    expect(url.searchParams.get('client_id')).toBe('dummy-client');
    expect(url.searchParams.get('redirect_uri')).toBe(`http://localhost:4317${CALLBACK_PATH}`);
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('state')!.length).toBeGreaterThanOrEqual(32);
    const cookie = cookieNamed(r.headers['set-cookie'], 'ci_oauth_login')!;
    expect(cookie).toContain(`ci_oauth_login=${url.searchParams.get('state')}`);
    expect(cookie).toContain(`Path=${CALLBACK_PATH}`);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Max-Age=600');
  });

  it('AC-02: the first person with CI_BOOTSTRAP_EMAIL (any case) becomes Owner and gets a session', async () => {
    const { calls } = fakeAtlassian();
    app = await startAccounts(dir, { bootstrapEmail: 'ADA@Example.com' });
    expect((await me()).json()).toEqual({ mode: 'accounts', user: null });
    const { back, session } = await login(app.app);
    expect(back.statusCode).toBe(302);
    expect(back.headers.location).toBe('/');
    const cookie = cookieNamed(back.headers['set-cookie'], 'ci_session')!;
    expect(cookie).toMatch(/^ci_session=[A-Za-z0-9_-]{43}; /);
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).not.toContain('Secure');
    // The login state cookie is cleared.
    expect(cookieNamed(back.headers['set-cookie'], 'ci_oauth_login')).toContain('Max-Age=0');
    const exchange = calls.find((c) => c.url === 'https://auth.atlassian.com/oauth/token')!;
    expect(exchange.body).toMatchObject({ grant_type: 'authorization_code', code: 'dummy-code', client_id: 'dummy-client', redirect_uri: `http://localhost:4317${CALLBACK_PATH}` });
    expect(calls.find((c) => c.url === 'https://api.atlassian.com/me')?.auth).toBe('Bearer dummy-login-token-1');
    const who = (await me(session)).json();
    expect(who).toMatchObject({ mode: 'accounts', user: { name: 'Ada Owner', email: 'ada@example.com', role: 'owner' } });
    expect(who.user.id).toEqual(expect.any(String));
    expect((await app.app.inject({ method: 'GET', url: '/api/settings', headers: browser(session) })).statusCode).toBe(200);
  });

  it('AC-03: neither the Atlassian token nor the session id is stored, only the SHA-256 of the session id', async () => {
    fakeAtlassian();
    app = await startAccounts(dir, { bootstrapEmail: ADA.email });
    const { session } = await login(app.app);
    const id = session!.slice('ci_session='.length);
    const stored = allText(dir);
    expect(stored).not.toContain('dummy-login-token');
    expect(stored).not.toContain(id);
    const sessions = readFileSync(join(dir, 'workspaces', '_platform', 'sessions.json'), 'utf8');
    expect(sessions).toContain(createHash('sha256').update(id).digest('hex'));
  });

  it('AC-04: a wrong state or a missing login cookie is refused with a message for the login screen', async () => {
    const { calls } = fakeAtlassian();
    app = await startAccounts(dir, { bootstrapEmail: ADA.email });
    const start = await app.app.inject({ method: 'GET', url: '/api/auth/login' });
    const cookie = cookieNamed(start.headers['set-cookie'], 'ci_oauth_login')!.split(';')[0]!;
    const wrong = await app.app.inject({ method: 'GET', url: `${CALLBACK_PATH}?code=dummy-code&state=not-the-state`, headers: { cookie } });
    expect(wrong.statusCode).toBe(302);
    expect(loginError(wrong.headers.location)).toMatch(/expired|again/i);
    expect(cookieNamed(wrong.headers['set-cookie'], 'ci_session')).toBeUndefined();
    const state = new URL(String(start.headers.location)).searchParams.get('state');
    const noCookie = await app.app.inject({ method: 'GET', url: `${CALLBACK_PATH}?code=dummy-code&state=${state}` });
    expect(loginError(noCookie.headers.location)).toMatch(/expired|again/i);
    expect(cookieNamed(noCookie.headers['set-cookie'], 'ci_session')).toBeUndefined();
    expect(calls.some((c) => c.url.includes('/oauth/token'))).toBe(false);
  });

  it('AC-05: with CI_BOOTSTRAP_EMAIL nobody else can become the first Owner', async () => {
    const fake = fakeAtlassian();
    app = await startAccounts(dir, { bootstrapEmail: ADA.email });
    fake.state.as = BOB;
    const bob = await login(app.app);
    expect(bob.session).toBeUndefined();
    expect(loginError(bob.back.headers.location)).toMatch(/invitation/i);
    fake.state.as = { ...ADA, email: undefined };
    expect((await login(app.app)).session).toBeUndefined();
    fake.state.as = ADA;
    expect((await login(app.app)).session).toBeDefined();
  });

  it('AC-06: without CI_BOOTSTRAP_EMAIL the first Owner needs the one-time link from the log', async () => {
    const fake = fakeAtlassian();
    app = await startAccounts(dir);
    const link = app.accounts.bootstrapLink();
    expect(link).toMatch(/^http:\/\/localhost:4317\/api\/auth\/login\?bootstrap=[A-Za-z0-9_-]{20,}$/);
    const code = new URL(link!).searchParams.get('bootstrap')!;
    expect((await login(app.app)).session).toBeUndefined();
    expect((await login(app.app, '?bootstrap=wrong-code')).session).toBeUndefined();
    const ada = await login(app.app, `?bootstrap=${code}`);
    expect((await me(ada.session)).json().user).toMatchObject({ name: 'Ada Owner', role: 'owner' });
    expect(app.accounts.bootstrapLink()).toBeUndefined();
    fake.state.as = BOB;
    const bob = await login(app.app, `?bootstrap=${code}`);
    expect(bob.session).toBeUndefined();
    expect(loginError(bob.back.headers.location)).toMatch(/invitation/i);
  });

  it('AC-07: a known person logs in again as the same account; a stranger is told to ask for an invitation', async () => {
    const fake = fakeAtlassian();
    app = await startAccounts(dir, { bootstrapEmail: ADA.email });
    const first = await login(app.app);
    const id = (await me(first.session)).json().user.id;
    fake.state.as = { ...ADA, name: 'Ada Lovelace' };
    const again = await login(app.app);
    expect(again.session).not.toBe(first.session);
    expect((await me(again.session)).json().user).toMatchObject({ id, name: 'Ada Lovelace', role: 'owner' });
    expect((await me(first.session)).json().user).toMatchObject({ id });
    fake.state.as = BOB;
    const bob = await login(app.app);
    expect(bob.session).toBeUndefined();
    expect(loginError(bob.back.headers.location)).toBe('Ask an administrator for an invitation.');
  });

  it('AC-08: an Atlassian answer without account_id is refused', async () => {
    const fake = fakeAtlassian();
    app = await startAccounts(dir, { bootstrapEmail: ADA.email });
    fake.state.as = { account_id: '', name: 'Nobody', email: ADA.email };
    const r = await login(app.app);
    expect(r.session).toBeUndefined();
    expect(loginError(r.back.headers.location)).not.toBe('');
  });

  it('AC-09: an https public URL makes both cookies Secure', async () => {
    fakeAtlassian();
    app = await startAccounts(dir, { bootstrapEmail: ADA.email, connect: { ...loginCfg, publicUrl: 'https://ci.example.com' } });
    const start = await app.app.inject({ method: 'GET', url: '/api/auth/login' });
    expect(cookieNamed(start.headers['set-cookie'], 'ci_oauth_login')).toContain('Secure');
    const { back } = await login(app.app);
    expect(cookieNamed(back.headers['set-cookie'], 'ci_session')).toContain('Secure');
  });
});

describe('sessions', () => {
  it('SE-01: without a session only health, login and me are open; loopback no longer passes', async () => {
    fakeAtlassian();
    app = await startAccounts(dir, { bootstrapEmail: ADA.email });
    const call = (method: 'GET' | 'POST', url: string) => app!.app.inject({ method, url });
    expect((await call('GET', '/api/health')).statusCode).toBe(200);
    expect((await call('GET', '/api/auth/me')).statusCode).toBe(200);
    expect((await call('GET', '/api/auth/login')).statusCode).toBe(302);
    expect((await call('GET', '/api/settings')).statusCode).toBe(401);
    expect((await call('GET', '/api/w/default/items')).statusCode).toBe(401);
    expect((await call('POST', '/api/analyze')).statusCode).toBe(401);
    expect((await app.app.inject({ method: 'GET', url: '/api/settings', headers: { cookie: 'ci_session=forged' } })).statusCode).toBe(401);
  });

  it('SE-02: log out removes the session on the server and clears the cookie', async () => {
    fakeAtlassian();
    app = await startAccounts(dir, { bootstrapEmail: ADA.email });
    const { session } = await login(app.app);
    const out = await app.app.inject({ method: 'POST', url: '/api/auth/logout', headers: browser(session) });
    expect(out.statusCode).toBe(204);
    expect(cookieNamed(out.headers['set-cookie'], 'ci_session')).toContain('Max-Age=0');
    expect((await me(session)).json().user).toBeNull();
    expect((await app.app.inject({ method: 'GET', url: '/api/settings', headers: browser(session) })).statusCode).toBe(401);
  });

  it('SE-03: a session ends after 12 hours without activity', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-02T08:00:00Z'));
    fakeAtlassian();
    app = await startAccounts(dir, { bootstrapEmail: ADA.email });
    const { session } = await login(app.app);
    vi.setSystemTime(new Date('2026-11-02T19:59:00Z'));
    expect((await me(session)).json().user).not.toBeNull();
    vi.setSystemTime(new Date('2026-11-03T07:58:00Z'));
    expect((await me(session)).json().user).not.toBeNull();
    vi.setSystemTime(new Date('2026-11-03T20:00:00Z'));
    expect((await me(session)).json().user).toBeNull();
  });

  it('SE-04: a session ends after 7 days even when it is used', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const t0 = new Date('2026-11-02T08:00:00Z').getTime();
    vi.setSystemTime(t0);
    fakeAtlassian();
    app = await startAccounts(dir, { bootstrapEmail: ADA.email });
    const { session } = await login(app.app);
    for (let h = 10; h < 7 * 24; h += 10) {
      vi.setSystemTime(t0 + h * 3_600_000);
      expect((await me(session)).json().user).not.toBeNull();
    }
    vi.setSystemTime(t0 + 7 * 24 * 3_600_000 + 60_000);
    expect((await me(session)).json().user).toBeNull();
  });

  it('SE-05: with a session the audit names the account and via session; X-CI-Actor and "by" are ignored', async () => {
    fakeAtlassian();
    app = await startAccounts(dir, { bootstrapEmail: ADA.email });
    const { session } = await login(app.app);
    const r = await app.app.inject({ method: 'POST', url: '/api/workspaces', headers: { ...browser(session), 'x-ci-actor': 'Mallory' }, payload: { id: 'team-a', by: 'Mallory' } });
    expect(r.statusCode).toBe(201);
    const audit = (await app.app.inject({ method: 'GET', url: '/api/audit', headers: browser(session) })).json();
    expect(audit[0]).toMatchObject({ kind: 'workspace', actor: 'Ada Owner', via: 'session' });
  });

  it('SE-06: machines keep using the tokens, only with the Authorization header; a wrong token is refused', async () => {
    fakeAtlassian();
    app = await startAccounts(dir, { bootstrapEmail: ADA.email, adminToken: 'dummy-admin', readToken: 'dummy-read' });
    const call = (method: 'GET' | 'POST', url: string, token: string) => app!.app.inject({ method, url, headers: { authorization: `Bearer ${token}` }, remoteAddress: '10.0.0.5' });
    expect((await call('GET', '/api/settings', 'dummy-read')).statusCode).toBe(200);
    expect((await call('POST', '/api/analyze', 'dummy-admin')).statusCode).toBe(200);
    expect((await call('POST', '/api/analyze', 'dummy-read')).statusCode).toBe(401);
    expect((await call('GET', '/api/settings', 'wrong')).statusCode).toBe(401);
    const { session } = await login(app.app);
    // A wrong bearer is not rescued by a valid session cookie.
    expect((await app.app.inject({ method: 'GET', url: '/api/settings', headers: { ...browser(session), authorization: 'Bearer wrong' } })).statusCode).toBe(401);
  });

  it('SE-07: CI_AUTH_MODE picks the mode; an unknown value stops the start', async () => {
    fakeAtlassian();
    process.env.CI_AUTH_MODE = 'accounts';
    process.env.CI_BOOTSTRAP_EMAIL = ADA.email;
    app = await buildApp({ dataDir: dir, adminToken: '', readToken: '', allowedHosts: [], allowedOrigins: [], connect: loginCfg });
    expect((await me()).json()).toEqual({ mode: 'accounts', user: null });
    expect((await login(app.app)).session).toBeDefined();
    await app.app.close();
    app = undefined;
    process.env.CI_AUTH_MODE = 'sso';
    await expect(buildApp({ dataDir: tempDir(), connect: loginCfg })).rejects.toThrow(/CI_AUTH_MODE/);
  });
});

describe('token mode (the default) is unchanged', () => {
  it('TM-01: me says token mode, login is off and loopback still changes data', async () => {
    fakeAtlassian();
    app = await buildApp({ dataDir: dir, adminToken: '', readToken: '', allowedHosts: [], allowedOrigins: [], connect: loginCfg });
    expect((await me()).json()).toEqual({ mode: 'token', user: null });
    expect((await app.app.inject({ method: 'GET', url: '/api/auth/login' })).statusCode).toBe(404);
    expect((await app.app.inject({ method: 'POST', url: '/api/analyze' })).statusCode).toBe(200);
    expect(app.accounts.bootstrapLink()).toBeUndefined();
  });
});
