import { afterEach, describe, expect, it } from 'vitest';
import { demoProject, fetchConfluence, fetchJira, parseAcceptanceCriteria, type DocumentItem, type RequirementItem } from '../src/index.js';
import { DUMMY_ATLASSIAN_EMAIL, DUMMY_ATLASSIAN_TOKEN, startAtlassianMock, type AtlassianMock } from './mocks/atlassian-mock.js';

// Contract test: the real Jira and Confluence connectors (real fetch, real HTTP) against the local Atlassian mock built from demo data.
let mock: AtlassianMock | undefined;

afterEach(async () => {
  await mock?.close();
  mock = undefined;
});

const DEMO_SITE = 'https://demo.atlassian.net';
const creds = { email: DUMMY_ATLASSIAN_EMAIL, apiToken: DUMMY_ATLASSIAN_TOKEN };
const projectsOf = (rs: RequirementItem[]) => [...new Set(rs.map((r) => r.key.split('-')[0] ?? ''))].sort();
const byKey = (a: { key: string }, b: { key: string }) => a.key.localeCompare(b.key);
const byId = (a: DocumentItem, b: DocumentItem) => a.id.localeCompare(b.id);

/**
 * PAY-127 types its bug sections inline in the description, so the connector parses them from there; the demo's
 * structured `bug` field is a shorter paraphrase of the same text.
 */
const PAY_127_BUG = {
  stepsToReproduce: '1. Pay for an order with a card while the payment provider is slow.\n2. Payment screen shows "Payment failed".\n3. Click Retry.',
  expected: 'one charge.',
  actual: 'duplicate charge — the customer is charged twice.',
  environment: undefined,
};

/** The connector reads remote links only for stories, bugs, epics and features; URLs point at the site it was given. */
const expectedRequirement = (r: RequirementItem, base: string): RequirementItem => ({
  ...r,
  // The connector groups the AC it read (analysis/acceptance.ts, tested in acceptance.test.ts).
  acScenarios: parseAcceptanceCriteria(r.acceptanceCriteria),
  ...(r.key === 'PAY-127' ? { bug: PAY_127_BUG } : {}),
  remoteLinks: r.type === 'task' || r.type === 'subtask' ? [] : r.remoteLinks,
  url: r.url?.replace(DEMO_SITE, base),
});

describe('Jira connector against the mock API', () => {
  it('AC-01: reads back every demo issue with type, hierarchy, ADF sections, links and remote links', async () => {
    const { requirements } = demoProject();
    mock = await startAtlassianMock({ requirements, documents: [], pageSize: 3 });
    const base = mock.baseUrl;
    const fetched = (await Promise.all(projectsOf(requirements).map((projectKey) => fetchJira({ baseUrl: base, ...creds, projectKey })))).flat();
    expect(fetched.sort(byKey)).toEqual(requirements.map((r) => expectedRequirement(r, base)).sort(byKey));
  });

  it('AC-02: follows nextPageToken until isLast', async () => {
    const { requirements } = demoProject();
    const pay = requirements.filter((r) => r.key.startsWith('PAY-'));
    mock = await startAtlassianMock({ requirements, documents: [], pageSize: 4 });
    expect(await fetchJira({ baseUrl: mock.baseUrl, ...creds, projectKey: 'PAY' })).toHaveLength(pay.length);
    const searches = mock.requests.filter((p) => p.startsWith('/rest/api/3/search/jql'));
    expect(searches).toHaveLength(Math.ceil(pay.length / 4));
    expect(searches[0]).not.toContain('nextPageToken');
    expect(searches[1]).toContain('nextPageToken=4');
  });

  it('AC-03: a token other than the dummy one gets 401', async () => {
    mock = await startAtlassianMock({ requirements: demoProject().requirements, documents: [] });
    await expect(fetchJira({ baseUrl: mock.baseUrl, email: DUMMY_ATLASSIAN_EMAIL, apiToken: 'ATATT-real-looking', projectKey: 'PAY' })).rejects.toThrow(/search\/jql\?.* → HTTP 401/);
  });

  it('AC-04: an unknown project gets 400 from the JQL search', async () => {
    mock = await startAtlassianMock({ requirements: demoProject().requirements, documents: [] });
    await expect(fetchJira({ baseUrl: mock.baseUrl, ...creds, projectKey: 'NOPE' })).rejects.toThrow(/HTTP 400: .*'NOPE' does not exist/);
  });

  it('AC-05: a 429 is not retried yet and fails the fetch (Figma retries, Atlassian does not)', async () => {
    mock = await startAtlassianMock({ requirements: demoProject().requirements, documents: [], rateLimitFirst: 1 });
    await expect(fetchJira({ baseUrl: mock.baseUrl, ...creds, projectKey: 'PAY' })).rejects.toThrow(/HTTP 429/);
    expect(mock.requests).toHaveLength(1);
  });
});

describe('Confluence connector against the mock API', () => {
  it('AC-06: reads back every demo page with storage body, labels and web URL, following _links.next', async () => {
    const { documents } = demoProject();
    mock = await startAtlassianMock({ requirements: [], documents, pageSize: 2 });
    const base = mock.baseUrl;
    const spaceKeys = [...new Set(documents.map((d) => d.space))];
    const fetched = await fetchConfluence({ baseUrl: base, ...creds, spaceKeys });
    expect(fetched.sort(byId)).toEqual(documents.map((d) => ({ ...d, url: d.url?.replace(DEMO_SITE, base) })).sort(byId));
    expect(mock.requests.some((p) => p.includes('cursor=2'))).toBe(true);
  });

  it('AC-07: an unknown space is skipped, not an error', async () => {
    mock = await startAtlassianMock({ requirements: [], documents: demoProject().documents });
    expect(await fetchConfluence({ baseUrl: mock.baseUrl, ...creds, spaceKeys: ['NOPE'] })).toEqual([]);
  });

  it('AC-08: a token other than the dummy one gets 401', async () => {
    mock = await startAtlassianMock({ requirements: [], documents: demoProject().documents });
    await expect(fetchConfluence({ baseUrl: mock.baseUrl, email: DUMMY_ATLASSIAN_EMAIL, apiToken: 'ATATT-real-looking', spaceKeys: ['PAY'] })).rejects.toThrow(/spaces\?keys=PAY → HTTP 401/);
  });
});
