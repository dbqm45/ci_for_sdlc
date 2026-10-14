import { basic, MARKER } from '../../../scripts/lib/sandbox-atlassian.mjs';

/**
 * In-memory Jira and Confluence for the seeder tests: the routes the kits and the core connectors call, through the
 * gateway (api.atlassian.com/ex/{jira|confluence}/{cloudId}). Usable as the client's fetchImpl and as global fetch.
 */

export const SITE = 'sandbox-test.atlassian.net';
export const CLOUD = 'cloud-test';
export const JIRA = `https://api.atlassian.com/ex/jira/${CLOUD}`;
export const CONF = `https://api.atlassian.com/ex/confluence/${CLOUD}`;
const SPACE_ID = '98';

export const ENV = {
  ATLASSIAN_SITE: SITE,
  SANDBOX_ALLOWED_SITES: SITE,
  SANDBOX_BOT_EMAIL: 'bot@example.test',
  JIRA_API_TOKEN: 'dummy-jira-read-0001',
  CONFLUENCE_API_TOKEN: 'dummy-confluence-read-0002',
  SANDBOX_JIRA_WRITE_TOKEN: 'dummy-jira-write-0003',
  SANDBOX_CONFLUENCE_WRITE_TOKEN: 'dummy-confluence-write-0004',
};
export const TOKENS = [ENV.JIRA_API_TOKEN, ENV.CONFLUENCE_API_TOKEN, ENV.SANDBOX_JIRA_WRITE_TOKEN, ENV.SANDBOX_CONFLUENCE_WRITE_TOKEN];
const READ = new Set([basic(ENV.SANDBOX_BOT_EMAIL, ENV.JIRA_API_TOKEN), basic(ENV.SANDBOX_BOT_EMAIL, ENV.CONFLUENCE_API_TOKEN)]);
const WRITE = new Set([basic(ENV.SANDBOX_BOT_EMAIL, ENV.SANDBOX_JIRA_WRITE_TOKEN), basic(ENV.SANDBOX_BOT_EMAIL, ENV.SANDBOX_CONFLUENCE_WRITE_TOKEN)]);

const LINK_TYPES = [
  { id: '10000', name: 'Relates', inward: 'relates to', outward: 'relates to' },
  { id: '10001', name: 'Blocks', inward: 'is blocked by', outward: 'blocks' },
];
const ISSUE_TYPES = [
  { id: '1', name: 'Epic', subtask: false },
  { id: '2', name: 'Story', subtask: false },
  { id: '3', name: 'Bug', subtask: false },
  { id: '4', name: 'Task', subtask: false },
  { id: '5', name: 'Feature', subtask: false },
  { id: '6', name: 'Subtask', subtask: true },
];

interface Issue { id: string; key: string; fields: any }
interface Link { id: string; type: (typeof LINK_TYPES)[number]; source: string; target: string }
interface Remote { id: string; issue: string; globalId?: string; object: { url: string; title: string } }
interface Page { id: string; title: string; body: string; version: number; labels: string[]; trashed: boolean }
export interface Request { method: string; url: string; auth?: string; body?: any }
type Hook = (req: Request) => { status: number; json?: unknown } | undefined;

export interface FakeOptions {
  /** How Jira reads the two ends of a POST /issueLink (kits/jira.ts learns it once). */
  links?: 'as-sent' | 'swapped';
  projectMarker?: boolean;
  spaceMarker?: boolean;
  components?: string[];
  /** Results per page of the Jira search and the Confluence page list. */
  pageSize?: number;
  /** Answers a write before the fake does (an error the test wants to see). */
  hook?: Hook;
}

export class FakeAtlassian {
  readonly issues = new Map<string, Issue>();
  readonly links: Link[] = [];
  readonly remotes: Remote[] = [];
  readonly pages = new Map<string, Page>();
  readonly requests: Request[] = [];
  private seq = 100;
  private throttled = 0;

  constructor(readonly opts: FakeOptions = {}) {}

  /** The next n requests get 429 with Retry-After: 0. */
  throttle(n: number): void {
    this.throttled = n;
  }

