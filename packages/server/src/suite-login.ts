import { createHash, createPublicKey, randomBytes, timingSafeEqual, verify } from 'node:crypto';
import { ConnectError } from './connections.js';

/**
 * Login through the suite's identity service (docs/SUITE-LOGIN-PLAN.md; ADR 17 in dbqm45/pdi): the authorization code
 * flow with PKCE against `dbqm45/di-identity` (Keycloak, realm `suite`, client `di-definition`), beside the login with
 * Atlassian. The ID token is checked here without dependencies: RS256 only, a key from the issuer's JWKS (never one the
 * token names itself), `iss`, `aud`, `azp`, `exp` and `nonce`. The token carries no e-mail: the suite gives it only to
 * applications that need it (DI3).
 */
export const SUITE_CALLBACK_PATH = '/api/auth/suite/callback';
export const SUITE_LOGIN_COOKIE = 'ci_suite_login';

export interface SuiteLoginConfig {
  issuer: string;
  clientId: string;
  clientSecret: string;
  /** Alias of the suite organization whose people log in to the installation's first organization. */
  organization: string;
}

/** Who the suite says logged in. */
export interface SuitePerson {
  sub: string;
  name: string;
  organizations: string[];
  /** Roles of this application (`resource_access[<client>].roles`). */
  roles: string[];
}

const LOGIN_TTL_MS = 10 * 60_000;
const SKEW_S = 60;
const TIMEOUT_MS = 5000;
const LOGIN_FAILED = 'The suite did not accept the login. Please log in again.';
const LOGIN_EXPIRED = 'The login expired. Please log in again.';

/** The suite settings from the environment, or undefined when the suite login is off; throws on a half-set or unsafe one. */
export function suiteLoginConfig(env: NodeJS.ProcessEnv = process.env): SuiteLoginConfig | undefined {
  const issuer = env.CI_SUITE_ISSUER?.trim();
  const clientSecret = env.CI_SUITE_CLIENT_SECRET?.trim();
  const organization = env.CI_SUITE_ORGANIZATION?.trim();
  if (!issuer && !clientSecret && !organization) return undefined;
  const missing = Object.entries({ CI_SUITE_ISSUER: issuer, CI_SUITE_CLIENT_SECRET: clientSecret, CI_SUITE_ORGANIZATION: organization })
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) throw new Error(`The suite login is half configured: set ${missing.join(', ')} (docs/SUITE-LOGIN-PLAN.md).`);
  checkIssuer(issuer!);
  return { issuer: issuer!, clientId: env.CI_SUITE_CLIENT_ID?.trim() || 'di-definition', clientSecret: clientSecret!, organization: organization! };
}

/** https, or http only for a local identity service. */
export function checkIssuer(issuer: string) {
  const u = new URL(issuer);
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) throw new Error(`CI_SUITE_ISSUER must be https (http only on localhost), not "${issuer}".`);
}

interface Discovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
}
interface Pending {
  expiresAt: number;
  nonce: string;
  verifier: string;
}

const random = () => randomBytes(32).toString('base64url');
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

async function getJson(url: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

const decode = (segment: string): Record<string, unknown> => {
  const v: unknown = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('not a JSON object');
  return v as Record<string, unknown>;
};
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : typeof v === 'string' ? [v] : []);

export class SuiteLogin {
  private discovery?: { value: Discovery; at: number };
  private readonly pending = new Map<string, Pending>();

  constructor(
    readonly cfg: SuiteLoginConfig,
    private readonly publicUrl: string,
  ) {}

  get redirectUri() {
    return this.publicUrl + SUITE_CALLBACK_PATH;
  }

  private secure() {
    return this.publicUrl.startsWith('https://') ? '; Secure' : '';
  }
  loginCookie(value: string, maxAgeSeconds = LOGIN_TTL_MS / 1000) {
    return `${SUITE_LOGIN_COOKIE}=${value}; Path=${SUITE_CALLBACK_PATH}; Max-Age=${maxAgeSeconds}; HttpOnly; SameSite=Lax${this.secure()}`;
  }

