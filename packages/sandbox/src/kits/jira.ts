import { hash, type ProjectContext, type RequirementItem } from '@ci/core';
import { KEY } from '../../../../scripts/lib/sandbox-atlassian.mjs';
import { act, failure, SandboxError, type LiveContext, type SandboxState } from '../live/context.js';
import {
  adfDescription,
  desiredLinks,
  isFigmaUrl,
  issueFields,
  issueHash,
  jiraType,
  keyFromLabels,
  level,
  linkId,
  pageIdOfUrl,
  pageTitle,
  REMOTE_PREFIX,
  remoteGlobalId,
  SANDBOX_LABEL,
  type DesiredLink,
  type JiraTypeName,
  type LinkType,
} from './encode.js';
import type { LivePage } from './confluence.js';

/**
 * Jira kit (docs/TEST-DATA-GENERATOR.md, 4.2): issues, issue links and remote links to the pages of the world.
 * Every call goes through ctx.call (masked log, 429 retry); every write through act (dry run by default).
 */

export interface JiraMeta {
  /** Issue type id per world type; the subtask type is the one Jira marks as subtask, whatever its name. */
  typeIds: Partial<Record<JiraTypeName, string>>;
  components: Set<string>;
  linkTypes: LinkType[];
}

/** A labelled issue as the search returns it. */
export interface LiveIssue {
  id: string;
  key: string;
  typeId?: string;
  subtask: boolean;
  typeName: string;
  links: { id: string; type: LinkType; outwardKey?: string; inwardKey?: string }[];
}

/** One seeder run over Jira and Confluence: the world, what lives on the site and the world → sandbox key map. */
export interface Run {
  ctx: LiveContext;
  state: SandboxState;
  world: ProjectContext;
  meta: JiraMeta;
  /** World key → sandbox key (PAY-123 → CITEST-7). */
  keys: Record<string, string>;
  /** Labelled issues by world key. */
  issues: Map<string, LiveIssue>;
  /** Labelled pages by world page id, and the id of the CITEST space. */
  pages: Map<string, LivePage>;
  spaceId: string;
}

const TYPE_NAMES: JiraTypeName[] = ['Epic', 'Story', 'Bug', 'Task', 'Feature'];
const now = () => new Date().toISOString();

/** Issue types and components from the project (read by the guard), link types from Jira. */
export async function jiraMeta(ctx: LiveContext, project: any): Promise<JiraMeta> {
  const typeIds: JiraMeta['typeIds'] = {};
  for (const t of Array.isArray(project?.issueTypes) ? project.issueTypes : []) {
    if (t.subtask) typeIds.Subtask ??= String(t.id);
    else {
      const name = TYPE_NAMES.find((n) => n.toLowerCase() === String(t.name).toLowerCase());
      if (name) typeIds[name] ??= String(t.id);
    }
  }
  const components = new Set<string>((Array.isArray(project?.components) ? project.components : []).map((c: any) => String(c.name)));
  const r = await ctx.call('GET', `${ctx.jira}/rest/api/3/issueLinkType`, { auth: ctx.auth.jira });
  if (!r.ok) throw new SandboxError([failure(ctx, 'Jira: reading link types', r)]);
  const linkTypes: LinkType[] = (r.json?.issueLinkTypes ?? []).map((t: any) => ({ id: String(t.id), name: String(t.name), inward: String(t.inward), outward: String(t.outward) }));
  return { typeIds, components, linkTypes };
}

