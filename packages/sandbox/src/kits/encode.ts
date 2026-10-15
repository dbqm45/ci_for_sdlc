import { hash, splitSections, type DocumentItem, type RequirementItem } from '@ci/core';

/**
 * World objects → Jira and Confluence payloads (docs/TEST-DATA-GENERATOR.md, 5.3). Pure functions: the same world and
 * key map give the same payload and the same hash, so a second seed changes nothing.
 */

/** Every object the seeder creates carries this label; teardown deletes nothing without it. */
export const SANDBOX_LABEL = 'ci-sandbox';
export const FOOTER = 'Wygenerowane przez sandbox, nie edytuj ręcznie';

/** Per-object label: the logical id survives a lost state file. */
export const issueLabel = (key: string) => `ci-sbx-${key.toLowerCase()}`;
export const pageLabel = (id: string) => `ci-sbx-doc-${id}`;

/** Logical key from the per-object label of an issue (`ci-sbx-pay-123` → `PAY-123`). */
export function keyFromLabels(labels: string[]): string | undefined {
  const l = labels.find((x) => /^ci-sbx-(?!doc-)[a-z][a-z0-9]*-\d+$/.test(x));
  return l?.slice('ci-sbx-'.length).toUpperCase();
}

/** Logical page id from the per-object label of a page (`ci-sbx-doc-1001` → `1001`). */
export function pageIdFromLabels(labels: string[]): string | undefined {
  return labels.find((x) => /^ci-sbx-doc-[a-z0-9-]+$/.test(x))?.slice('ci-sbx-doc-'.length);
}

/** Labels the seeder adds; status hides them before comparing with the world. */
export const isOwnLabel = (l: string) => l === SANDBOX_LABEL || l.startsWith('ci-sbx-');

/** Replaces world keys (`PAY-125`) with sandbox keys (`CITEST-7`); keys not in the map stay as they are. */
export function rewriteKeys(text: string, keys: Record<string, string>): string {
  return text.replace(/\b[A-Z][A-Z0-9]+-\d+\b/g, (k) => keys[k] ?? k);
}

// ---------------------------------------------------------------------------- Jira

export type JiraTypeName = 'Epic' | 'Story' | 'Bug' | 'Task' | 'Subtask' | 'Feature';

/**
 * Jira issue type of a world item. A task under a story becomes a subtask: in a company-managed project only a
 * subtask may have a story as its parent (known difference, docs 5.3).
 */
export function jiraType(item: RequirementItem, world: RequirementItem[]): JiraTypeName {
  if (item.type === 'subtask') return 'Subtask';
  if (item.type === 'task' && item.parentKey) {
    const parent = world.find((r) => r.key === item.parentKey);
    return parent?.type === 'epic' ? 'Task' : 'Subtask';
  }
  return ({ epic: 'Epic', feature: 'Feature', story: 'Story', bug: 'Bug', task: 'Task' } as const)[item.type];
}

/** Creation order: parents before children. */
export const level = (t: JiraTypeName) => (t === 'Epic' ? 0 : t === 'Subtask' ? 2 : 1);

/** The world key of the Jira parent: an epic for epic children, the story for a subtask. */
export const parentOf = (item: RequirementItem) => item.parentKey ?? item.epicKey;

type Adf = Record<string, unknown>;
const text = (t: string): Adf => ({ type: 'text', text: t });
/** ADF forbids empty text nodes: an empty line is an empty paragraph. */
const para = (t: string): Adf => (t ? { type: 'paragraph', content: [text(t)] } : { type: 'paragraph' });
const heading = (t: string): Adf => ({ type: 'heading', attrs: { level: 2 }, content: [text(t)] });
const bulletList = (xs: string[]): Adf => ({ type: 'bulletList', content: xs.map((x) => ({ type: 'listItem', content: [para(x)] })) });
const lines = (t: string) => t.replace(/\r\n/g, '\n').split('\n').map((l) => l.trimEnd());

/** The footer is a status lozenge: visible in Jira, invisible to the parser (adfToText skips nodes without text). */
export const FOOTER_NODE: Adf = { type: 'paragraph', content: [{ type: 'status', attrs: { text: FOOTER, color: 'neutral' } }] };

/**
 * Description in Atlassian Document Format: the world text, then "Acceptance criteria" and "Business rules" as
 * headed lists, and for a bug the sections its description does not already have — the layout the connector parses.
 */
export function adfDescription(item: RequirementItem, keys: Record<string, string>, footer = true): Adf {
  const rw = (t: string) => rewriteKeys(t, keys);
  const content: Adf[] = lines(rw(item.description)).map(para);
  if (item.acceptanceCriteria.length) content.push(heading('Acceptance criteria'), bulletList(item.acceptanceCriteria.map(rw)));
  if (item.businessRules.length) content.push(heading('Business rules'), bulletList(item.businessRules.map(rw)));
  if (item.bug) {
    const present = splitSections(item.description);
    const sections: [string, string, string | undefined][] = [
      ['steps to reproduce', 'Steps to reproduce', item.bug.stepsToReproduce],
      ['expected', 'Expected', item.bug.expected],
      ['actual', 'Actual', item.bug.actual],
      ['environment', 'Environment', item.bug.environment],
    ];
    for (const [key, title, value] of sections) {
      if (value && !present.has(key)) content.push(heading(title), ...lines(rw(value)).map(para));
    }
  }
  if (footer) content.push(FOOTER_NODE);
  return { type: 'doc', version: 1, content };
}

