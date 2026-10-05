import type { DocumentItem, IssueType, RequirementItem } from '../model.js';
import { htmlToText } from '../text.js';

/**
 * Jira Cloud + Confluence Cloud connectors (REST, API-token auth).
 * Selective fetching: only the configured project / spaces are read, and only
 * the fields the analysis needs.
 */

export interface JiraConfig {
  baseUrl: string; // https://your-site.atlassian.net
  email: string;
  apiToken: string;
  projectKey: string;
  /** Optional custom field id holding acceptance criteria (e.g. customfield_10035). */
  acceptanceCriteriaField?: string;
  /** Optional JQL appended to the project filter (e.g. "AND statusCategory != Done"). */
  jqlFilter?: string;
  maxIssues?: number;
}

export interface ConfluenceConfig {
  baseUrl: string; // https://your-site.atlassian.net
  email: string;
  apiToken: string;
  spaceKeys: string[];
  maxPages?: number;
}

const auth = (email: string, token: string) => `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`;

async function getJson<T>(url: string, headers: Record<string, string>): Promise<T> {
  const res = await fetch(url, { headers: { Accept: 'application/json', ...headers } });
  if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------- Jira

interface JiraIssue {
  key: string;
  fields: Record<string, any>;
}

export async function fetchJira(cfg: JiraConfig): Promise<RequirementItem[]> {
  const base = cfg.baseUrl.replace(/\/$/, '');
  const headers = { Authorization: auth(cfg.email, cfg.apiToken) };
  const fields = ['summary', 'description', 'issuetype', 'parent', 'status', 'labels', 'components', 'issuelinks', 'updated', cfg.acceptanceCriteriaField].filter(Boolean).join(',');
  const jql = `project = "${cfg.projectKey}" ${cfg.jqlFilter ?? ''} ORDER BY key ASC`;
  const issues: JiraIssue[] = [];
  let next: string | undefined;
  do {
    const url = `${base}/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&fields=${fields}&maxResults=100${next ? `&nextPageToken=${encodeURIComponent(next)}` : ''}`;
    const page = await getJson<{ issues: JiraIssue[]; nextPageToken?: string; isLast?: boolean }>(url, headers);
    issues.push(...page.issues);
    next = page.isLast === false || page.nextPageToken ? page.nextPageToken : undefined;
  } while (next && issues.length < (cfg.maxIssues ?? 2000));

  const items = issues.map((i) => toRequirement(i, base, cfg.acceptanceCriteriaField));

  // Remote links (Confluence pages / Figma frames) for stories, bugs and epics.
  await pool(items.filter((i) => i.type !== 'task' && i.type !== 'subtask'), 4, async (item) => {
    try {
      const links = await getJson<{ object?: { url?: string } }[]>(`${base}/rest/api/3/issue/${item.key}/remotelink`, headers);
      item.remoteLinks.push(...links.map((l) => l.object?.url).filter((u): u is string => !!u));
    } catch {
      /* remote links are optional */
    }
  });
  return items;
}

function toRequirement(i: JiraIssue, base: string, acField?: string): RequirementItem {
  const f = i.fields;
  const typeName: string = (f.issuetype?.name ?? 'Story').toLowerCase();
  const type: IssueType = f.issuetype?.subtask ? 'subtask' : typeName.includes('epic') ? 'epic' : typeName.includes('bug') ? 'bug' : typeName.includes('task') ? 'task' : 'story';
  const description = adfToText(f.description);
  const sections = splitSections(description);
  const acRaw = acField && f[acField] ? (typeof f[acField] === 'string' ? f[acField] : adfToText(f[acField])) : sections.get('acceptance criteria') ?? '';
  const parent = f.parent as { key: string; fields?: { issuetype?: { name?: string } } } | undefined;
  const parentIsEpic = parent?.fields?.issuetype?.name?.toLowerCase().includes('epic');

  return {
    key: i.key,
    type,
    title: f.summary ?? i.key,
    description: sections.get('__body') ?? description,
    acceptanceCriteria: bullets(acRaw),
    businessRules: bullets(sections.get('business rules') ?? ''),
    status: f.status?.name ?? 'Unknown',
    epicKey: parentIsEpic ? parent?.key : undefined,
    parentKey: !parentIsEpic ? parent?.key : undefined,
    labels: f.labels ?? [],
    components: (f.components ?? []).map((c: { name: string }) => c.name),
    links: (f.issuelinks ?? []).flatMap((l: any) =>
      l.outwardIssue ? [{ type: l.type?.outward ?? 'relates to', key: l.outwardIssue.key }] : l.inwardIssue ? [{ type: l.type?.inward ?? 'relates to', key: l.inwardIssue.key }] : [],
    ),
    remoteLinks: [],
    bug:
      type === 'bug'
        ? {
            stepsToReproduce: sections.get('steps to reproduce'),
            expected: sections.get('expected') ?? sections.get('expected result') ?? sections.get('expected behavior'),
            actual: sections.get('actual') ?? sections.get('actual result') ?? sections.get('actual behavior'),
            environment: sections.get('environment'),
          }
        : undefined,
    updatedAt: f.updated ?? new Date().toISOString(),
    url: `${base}/browse/${i.key}`,
  };
}

/** Atlassian Document Format → plain text (headings and bullets preserved as lines). */
export function adfToText(node: any): string {
  if (!node) return '';
  if (typeof node === 'string') return node;
  const walk = (n: any): string => {
    if (!n) return '';
    if (n.type === 'text') return n.text ?? '';
    if (n.type === 'hardBreak') return '\n';
    const inner = (n.content ?? []).map(walk).join('');
    switch (n.type) {
      case 'paragraph':
        return inner + '\n';
      case 'heading':
        return `\n## ${inner}\n`;
      case 'listItem':
        return `- ${inner.trim()}\n`;
      case 'bulletList':
      case 'orderedList':
        return inner;
      default:
        return inner;
    }
  };
  return walk(node).replace(/\n{3,}/g, '\n\n').trim();
}

/** Split a description into sections by "## Heading" or "Heading:" lines. */
export function splitSections(text: string): Map<string, string> {
  const out = new Map<string, string>();
  const lines = text.split('\n');
  let current = '__body';
  const buf: Record<string, string[]> = { __body: [] };
  const known = /^(?:##\s*|\*\*)?(acceptance criteria|business rules|steps to reproduce|expected(?: result| behaviou?r)?|actual(?: result| behaviou?r)?|environment)\s*:?\s*(?:\*\*)?\s*(.*)$/i;
  for (const line of lines) {
    const m = known.exec(line.trim());
    if (m) {
      current = m[1].toLowerCase().replace('behaviour', 'behavior');
      buf[current] = m[2] ? [m[2]] : [];
      continue;
    }
    (buf[current] ??= []).push(line);
  }
  for (const [k, v] of Object.entries(buf)) {
    const t = v.join('\n').trim();
    if (t) out.set(k, t);
  }
  return out;
}

const bullets = (t: string) =>
  t
    .split('\n')
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter((l) => l.length > 2);

// ---------------------------------------------------------------------------- Confluence

export async function fetchConfluence(cfg: ConfluenceConfig): Promise<DocumentItem[]> {
  const base = cfg.baseUrl.replace(/\/$/, '');
  const headers = { Authorization: auth(cfg.email, cfg.apiToken) };
  const docs: DocumentItem[] = [];
  for (const spaceKey of cfg.spaceKeys) {
    const spaces = await getJson<{ results: { id: string; key: string }[] }>(`${base}/wiki/api/v2/spaces?keys=${encodeURIComponent(spaceKey)}`, headers);
    const space = spaces.results[0];
    if (!space) continue;
    let url: string | undefined = `${base}/wiki/api/v2/spaces/${space.id}/pages?body-format=storage&limit=100`;
    while (url && docs.length < (cfg.maxPages ?? 1000)) {
      const res: { results: any[]; _links?: { next?: string } } = await getJson(url, headers);
      for (const p of res.results) {
        docs.push({
          id: String(p.id),
          title: p.title,
          space: spaceKey,
          body: htmlToText(p.body?.storage?.value ?? ''),
          labels: [],
          updatedAt: p.version?.createdAt ?? new Date().toISOString(),
          url: p._links?.webui ? `${base}/wiki${p._links.webui}` : undefined,
        });
      }
      url = res._links?.next ? `${base}${res._links.next}` : undefined;
    }
  }
  await pool(docs, 4, async (d) => {
    try {
      const res = await getJson<{ results: { name: string }[] }>(`${base}/wiki/api/v2/pages/${d.id}/labels`, headers);
      d.labels = res.results.map((l) => l.name);
    } catch {
      /* labels are optional */
    }
  });
  return docs;
}

export async function pool<T>(xs: T[], n: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, xs.length) }, async () => {
    while (i < xs.length) await fn(xs[i++]);
  }));
}