/** Issues of CITEST with the sandbox label, by world key (from the per-object label). Others are never touched. */
export async function discoverIssues(ctx: LiveContext): Promise<Map<string, LiveIssue>> {
  const out = new Map<string, LiveIssue>();
  const jql = encodeURIComponent(`project = ${KEY} AND labels = "${SANDBOX_LABEL}" ORDER BY key ASC`);
  let next: string | undefined;
  do {
    const url = `${ctx.jira}/rest/api/3/search/jql?jql=${jql}&fields=summary,labels,issuetype,issuelinks,parent&maxResults=100${next ? `&nextPageToken=${encodeURIComponent(next)}` : ''}`;
    const r = await ctx.call('GET', url, { auth: ctx.auth.jira });
    if (!r.ok) throw new SandboxError([failure(ctx, `Jira: searching ${KEY}`, r)]);
    for (const i of r.json?.issues ?? []) {
      const f = i.fields ?? {};
      const labels: string[] = Array.isArray(f.labels) ? f.labels : [];
      const worldKey = keyFromLabels(labels);
      if (!worldKey || !labels.includes(SANDBOX_LABEL)) continue;
      if (out.has(worldKey)) {
        ctx.warnings.push(`${worldKey}: two issues carry its label (${out.get(worldKey)!.key}, ${i.key}) — keeping the first; delete the other by hand`);
        continue;
      }
      out.set(worldKey, {
        id: String(i.id),
        key: String(i.key),
        typeId: f.issuetype?.id ? String(f.issuetype.id) : undefined,
        subtask: f.issuetype?.subtask === true,
        typeName: String(f.issuetype?.name ?? ''),
        links: (Array.isArray(f.issuelinks) ? f.issuelinks : []).map((l: any) => ({
          id: String(l.id),
          type: { id: l.type?.id, name: String(l.type?.name), inward: String(l.type?.inward), outward: String(l.type?.outward) },
          outwardKey: l.outwardIssue?.key,
          inwardKey: l.inwardIssue?.key,
        })),
      });
    }
    next = r.json?.isLast === false || r.json?.nextPageToken ? r.json?.nextPageToken : undefined;
  } while (next);
  return out;
}

/** Pass 1: creates the missing issues, parents first. Texts may still name keys created later; pass 2 fixes them. */
export async function createIssues(run: Run): Promise<void> {
  const { ctx, world, meta, keys } = run;
  const items = world.requirements
    .map((item) => ({ item, type: jiraType(item, world.requirements) }))
    .filter(({ item }) => !keys[item.key])
    .sort((a, b) => level(a.type) - level(b.type));
  for (const { item, type } of items) {
    const typeId = meta.typeIds[type];
    if (!typeId) throw new SandboxError([`Jira: project ${KEY} has no issue type ${type} (needed by ${item.key}) — add it to the project's scheme`]);
    const fields = issueFields(item, keys, meta.components);
    const parent = item.parentKey ?? item.epicKey;
    const line = `create ${type} ${item.key}${parent ? ` under ${parent}` : ''}`;
    const send = (f: object) => ctx.call('POST', `${ctx.jira}/rest/api/3/issue`, { auth: ctx.auth.jira, body: { fields: { project: { key: KEY }, issuetype: { id: typeId }, ...f } } });
    const r = await act(ctx, line, async () => {
      const first = await send(fields);
      if (first.status !== 400) return first;
      ctx.warnings.push(`${item.key}: Jira refused the description with the footer — created without it`);
      return send({ ...fields, description: adfDescription(item, keys, false) });
    });
    if (!r) continue;
    keys[item.key] = String(r.json.key);
    run.state.issues[item.key] = { key: String(r.json.key), id: String(r.json.id), hash: issueHash(fields, type), syncedAt: now() };
  }
}

/** Pass 2: updates every issue whose payload changed (new keys in texts, a scenario, a lost state file). */
export async function updateIssues(run: Run): Promise<void> {
  const { ctx, world, meta, keys, state } = run;
  for (const item of world.requirements) {
    const key = keys[item.key];
    const entry = state.issues[item.key];
    if (!key || !entry) continue;
    const type = jiraType(item, world.requirements);
    const live = run.issues.get(item.key);
    if (live?.typeId && meta.typeIds[type] && live.typeId !== meta.typeIds[type]) {
      ctx.warnings.push(`${item.key}: ${key} is a ${live.typeName}, the world wants a ${type} — Jira cannot change it in place; run sandbox:reset and seed again`);
    }
    const fields = issueFields(item, keys, meta.components);
    const h = issueHash(fields, type);
    if (entry.hash === h) continue;
    const send = (f: object) => ctx.call('PUT', `${ctx.jira}/rest/api/3/issue/${key}`, { auth: ctx.auth.jira, body: { fields: f } });
    const r = await act(ctx, `update ${item.key} (${key})`, async () => {
      const first = await send(fields);
      if (first.status !== 400) return first;
      ctx.warnings.push(`${item.key}: Jira refused the description with the footer — updated without it`);
      return send({ ...fields, description: adfDescription(item, keys, false) });
    });
    if (r) state.issues[item.key] = { ...entry, hash: h, syncedAt: now() };
  }
}