export interface IssueFields {
  summary: string;
  description: Adf;
  labels: string[];
  components: { name: string }[];
  /** Sandbox key of the parent; undefined while the parent does not exist yet. */
  parent?: { key: string };
}

/** Fields of an issue; components only those the project has (the rest are reported, not created). */
export function issueFields(item: RequirementItem, keys: Record<string, string>, components: Set<string>): IssueFields {
  const parent = parentOf(item);
  const parentKey = parent ? keys[parent] : undefined;
  return {
    summary: rewriteKeys(item.title, keys),
    description: adfDescription(item, keys),
    labels: [...new Set([...item.labels, SANDBOX_LABEL, issueLabel(item.key)])],
    components: item.components.filter((c) => components.has(c)).map((name) => ({ name })),
    ...(parentKey ? { parent: { key: parentKey } } : {}),
  };
}

export const issueHash = (fields: IssueFields, type: JiraTypeName) => hash(JSON.stringify({ type, ...fields }));

// ---------------------------------------------------------------------------- Issue links

/** A Jira link type as `GET /rest/api/3/issueLinkType` returns it. */
export interface LinkType { id?: string; name: string; inward: string; outward: string }

/** "S <outward> O": for Blocks, S blocks O. For a symmetric type (inward = outward) S < O, so each pair appears once. */
export interface DesiredLink { type: string; subject: string; object: string }

/**
 * Issue links of the world as Jira links between world keys, without duplicates. A world link names one side
 * ("is blocked by"), Jira stores one link that both issues show. Unknown names are returned as problems.
 */
export function desiredLinks(world: RequirementItem[], types: LinkType[]): { links: DesiredLink[]; problems: string[] } {
  const keys = new Set(world.map((r) => r.key));
  const seen = new Map<string, DesiredLink>();
  const problems: string[] = [];
  for (const item of world) {
    for (const l of item.links) {
      if (!keys.has(l.key)) {
        problems.push(`${item.key}: link "${l.type}" to ${l.key}, which is not in the world — skipped`);
        continue;
      }
      const name = l.type.toLowerCase();
      const t = types.find((x) => x.outward.toLowerCase() === name) ?? types.find((x) => x.inward.toLowerCase() === name);
      if (!t) {
        problems.push(`${item.key}: no Jira link type has the name "${l.type}" — skipped`);
        continue;
      }
      const symmetric = t.inward.toLowerCase() === t.outward.toLowerCase();
      let [subject, object] = t.outward.toLowerCase() === name ? [item.key, l.key] : [l.key, item.key];
      if (symmetric && subject > object) [subject, object] = [object, subject];
      const link = { type: t.name, subject: subject!, object: object! };
      seen.set(linkId(link), link);
    }
  }
  return { links: [...seen.values()], problems };
}

export const linkId = (l: DesiredLink) => `${l.type}|${l.subject}|${l.object}`;

/** Both sides of the desired links as the connector reads them on an issue: `{ type, key }` from that issue's view. */
export function linksSeenFrom(key: string, links: DesiredLink[], types: LinkType[]): { type: string; key: string }[] {
  const out: { type: string; key: string }[] = [];
  for (const l of links) {
    const t = types.find((x) => x.name === l.type);
    if (!t) continue;
    if (l.subject === key) out.push({ type: t.outward, key: l.object });
    if (l.object === key) out.push({ type: t.inward, key: l.subject });
  }
  return out;
}

// ---------------------------------------------------------------------------- Remote links

/** World page id of a Confluence URL (`…/pages/1001`); undefined for anything else (Figma, outside links). */
export const pageIdOfUrl = (url: string) => /\/wiki\/spaces\/[^/]+\/pages\/(\d+)/.exec(url)?.[1];
export const isFigmaUrl = (url: string) => /^https:\/\/(?:www\.)?figma\.com\//.test(url);

/** globalId of a remote link: ours start with this prefix, so the seeder never touches links people added. */
export const REMOTE_PREFIX = 'ci-sandbox:';
export const remoteGlobalId = (key: string, pageId: string) => `${REMOTE_PREFIX}${key}:${pageId}`;
/** Figma links take `figma-<frame id>` in place of the page id: ci-sandbox:PAY-1:figma-1-1. */
export const FIGMA_REMOTE = ':figma-';

// ---------------------------------------------------------------------------- Confluence

const escapeHtml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Storage format: a paragraph per non-empty line, then a rule and the footer. */
export function pageStorage(doc: DocumentItem, keys: Record<string, string>): string {
  const body = lines(rewriteKeys(doc.body, keys)).filter((l) => l.trim()).map((l) => `<p>${escapeHtml(l)}</p>`).join('');
  return `${body}<hr/><p><em>${escapeHtml(FOOTER)}</em></p>`;
}

export const pageTitle = (doc: DocumentItem, keys: Record<string, string>) => rewriteKeys(doc.title, keys);
export const pageLabels = (doc: DocumentItem) => [...new Set([...doc.labels, SANDBOX_LABEL, pageLabel(doc.id)])];

/** Page text without the footer line, for comparisons. */
export const withoutFooter = (t: string) => t.replace(new RegExp(`\\s*${FOOTER}\\s*$`), '').trim();

export const pageHash = (doc: DocumentItem, keys: Record<string, string>) =>
  hash(JSON.stringify({ title: pageTitle(doc, keys), body: pageStorage(doc, keys), labels: pageLabels(doc) }));
