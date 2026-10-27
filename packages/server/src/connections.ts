import { randomBytes, timingSafeEqual } from 'node:crypto';
import { errorMessage, type AtlassianOAuthAccess } from '@ci/core';
import type { Store } from './store.js';

/**
 * How the server reaches Jira and Confluence (CI_CONNECT_MODE):
 * - `token` (default): API token from the environment (JIRA_API_TOKEN) plus the site URL and e-mail from Settings.
 * - `oauth`: an admin clicks "Connect Atlassian" once; the app keeps an encrypted refresh token (Atlassian OAuth 2.0 3LO).
 * Switching back to `token` uses the environment again; a stored connection is kept until it is disconnected.
 */
export type ConnectMode = 'token' | 'oauth';

export interface ConnectConfig {
  mode: ConnectMode;
  /** CI_PUBLIC_URL: the address people open the app at; Atlassian sends the browser back to it. */
  publicUrl: string;
  atlassian: { clientId: string; clientSecret: string; scopes: string[] };
}

export const ATLASSIAN_AUTH = 'https://auth.atlassian.com';
export const ATLASSIAN_RESOURCES = 'https://api.atlassian.com/oauth/token/accessible-resources';
export const CALLBACK_PATH = '/api/connections/atlassian/callback';
export const STATE_COOKIE = 'ci_oauth_atlassian';

/** Read only. offline_access gives the refresh token; Confluence REST v2 needs the granular scopes. */
export const DEFAULT_ATLASSIAN_SCOPES = ['read:jira-work', 'read:space:confluence', 'read:page:confluence', 'read:label:confluence', 'offline_access'];

const list = (v: string | undefined) => (v ?? '').split(/[\s,]+/).filter(Boolean);

export function connectConfigFromEnv(env: Record<string, string | undefined> = process.env): ConnectConfig {
  const mode = (env.CI_CONNECT_MODE ?? 'token').trim() || 'token';
  if (mode !== 'token' && mode !== 'oauth') throw new Error(`CI_CONNECT_MODE must be "token" or "oauth", not "${mode}"`);
  const scopes = list(env.ATLASSIAN_SCOPES);
  return {
    mode,
    publicUrl: (env.CI_PUBLIC_URL?.trim() || `http://localhost:${env.PORT ?? 4317}`).replace(/\/$/, ''),
    atlassian: { clientId: env.ATLASSIAN_CLIENT_ID ?? '', clientSecret: env.ATLASSIAN_CLIENT_SECRET ?? '', scopes: scopes.length ? scopes : DEFAULT_ATLASSIAN_SCOPES },
  };
}

export interface AtlassianSite {
  id: string;
  name: string;
  url: string;
  scopes: string[];
}

/** What connections.json holds under `atlassian`. The access token is never written to disk. */
interface StoredAtlassian {
  refreshToken: string;
  sites: AtlassianSite[];
  cloudId: string;
  connectedAt: string;
  connectedBy: string;
  /** Set when a refresh was refused: the admin has to connect again. */
  lastError?: string;
}

export interface AtlassianStatus {
  mode: ConnectMode;
  /** Client id, client secret and CI_ENCRYPTION_KEY are all set. */
  configured: boolean;
  missing: string[];
  callbackUrl: string;
  connected: boolean;
  site?: AtlassianSite;
  sites: AtlassianSite[];
  connectedAt?: string;
  connectedBy?: string;
  lastError?: string;
}

