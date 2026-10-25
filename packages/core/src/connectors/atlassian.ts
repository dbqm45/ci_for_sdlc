import type { DocumentItem, IssueType, RequirementItem } from '../model.js';
import { resolveIssueType } from '../hierarchy.js';
import { parseAcceptanceCriteria } from '../analysis/acceptance.js';
import { isRecord, records, str, strings } from '../guards.js';
import { htmlToText } from '../text.js';

/**
 * Jira Cloud + Confluence Cloud connectors (REST). Two ways to authenticate:
 * an API token (e-mail + token, straight to the site) or an OAuth 2.0 (3LO)
 * access token (`oauth`, through the api.atlassian.com gateway).
 * Selective fetching: only the configured project / spaces are read, and only
 * the fields the analysis needs.
 */

/** A 3LO access token for one Atlassian site; with it `baseUrl`, `email` and `apiToken` are ignored. */
export interface AtlassianOAuthAccess {
  cloudId: string;
  /** https://your-site.atlassian.net — only for links shown to people. */
  siteUrl: string;
  accessToken: string;
}

export interface JiraConfig {
  baseUrl: string; // https://your-site.atlassian.net
  email: string;
  apiToken: string;
  projectKey: string;
  /** Optional custom field id holding acceptance criteria (e.g. customfield_10035). */
  acceptanceCriteriaField?: string;
  /** Optional custom field id holding the estimate in story points (e.g. customfield_10016). */
  storyPointsField?: string;
  /** Optional JQL appended to the project filter (e.g. "AND statusCategory != Done"). */
  jqlFilter?: string;
  maxIssues?: number;
  /** Jira issue type name → hierarchy level (P1). Unmapped types use DEFAULT_ISSUE_TYPE_MAP, then become stories. */
  issueTypeMap?: Record<string, string>;
  oauth?: AtlassianOAuthAccess;
}

export interface ConfluenceConfig {
  baseUrl: string; // https://your-site.atlassian.net
  email: string;
  apiToken: string;
  spaceKeys: string[];
  maxPages?: number;
  oauth?: AtlassianOAuthAccess;
}

/** The api.atlassian.com gateway that 3LO tokens are sent to. */
export const ATLASSIAN_API = 'https://api.atlassian.com';

const auth = (email: string, token: string) => `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`;

/** Where requests go (`api`), how they authenticate, and the site URL used in links (`site`). */
function endpoint(cfg: { baseUrl: string; email: string; apiToken: string; oauth?: AtlassianOAuthAccess }, product: 'jira' | 'confluence') {
  if (cfg.oauth) {
    const { cloudId, siteUrl, accessToken } = cfg.oauth;
    return { api: `${ATLASSIAN_API}/ex/${product}/${encodeURIComponent(cloudId)}`, site: siteUrl.replace(/\/$/, ''), headers: { Authorization: `Bearer ${accessToken}` } };
  }
  const base = cfg.baseUrl.replace(/\/$/, '');
  return { api: base, site: base, headers: { Authorization: auth(cfg.email, cfg.apiToken) } };
}

/** GETs JSON and hands it to `parse`, which turns the untrusted body into a typed value (or throws). */
async function getJson<T>(url: string, headers: Record<string, string>, parse: (body: unknown) => T): Promise<T> {
  const res = await fetch(url, { headers: { Accept: 'application/json', ...headers } });
  if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body: unknown = await res.json();
  return parse(body);
}

const expectRecord = (url: string) => (body: unknown) => {
  if (!isRecord(body)) throw new Error(`GET ${url} → unexpected response`);
  return body;
};

const pathOf = (url: string) => url.split('?')[0] ?? url;

// ---------------------------------------------------------------------------- Jira

export interface JiraIssue {
  key: string;
  /** Raw Jira fields; read through the guards, never trusted as typed. */
  fields: Record<string, unknown>;
}

const toJiraIssue = (v: Record<string, unknown>): JiraIssue[] => {
  const key = str(v.key);
  return key ? [{ key, fields: isRecord(v.fields) ? v.fields : {} }] : [];
};

export async function fetchJira(cfg: JiraConfig): Promise<RequirementItem[]> {
  const { api: base, site, headers } = endpoint(cfg, 'jira');
  const fields = ['summary', 'description', 'issuetype', 'parent', 'status', 'labels', 'components', 'issuelinks', 'updated', cfg.acceptanceCriteriaField, cfg.storyPointsField].filter(Boolean).join(',');
  const jql = `project = "${cfg.projectKey}" ${cfg.jqlFilter ?? ''} ORDER BY key ASC`;
  const issues: JiraIssue[] = [];
  let next: string | undefined;
  do {
    const url = `${base}/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&fields=${fields}&maxResults=100${next ? `&nextPageToken=${encodeURIComponent(next)}` : ''}`;
    const page = await getJson(url, headers, expectRecord(pathOf(url)));
    issues.push(...records(page.issues).flatMap(toJiraIssue));
    const token = str(page.nextPageToken);
    next = page.isLast === false || token ? token : undefined;
  } while (next && issues.length < (cfg.maxIssues ?? 2000));

  const items = issues.map((i) => jiraIssueToRequirement(i, site, cfg));

  // Remote links (Confluence pages / Figma frames) for stories, bugs and epics.
  await pool(items.filter((i) => i.type !== 'task' && i.type !== 'subtask'), 4, async (item) => {
    try {
      const links = await getJson(`${base}/rest/api/3/issue/${item.key}/remotelink`, headers, records);
      item.remoteLinks.push(...links.flatMap((l) => (isRecord(l.object) && str(l.object.url)) || []));
    } catch {
      /* remote links are optional */
    }
  });
  return items;
}

