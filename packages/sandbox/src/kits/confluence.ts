import { KEY } from '../../../../scripts/lib/sandbox-atlassian.mjs';
import { act, failure, SandboxError, type LiveContext } from '../live/context.js';
import { pageHash, pageIdFromLabels, pageLabels, pageStorage, pageTitle, SANDBOX_LABEL } from './encode.js';
import type { Run } from './jira.js';

/**
 * Confluence kit (docs/TEST-DATA-GENERATOR.md, 4.2): the documents of the world as pages of the CITEST space.
 * Pages are listed with the v2 API and labels read per page, so the read token needs no search scope (no CQL).
 */

/** A labelled page of the space. */
export interface LivePage {
  id: string;
  title: string;
  version: number;
  labels: string[];
}

const now = () => new Date().toISOString();

async function labelsOf(ctx: LiveContext, id: string): Promise<string[]> {
  const out: string[] = [];
  let url: string | undefined = `${ctx.confluence}/wiki/api/v2/pages/${id}/labels?limit=100`;
  while (url) {
    const r = await ctx.call('GET', url, { auth: ctx.auth.confluence });
    if (!r.ok) throw new SandboxError([failure(ctx, `Confluence: reading labels of page ${id}`, r)]);
    for (const l of r.json?.results ?? []) if (l?.name) out.push(String(l.name));
    url = r.json?._links?.next ? `${ctx.confluence}${r.json._links.next}` : undefined;
  }
  return out;
}

/** Pages of the space with the sandbox label, by world page id (from the per-object label). Others are never touched. */
export async function discoverPages(ctx: LiveContext, spaceId: string): Promise<Map<string, LivePage>> {
  const out = new Map<string, LivePage>();
  let url: string | undefined = `${ctx.confluence}/wiki/api/v2/spaces/${spaceId}/pages?limit=100`;
  while (url) {
    const r = await ctx.call('GET', url, { auth: ctx.auth.confluence });
    if (!r.ok) throw new SandboxError([failure(ctx, `Confluence: listing pages of ${KEY}`, r)]);
    for (const p of r.json?.results ?? []) {
      const id = String(p.id);
      const labels = await labelsOf(ctx, id);
      const worldId = pageIdFromLabels(labels);
      if (!worldId || !labels.includes(SANDBOX_LABEL)) continue;
      if (out.has(worldId)) {
        ctx.warnings.push(`page ${worldId}: two pages carry its label (${out.get(worldId)!.id}, ${id}) — keeping the first; delete the other by hand`);
        continue;
      }
      out.set(worldId, { id, title: String(p.title ?? ''), version: Number(p.version?.number ?? 1), labels });
    }
    url = r.json?._links?.next ? `${ctx.confluence}${r.json._links.next}` : undefined;
  }
  return out;
}

export const pageUrl = (site: string, id: string) => `https://${site}/wiki/spaces/${KEY}/pages/${id}`;

const addLabels = (ctx: LiveContext, id: string, names: string[]) =>
  ctx.call('POST', `${ctx.confluence}/wiki/rest/api/content/${id}/label`, { auth: ctx.auth.confluence, body: names.map((name) => ({ prefix: 'global', name })) });

/**
 * Creates the missing pages and updates the changed ones. A new page gets its labels right after creation; if that
 * fails, the page is deleted again, so no unlabelled page is left behind that teardown could not find.
 */
export async function syncPages(run: Run): Promise<void> {
  const { ctx, world, keys, state } = run;
  for (const doc of world.documents) {
    const title = pageTitle(doc, keys);
    const value = pageStorage(doc, keys);
    const labels = pageLabels(doc);
    const h = pageHash(doc, keys);
    const live = run.pages.get(doc.id);

    if (!live) {
      const r = await act(ctx, `create page ${doc.id} "${title}"`, async () => {
        const created = await ctx.call('POST', `${ctx.confluence}/wiki/api/v2/pages`, {
          auth: ctx.auth.confluence,
          body: { spaceId: run.spaceId, status: 'current', title, body: { representation: 'storage', value } },
        });
        if (!created.ok) return created;
        const id = String(created.json.id);
        const labelled = await addLabels(ctx, id, labels);
        if (labelled.ok) return created;
        await ctx.call('DELETE', `${ctx.confluence}/wiki/api/v2/pages/${id}`, { auth: ctx.auth.confluence });
        throw new SandboxError([failure(ctx, `Confluence: labelling new page ${doc.id} (page deleted again)`, labelled)]);
      });
      if (!r) continue;
      const id = String(r.json.id);
      run.pages.set(doc.id, { id, title, version: Number(r.json.version?.number ?? 1), labels });
      state.pages[doc.id] = { id, url: pageUrl(ctx.site, id), version: Number(r.json.version?.number ?? 1), hash: h, syncedAt: now() };
      continue;
    }

    const entry = state.pages[doc.id] ?? { id: live.id, url: pageUrl(ctx.site, live.id), syncedAt: now() };
    if (entry.hash === h) continue;
    const r = await act(ctx, `update page ${doc.id} "${title}"`, () =>
      ctx.call('PUT', `${ctx.confluence}/wiki/api/v2/pages/${live.id}`, {
        auth: ctx.auth.confluence,
        body: { id: live.id, status: 'current', title, body: { representation: 'storage', value }, version: { number: live.version + 1 } },
      }),
    );
    const missing = labels.filter((l) => !live.labels.includes(l));
    if (missing.length) await act(ctx, `label page ${doc.id}: ${missing.join(', ')}`, () => addLabels(ctx, live.id, missing));
    for (const extra of live.labels.filter((l) => !labels.includes(l))) {
      await act(ctx, `unlabel page ${doc.id}: ${extra}`, () =>
        ctx.call('DELETE', `${ctx.confluence}/wiki/rest/api/content/${live.id}/label/${encodeURIComponent(extra)}`, { auth: ctx.auth.confluence }),
        (x) => x.ok || x.status === 404,
      );
    }
    if (r) {
      const version = Number(r.json?.version?.number ?? live.version + 1);
      run.pages.set(doc.id, { ...live, title, version, labels });
      state.pages[doc.id] = { ...entry, version, hash: h, syncedAt: now() };
    }
  }
}

/**
 * Deletes pages by world page id. Only labelled pages (found by discovery) are deleted; a state entry without one is
 * dropped. The page goes to the trash and is then purged; a failed purge (the bot may lack the right) is a warning.
 */
export async function deletePages(run: Run, ids: string[]): Promise<void> {
  const { ctx, state } = run;
  for (const id of ids) {
    const live = run.pages.get(id);
    if (!live) {
      if (state.pages[id]) ctx.warnings.push(`page ${id}: ${state.pages[id]!.id} no longer has the label ${SANDBOX_LABEL} — left alone`);
      if (ctx.write) delete state.pages[id];
      continue;
    }
    await act(ctx, `delete page ${id} "${live.title}"`, async () => {
      const base = `${ctx.confluence}/wiki/api/v2/pages/${live.id}`;
      const r = await ctx.call('DELETE', base, { auth: ctx.auth.confluence });
      if (!r.ok) return r;
      const purged = await ctx.call('DELETE', `${base}?purge=true`, { auth: ctx.auth.confluence });
      if (!purged.ok) ctx.warnings.push(`page ${id}: moved to the trash, not purged (${purged.status}) — empty the trash of ${KEY} by hand if needed`);
      return r;
    }, (r) => r.ok || r.status === 404);
    if (ctx.write) {
      delete state.pages[id];
      run.pages.delete(id);
    }
  }
}
