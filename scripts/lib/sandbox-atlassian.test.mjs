import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { adfText, basic, checkBot, checkSite, client, DESCRIPTION, KEY, MARKER, noConnectionHint, parseSite, redact, setup } from './sandbox-atlassian.mjs';

// Expected behaviour comes from docs/TEST-DATA-GENERATOR.md, 7.2 (CITEST, marker, bot) and 8.4–8.5 (guards, logs).

const TOKEN = 'secret-token-value-1234';

/** Fake Atlassian: routes "METHOD url" to [status, json]; records calls. */
function fake(routes) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ method: init.method, url, auth: init.headers.Authorization, body: init.body && JSON.parse(init.body) });
    const hit = routes[`${init.method} ${url}`];
    const [status, json] = typeof hit === 'function' ? hit(init) : hit ?? [404, { errorMessages: ['nope'] }];
    return { status, headers: { get: () => null }, text: async () => (json === undefined ? '' : JSON.stringify(json)) };
  };
  const lines = [];
  return { calls, lines, call: client({ fetchImpl, log: (l) => lines.push(l), sleep: async () => {}, secrets: [TOKEN] }) };
}

describe('SBX-SITE: site guard (8.4.1)', () => {
  it('SBX-SITE-1: normalises the site address', () => {
    assert.equal(parseSite('https://Foo-Sandbox.atlassian.net/'), 'foo-sandbox.atlassian.net');
    assert.equal(parseSite('evil.com'), null);
    assert.equal(parseSite('x.atlassian.net.evil.com'), null);
  });
  it('SBX-SITE-2: refuses a site missing from SANDBOX_ALLOWED_SITES', () => {
    assert.match(checkSite({ ATLASSIAN_SITE: 'a.atlassian.net', SANDBOX_ALLOWED_SITES: 'b.atlassian.net' })[0], /SANDBOX_ALLOWED_SITES/);
    assert.deepEqual(checkSite({ ATLASSIAN_SITE: 'a.atlassian.net', SANDBOX_ALLOWED_SITES: 'b.atlassian.net, https://a.atlassian.net' }), []);
    assert.match(checkSite({})[0], /ATLASSIAN_SITE/);
  });
});

describe('SBX-LOG: logs never carry tokens (8.5)', () => {
  it('SBX-LOG-1: redact replaces the token', () => assert.equal(redact(`x ${TOKEN} y`, [TOKEN]), 'x *** y'));
  it('SBX-LOG-2: a full setup run logs method, host, path and status only', async () => {
    const f = fake({});
    await setup(f.call, { site: 'a.atlassian.net', email: 'admin@example.com', token: TOKEN, confirm: true });
    assert.ok(f.lines.length > 0);
    for (const l of f.lines) {
      assert.ok(!l.includes(TOKEN) && !l.includes(basic('admin@example.com', TOKEN)), l);
      assert.match(l, /^ {2}(GET|POST) \S+ → \d{3}$/);
    }
  });
});

