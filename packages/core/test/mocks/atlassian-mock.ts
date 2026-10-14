import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { DocumentItem, IssueType, RequirementItem } from '../../src/index.js';

/**
 * Atlassian Cloud site mock (test data generator, stage E2): the Jira and Confluence REST endpoints the connectors
 * read, built from RequirementItems and DocumentItems. Listens on 127.0.0.1 only, accepts a single dummy
 * email/API token pair and never forwards anything upstream.
 */
export interface AtlassianMockOptions {
  requirements: RequirementItem[];
  documents: DocumentItem[];
  /** The only credentials accepted (Basic auth); real tokens never belong in tests. */
  email?: string;
  apiToken?: string;
  /** Page size for Jira search and Confluence page lists, so pagination is exercised on small data sets. */
  pageSize?: number;
  /** Number of initial requests answered with 429 (Retry-After: 0) before serving data. */
  rateLimitFirst?: number;
}

export interface AtlassianMock {
  /** Value for JiraConfig.baseUrl / ConfluenceConfig.baseUrl. */
  baseUrl: string;
  /** Request paths (with query) in arrival order. */
  requests: string[];
  close(): Promise<void>;
}

export const DUMMY_ATLASSIAN_EMAIL = 'dummy@example.test';
export const DUMMY_ATLASSIAN_TOKEN = 'dummy-atlassian-token';

const JIRA_TYPE_NAMES: Record<IssueType, string> = { epic: 'Epic', feature: 'Feature', story: 'Story', task: 'Task', subtask: 'Sub-task', bug: 'Bug' };

const text = (t: string) => ({ type: 'text', text: t });
const paragraph = (t: string) => ({ type: 'paragraph', content: t.split('\n').flatMap((line, i) => (i ? [{ type: 'hardBreak' }, text(line)] : [text(line)])) });
const heading = (t: string) => ({ type: 'heading', attrs: { level: 2 }, content: [text(t)] });
const bulletList = (items: string[]) => ({ type: 'bulletList', content: items.map((i) => ({ type: 'listItem', content: [paragraph(i)] })) });

/** Builds the ADF description the way teams write it: body, then "Acceptance Criteria" / "Business Rules" / bug sections. */
export function adfDescription(r: RequirementItem): unknown {
  const content: unknown[] = [];
  if (r.description) content.push(paragraph(r.description));
  if (r.acceptanceCriteria.length) content.push(heading('Acceptance Criteria'), bulletList(r.acceptanceCriteria));
  if (r.businessRules.length) content.push(heading('Business Rules'), bulletList(r.businessRules));
  const bug: [string, string | undefined][] = [
    ['Steps to reproduce', r.bug?.stepsToReproduce],
    ['Expected', r.bug?.expected],
    ['Actual', r.bug?.actual],
    ['Environment', r.bug?.environment],
  ];
  // A description that already carries the bug sections (as typed in Jira) is sent as is, without a second copy.
  const inline = /^(steps to reproduce|expected|actual)\s*:/im.test(r.description);
  if (!inline) for (const [title, value] of bug) if (value) content.push(heading(title), paragraph(value));
  return { type: 'doc', version: 1, content };
}

