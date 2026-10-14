import { fetchConfluence, fetchJira, htmlToText, jiraIssueToRequirement, type ProjectContext, type RequirementItem } from '@ci/core';
import { KEY, redact } from '../../../../scripts/lib/sandbox-atlassian.mjs';
import { emptyState, guardContainers, SandboxError, type LiveContext, type SandboxState } from '../live/context.js';
import { SCENARIOS } from '../world/scenarios.js';
import { checkoutWorld, worldAfter } from '../world/checkout.js';
import { deletePages, discoverPages, pageUrl, syncPages } from './confluence.js';
import {
  adfDescription,
  desiredLinks,
  isFigmaUrl,
  isOwnLabel,
  keyFromLabels,
  linksSeenFrom,
  pageIdFromLabels,
  pageIdOfUrl,
  pageStorage,
  pageTitle,
  parentOf,
  rewriteKeys,
  SANDBOX_LABEL,
  withoutFooter,
} from './encode.js';
import {
  createIssues,
  deleteIssues,
  discoverIssues,
  jiraMeta,
  syncLinks,
  syncRemoteLinks,
  updateIssues,
  worldTypes,
  type Run,
} from './jira.js';

/**
 * Seeder commands (docs/TEST-DATA-GENERATOR.md, 4.3): seed, mutate, reset and status on the CITEST project and space.
 * Every command starts with the guard (8.4); seed, mutate and reset only list their writes without --confirm.
 */

const now = () => new Date().toISOString();

/** Guard, then what lives on the site, adopted into the state: the labels win over a lost or stale state file. */
async function open(ctx: LiveContext, state: SandboxState, world: ProjectContext): Promise<Run> {
  const { spaceId, project } = await guardContainers(ctx);
  const meta = await jiraMeta(ctx, project);
  const issues = await discoverIssues(ctx);
  const pages = await discoverPages(ctx, spaceId);
  const keys: Record<string, string> = {};
  const missing = [...new Set(world.requirements.flatMap((r) => r.components))].filter((c) => !meta.components.has(c)).sort();
  if (missing.length) ctx.warnings.push(`${KEY} has no component(s) ${missing.join(', ')} — create them in the project settings; issues are written without them`);

  for (const [k, entry] of Object.entries(state.issues)) {
    if (issues.has(k)) continue;
    ctx.warnings.push(`${k}: ${entry.key} from the state file is gone or lost its label — it will be created again`);
    delete state.issues[k];
  }
  for (const [k, live] of issues) {
    keys[k] = live.key;
    const entry = state.issues[k];
    state.issues[k] = entry?.key === live.key ? { ...entry, id: live.id } : { key: live.key, id: live.id, syncedAt: now() };
  }
  for (const [id, entry] of Object.entries(state.pages)) {
    if (pages.has(id)) continue;
    ctx.warnings.push(`page ${id}: ${entry.id} from the state file is gone or lost its label — it will be created again`);
    delete state.pages[id];
  }
  for (const [id, live] of pages) {
    const entry = state.pages[id];
    state.pages[id] = entry?.id === live.id ? entry : { id: live.id, url: pageUrl(ctx.site, live.id), version: live.version, syncedAt: now() };
  }
  return { ctx, state, world, meta, keys, issues, pages, spaceId };
}

/** Brings the site to `world`: creates, updates and deletes only labelled objects. */
async function sync(run: Run): Promise<void> {
  const { world } = run;
  const keep = new Set(world.requirements.map((r) => r.key));
  const keepPages = new Set(world.documents.map((d) => d.id));
  await deleteIssues(run, [...run.issues.keys()].filter((k) => !keep.has(k)));
  await deletePages(run, [...run.pages.keys()].filter((id) => !keepPages.has(id)));
  await createIssues(run);
  await syncPages(run);
  await updateIssues(run);
  await syncLinks(run);
  await syncRemoteLinks(run);
}

export interface Outcome {
  state: SandboxState;
  /** Lines for the user beyond the actions: counts, drift. */
  report: string[];
  /** Non-empty: the command failed (exit code 1). */
  problems: string[];
}