// ---------------------------------------------------------------------------- Issue links

const symmetric = (t: LinkType) => t.inward.toLowerCase() === t.outward.toLowerCase();

/** Links between our issues as they are now, in world keys, with the Jira link id. */
function existingLinks(run: Run): Map<string, { link: DesiredLink; id: string }> {
  const worldOf = new Map(Object.entries(run.keys).map(([w, s]) => [s, w]));
  const out = new Map<string, { link: DesiredLink; id: string }>();
  for (const [x, live] of run.issues) {
    for (const l of live.links) {
      const other = worldOf.get(l.outwardKey ?? l.inwardKey ?? '');
      if (!other) continue; // a link to an issue that is not ours: never touched
      let [subject, object] = l.outwardKey ? [x, other] : [other, x];
      if (symmetric(l.type) && subject > object) [subject, object] = [object, subject];
      const link = { type: l.type.name, subject, object };
      out.set(linkId(link), { link, id: l.id });
    }
  }
  return out;
}

/**
 * Issue links: creates the missing ones, deletes ours that the world no longer has. Jira's POST names the two ends
 * "inwardIssue" and "outwardIssue" the opposite way some sites read them, so the first asymmetric link is read back:
 * if it came out reversed, it is recreated and the direction is remembered in the state file.
 */
export async function syncLinks(run: Run): Promise<void> {
  const { ctx, keys, state } = run;
  const { links, problems } = desiredLinks(run.world.requirements, run.meta.linkTypes);
  ctx.warnings.push(...problems);
  const existing = existingLinks(run);
  for (const l of links) {
    if (existing.has(linkId(l))) continue;
    const t = run.meta.linkTypes.find((x) => x.name === l.type)!;
    const s = keys[l.subject];
    const o = keys[l.object];
    const line = `link ${l.subject} ${t.outward} ${l.object}`;
    if (!s || !o) {
      ctx.actions.push(`would ${line}`); // an end is created in this run only with --confirm
      continue;
    }
    const send = (swap: boolean) =>
      ctx.call('POST', `${ctx.jira}/rest/api/3/issueLink`, {
        auth: ctx.auth.jira,
        body: { type: { name: t.name }, inwardIssue: { key: swap ? o : s }, outwardIssue: { key: swap ? s : o } },
      });
    const swapped = state.linkOrientation === 'swapped' && !symmetric(t);
    const r = await act(ctx, line, () => send(swapped));
    if (!r || symmetric(t) || state.linkOrientation) continue;

    const back = await ctx.call('GET', `${ctx.jira}/rest/api/3/issue/${s}?fields=issuelinks`, { auth: ctx.auth.jira });
    const entry = (back.json?.fields?.issuelinks ?? []).find(
      (x: any) => x.type?.name === t.name && (x.outwardIssue?.key === o || x.inwardIssue?.key === o),
    );
    if (!entry) {
      ctx.warnings.push(`${line}: created, but cannot read it back to check its direction`);
      continue;
    }
    if (entry.outwardIssue?.key === o) {
      state.linkOrientation = 'as-sent';
      continue;
    }
    state.linkOrientation = 'swapped';
    ctx.warnings.push('Jira reads issue links the other way round on this site — fixed the first one and remembered it');
    await act(ctx, `delete reversed link ${l.subject} – ${l.object}`, () => ctx.call('DELETE', `${ctx.jira}/rest/api/3/issueLink/${entry.id}`, { auth: ctx.auth.jira }));
    await act(ctx, `${line} (reversed)`, () => send(true));
  }
  const wanted = new Set(links.map(linkId));
  for (const [id, { link, id: jiraId }] of existing) {
    if (wanted.has(id)) continue;
    await act(ctx, `unlink ${link.subject} ${link.type} ${link.object}`, () =>
      ctx.call('DELETE', `${ctx.jira}/rest/api/3/issueLink/${jiraId}`, { auth: ctx.auth.jira }),
      (r) => r.ok || r.status === 404,
    );
  }
}

// ---------------------------------------------------------------------------- Remote links

/**
 * Remote links from issues to the sandbox pages of the world. Figma links wait for the Figma kit (E4). Only links
 * whose globalId starts with ci-sandbox: are ever deleted.
 */