  /** Writes (anything but GET) sent so far, as "METHOD path". */
  writes(): string[] {
    return this.requests.filter((r) => r.method !== 'GET').map((r) => `${r.method} ${new URL(r.url).pathname.replace(/^\/ex\/\w+\/[^/]+/, '')}`);
  }

  /** Something people made by hand: an issue or page without the sandbox labels. */
  addIssue(summary: string, labels: string[] = [], typeName = 'Story', parent?: string): Issue {
    const type = ISSUE_TYPES.find((t) => t.name === typeName)!;
    const n = ++this.seq;
    const issue: Issue = { id: String(n), key: `CITEST-${n}`, fields: { summary, labels, issuetype: { id: type.id }, components: [], ...(parent ? { parent: { key: parent } } : {}) } };
    this.issues.set(issue.key, issue);
    return issue;
  }

  addPage(title: string, labels: string[] = []): Page {
    const page = { id: String(++this.seq), title, body: '<p>hand made</p>', version: 1, labels, trashed: false };
    this.pages.set(page.id, page);
    return page;
  }

  readonly fetch = async (input: string | URL, init: { method?: string; headers?: Record<string, string>; body?: string } = {}): Promise<Response> => {
    const url = new URL(String(input));
    const method = (init.method ?? 'GET').toUpperCase();
    const auth = init.headers?.Authorization;
    const body = init.body ? JSON.parse(init.body) : undefined;
    const req: Request = { method, url: url.href, auth, body };
    this.requests.push(req);
    if (this.throttled > 0) {
      this.throttled--;
      return new Response('{}', { status: 429, headers: { 'Retry-After': '0' } });
    }
    if (url.host === SITE && url.pathname === '/_edge/tenant_info') return json(200, { cloudId: CLOUD });
    if (url.host !== 'api.atlassian.com') return json(404, {});
    if (!auth || !(READ.has(auth) || WRITE.has(auth))) return json(401, { message: 'Client must be authenticated' });
    if (method !== 'GET' && !WRITE.has(auth)) return json(403, { message: 'read token' });
    const hooked = method !== 'GET' ? this.opts.hook?.(req) : undefined;
    if (hooked) return json(hooked.status, hooked.json ?? {});

    const path = url.pathname;
    const q = url.searchParams;
    if (path.startsWith(`/ex/jira/${CLOUD}/rest/api/3/`)) return this.jira(method, path.slice(`/ex/jira/${CLOUD}/rest/api/3`.length), q, body);
    if (path.startsWith(`/ex/confluence/${CLOUD}/wiki/`)) return this.confluence(method, path.slice(`/ex/confluence/${CLOUD}/wiki`.length), q, body);
    return json(404, {});
  };

  // -------------------------------------------------------------------------- Jira

