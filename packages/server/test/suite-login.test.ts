import { createHash, generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SUITE_CALLBACK_PATH, SUITE_LOGIN_COOKIE, type SuiteLoginConfig } from '../src/suite-login.js';
import { cookieNamed, loginError, removeDir, startAccounts, tempDir, type App } from './accounts-helpers.js';

// Login through the suite's identity service (docs/SUITE-LOGIN-PLAN.md) against a fake OpenID provider: discovery,
// JWKS and a token endpoint that checks PKCE and issues an RS256 ID token with the claims the test chooses. The claims
// have the shape the real realm gives the di-definition client (Keycloak 26.4.7, dbqm45/di-identity 0.1.3): no email.

const ISSUER = 'http://localhost:8180/realms/suite';
const suite: SuiteLoginConfig = { issuer: ISSUER, clientId: 'di-definition', clientSecret: 'dummy-suite-secret', organization: 'acme' };

const b64 = (v: unknown) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');
const jwt = (key: KeyObject, claims: Record<string, unknown>, kid = 'k1') => {
  const input = `${b64({ alg: 'RS256', typ: 'JWT', kid })}.${b64(claims)}`;
  return `${input}.${sign('sha256', Buffer.from(input), key).toString('base64url')}`;
};

const person = (roles: string[], organization: string[] = ['acme'], sub = 'f1d2c3b4-0000-4000-8000-000000000001') => ({
  sub,
  name: 'Ola Test',
  preferred_username: 'ola.test',
  organization,
  resource_access: { account: { roles: ['view-profile'] }, 'di-definition': { roles }, 'di-release': { roles: ['admin'] } },
});

function fakeSuite() {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const stranger = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
  const grants = new Map<string, { nonce: string; challenge: string }>();
  const state = {
    claims: person(['editor']) as Record<string, unknown>,
    /** Changes the issued token after the standard claims are set (a bad audience, an old token, another key). */
    tamper: (c: Record<string, unknown>) => c,
    key: privateKey,
    tokenForms: [] as URLSearchParams[],
  };
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url === `${ISSUER}/.well-known/openid-configuration`)
        return reply({ issuer: ISSUER, authorization_endpoint: `${ISSUER}/protocol/openid-connect/auth`, token_endpoint: `${ISSUER}/protocol/openid-connect/token`, jwks_uri: `${ISSUER}/protocol/openid-connect/certs` });
      if (url === `${ISSUER}/protocol/openid-connect/certs`) return reply({ keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' }] });
      if (url === `${ISSUER}/protocol/openid-connect/token`) {
        const form = new URLSearchParams(String(init?.body ?? ''));
        state.tokenForms.push(form);
        const grant = grants.get(form.get('code') ?? '');
        const verifier = form.get('code_verifier') ?? '';
        if (!grant || createHash('sha256').update(verifier).digest('base64url') !== grant.challenge) return reply({ error: 'invalid_grant' }, 400);
        const now = Math.floor(Date.now() / 1000);
        const claims = state.tamper({ iss: ISSUER, aud: 'di-definition', azp: 'di-definition', typ: 'ID', iat: now, exp: now + 300, nonce: grant.nonce, ...state.claims });
        return reply({ access_token: 'dummy-access', token_type: 'Bearer', expires_in: 300, id_token: jwt(state.key, claims) });
      }
      return new Response('not found', { status: 404 });
    }),
  );
  /** Plays the person signing in at the identity service: the code for the authorization request in `location`. */
  const approve = (location: string) => {
    const auth = new URL(location);
    const code = `code-${grants.size}`;
    grants.set(code, { nonce: auth.searchParams.get('nonce')!, challenge: auth.searchParams.get('code_challenge')! });
    return { code, state: auth.searchParams.get('state')! };
  };
  return { state, approve, stranger };
}

/** The whole suite login through the API; `session` is the `ci_session=…` pair when one was set. */
async function suiteLogin(app: App['app'], fake: ReturnType<typeof fakeSuite>) {
  const start = await app.inject({ method: 'GET', url: '/api/auth/suite/login' });
  const cookie = cookieNamed(start.headers['set-cookie'], SUITE_LOGIN_COOKIE)?.split(';')[0] ?? '';
  const { code, state } = fake.approve(String(start.headers.location));
  const back = await app.inject({ method: 'GET', url: `${SUITE_CALLBACK_PATH}?code=${code}&state=${state}`, headers: { cookie } });
  const session = cookieNamed(back.headers['set-cookie'], 'ci_session')?.split(';')[0];
  return { start, back, session };
}

const me = async (app: App['app'], session?: string) => (await app.inject({ method: 'GET', url: '/api/auth/me', headers: session ? { cookie: session } : {} })).json();

let dir: string;
let running: App | undefined;
beforeEach(() => {
  dir = tempDir();
});
afterEach(async () => {
  await running?.app.close();
  running = undefined;
  vi.unstubAllGlobals();
  removeDir(dir);
});