/** Base world, no scenarios. */
export async function seed(ctx: LiveContext, state: SandboxState): Promise<Outcome> {
  const run = await open(ctx, state, checkoutWorld());
  await sync(run);
  if (ctx.write) state.scenarios = [];
  return { state, report: [], problems: [] };
}

/** One more change scenario on top of the ones already applied. */
export async function mutate(ctx: LiveContext, state: SandboxState, id: string): Promise<Outcome> {
  const scenario = SCENARIOS.find((s) => s.id === id);
  if (!scenario) return { state, report: [], problems: [`unknown scenario "${id}" — one of: ${SCENARIOS.map((s) => s.id).join(', ')}`] };
  if (state.scenarios.includes(id)) return { state, report: [], problems: [`scenario "${id}" is already applied — run sandbox:seed to start over`] };
  if (scenario.source === 'figma') return { state, report: [`${id} changes Figma — the Figma kit comes in stage E4; nothing to do`], problems: [] };
  const run = await open(ctx, state, worldAfter(...state.scenarios, id));
  await sync(run);
  if (ctx.write) state.scenarios = [...state.scenarios, id];
  return { state, report: [], problems: [] };
}

/** Deletes every labelled issue and page of CITEST, whatever the world says, and clears the state. */
export async function reset(ctx: LiveContext, state: SandboxState): Promise<Outcome> {
  const run = await open(ctx, state, checkoutWorld());
  const report = [`${KEY}: ${run.issues.size} issue(s) and ${run.pages.size} page(s) carry the label ${SANDBOX_LABEL}`];
  await deleteIssues(run, [...run.issues.keys()]);
  await deletePages(run, [...run.pages.keys()]);
  return { state: ctx.write ? emptyState(ctx.site) : state, report, problems: [] };
}

// ---------------------------------------------------------------------------- Status

/** Error of a core connector without the response body it quotes. */
const bare = (ctx: LiveContext, e: unknown) => redact((e instanceof Error ? e.message : String(e)).replace(/(HTTP \d+):[\s\S]*$/, '$1'), ctx.secrets);

const sorted = (xs: string[]) => [...xs].sort();
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The world item as the connector reads it once seeded, from a synthetic Jira issue built like the seeder's payload. */
function expectedItem(item: RequirementItem, world: RequirementItem[], keys: Record<string, string>, base: string): RequirementItem {
  const types = worldTypes(world);
  const type = types.get(item.key)!;
  const parent = parentOf(item);
  const parentKey = parent ? keys[parent] : undefined;
  return jiraIssueToRequirement(
    {
      key: keys[item.key]!,
      fields: {
        summary: rewriteKeys(item.title, keys),
        description: adfDescription(item, keys),
        issuetype: { name: type, subtask: type === 'Subtask' },
        ...(parentKey ? { parent: { key: parentKey, fields: { issuetype: { name: types.get(parent!) } } } } : {}),
        labels: item.labels,
        components: item.components.map((name) => ({ name })),
      },
    },
    base,
  );
}

/**
 * Reads the sandbox through the core connectors (read tokens), as the application will, and compares it with the world
 * after the scenarios in the state file. Drifted objects lose their hash, so the next seed rewrites them.
 */