  private async discover(): Promise<Discovery> {
    if (this.discovery && Date.now() - this.discovery.at < 3_600_000) return this.discovery.value;
    const d = (await getJson(`${this.cfg.issuer.replace(/\/+$/, '')}/.well-known/openid-configuration`)) as Discovery;
    if (d.issuer !== this.cfg.issuer) throw new Error(`the identity service names itself ${d.issuer}, not ${this.cfg.issuer}`);
    this.discovery = { value: d, at: Date.now() };
    return d;
  }

  /** Where to send the browser, and the cookie that ties the answer to this browser. */
  async start(): Promise<{ url: string; cookie: string }> {
    const now = Date.now();
    for (const [k, v] of this.pending) if (v.expiresAt < now) this.pending.delete(k);
    const d = await this.discover();
    const state = random();
    const p: Pending = { expiresAt: now + LOGIN_TTL_MS, nonce: random(), verifier: random() };
    this.pending.set(state, p);
    const url = new URL(d.authorization_endpoint);
    url.search = new URLSearchParams({
      client_id: this.cfg.clientId,
      response_type: 'code',
      scope: 'openid profile',
      redirect_uri: this.redirectUri,
      state,
      nonce: p.nonce,
      code_challenge: createHash('sha256').update(p.verifier).digest('base64url'),
      code_challenge_method: 'S256',
    }).toString();
    return { url: url.toString(), cookie: this.loginCookie(state) };
  }

  /** Finishes the login: the person from the checked ID token, or a ConnectError with a message for the login screen. */
  async complete(q: { code?: string; state?: string; error?: string; cookieState?: string }): Promise<SuitePerson> {
    const p = q.state ? this.pending.get(q.state) : undefined;
    if (q.state) this.pending.delete(q.state);
    if (!p || !q.cookieState || !same(q.cookieState, q.state!) || p.expiresAt < Date.now()) throw new ConnectError('login_expired', LOGIN_EXPIRED);
    if (q.error || !q.code) throw new ConnectError('login_denied', 'The login was cancelled at the suite.');
    try {
      const d = await this.discover();
      const tokens = (await getJson(d.token_endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: q.code,
          redirect_uri: this.redirectUri,
          client_id: this.cfg.clientId,
          client_secret: this.cfg.clientSecret,
          code_verifier: p.verifier,
        }).toString(),
      })) as { id_token?: unknown };
      if (typeof tokens.id_token !== 'string') throw new Error('no ID token');
      return await this.checkIdToken(tokens.id_token, d, p.nonce);
    } catch (e) {
      throw new ConnectError('login_failed', LOGIN_FAILED, { cause: e });
    }
  }

  private async checkIdToken(token: string, d: Discovery, nonce: string): Promise<SuitePerson> {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('not a JWT');
    const [h, b, s] = parts as [string, string, string];
    const header = decode(h);
    if (header.alg !== 'RS256') throw new Error('not RS256');
    const { keys } = (await getJson(d.jwks_uri)) as { keys?: { kid?: string; kty?: string; n?: string; e?: string }[] };
    const jwk = keys?.find((k) => k.kid === header.kid && k.kty === 'RSA');
    if (!jwk?.n || !jwk.e) throw new Error('unknown signing key');
    const key = createPublicKey({ key: { kty: 'RSA', n: jwk.n, e: jwk.e }, format: 'jwk' });
    if (!verify('sha256', Buffer.from(`${h}.${b}`), key, Buffer.from(s, 'base64url'))) throw new Error('bad signature');
    const c = decode(b);
    const now = Math.floor(Date.now() / 1000);
    if (c.iss !== this.cfg.issuer) throw new Error('wrong issuer');
    if (!strings(c.aud).includes(this.cfg.clientId)) throw new Error('wrong audience');
    if (c.azp !== undefined && c.azp !== this.cfg.clientId) throw new Error('issued to another application');
    if (typeof c.exp !== 'number' || c.exp + SKEW_S < now) throw new Error('expired');
    if (typeof c.nonce !== 'string' || !same(c.nonce, nonce)) throw new Error('wrong nonce');
    if (typeof c.sub !== 'string' || !c.sub) throw new Error('no subject');
    const access = (c.resource_access as Record<string, { roles?: unknown }> | undefined)?.[this.cfg.clientId];
    const name = [c.name, c.preferred_username].find((v): v is string => typeof v === 'string' && !!v.trim()) ?? c.sub;
    return { sub: c.sub, name: name.trim().slice(0, 200), organizations: strings(c.organization), roles: strings(access?.roles) };
  }
}