describe('SBX-SETUP: admin step (7.2, step 2)', () => {
  const site = 'a.atlassian.net';
  const base = `https://${site}`;
  const me = { [`GET ${base}/rest/api/3/myself`]: [200, { accountId: 'admin-1' }] };
  const noSpace = { [`GET ${base}/wiki/api/v2/spaces?keys=${KEY}&description-format=plain`]: [200, { results: [] }] };

  it('SBX-SETUP-1: dry run creates nothing', async () => {
    const f = fake({ ...me, ...noSpace });
    const r = await setup(f.call, { site, email: 'a@x', token: TOKEN, confirm: false });
    assert.deepEqual(r.problems, []);
    assert.deepEqual(r.actions, [`Jira: would create project ${KEY} (company-managed Scrum)`, `Confluence: would create space ${KEY}`]);
    assert.ok(f.calls.every((c) => c.method === 'GET'));
  });

  it('SBX-SETUP-2: --confirm creates the project with the marker and the admin as lead, then the space', async () => {
    const f = fake({
      ...me, ...noSpace,
      [`POST ${base}/rest/api/3/project`]: [201, { key: KEY }],
      [`POST ${base}/wiki/api/v2/spaces`]: [200, { key: KEY }],
    });
    const r = await setup(f.call, { site, email: 'a@x', token: TOKEN, confirm: true });
    assert.deepEqual(r.problems, []);
    const project = f.calls.find((c) => c.method === 'POST' && c.url.endsWith('/project')).body;
    assert.equal(project.key, KEY);
    assert.equal(project.leadAccountId, 'admin-1');
    assert.ok(project.description.includes(MARKER));
    const space = f.calls.find((c) => c.method === 'POST' && c.url.endsWith('/spaces')).body;
    assert.equal(space.description.value, DESCRIPTION);
  });

  it('SBX-SETUP-3: falls back to the v1 space endpoint when v2 cannot create', async () => {
    const f = fake({
      ...me, ...noSpace,
      [`POST ${base}/rest/api/3/project`]: [201, {}],
      [`POST ${base}/wiki/api/v2/spaces`]: [405, {}],
      [`POST ${base}/wiki/rest/api/space`]: [200, {}],
    });
    const r = await setup(f.call, { site, email: 'a@x', token: TOKEN, confirm: true });
    assert.deepEqual(r.problems, []);
    assert.ok(r.actions.includes(`Confluence: created space ${KEY}`));
  });

  it('SBX-SETUP-4: refuses CITEST without the marker (8.4.2) and writes nothing', async () => {
    const f = fake({
      ...me,
      [`GET ${base}/rest/api/3/project/${KEY}?expand=description`]: [200, { key: KEY, description: 'real data' }],
      [`GET ${base}/wiki/api/v2/spaces?keys=${KEY}&description-format=plain`]: [200, { results: [{ key: KEY, description: { plain: { value: '' } } }] }],
    });
    const r = await setup(f.call, { site, email: 'a@x', token: TOKEN, confirm: true });
    assert.equal(r.problems.length, 2);
    assert.ok(f.calls.every((c) => c.method === 'GET'));
  });

  it('SBX-SETUP-5: accepts an existing project with the marker in an ADF description', async () => {
    const adf = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: DESCRIPTION }] }] };
    assert.ok(adfText(adf).includes(MARKER));
    const f = fake({ ...me, ...noSpace, [`GET ${base}/rest/api/3/project/${KEY}?expand=description`]: [200, { key: KEY, description: adf }] });
    const r = await setup(f.call, { site, email: 'a@x', token: TOKEN, confirm: false });
    assert.ok(r.actions.includes(`Jira: project ${KEY} exists`));
  });

  it('SBX-SETUP-6: a rejected admin token stops before anything else', async () => {
    const f = fake({ [`GET ${base}/rest/api/3/myself`]: [401, {}] });
    const r = await setup(f.call, { site, email: 'a@x', token: TOKEN, confirm: true });
    assert.match(r.problems[0], /admin token rejected/);
    assert.equal(f.calls.length, 1);
  });
});