export async function status(ctx: LiveContext, state: SandboxState): Promise<Outcome> {
  const problems: string[] = [];
  const report: string[] = [];
  const { project } = await guardContainers(ctx);
  const meta = await jiraMeta(ctx, project);
  const world = worldAfter(...state.scenarios);

  let items: RequirementItem[];
  let docs: Awaited<ReturnType<typeof fetchConfluence>>;
  try {
    items = await fetchJira({ baseUrl: ctx.jira, email: ctx.creds.email, apiToken: ctx.creds.jiraToken, projectKey: KEY, jqlFilter: `AND labels = "${SANDBOX_LABEL}"` });
    docs = (await fetchConfluence({ baseUrl: ctx.confluence, email: ctx.creds.email, apiToken: ctx.creds.confluenceToken, spaceKeys: [KEY] }))
      .filter((d) => d.labels.includes(SANDBOX_LABEL));
  } catch (e) {
    throw new SandboxError([`reading the sandbox: ${bare(ctx, e)}`]);
  }

  const live = new Map<string, RequirementItem>();
  for (const i of items) {
    const k = keyFromLabels(i.labels);
    if (k && !live.has(k)) live.set(k, i);
  }
  const pages = new Map<string, (typeof docs)[number]>();
  for (const d of docs) {
    const id = pageIdFromLabels(d.labels);
    if (id && !pages.has(id)) pages.set(id, d);
  }
  const keys: Record<string, string> = Object.fromEntries([...live].map(([k, i]) => [k, i.key]));
  const worldOfPage = new Map([...pages].map(([id, d]) => [d.id, id]));
  const { links } = desiredLinks(world.requirements, meta.linkTypes);
  const drift = (what: string, field: string) => problems.push(`${what}: ${field} differs from the world`);

  const fresh: SandboxState = { ...state, issues: {}, pages: {} };
  for (const item of world.requirements) {
    const got = live.get(item.key);
    if (!got) {
      problems.push(`${item.key}: missing`);
      continue;
    }
    const want = expectedItem(item, world.requirements, keys, ctx.jira);
    const before = problems.length;
    const what = `${item.key} (${got.key})`;
    for (const f of ['type', 'title', 'description', 'acceptanceCriteria', 'businessRules', 'bug', 'epicKey', 'parentKey'] as const) {
      if (!same(want[f], got[f])) drift(what, f);
    }
    if (!same(sorted(want.components), sorted(got.components))) drift(what, 'components');
    if (!same(sorted(item.labels), sorted(got.labels.filter((l) => !isOwnLabel(l))))) drift(what, 'labels');
    const wantLinks = linksSeenFrom(item.key, links, meta.linkTypes).map((l) => `${l.type.toLowerCase()} ${keys[l.key] ?? l.key}`);
    if (!same(sorted(wantLinks), sorted(got.links.map((l) => `${l.type.toLowerCase()} ${l.key}`)))) drift(what, 'issue links');
    if (got.type !== 'task' && got.type !== 'subtask') {
      const wantPages = item.remoteLinks.filter((u) => !isFigmaUrl(u)).flatMap((u) => pageIdOfUrl(u) ?? []);
      const gotPages = got.remoteLinks.flatMap((u) => worldOfPage.get(pageIdOfUrl(u) ?? '') ?? []);
      if (!same(sorted(wantPages), sorted(gotPages))) drift(what, 'links to pages');
    }
    const old = state.issues[item.key];
    const ok = problems.length === before && old?.key === got.key;
    fresh.issues[item.key] = { key: got.key, id: old?.key === got.key ? old.id : undefined, hash: ok ? old?.hash : undefined, relHash: ok ? old?.relHash : undefined, syncedAt: old?.syncedAt ?? now() };
  }
  for (const [k, i] of live) if (!world.requirements.some((r) => r.key === k)) problems.push(`${k} (${i.key}): not in the world — sandbox:seed deletes it`);

  for (const doc of world.documents) {
    const got = pages.get(doc.id);
    if (!got) {
      problems.push(`page ${doc.id}: missing`);
      continue;
    }
    const before = problems.length;
    const what = `page ${doc.id} (${got.id})`;
    if (got.title !== pageTitle(doc, keys)) drift(what, 'title');
    if (withoutFooter(got.body) !== withoutFooter(htmlToText(pageStorage(doc, keys)))) drift(what, 'body');
    if (!same(sorted(doc.labels), sorted(got.labels.filter((l) => !isOwnLabel(l))))) drift(what, 'labels');
    const old = state.pages[doc.id];
    const ok = problems.length === before && old?.id === got.id;
    fresh.pages[doc.id] = { id: got.id, url: pageUrl(ctx.site, got.id), version: old?.version, hash: ok ? old?.hash : undefined, syncedAt: old?.syncedAt ?? now() };
  }
  for (const [id, d] of pages) if (!world.documents.some((x) => x.id === id)) problems.push(`page ${id} (${d.id}): not in the world — sandbox:seed deletes it`);

  report.push(`${KEY}: ${live.size} issue(s), ${pages.size} page(s); world: ${world.requirements.length} items, ${world.documents.length} documents` +
    (state.scenarios.length ? `, scenarios: ${state.scenarios.join(', ')}` : ''));
  if (!problems.length) report.push('in sync with the world');
  return { state: fresh, report, problems };
}
