import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { figmaApiBase } from '@ci/core';
import {
  KEY,
  MARKER,
  adfText,
  basic,
  checkSite,
  client,
  cloudIdOf,
  gateway,
  hasMarker,
  parseSite,
  redact,
  type Call,
  type FetchLike,
  type Reply,
} from '../../../../scripts/lib/sandbox-atlassian.mjs';
import type { FigmaAccess } from '../kits/figma.js';

/**
 * Connection to the sandbox site and the local state of the seeder (docs/TEST-DATA-GENERATOR.md, 8.4).
 * Read tokens for a dry run and status, write tokens only with --confirm.
 */

export type Env = Record<string, string | undefined>;

export interface LiveContext {
  call: Call;
  /** Gateway bases: https://api.atlassian.com/ex/{jira|confluence}/{cloudId}. */
  jira: string;
  confluence: string;
  site: string;
  auth: { jira: string; confluence: string };
  /** For the core connectors (status), which take the credentials themselves. */
  creds: { email: string; jiraToken: string; confluenceToken: string };
  /** false: a dry run — writes are listed, not sent. */
  write: boolean;
  log: (line: string) => void;
  /** What the run did (or would do), one line per write. */
  actions: string[];
  warnings: string[];
  secrets: string[];
  /** The Figma sandbox file, when FIGMA_TOKEN and SANDBOX_FIGMA_FILE_KEY are set; Figma is optional (4.2). */
  figma?: FigmaAccess;
}

export class SandboxError extends Error {
  constructor(readonly problems: string[]) {
    super(problems.join('\n'));
  }
}

export interface ConnectOptions {
  write: boolean;
  log?: (line: string) => void;
  fetchImpl?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
}

/** Guard 8.4.1 and the tokens of the mode; throws SandboxError with every problem at once. */
export async function connect(env: Env, opts: ConnectOptions): Promise<LiveContext> {
  const jiraVar = opts.write ? 'SANDBOX_JIRA_WRITE_TOKEN' : 'JIRA_API_TOKEN';
  const confVar = opts.write ? 'SANDBOX_CONFLUENCE_WRITE_TOKEN' : 'CONFLUENCE_API_TOKEN';
  const problems = [...checkSite(env)];
  for (const name of ['SANDBOX_BOT_EMAIL', jiraVar, confVar]) if (!env[name]) problems.push(`${name}: not set`);
  let figmaBase: string | undefined;
  try {
    figmaBase = figmaApiBase(env.CI_FIGMA_API_BASE);
  } catch (e) {
    problems.push(`CI_FIGMA_API_BASE: ${(e as Error).message}`);
  }
  if (problems.length) throw new SandboxError(problems);

  const site = parseSite(env.ATLASSIAN_SITE)!;
  const email = env.SANDBOX_BOT_EMAIL!;
  const jiraToken = env[jiraVar]!;
  const confluenceToken = env[confVar]!;
  // Every token the process knows is masked, not only the ones this mode uses.
  // The Figma file key is not a credential, but it opens the file to anyone with a token: masked as well.
  const secrets = [jiraToken, confluenceToken, env.JIRA_API_TOKEN, env.CONFLUENCE_API_TOKEN, env.SANDBOX_JIRA_WRITE_TOKEN, env.SANDBOX_CONFLUENCE_WRITE_TOKEN, env.FIGMA_TOKEN, env.SANDBOX_FIGMA_FILE_KEY]
    .filter((s): s is string => !!s);
  const auth = { jira: basic(email, jiraToken), confluence: basic(email, confluenceToken) };
  secrets.push(auth.jira, auth.confluence);
  const log = opts.log ?? ((line: string) => console.log(line));
  const call = client({ fetchImpl: opts.fetchImpl, log, sleep: opts.sleep, secrets });
  const cloudId = await cloudIdOf(call, site);
  const fetchImpl = opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  const figma = env.FIGMA_TOKEN && env.SANDBOX_FIGMA_FILE_KEY
    ? { token: env.FIGMA_TOKEN, fileKey: env.SANDBOX_FIGMA_FILE_KEY, apiBase: figmaBase!, fetchImpl }
    : undefined;
  return {
    call,
    jira: gateway('jira', cloudId),
    confluence: gateway('confluence', cloudId),
    site,
    auth,
    creds: { email, jiraToken, confluenceToken },
    write: opts.write,
    log,
    actions: [],
    warnings: [],
    secrets,
    figma,
  };
}