/** An OAuth step failed in a way the admin can act on; the message is safe to show. */
export class ConnectError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ConnectError';
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown) => (typeof v === 'string' && v !== '' ? v : undefined);
const isHttpsUrl = (v: unknown): v is string => {
  try {
    return typeof v === 'string' && new URL(v).protocol === 'https:';
  } catch {
    return false;
  }
};
const sameText = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Validates a stored record; anything else is treated as not connected. */
function toStored(v: unknown): StoredAtlassian | undefined {
  if (!isRecord(v) || !text(v.refreshToken) || !text(v.cloudId) || !Array.isArray(v.sites)) return undefined;
  return {
    refreshToken: v.refreshToken as string,
    cloudId: v.cloudId as string,
    sites: v.sites.flatMap((s) => toSite(s) ?? []),
    connectedAt: text(v.connectedAt) ?? '',
    connectedBy: text(v.connectedBy) ?? '',
    lastError: text(v.lastError),
  };
}

function toSite(v: unknown): AtlassianSite | undefined {
  if (!isRecord(v) || !text(v.id) || !isHttpsUrl(v.url)) return undefined;
  return { id: v.id as string, name: text(v.name) ?? (v.url as string), url: (v.url as string).replace(/\/$/, ''), scopes: Array.isArray(v.scopes) ? v.scopes.filter((s): s is string => typeof s === 'string') : [] };
}

interface TokenResponse {
  accessToken: string;
  expiresIn: number;
  refreshToken?: string;
}

/** POSTs to Atlassian's token endpoint; `refused` = the grant was rejected (expired, revoked), not a network problem. */
async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(`${ATLASSIAN_AUTH}/oauth/token`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(body) });
  const json: unknown = await res.json().catch(() => undefined);
  if (!res.ok) {
    // Only the error code: the body may echo what was sent.
    const code = isRecord(json) ? text(json.error) : undefined;
    const refused = res.status >= 400 && res.status < 500 && res.status !== 429;
    throw Object.assign(new Error(`Atlassian token endpoint → HTTP ${res.status}${code ? ` (${code.slice(0, 60)})` : ''}`), { refused });
  }
  if (!isRecord(json) || !text(json.access_token) || typeof json.expires_in !== 'number') throw new Error('Atlassian token endpoint → unexpected response');
  return { accessToken: json.access_token as string, expiresIn: json.expires_in, refreshToken: text(json.refresh_token) };
}