  private jira(method: string, path: string, q: URLSearchParams, body: any): Response {
    let m: RegExpExecArray | null;
    if (method === 'GET' && path === '/project/CITEST') {
      const marker = this.opts.projectMarker ?? true;
      const text = marker ? `${MARKER} Test data` : 'Real work';
      return json(200, {
        key: 'CITEST',
        description: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
        issueTypes: ISSUE_TYPES,
        components: (this.opts.components ?? ['Payments', 'Checkout', 'Account']).map((name, i) => ({ id: String(i + 1), name })),
      });
    }
    if (method === 'GET' && path === '/issueLinkType') return json(200, { issueLinkTypes: LINK_TYPES });
    if (method === 'GET' && path === '/search/jql') {
      const jql = q.get('jql') ?? '';
      const label = /labels = "([^"]+)"/.exec(jql)?.[1];
      const all = [...this.issues.values()].filter((i) => !label || i.fields.labels.includes(label)).sort((a, b) => Number(a.id) - Number(b.id));
      const size = this.opts.pageSize ?? 100;
      const from = Number(q.get('nextPageToken') ?? 0);
      const slice = all.slice(from, from + size);
      const more = from + size < all.length;
      return json(200, { issues: slice.map((i) => this.view(i)), isLast: !more, ...(more ? { nextPageToken: String(from + size) } : {}) });
    }
    if (method === 'POST' && path === '/issue') {
      const f = body.fields;
      const type = ISSUE_TYPES.find((t) => t.id === f.issuetype?.id);
      if (!type) return json(400, { errors: { issuetype: 'invalid' } });
      if (type.subtask && !this.issues.has(f.parent?.key)) return json(400, { errors: { parent: 'required' } });
      const n = ++this.seq;
      const { project: _p, ...fields } = f;
      this.issues.set(`CITEST-${n}`, { id: String(n), key: `CITEST-${n}`, fields: { ...fields, labels: fields.labels ?? [], components: fields.components ?? [] } });
      return json(201, { id: String(n), key: `CITEST-${n}` });
    }
    if ((m = /^\/issue\/(CITEST-\d+)$/.exec(path))) {
      const issue = this.issues.get(m[1]!);
      if (!issue) return json(404, {});
      if (method === 'GET') return json(200, this.view(issue));
      if (method === 'PUT') {
        Object.assign(issue.fields, body.fields);
        return empty();
      }
      if (method === 'DELETE') {
        const subtasks = [...this.issues.values()].filter((i) => i.fields.parent?.key === issue.key && this.typeOf(i).subtask);
        if (subtasks.length && q.get('deleteSubtasks') !== 'true') return json(400, {});
        for (const i of [issue, ...subtasks]) {
          this.issues.delete(i.key);
          remove(this.links, (l) => l.source === i.key || l.target === i.key);
          remove(this.remotes, (r) => r.issue === i.key);
        }
        return empty();
      }
    }
    if (method === 'POST' && path === '/issueLink') {
      const type = LINK_TYPES.find((t) => t.name === body.type?.name);
      const a = body.inwardIssue?.key;
      const b = body.outwardIssue?.key;
      if (!type || !this.issues.has(a) || !this.issues.has(b)) return json(404, {});
      const [source, target] = this.opts.links === 'swapped' ? [b, a] : [a, b];
      this.links.push({ id: String(++this.seq), type, source, target });
      return json(201, {});
    }
    if ((m = /^\/issueLink\/(\d+)$/.exec(path)) && method === 'DELETE') {
      return remove(this.links, (l) => l.id === m![1]) ? empty() : json(404, {});
    }
    if ((m = /^\/issue\/(CITEST-\d+)\/remotelink(?:\/(\d+))?$/.exec(path))) {
      const key = m[1]!;
      if (!this.issues.has(key)) return json(404, {});
      if (method === 'GET' && !m[2]) return json(200, this.remotes.filter((r) => r.issue === key));
      if (method === 'POST' && !m[2]) {
        const same = this.remotes.find((r) => r.issue === key && body.globalId && r.globalId === body.globalId);
        if (same) same.object = body.object;
        else this.remotes.push({ id: String(++this.seq), issue: key, globalId: body.globalId, object: body.object });
        return json(201, {});
      }
      if (method === 'DELETE' && m[2]) return remove(this.remotes, (r) => r.id === m![2]) ? empty() : json(404, {});
    }
    return json(404, {});
  }

  typeOf(i: Issue) {
    return ISSUE_TYPES.find((t) => t.id === i.fields.issuetype?.id)!;
  }

  /** An issue as GET and the search return it, links seen from this issue. */
  private view(i: Issue) {
    const parent = i.fields.parent?.key ? this.issues.get(i.fields.parent.key) : undefined;
    return {
      id: i.id,
      key: i.key,
      fields: {
        ...i.fields,
        issuetype: this.typeOf(i),
        parent: parent ? { key: parent.key, fields: { issuetype: this.typeOf(parent) } } : undefined,
        status: { name: 'To Do' },
        updated: '2026-10-01T10:00:00.000+0000',
        issuelinks: this.links.flatMap((l): object[] =>
          l.source === i.key ? [{ id: l.id, type: l.type, outwardIssue: { key: l.target } }] : l.target === i.key ? [{ id: l.id, type: l.type, inwardIssue: { key: l.source } }] : [],
        ),
      },
    };
  }

  // -------------------------------------------------------------------------- Confluence

  private confluence(method: string, path: string, q: URLSearchParams, body: any): Response {
    let m: RegExpExecArray | null;
    if (method === 'GET' && path === '/api/v2/spaces') {
      if (q.get('keys') !== 'CITEST') return json(200, { results: [] });
      const value = (this.opts.spaceMarker ?? true) ? `${MARKER} Test data` : 'Team space';
      return json(200, { results: [{ id: SPACE_ID, key: 'CITEST', description: { plain: { value } } }] });
    }
    if (method === 'GET' && path === `/api/v2/spaces/${SPACE_ID}/pages`) {
      const size = this.opts.pageSize ?? 100;
      const from = Number(q.get('cursor') ?? 0);
      const all = [...this.pages.values()].filter((p) => !p.trashed);
      const storage = q.get('body-format') === 'storage';
      const results = all.slice(from, from + size).map((p) => ({
        id: p.id,
        title: p.title,
        version: { number: p.version, createdAt: '2026-10-01T10:00:00.000Z' },
        ...(storage ? { body: { storage: { value: p.body, representation: 'storage' } } } : {}),
        _links: { webui: `/spaces/CITEST/pages/${p.id}` },
      }));
      const more = from + size < all.length;
      const next = new URLSearchParams(q);
      next.set('cursor', String(from + size));
      return json(200, { results, _links: more ? { next: `/wiki/api/v2/spaces/${SPACE_ID}/pages?${next}` } : {} });
    }
    if ((m = /^\/api\/v2\/pages\/(\d+)\/labels$/.exec(path)) && method === 'GET') {
      const page = this.pages.get(m[1]!);
      return page ? json(200, { results: page.labels.map((name, i) => ({ id: String(i), name, prefix: 'global' })), _links: {} }) : json(404, {});
    }
    if (method === 'POST' && path === '/api/v2/pages') {
      if (body.spaceId !== SPACE_ID) return json(400, {});
      if ([...this.pages.values()].some((p) => !p.trashed && p.title === body.title)) return json(400, { errors: { title: 'a page with this title exists' } });
      const page = { id: String(++this.seq), title: body.title, body: body.body.value, version: 1, labels: [], trashed: false };
      this.pages.set(page.id, page);
      return json(200, { id: page.id, title: page.title, version: { number: 1 } });
    }
    if ((m = /^\/api\/v2\/pages\/(\d+)$/.exec(path))) {
      const page = this.pages.get(m[1]!);
      if (!page) return json(404, {});
      if (method === 'PUT') {
        if (page.trashed) return json(404, {});
        if (body.version?.number !== page.version + 1) return json(409, {});
        Object.assign(page, { title: body.title, body: body.body.value, version: page.version + 1 });
        return json(200, { id: page.id, version: { number: page.version } });
      }
      if (method === 'DELETE') {
        if (q.get('purge') === 'true') {
          if (!page.trashed) return json(400, {});
          this.pages.delete(page.id);
        } else {
          if (page.trashed) return json(404, {});
          page.trashed = true;
        }
        return empty();
      }
    }
    if ((m = /^\/rest\/api\/content\/(\d+)\/label(?:\/([^/]+))?$/.exec(path))) {
      const page = this.pages.get(m[1]!);
      if (!page) return json(404, {});
      if (method === 'POST' && !m[2]) {
        for (const l of body) if (!page.labels.includes(l.name)) page.labels.push(l.name);
        return json(200, {});
      }
      if (method === 'DELETE' && m[2]) {
        const name = decodeURIComponent(m[2]);
        return remove(page.labels, (l) => l === name) ? empty() : json(404, {});
      }
    }
    return json(404, {});
  }
}

const json = (status: number, value: unknown) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const empty = () => new Response(null, { status: 204 });

function remove<T>(xs: T[], pred: (x: T) => boolean): boolean {
  let removed = false;
  for (let i = xs.length - 1; i >= 0; i--) {
    if (pred(xs[i]!)) {
      xs.splice(i, 1);
      removed = true;
    }
  }
  return removed;
}