/** Why a call failed, without the response body on 401/403; Jira's validation messages on 400. */
export function failure(ctx: LiveContext, what: string, r: Reply): string {
  if (r.status === 401 || r.status === 403) return `${what}: refused (${r.status}) — check the token scopes and the bot's permissions in ${KEY}`;
  if (r.status === 400 && r.json) {
    const messages = [...(Array.isArray(r.json.errorMessages) ? r.json.errorMessages : []), ...Object.entries(r.json.errors ?? {}).map(([k, v]) => `${k}: ${v}`)];
    if (messages.length) return redact(`${what}: rejected (400) — ${messages.join('; ')}`, ctx.secrets);
  }
  return `${what}: failed (${r.status})`;
}

/**
 * Records a write. In a dry run it only lists it; with --confirm it runs `send` and throws on a failed reply.
 * Returns the reply, or undefined in a dry run.
 */
export async function act(ctx: LiveContext, line: string, send: () => Promise<Reply>, ok: (r: Reply) => boolean = (r) => r.ok): Promise<Reply | undefined> {
  ctx.actions.push(ctx.write ? line : `would ${line}`);
  if (!ctx.write) return undefined;
  const r = await send();
  if (!ok(r)) throw new SandboxError([failure(ctx, line, r)]);
  return r;
}

/**
 * Guard 8.4.2: the project and the space carry the marker in their description. Refuses to work on anything else.
 * Returns the id of the space and the project as Jira returns it (issue types, components).
 */
export async function guardContainers(ctx: LiveContext): Promise<{ spaceId: string; project: any }> {
  const problems: string[] = [];
  const project = await ctx.call('GET', `${ctx.jira}/rest/api/3/project/${KEY}?expand=description`, { auth: ctx.auth.jira });
  if (!project.ok) problems.push(failure(ctx, `Jira: reading project ${KEY}`, project));
  else if (!hasMarker(adfText(project.json?.description))) problems.push(`Jira: project ${KEY} has no "${MARKER}" in its description — the seeder refuses to touch it`);

  const spaces = await ctx.call('GET', `${ctx.confluence}/wiki/api/v2/spaces?keys=${KEY}&description-format=plain`, { auth: ctx.auth.confluence });
  const space = spaces.json?.results?.[0];
  if (!spaces.ok) problems.push(failure(ctx, `Confluence: reading space ${KEY}`, spaces));
  else if (!space) problems.push(`Confluence: no space ${KEY} — create it first (npm run sandbox:atlassian)`);
  else if (!hasMarker(space.description?.plain?.value)) problems.push(`Confluence: space ${KEY} has no "${MARKER}" in its description — the seeder refuses to touch it`);
  if (problems.length) throw new SandboxError(problems);
  return { spaceId: String(space.id), project: project.json };
}

// ---------------------------------------------------------------------------- State

export interface IssueState { key: string; id?: string; hash?: string; relHash?: string; syncedAt: string }
export interface PageState { id: string; url: string; version?: number; hash?: string; syncedAt: string }

/**
 * Local memory of the seeder: which sandbox object holds which world object. Losing it is harmless — the labels on
 * the objects rebuild it — so it holds no secrets and lives in .sandbox/ (gitignored).
 */
export interface SandboxState {
  version: 1;
  site: string;
  scenarios: string[];
  issues: Record<string, IssueState>;
  pages: Record<string, PageState>;
  /** How Jira read our issue links: learnt once, see kits/jira.ts. */
  linkOrientation?: 'as-sent' | 'swapped';
}

export const emptyState = (site: string): SandboxState => ({ version: 1, site, scenarios: [], issues: {}, pages: {} });

export function loadState(file: string, site: string, warn: (line: string) => void): SandboxState {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return emptyState(site);
  }
  const s = raw as Partial<SandboxState> | null;
  if (!s || s.version !== 1 || typeof s.issues !== 'object' || typeof s.pages !== 'object' || !Array.isArray(s.scenarios)) {
    warn(`${file}: unreadable — starting from the labels on the site`);
    return emptyState(site);
  }
  if (s.site !== site) {
    warn(`${file}: written for another site — starting from the labels on ${site}`);
    return emptyState(site);
  }
  return { version: 1, site, scenarios: s.scenarios, issues: s.issues ?? {}, pages: s.pages ?? {}, linkOrientation: s.linkOrientation };
}

export function saveState(file: string, state: SandboxState): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(`${file}.tmp`, `${JSON.stringify(state, null, 2)}\n`);
  renameSync(`${file}.tmp`, file);
}