async function fetchSites(accessToken: string): Promise<AtlassianSite[]> {
  const res = await fetch(ATLASSIAN_RESOURCES, { headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' } });
  if (!res.ok) throw new Error(`Atlassian accessible-resources → HTTP ${res.status}`);
  const json: unknown = await res.json();
  // One entry per site; Jira and Confluence of one site share the cloud id. Keep the first entry with merged scopes.
  const byId = new Map<string, AtlassianSite>();
  for (const s of Array.isArray(json) ? json.flatMap((x) => toSite(x) ?? []) : []) {
    const seen = byId.get(s.id);
    if (seen) seen.scopes = [...new Set([...seen.scopes, ...s.scopes])];
    else byId.set(s.id, s);
  }
  return [...byId.values()];
}

const STATE_TTL_MS = 10 * 60_000;
const MAX_PENDING = 20;

/**
 * The Atlassian OAuth 2.0 (3LO) connection of this workspace: one per server, made by an admin.
 * Atlassian rotates refresh tokens, so every refresh runs one at a time and stores the new token before it is used again.
 */
export class AtlassianConnection {
  private pending = new Map<string, { expiresAt: number; actor: string }>();
  private access?: { token: string; cloudId: string; expiresAt: number };
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private store: Store,
    readonly cfg: ConnectConfig,
    private now: () => number = Date.now,
  ) {}

  get callbackUrl() {
    return `${this.cfg.publicUrl}${CALLBACK_PATH}`;
  }

  missing(env: Record<string, string | undefined> = process.env) {
    return [!this.cfg.atlassian.clientId && 'ATLASSIAN_CLIENT_ID', !this.cfg.atlassian.clientSecret && 'ATLASSIAN_CLIENT_SECRET', !env.CI_ENCRYPTION_KEY && 'CI_ENCRYPTION_KEY'].filter((x): x is string => !!x);
  }

  private async stored() {
    return toStored((await this.store.connections()).atlassian);
  }

  async status(): Promise<AtlassianStatus> {
    const missing = this.missing();
    const base = { mode: this.cfg.mode, configured: !missing.length, missing, callbackUrl: this.callbackUrl, sites: [] as AtlassianSite[] };
    // Without the key the file cannot be read; that is reported through `missing`, not as an error.
    const s = missing.includes('CI_ENCRYPTION_KEY') ? undefined : await this.stored();
    if (!s) return { ...base, connected: false };
    return { ...base, connected: !s.lastError, site: s.sites.find((x) => x.id === s.cloudId), sites: s.sites, connectedAt: s.connectedAt, connectedBy: s.connectedBy, lastError: s.lastError };
  }

  private assertUsable() {
    if (this.cfg.mode !== 'oauth') throw new ConnectError('mode', 'Connecting with one click is off. Set CI_CONNECT_MODE=oauth on the server.');
    const missing = this.missing();
    if (missing.length) throw new ConnectError('config', `Set ${missing.join(', ')} on the server first.`);
  }

  /** Starts the consent flow: returns Atlassian's URL and the state to bind to this browser (cookie). */
  start(actor: string): { url: string; state: string } {
    this.assertUsable();
    const now = this.now();
    for (const [k, v] of this.pending) if (v.expiresAt <= now) this.pending.delete(k);
    while (this.pending.size >= MAX_PENDING) this.pending.delete(this.pending.keys().next().value as string);
    const state = randomBytes(24).toString('base64url');
    this.pending.set(state, { expiresAt: now + STATE_TTL_MS, actor });
    const q = new URLSearchParams({
      audience: 'api.atlassian.com',
      client_id: this.cfg.atlassian.clientId,
      scope: this.cfg.atlassian.scopes.join(' '),
      redirect_uri: this.callbackUrl,
      state,
      response_type: 'code',
      prompt: 'consent',
    });
    return { url: `${ATLASSIAN_AUTH}/authorize?${q}`, state };
  }

  /** Whether this connection issued `state` (F5: the callback finds the workspace that started the flow). */
  issued(state: string | undefined): boolean {
    return !!state && this.pending.has(state);
  }

  /** Finishes the flow: the state must be one this server issued and the one this browser holds. */
  async complete(input: { code?: string; state?: string; cookieState?: string; error?: string }): Promise<{ site?: AtlassianSite; actor: string }> {
    this.assertUsable();
    const { state, cookieState } = input;
    const entry = state ? this.pending.get(state) : undefined;
    if (!state || !cookieState || !entry || !sameText(state, cookieState) || entry.expiresAt <= this.now()) throw new ConnectError('state', 'The connection attempt expired or did not start in this browser. Click Connect again.');
    this.pending.delete(state);
    if (input.error) throw new ConnectError('denied', 'Access was not granted in Atlassian.');
    if (!input.code) throw new ConnectError('denied', 'Atlassian did not return an authorization code.');
    let tokens: TokenResponse;
    let sites: AtlassianSite[];
    try {
      tokens = await tokenRequest({ grant_type: 'authorization_code', client_id: this.cfg.atlassian.clientId, client_secret: this.cfg.atlassian.clientSecret, code: input.code, redirect_uri: this.callbackUrl });
      sites = await fetchSites(tokens.accessToken);
    } catch (e) {
      throw new ConnectError('exchange', `Atlassian refused the connection: ${errorMessage(e)}`);
    }
    if (!tokens.refreshToken) throw new ConnectError('offline', 'Atlassian returned no refresh token. Add the offline_access scope to the app in the developer console.');
    if (!sites.length) throw new ConnectError('sites', 'The Atlassian account has no site this app may read.');
    const site = sites[0]!;
    await this.save({ refreshToken: tokens.refreshToken, sites, cloudId: site.id, connectedAt: new Date(this.now()).toISOString(), connectedBy: entry.actor });
    this.access = { token: tokens.accessToken, cloudId: site.id, expiresAt: this.now() + tokens.expiresIn * 1000 };
    return { site, actor: entry.actor };
  }

  async selectSite(cloudId: string): Promise<AtlassianSite> {
    this.assertUsable();
    let site: AtlassianSite | undefined;
    await this.update((s) => {
      site = s.sites.find((x) => x.id === cloudId);
      if (site) s.cloudId = site.id;
    });
    if (!site) throw new ConnectError('site', 'This Atlassian site is not part of the connection.');
    return site;
  }

  async disconnect() {
    if (!process.env.CI_ENCRYPTION_KEY) throw new ConnectError('config', 'Set CI_ENCRYPTION_KEY on the server first: the connection is stored encrypted with it.');
    this.access = undefined;
    await this.store.updateConnections((all) => {
      delete all.atlassian;
    });
  }

  /** A valid access token for the chosen site, refreshed (and the rotated refresh token stored) when needed. */
  accessFor(): Promise<AtlassianOAuthAccess> {
    const run = this.queue.then(() => this.doAccess());
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async doAccess(): Promise<AtlassianOAuthAccess> {
    this.assertUsable();
    const s = await this.stored();
    if (!s) throw new Error('Atlassian is not connected. Click "Connect Atlassian" in Settings → Integrations.');
    if (s.lastError) throw new Error(`The Atlassian connection stopped working (${s.lastError}). Click "Reconnect Atlassian" in Settings → Integrations.`);
    const site = s.sites.find((x) => x.id === s.cloudId);
    if (!site) throw new Error('The chosen Atlassian site is no longer part of the connection. Reconnect Atlassian in Settings.');
    // A minute of margin so a token does not expire in the middle of a fetch.
    if (this.access && this.access.cloudId === s.cloudId && this.access.expiresAt - 60_000 > this.now()) return { cloudId: site.id, siteUrl: site.url, accessToken: this.access.token };
    let tokens: TokenResponse;
    try {
      tokens = await tokenRequest({ grant_type: 'refresh_token', client_id: this.cfg.atlassian.clientId, client_secret: this.cfg.atlassian.clientSecret, refresh_token: s.refreshToken });
    } catch (e) {
      if ((e as { refused?: boolean }).refused) {
        const reason = errorMessage(e);
        await this.update((x) => void (x.lastError = reason));
        throw new Error(`The Atlassian connection stopped working (${reason}). Click "Reconnect Atlassian" in Settings → Integrations.`);
      }
      throw e;
    }
    if (tokens.refreshToken && tokens.refreshToken !== s.refreshToken) await this.update((x) => void (x.refreshToken = tokens.refreshToken!));
    this.access = { token: tokens.accessToken, cloudId: s.cloudId, expiresAt: this.now() + tokens.expiresIn * 1000 };
    return { cloudId: site.id, siteUrl: site.url, accessToken: tokens.accessToken };
  }

  private save(s: StoredAtlassian) {
    return this.store.updateConnections((all) => void (all.atlassian = s));
  }

  private update(fn: (s: StoredAtlassian) => void) {
    return this.store.updateConnections((all) => {
      const s = toStored(all.atlassian);
      if (!s) return;
      fn(s);
      all.atlassian = s;
    });
  }
}

/** Reads one cookie from a Cookie header. */
export function cookieValue(header: string | undefined, name: string): string | undefined {
  for (const part of (header ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=') || undefined;
  }
  return undefined;
}

/** The state cookie: only sent back to the callback, readable by no script, gone after 10 minutes. */
export function stateCookie(value: string, publicUrl: string, maxAgeSeconds = STATE_TTL_MS / 1000) {
  const secure = publicUrl.startsWith('https://') ? '; Secure' : '';
  return `${STATE_COOKIE}=${value}; Path=${CALLBACK_PATH}; Max-Age=${maxAgeSeconds}; HttpOnly; SameSite=Lax${secure}`;
}