/** Builds a Jira search-result issue (fields as requested by the connector). */
export function jiraIssue(r: RequirementItem, byKey: Map<string, RequirementItem>): unknown {
  const parentKey = r.epicKey ?? r.parentKey;
  const parentType = parentKey ? (byKey.get(parentKey)?.type ?? (r.epicKey ? 'epic' : 'story')) : undefined;
  return {
    key: r.key,
    fields: {
      summary: r.title,
      description: adfDescription(r),
      issuetype: { name: JIRA_TYPE_NAMES[r.type], subtask: r.type === 'subtask' },
      parent: parentKey ? { key: parentKey, fields: { issuetype: { name: JIRA_TYPE_NAMES[parentType ?? 'story'] } } } : undefined,
      status: { name: r.status },
      labels: r.labels,
      components: r.components.map((name) => ({ name })),
      issuelinks: r.links.map((l) => ({ type: { name: l.type, outward: l.type }, outwardIssue: { key: l.key } })),
      updated: r.updatedAt,
    },
  };
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Confluence storage format: one <p> per line of the page body. */
export const storageBody = (body: string) => body.split('\n').map((line) => `<p>${escapeHtml(line)}</p>`).join('');

export async function startAtlassianMock(opts: AtlassianMockOptions): Promise<AtlassianMock> {
  const expectedAuth = `Basic ${Buffer.from(`${opts.email ?? DUMMY_ATLASSIAN_EMAIL}:${opts.apiToken ?? DUMMY_ATLASSIAN_TOKEN}`).toString('base64')}`;
  const pageSize = opts.pageSize ?? 100;
  const byKey = new Map(opts.requirements.map((r) => [r.key, r]));
  const spaces = [...new Set(opts.documents.map((d) => d.space))];
  const requests: string[] = [];
  let rateLimited = opts.rateLimitFirst ?? 0;

  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const q = url.searchParams;
    requests.push(`${url.pathname}${url.search}`);
    const send = (status: number, body: unknown, headers: Record<string, string> = {}) => {
      res.writeHead(status, { 'content-type': 'application/json', ...headers });
      res.end(JSON.stringify(body));
    };
    if (req.method !== 'GET') return send(405, { errorMessages: ['Method not allowed'] });
    if (req.headers.authorization !== expectedAuth) return send(401, { errorMessages: ['Client must be authenticated to access this resource.'] });
    if (rateLimited > 0) {
      rateLimited -= 1;
      return send(429, { errorMessages: ['Rate limit exceeded'] }, { 'retry-after': '0' });
    }
    const offset = Number(q.get('nextPageToken') ?? q.get('cursor') ?? 0);
    const slice = <T>(xs: T[], limit: number) => ({ items: xs.slice(offset, offset + limit), more: offset + limit < xs.length, next: String(offset + limit) });

    // ------------------------------------------------------------ Jira
    if (url.pathname === '/rest/api/3/search/jql') {
      const project = /project\s*=\s*"([^"]+)"/.exec(q.get('jql') ?? '')?.[1];
      const issues = opts.requirements.filter((r) => r.key.startsWith(`${project}-`)).sort((a, b) => a.key.localeCompare(b.key));
      // Jira rejects a JQL naming a project that does not exist (or that the user cannot see) with 400.
      if (!issues.length) return send(400, { errorMessages: [`The value '${project}' does not exist for the field 'project'.`] });
      const page = slice(issues, Math.min(pageSize, Number(q.get('maxResults') ?? 50)));
      return send(200, { issues: page.items.map((r) => jiraIssue(r, byKey)), isLast: !page.more, ...(page.more ? { nextPageToken: page.next } : {}) });
    }
    const remote = /^\/rest\/api\/3\/issue\/([^/]+)\/remotelink$/.exec(url.pathname);
    if (remote) {
      const r = byKey.get(decodeURIComponent(remote[1] ?? ''));
      if (!r) return send(404, { errorMessages: ['Issue does not exist or you do not have permission to see it.'] });
      return send(200, r.remoteLinks.map((u, i) => ({ id: i + 1, object: { url: u, title: u } })));
    }

    // ------------------------------------------------------------ Confluence
    if (url.pathname === '/wiki/api/v2/spaces') {
      const keys = (q.get('keys') ?? '').split(',');
      return send(200, { results: spaces.flatMap((key, i) => (keys.includes(key) ? [{ id: String(100 + i), key, name: key }] : [])), _links: {} });
    }
    const pages = /^\/wiki\/api\/v2\/spaces\/(\d+)\/pages$/.exec(url.pathname);
    if (pages) {
      const space = spaces[Number(pages[1]) - 100];
      if (!space) return send(404, { errors: [{ status: 404, code: 'NOT_FOUND', title: 'Space not found' }] });
      const page = slice(opts.documents.filter((d) => d.space === space), Math.min(pageSize, Number(q.get('limit') ?? 25)));
      return send(200, {
        results: page.items.map((d) => ({
          id: d.id,
          title: d.title,
          spaceId: pages[1],
          body: { storage: { representation: 'storage', value: storageBody(d.body) } },
          version: { number: 1, createdAt: d.updatedAt },
          _links: { webui: `/spaces/${space}/pages/${d.id}` },
        })),
        _links: page.more ? { next: `/wiki/api/v2/spaces/${pages[1]}/pages?body-format=storage&limit=${q.get('limit') ?? 25}&cursor=${page.next}` } : {},
      });
    }
    const labels = /^\/wiki\/api\/v2\/pages\/([^/]+)\/labels$/.exec(url.pathname);
    const doc = labels ? opts.documents.find((d) => d.id === decodeURIComponent(labels[1] ?? '')) : undefined;
    if (doc) return send(200, { results: doc.labels.map((name, i) => ({ id: String(i + 1), name, prefix: 'global' })), _links: {} });
    return send(404, { errorMessages: ['Not found'] });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}