export async function syncRemoteLinks(run: Run): Promise<void> {
  const { ctx, keys, state, world } = run;
  let figma = 0;
  for (const item of world.requirements) {
    const key = keys[item.key];
    const wanted: { globalId: string; url: string; title: string }[] = [];
    const pending: string[] = [];
    for (const url of item.remoteLinks) {
      if (isFigmaUrl(url)) {
        figma++;
        continue;
      }
      const pageId = pageIdOfUrl(url);
      const doc = pageId ? world.documents.find((d) => d.id === pageId) : undefined;
      if (!pageId || !doc) {
        ctx.warnings.push(`${item.key}: remote link ${pageId ? `to page ${pageId}, which is not in the world` : 'outside Confluence and Figma'} — skipped`);
        continue;
      }
      const page = state.pages[pageId];
      if (!page) pending.push(pageId);
      else wanted.push({ globalId: remoteGlobalId(item.key, pageId), url: page.url, title: pageTitle(doc, keys) });
    }
    if (!key || pending.length) {
      for (const p of pending) ctx.actions.push(`would link ${item.key} to page ${p}`);
      continue;
    }
    const entry = state.issues[item.key];
    const relHash = hash(JSON.stringify(wanted));
    if (!entry || entry.relHash === relHash) continue;

    const base = `${ctx.jira}/rest/api/3/issue/${key}/remotelink`;
    const r = await ctx.call('GET', base, { auth: ctx.auth.jira });
    if (!r.ok) throw new SandboxError([failure(ctx, `Jira: reading remote links of ${item.key}`, r)]);
    const present: any[] = Array.isArray(r.json) ? r.json : [];
    for (const p of present) {
      const gid = String(p.globalId ?? '');
      if (!gid.startsWith(REMOTE_PREFIX) || wanted.some((w) => w.globalId === gid)) continue;
      await act(ctx, `remove remote link ${gid} from ${item.key}`, () => ctx.call('DELETE', `${base}/${p.id}`, { auth: ctx.auth.jira }), (x) => x.ok || x.status === 404);
    }
    for (const w of wanted) {
      const same = present.find((p) => p.globalId === w.globalId);
      if (same?.object?.url === w.url && same?.object?.title === w.title) continue;
      await act(ctx, `link ${item.key} to page ${w.globalId.split(':').pop()}`, () =>
        ctx.call('POST', base, { auth: ctx.auth.jira, body: { globalId: w.globalId, object: { url: w.url, title: w.title } } }),
      );
    }
    if (ctx.write) state.issues[item.key] = { ...entry, relHash };
  }
  if (figma) ctx.warnings.push(`${figma} Figma link(s) left out — the Figma kit comes in stage E4`);
}

// ---------------------------------------------------------------------------- Deleting

const liveLevel = (i: LiveIssue) => (i.subtask ? 2 : i.typeName.toLowerCase() === 'epic' ? 0 : 1);

/**
 * Deletes issues by world key, subtasks first. Only issues that still carry the sandbox label (found by the search)
 * are deleted; a state entry without a labelled issue is dropped and the issue is left alone.
 */
export async function deleteIssues(run: Run, worldKeys: string[]): Promise<void> {
  const { ctx, state } = run;
  const targets = worldKeys.flatMap((k) => {
    const live = run.issues.get(k);
    if (!live) {
      if (state.issues[k]) ctx.warnings.push(`${k}: ${state.issues[k]!.key} no longer has the label ${SANDBOX_LABEL} — left alone`);
      if (ctx.write) delete state.issues[k];
      return [];
    }
    return [{ k, live }];
  });
  targets.sort((a, b) => liveLevel(b.live) - liveLevel(a.live));
  for (const { k, live } of targets) {
    await act(ctx, `delete ${live.typeName || 'issue'} ${k} (${live.key})`, () =>
      ctx.call('DELETE', `${ctx.jira}/rest/api/3/issue/${live.key}?deleteSubtasks=true`, { auth: ctx.auth.jira }),
      (r) => r.ok || r.status === 404,
    );
    if (ctx.write) delete state.issues[k];
    // Gone for the rest of the run, also in a dry run: links to it are not listed as separate unlinks.
    delete run.keys[k];
    run.issues.delete(k);
  }
}

/** World items as the Jira kit sees them; exported for status. */
export const worldTypes = (world: RequirementItem[]) => new Map(world.map((r) => [r.key, jiraType(r, world)]));