describe('SBX-BOT: bot tokens (7.2, step 3; tokens)', () => {
  const cloudId = 'cloud-1';
  const jira = `https://api.atlassian.com/ex/jira/${cloudId}`;
  const conf = `https://api.atlassian.com/ex/confluence/${cloudId}`;
  const good = {
    [`GET ${jira}/rest/api/3/myself`]: [200, { accountId: 'bot-1', emailAddress: 'me+ci-sandbox-bot@example.com' }],
    [`GET ${jira}/rest/api/3/project/${KEY}`]: [200, { key: KEY }],
    [`GET ${jira}/rest/api/3/project/search?maxResults=50`]: [200, { values: [{ key: KEY }] }],
    [`GET ${jira}/rest/api/3/mypermissions?projectKey=${KEY}&permissions=CREATE_ISSUES,DELETE_ISSUES`]:
      [200, { permissions: { CREATE_ISSUES: { havePermission: true }, DELETE_ISSUES: { havePermission: true } } }],
    [`GET ${conf}/wiki/api/v2/spaces?keys=${KEY}`]: [200, { results: [{ key: KEY }] }],
  };
  const all = { JIRA_API_TOKEN: 't1xx', CONFLUENCE_API_TOKEN: 't2xx', SANDBOX_JIRA_WRITE_TOKEN: 't3xx', SANDBOX_CONFLUENCE_WRITE_TOKEN: 't4xx' };
  const args = { cloudId, botEmail: 'me+ci-sandbox-bot@example.com', adminEmail: 'me@example.com' };

  it('SBX-BOT-1: four working tokens pass through the gateway with the bot e-mail', async () => {
    const f = fake(good);
    const r = await checkBot(f.call, { ...args, tokens: all });
    assert.deepEqual(r.problems, []);
    assert.deepEqual(r.results.map((x) => x.status), ['ok', 'ok', 'ok', 'ok']);
    assert.ok(f.calls.every((c) => c.url.startsWith('https://api.atlassian.com/ex/') && c.method === 'GET'));
    assert.ok(f.calls.every((c) => c.auth.startsWith('Basic ') && Buffer.from(c.auth.slice(6), 'base64').toString().startsWith(args.botEmail)));
  });

  it('SBX-BOT-2: a token created on the admin account fails', async () => {
    const f = fake({ ...good, [`GET ${jira}/rest/api/3/myself`]: [200, { accountId: 'admin-1', emailAddress: 'ME@example.com' }] });
    const r = await checkBot(f.call, { ...args, tokens: { JIRA_API_TOKEN: 't1xx' } });
    assert.match(r.problems[0], /admin account/);
  });

  it('SBX-BOT-3: missing tokens are skipped, not failed', async () => {
    const r = await checkBot(fake(good).call, { ...args, tokens: {} });
    assert.deepEqual(r.results.map((x) => x.status), ['skip', 'skip', 'skip', 'skip']);
    assert.deepEqual(r.problems, []);
  });

  it('SBX-BOT-4: other projects visible to the bot raise a warning; a write token without delete fails', async () => {
    const f = fake({
      ...good,
      [`GET ${jira}/rest/api/3/project/search?maxResults=50`]: [200, { values: [{ key: KEY }, { key: 'PAY' }] }],
      [`GET ${jira}/rest/api/3/mypermissions?projectKey=${KEY}&permissions=CREATE_ISSUES,DELETE_ISSUES`]:
        [200, { permissions: { CREATE_ISSUES: { havePermission: true }, DELETE_ISSUES: { havePermission: false } } }],
    });
    const r = await checkBot(f.call, { ...args, tokens: { JIRA_API_TOKEN: 't1xx', SANDBOX_JIRA_WRITE_TOKEN: 't3xx' } });
    assert.match(r.warnings[0], /PAY/);
    assert.deepEqual(r.problems, ['SANDBOX_JIRA_WRITE_TOKEN: the bot lacks DELETE_ISSUES in CITEST']);
  });

  it('SBX-BOT-5: a Confluence token that does not see CITEST fails', async () => {
    const f = fake({ ...good, [`GET ${conf}/wiki/api/v2/spaces?keys=${KEY}`]: [200, { results: [] }] });
    const r = await checkBot(f.call, { ...args, tokens: { CONFLUENCE_API_TOKEN: 't2xx' } });
    assert.match(r.problems[0], /does not see space/);
  });
});

describe('noConnectionHint', () => {
  it('points at NODE_USE_ENV_PROXY when a proxy is set but Node does not use it', () => {
    assert.match(noConnectionHint({ HTTPS_PROXY: 'http://proxy:8080' }), /NODE_USE_ENV_PROXY=1/);
    assert.match(noConnectionHint({ https_proxy: 'http://proxy:8080' }), /NODE_USE_ENV_PROXY=1/);
  });
  it('points at the network allow-list otherwise', () => {
    assert.match(noConnectionHint({}), /allow \*\.atlassian\.net and api\.atlassian\.com/);
    assert.match(noConnectionHint({ HTTPS_PROXY: 'http://proxy:8080', NODE_USE_ENV_PROXY: '1' }), /allow/);
  });
});

describe('SBX-429: one retry after Retry-After (8.4.5)', () => {
  const throttled = (retryAfter) => {
    const waits = [];
    let n = 0;
    const fetchImpl = async () => {
      n++;
      const status = n === 1 ? 429 : 200;
      return { status, headers: { get: (h) => (h === 'retry-after' ? retryAfter : null) }, text: async () => '{}' };
    };
    const call = client({ fetchImpl, log: () => {}, sleep: async (ms) => { waits.push(ms); }, secrets: [] });
    return { waits, call, count: () => n };
  };
  for (const [header, ms] of [['0', 0], ['2', 2000], [null, 5000], ['soon', 5000], ['-1', 5000], ['600', 60000]]) {
    it(`Retry-After ${JSON.stringify(header)} waits ${ms} ms, then retries once`, async () => {
      const t = throttled(header);
      const r = await t.call('GET', 'https://api.atlassian.com/ex/jira/x/rest/api/3/myself');
      assert.equal(r.status, 200);
      assert.deepEqual(t.waits, [ms]);
      assert.equal(t.count(), 2);
    });
  }
});
