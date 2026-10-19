import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchConfluence, fetchJira, jiraIssueToRequirement, type ConfluenceConfig, type JiraConfig } from '../src/index.js';

type Route = [match: string, reply: () => Response];

/** Fake for the network port: answers by the first route whose text occurs in the URL; unknown URLs are a 404. */
function fakeAtlassian(routes: Route[]) {
  const calls: { url: string; auth: string | null }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, auth: new Headers(init?.headers).get('authorization') });
      const route = routes.find(([m]) => url.includes(m));
      return route ? route[1]() : new Response('not found', { status: 404 });
    }),
  );
  return calls;
}

const json = (body: unknown) => () => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
const issue = (key: string, type: string, extra: Record<string, unknown> = {}) => ({ key, fields: { summary: key, issuetype: { name: type }, ...extra } });

const jira: JiraConfig = { baseUrl: 'https://acme.atlassian.net/', email: 'bot@acme.test', apiToken: 'tok', projectKey: 'PAY' };
const conf: ConfluenceConfig = { baseUrl: 'https://acme.atlassian.net', email: 'bot@acme.test', apiToken: 'tok', spaceKeys: ['ARCH'] };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchJira', () => {
  it('AT-01: follows nextPageToken, sends Basic auth and attaches remote links to stories only', async () => {
    const calls = fakeAtlassian([
      ['nextPageToken=p2', json({ issues: [issue('PAY-2', 'Task'), { fields: {} }], isLast: true })],
      ['/search/jql', json({ issues: [issue('PAY-1', 'Story')], nextPageToken: 'p2', isLast: false })],
      ['/issue/PAY-1/remotelink', json([{ object: { url: 'https://figma.com/file/X' } }, { object: {} }, null])],
    ]);
    const items = await fetchJira(jira);
    expect(items.map((i) => [i.key, i.type])).toEqual([
      ['PAY-1', 'story'],
      ['PAY-2', 'task'],
    ]);
    expect(items[0]?.remoteLinks).toEqual(['https://figma.com/file/X']);
    expect(items[0]?.url).toBe('https://acme.atlassian.net/browse/PAY-1');
    expect(calls.some((c) => c.url.includes('/issue/PAY-2/remotelink'))).toBe(false);
    // base64("bot@acme.test:tok")
    expect(calls[0]?.auth).toBe(`Basic ${Buffer.from('bot@acme.test:tok').toString('base64')}`);
    expect(decodeURIComponent(calls[0]?.url ?? '')).toContain('project = "PAY"  ORDER BY key ASC');
  });

  it('AT-02: requests the acceptance-criteria field and appends the JQL filter', async () => {
    const calls = fakeAtlassian([['/search/jql', json({ issues: [] })]]);
    await fetchJira({ ...jira, acceptanceCriteriaField: 'customfield_10035', jqlFilter: 'AND statusCategory != Done' });
    expect(calls[0]?.url).toContain('fields=summary,description,issuetype,parent,status,labels,components,issuelinks,updated,customfield_10035&');
    expect(decodeURIComponent(calls[0]?.url ?? '')).toContain('project = "PAY" AND statusCategory != Done ORDER BY');
  });

  it('AT-03: stops paging at maxIssues', async () => {
    const calls = fakeAtlassian([['/search/jql', json({ issues: [issue('PAY-1', 'Task'), issue('PAY-2', 'Task')], nextPageToken: 'again' })]]);
    expect(await fetchJira({ ...jira, maxIssues: 2 })).toHaveLength(2);
    expect(calls).toHaveLength(1);
  });

  it('AT-04: a missing remote-link endpoint does not fail the import', async () => {
    fakeAtlassian([['/search/jql', json({ issues: [issue('PAY-1', 'Story')] })]]);
    expect((await fetchJira(jira))[0]?.remoteLinks).toEqual([]);
  });

  it('AT-05: an HTTP error names the URL and status and truncates the body', async () => {
    fakeAtlassian([['/search/jql', () => new Response('x'.repeat(500), { status: 401 })]]);
    await expect(fetchJira(jira)).rejects.toThrow(/^GET https:\/\/acme\.atlassian\.net\/rest\/api\/3\/search\/jql\?.* → HTTP 401: x{200}$/);
  });

  it('AT-06: a non-object response is rejected without echoing the query string', async () => {
    fakeAtlassian([['/search/jql', json(['not', 'an', 'object'])]]);
    await expect(fetchJira(jira)).rejects.toThrow(/^GET https:\/\/acme\.atlassian\.net\/rest\/api\/3\/search\/jql → unexpected response$/);
  });
});

describe('jiraIssueToRequirement', () => {
  it('AT-07: reads bug sections from the description', () => {
    const description = 'Charged twice.\nSteps to reproduce: click pay twice\nExpected result: one charge\nActual: two charges\nEnvironment: prod';
    const r = jiraIssueToRequirement(issue('PAY-9', 'Bug', { description }), 'https://j');
    expect(r.type).toBe('bug');
    expect(r.description).toBe('Charged twice.');
    expect(r.bug).toEqual({ stepsToReproduce: 'click pay twice', expected: 'one charge', actual: 'two charges', environment: 'prod' });
  });

  it.each([
    { id: 'AT-08', parentType: 'Epic', epicKey: 'PAY-100', parentKey: undefined },
    { id: 'AT-09', parentType: 'Story', epicKey: undefined, parentKey: 'PAY-100' },
  ])('$id: a $parentType parent becomes epicKey=$epicKey / parentKey=$parentKey', ({ parentType, epicKey, parentKey }) => {
    const r = jiraIssueToRequirement(issue('PAY-1', 'Story', { parent: { key: 'PAY-100', fields: { issuetype: { name: parentType } } } }), 'https://j');
    expect([r.epicKey, r.parentKey]).toEqual([epicKey, parentKey]);
  });

  it('AT-10: prefers the configured acceptance-criteria field over the description section', () => {
    const fields = { description: 'Acceptance criteria:\n- from description', customfield_1: '- from field one\n- from field two' };
    const r = jiraIssueToRequirement(issue('PAY-1', 'Story', fields), 'https://j', { acceptanceCriteriaField: 'customfield_1' });
    expect(r.acceptanceCriteria).toEqual(['from field one', 'from field two']);
  });

  it('AT-11: maps inward links with their inward label and business rules as bullets', () => {
    const fields = { description: 'Business rules:\n1. Max 3 retries', issuelinks: [{ type: { inward: 'is blocked by' }, inwardIssue: { key: 'PAY-7' } }] };
    const r = jiraIssueToRequirement(issue('PAY-1', 'Story', fields), 'https://j');
    expect(r.links).toEqual([{ type: 'is blocked by', key: 'PAY-7' }]);
    expect(r.businessRules).toEqual(['Max 3 retries']);
  });
});