describe('login through the suite identity service', () => {
  it('SL-01: without the suite settings the suite login is off and not offered', async () => {
    running = await startAccounts(dir);
    expect((await running.app.inject({ method: 'GET', url: '/api/auth/suite/login' })).statusCode).toBe(404);
    expect((await me(running.app)).suiteLogin).toBe(false);
  });

  it('SL-02: the login redirects to the issuer with PKCE (S256), state, nonce and no email scope', async () => {
    const fake = fakeSuite();
    running = await startAccounts(dir, { suite });
    expect((await me(running.app)).suiteLogin).toBe(true);
    const start = await running.app.inject({ method: 'GET', url: '/api/auth/suite/login' });
    expect(start.statusCode).toBe(302);
    const url = new URL(String(start.headers.location));
    expect(`${url.origin}${url.pathname}`).toBe(`${ISSUER}/protocol/openid-connect/auth`);
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: 'di-definition',
      response_type: 'code',
      scope: 'openid profile',
      redirect_uri: `http://localhost:4317${SUITE_CALLBACK_PATH}`,
      code_challenge_method: 'S256',
    });
    for (const p of ['state', 'nonce', 'code_challenge']) expect(url.searchParams.get(p)).toMatch(/^[\w-]{20,}$/);
    const cookie = cookieNamed(start.headers['set-cookie'], SUITE_LOGIN_COOKIE)!;
    expect(cookie).toContain(`Path=${SUITE_CALLBACK_PATH}`);
    expect(cookie).toContain('HttpOnly');
    expect(fake.state.tokenForms).toHaveLength(0);
  });

  it('SL-03: a person with the editor role in the organization comes in as Member, as the same account next time', async () => {
    const fake = fakeSuite();
    running = await startAccounts(dir, { suite });
    fake.state.claims = person(['admin']);
    expect((await suiteLogin(running.app, fake)).session).toBeDefined(); // the first Owner (SL-06)
    fake.state.claims = person(['editor'], ['acme'], 'f1d2c3b4-0000-4000-8000-000000000002');
    const first = await suiteLogin(running.app, fake);
    expect(first.back.headers.location).toBe('/');
    expect((await me(running.app, first.session)).user).toMatchObject({ name: 'Ola Test', role: 'member' });
    const again = await suiteLogin(running.app, fake);
    expect((await me(running.app, again.session)).user.id).toBe((await me(running.app, first.session)).user.id);
    // The client secret goes to the token endpoint only, with the PKCE verifier.
    expect(fake.state.tokenForms.at(-1)?.get('client_secret')).toBe('dummy-suite-secret');
    expect(fake.state.tokenForms.at(-1)?.get('code_verifier')).toMatch(/^[\w-]{43,}$/);
  });

  it('SL-04: a person outside the organization or without a role is refused with a reason, without a session', async () => {
    const fake = fakeSuite();
    running = await startAccounts(dir, { suite });
    fake.state.claims = person(['admin'], ['globex']);
    const outside = await suiteLogin(running.app, fake);
    expect(outside.session).toBeUndefined();
    expect(loginError(outside.back.headers.location)).toMatch(/not a member of the organization/);
    fake.state.claims = person([]);
    const noRole = await suiteLogin(running.app, fake);
    expect(noRole.session).toBeUndefined();
    expect(loginError(noRole.back.headers.location)).toMatch(/no role in DI Definition/);
  });

  it('SL-05: a token signed with another key, for another client, with another nonce or expired is refused', async () => {
    const fake = fakeSuite();
    running = await startAccounts(dir, { suite });
    fake.state.claims = person(['admin']);
    const bad: [string, () => void][] = [
      ['key', () => (fake.state.key = fake.stranger)],
      ['aud', () => (fake.state.tamper = (c) => ({ ...c, aud: 'di-release' }))],
      ['azp', () => (fake.state.tamper = (c) => ({ ...c, azp: 'di-release' }))],
      ['nonce', () => (fake.state.tamper = (c) => ({ ...c, nonce: 'forged' }))],
      ['exp', () => (fake.state.tamper = (c) => ({ ...c, exp: Math.floor(Date.now() / 1000) - 600 }))],
      ['iss', () => (fake.state.tamper = (c) => ({ ...c, iss: 'http://localhost:8180/realms/other' }))],
    ];
    for (const [name, spoil] of bad) {
      const key = fake.state.key;
      spoil();
      const r = await suiteLogin(running.app, fake);
      expect(r.session, name).toBeUndefined();
      expect(loginError(r.back.headers.location), name).toMatch(/login failed|not accept/i);
      fake.state.key = key;
      fake.state.tamper = (c) => c;
    }
    // A callback without the login cookie, or with a state it did not start, is refused before any token request.
    const forms = fake.state.tokenForms.length;
    const noCookie = await running.app.inject({ method: 'GET', url: `${SUITE_CALLBACK_PATH}?code=x&state=y` });
    expect(loginError(noCookie.headers.location)).toMatch(/expired/);
    expect(fake.state.tokenForms).toHaveLength(forms);
  });

  it('SL-06: the first person with admin on an empty installation becomes Owner; Owner stays with admin, drops with viewer', async () => {
    const fake = fakeSuite();
    running = await startAccounts(dir, { suite });
    fake.state.claims = person(['editor']);
    expect(loginError((await suiteLogin(running.app, fake)).back.headers.location)).toMatch(/administrator/);
    fake.state.claims = person(['admin']);
    const owner = await suiteLogin(running.app, fake);
    expect((await me(running.app, owner.session)).user.role).toBe('owner');
    expect((await me(running.app, (await suiteLogin(running.app, fake)).session)).user.role).toBe('owner');
    fake.state.claims = person(['viewer']);
    expect((await me(running.app, (await suiteLogin(running.app, fake)).session)).user.role).toBe('viewer');
  });

  it('SL-07: a person from the suite is no operator and has no e-mail', async () => {
    const fake = fakeSuite();
    running = await startAccounts(dir, { suite, operatorEmails: ['ola.test'] });
    fake.state.claims = person(['admin']);
    const { session } = await suiteLogin(running.app, fake);
    expect((await me(running.app, session)).user).toMatchObject({ email: '', operator: false, role: 'owner' });
  });
});