export function jiraIssueToRequirement(i: JiraIssue, base: string, cfg: Pick<JiraConfig, 'acceptanceCriteriaField' | 'storyPointsField' | 'issueTypeMap'> = {}): RequirementItem {
  const f = i.fields;
  const acField = cfg.acceptanceCriteriaField;
  const issuetype = isRecord(f.issuetype) ? f.issuetype : {};
  const type: IssueType = resolveIssueType(str(issuetype.name) ?? 'Story', { subtask: issuetype.subtask === true }, cfg.issueTypeMap);
  const description = adfToText(f.description);
  const sections = splitSections(description);
  const acRaw = acField && f[acField] ? adfToText(f[acField]) : sections.get('acceptance criteria') ?? '';
  const parentKey = isRecord(f.parent) ? str(f.parent.key) : undefined;
  const parentFields = isRecord(f.parent) && isRecord(f.parent.fields) ? f.parent.fields : {};
  const parentTypeName = isRecord(parentFields.issuetype) ? str(parentFields.issuetype.name) : undefined;
  const parentIsEpic = !!parentKey && resolveIssueType(parentTypeName ?? '', {}, cfg.issueTypeMap) === 'epic';
  const acceptanceCriteria = bullets(acRaw);
  const points = cfg.storyPointsField ? f[cfg.storyPointsField] : undefined;
  const link = (issue: unknown, type: string | undefined) => (isRecord(issue) && str(issue.key) ? [{ type: type ?? 'relates to', key: str(issue.key)! }] : []);

  return {
    key: i.key,
    type,
    title: str(f.summary) ?? i.key,
    description: sections.get('__body') ?? description,
    acceptanceCriteria,
    acScenarios: parseAcceptanceCriteria(acceptanceCriteria),
    ...(typeof points === 'number' && Number.isFinite(points) && points >= 0 && { storyPoints: points }),
    businessRules: bullets(sections.get('business rules') ?? ''),
    status: (isRecord(f.status) && str(f.status.name)) || 'Unknown',
    epicKey: parentIsEpic ? parentKey : undefined,
    parentKey: !parentIsEpic ? parentKey : undefined,
    labels: strings(f.labels),
    components: records(f.components).flatMap((c) => str(c.name) ?? []),
    links: records(f.issuelinks).flatMap((l) => {
      const t = isRecord(l.type) ? l.type : {};
      return l.outwardIssue ? link(l.outwardIssue, str(t.outward)) : link(l.inwardIssue, str(t.inward));
    }),
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
    updatedAt: str(f.updated) ?? new Date().toISOString(),
    url: `${base}/browse/${i.key}`,
  };
}

/** Atlassian Document Format → plain text (headings and bullets preserved as lines). Malformed nodes are skipped. */
export function adfToText(node: unknown): string {
  if (typeof node === 'string') return node;
  if (!isRecord(node)) return '';
  const walk = (n: Record<string, unknown>): string => {
    if (n.type === 'text') return str(n.text) ?? '';
    if (n.type === 'hardBreak') return '\n';
    const inner = records(n.content).map(walk).join('');
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
      current = m[1]!.toLowerCase().replace('behaviour', 'behavior');
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
  const { api: base, site, headers } = endpoint(cfg, 'confluence');
  const docs: DocumentItem[] = [];
  for (const spaceKey of cfg.spaceKeys) {
    const spacesUrl = `${base}/wiki/api/v2/spaces?keys=${encodeURIComponent(spaceKey)}`;
    const spaces = await getJson(spacesUrl, headers, expectRecord(pathOf(spacesUrl)));
    const spaceId = records(spaces.results).map((s) => s.id).find((id) => typeof id === 'string' || typeof id === 'number');
    if (spaceId === undefined) continue;
    let url: string | undefined = `${base}/wiki/api/v2/spaces/${spaceId}/pages?body-format=storage&limit=100`;
    while (url && docs.length < (cfg.maxPages ?? 1000)) {
      const res: Record<string, unknown> = await getJson(url, headers, expectRecord(pathOf(url)));
      for (const p of records(res.results)) {
        const id = typeof p.id === 'string' || typeof p.id === 'number' ? String(p.id) : undefined;
        if (!id) continue;
        const storage = isRecord(p.body) && isRecord(p.body.storage) ? p.body.storage : {};
        const webui = isRecord(p._links) ? str(p._links.webui) : undefined;
        docs.push({
          id,
          title: str(p.title) ?? id,
          space: spaceKey,
          body: htmlToText(str(storage.value) ?? ''),
          labels: [],
          updatedAt: (isRecord(p.version) && str(p.version.createdAt)) || new Date().toISOString(),
          url: webui ? `${site}/wiki${webui}` : undefined,
        });
      }
      const next: string | undefined = isRecord(res._links) ? str(res._links.next) : undefined;
      url = next ? `${base}${next}` : undefined;
    }
  }
  await pool(docs, 4, async (d) => {
    try {
      const labelsUrl = `${base}/wiki/api/v2/pages/${d.id}/labels`;
      const res = await getJson(labelsUrl, headers, expectRecord(labelsUrl));
      d.labels = records(res.results).flatMap((l) => str(l.name) ?? []);
    } catch {
      /* labels are optional */
    }
  });
  return docs;
}

export async function pool<T>(xs: T[], n: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, xs.length) }, async () => {
    while (i < xs.length) await fn(xs[i++] as T);
  }));
}
