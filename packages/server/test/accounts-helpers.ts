import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { vi } from 'vitest';
import { buildApp, type AppOptions } from '../src/app.js';
import { CALLBACK_PATH, DEFAULT_ATLASSIAN_SCOPES, type ConnectConfig } from '../src/connections.js';

/** Accounts mode (docs/ACCOUNTS-PLAN.md): login with Atlassian, where only `read:me` is asked for. */
export const loginCfg: ConnectConfig = {
  mode: 'token',
  publicUrl: 'http://localhost:4317',
  atlassian: { clientId: 'dummy-client', clientSecret: 'dummy-secret', scopes: DEFAULT_ATLASSIAN_SCOPES },
};

export interface Identity {
  account_id: string;
  name: string;
  email?: string;
}

export const ADA: Identity = { account_id: 'acc-ada', name: 'Ada Owner', email: 'ada@example.com' };

/** Fake Atlassian: the token endpoint hands out numbered tokens, `/me` answers with whoever `as` names. */
export function fakeAtlassian() {
  const calls: { url: string; body?: Record<string, string>; auth: string | null }[] = [];
  const state = { as: ADA as Identity, tokens: [] as string[] };
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, string>) : undefined;
      const auth = new Headers(init?.headers).get('authorization');
      calls.push({ url, body, auth });
      if (url === 'https://auth.atlassian.com/oauth/token') {
        const token = `dummy-login-token-${state.tokens.length + 1}`;
        state.tokens.push(token);
        return reply({ access_token: token, expires_in: 3600 });
      }
      if (url === 'https://api.atlassian.com/me') {
        if (!state.tokens.some((t) => auth === `Bearer ${t}`)) return reply({ message: 'Unauthorized' }, 401);
        return reply(state.as);
      }
      return new Response('not found', { status: 404 });
    }),
  );
  return { calls, state };
}

export type App = Awaited<ReturnType<typeof buildApp>>;

export function tempDir() {
  return mkdtempSync(join(tmpdir(), 'ci-accounts-'));
}

export function removeDir(dir: string) {
  rmSync(dir, { recursive: true, force: true });
}

export async function startAccounts(dataDir: string, opts: Partial<AppOptions> = {}): Promise<App> {
  return buildApp({ dataDir, adminToken: '', readToken: '', allowedHosts: [], allowedOrigins: [], connect: loginCfg, authMode: 'accounts', ...opts });
}

export const cookies = (h: unknown): string[] => (h === undefined ? [] : Array.isArray(h) ? h.map(String) : [String(h)]);
export const cookieNamed = (h: unknown, name: string) => cookies(h).find((c) => c.startsWith(`${name}=`));

/** The whole login flow through the API; `session` is the `ci_session=…` pair to send back, when one was set. */
export async function login(app: App['app'], query = '') {
  const start = await app.inject({ method: 'GET', url: `/api/auth/login${query}` });
  const url = new URL(String(start.headers.location));
  const cookie = cookieNamed(start.headers['set-cookie'], 'ci_oauth_login')?.split(';')[0] ?? '';
  const back = await app.inject({ method: 'GET', url: `${CALLBACK_PATH}?code=dummy-code&state=${url.searchParams.get('state')}`, headers: { cookie } });
  const session = cookieNamed(back.headers['set-cookie'], 'ci_session')?.split(';')[0];
  return { start, url, back, session };
}

/** The message the login screen shows after a refused login. */
export const loginError = (location: unknown) => new URL(String(location), 'http://localhost').searchParams.get('login_error') ?? '';

/** Headers a browser sends with a session: the cookie and, for changes, its own Origin. */
export const browser = (session: string | undefined) => ({ cookie: session ?? '', origin: 'http://localhost:4317', host: 'localhost:4317' });

/** Every file under `dir`, as text. */
export function allText(dir: string): string {
  return readdirSync(dir)
    .map((name) => join(dir, name))
    .map((p) => (statSync(p).isDirectory() ? allText(p) : readFileSync(p, 'utf8')))
    .join('\n');
}