describe('fetchConfluence', () => {
  it('AT-12: resolves the space, follows _links.next and loads labels', async () => {
    const calls = fakeAtlassian([
      ['/spaces?keys=ARCH', json({ results: [{ id: 42 }] })],
      ['cursor=c2', json({ results: [{ id: '2', title: 'Second', body: { storage: { value: '<p>Two</p>' } } }] })],
      [
        '/spaces/42/pages',
        json({
          results: [{ id: 1, title: 'First', body: { storage: { value: '<p>One</p>' } }, version: { createdAt: '2026-01-01T00:00:00Z' }, _links: { webui: '/spaces/ARCH/pages/1' } }, { title: 'no id' }],
          _links: { next: '/wiki/api/v2/spaces/42/pages?cursor=c2' },
        }),
      ],
      ['/pages/1/labels', json({ results: [{ name: 'payments' }, { name: 3 }] })],
    ]);
    const docs = await fetchConfluence(conf);
    expect(docs.map((d) => [d.id, d.title, d.body, d.space])).toEqual([
      ['1', 'First', 'One', 'ARCH'],
      ['2', 'Second', 'Two', 'ARCH'],
    ]);
    expect(docs[0]?.url).toBe('https://acme.atlassian.net/wiki/spaces/ARCH/pages/1');
    expect(docs[0]?.updatedAt).toBe('2026-01-01T00:00:00Z');
    expect(docs[0]?.labels).toEqual(['payments']);
    // labels for page 2 return 404 — optional, so the page keeps no labels
    expect(docs[1]?.labels).toEqual([]);
    expect(calls[0]?.auth).toMatch(/^Basic /);
  });

  it('AT-13: skips spaces that do not exist', async () => {
    fakeAtlassian([['/spaces?keys=', json({ results: [] })]]);
    expect(await fetchConfluence({ ...conf, spaceKeys: ['NOPE'] })).toEqual([]);
  });

  it('AT-14: stops reading pages at maxPages', async () => {
    const calls = fakeAtlassian([
      ['/spaces?keys=ARCH', json({ results: [{ id: '7' }] })],
      ['/spaces/7/pages', json({ results: [{ id: 'a' }, { id: 'b' }], _links: { next: '/wiki/api/v2/spaces/7/pages?cursor=more' } })],
    ]);
    expect(await fetchConfluence({ ...conf, maxPages: 2 })).toHaveLength(2);
    expect(calls.filter((c) => c.url.includes('/pages?'))).toHaveLength(1);
  });
});

describe('OAuth 2.0 (3LO) access', () => {
  const oauth = { cloudId: 'cloud-1', siteUrl: 'https://acme.atlassian.net/', accessToken: 'dummy-access' };

  it('AT-15: Jira goes through the api.atlassian.com gateway with a bearer token; links point at the site', async () => {
    const calls = fakeAtlassian([
      ['/search/jql', json({ issues: [issue('PAY-1', 'Story')] })],
      ['/issue/PAY-1/remotelink', json([])],
    ]);
    const items = await fetchJira({ ...jira, baseUrl: '', email: '', apiToken: '', oauth });
    expect(calls.every((c) => c.url.startsWith('https://api.atlassian.com/ex/jira/cloud-1/rest/api/3/'))).toBe(true);
    expect(calls.every((c) => c.auth === 'Bearer dummy-access')).toBe(true);
    expect(items[0]?.url).toBe('https://acme.atlassian.net/browse/PAY-1');
  });

  it('AT-16: Confluence goes through the gateway, follows relative next links there and links pages to the site', async () => {
    const calls = fakeAtlassian([
      ['/spaces?keys=ARCH', json({ results: [{ id: 7 }] })],
      ['cursor=c2', json({ results: [{ id: '2', title: 'Two', _links: { webui: '/spaces/ARCH/pages/2' } }] })],
      ['/spaces/7/pages', json({ results: [{ id: '1', title: 'One' }], _links: { next: '/wiki/api/v2/spaces/7/pages?cursor=c2' } })],
      ['/labels', json({ results: [] })],
    ]);
    const docs = await fetchConfluence({ ...conf, baseUrl: '', email: '', apiToken: '', oauth });
    expect(docs.map((d) => d.id)).toEqual(['1', '2']);
    expect(docs[1]?.url).toBe('https://acme.atlassian.net/wiki/spaces/ARCH/pages/2');
    expect(calls.every((c) => c.url.startsWith('https://api.atlassian.com/ex/confluence/cloud-1/wiki/api/v2/'))).toBe(true);
    expect(calls.every((c) => c.auth === 'Bearer dummy-access')).toBe(true);
  });
});
