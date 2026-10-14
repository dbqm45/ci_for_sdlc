// Sets up and checks the Atlassian sandbox: Jira project and Confluence space CITEST, bot tokens
// (docs/TEST-DATA-GENERATOR.md, 7.2 and 8.4). Logs only method, path and status — never tokens or response bodies.

export const KEY = 'CITEST';
export const MARKER = '[ci-sandbox]';
export const PROJECT_NAME = 'CI Sandbox';
export const DESCRIPTION = `${MARKER} Test data for continuous-intelligence-sdlc. Managed by scripts; do not keep real data here.`;
/** Company-managed Scrum (docs/TEST-DATA-GENERATOR.md, 7.2). */
export const SCRUM_TEMPLATE = 'com.pyxis.greenhopper.jira:gh-simplified-scrum-classic';

/** Bot tokens: variable → app and what it is for. One app per scoped token. */
export const BOT_TOKENS = [
  { env: 'JIRA_API_TOKEN', app: 'jira', role: 'read' },
  { env: 'CONFLUENCE_API_TOKEN', app: 'confluence', role: 'read' },
  { env: 'SANDBOX_JIRA_WRITE_TOKEN', app: 'jira', role: 'write' },
  { env: 'SANDBOX_CONFLUENCE_WRITE_TOKEN', app: 'confluence', role: 'write' },
];

/** `https://x.atlassian.net/`, `x.atlassian.net` → `x.atlassian.net`; anything else → null. */
export function parseSite(value) {
  const host = String(value ?? '').trim().replace(/^https?:\/\//, '').replace(/\/+$/, '').toLowerCase();
  return /^[a-z0-9][a-z0-9-]*\.atlassian\.net$/.test(host) ? host : null;
}

/** Guard 8.4.1: the site is valid and on SANDBOX_ALLOWED_SITES. Returns the problems. */
export function checkSite(env) {
  const site = parseSite(env.ATLASSIAN_SITE);
  if (!site) return ['ATLASSIAN_SITE: set it to <name>.atlassian.net'];
  const allowed = String(env.SANDBOX_ALLOWED_SITES ?? '').split(',').map(parseSite).filter(Boolean);
  if (!allowed.includes(site)) return [`SANDBOX_ALLOWED_SITES: add ${site} — the script writes only to listed sites`];
  return [];
}

export const basic = (email, token) => `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`;

/** Replaces every secret value in a text with ***. */
export function redact(text, secrets) {
  let out = String(text);
  for (const s of secrets) if (s && s.length >= 4) out = out.split(s).join('***');
  return out;
}

export const hasMarker = (text) => String(text ?? '').includes(MARKER);

/** Plain text of a Jira description: a string or Atlassian Document Format. */
export function adfText(node) {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(adfText).join(' ');
  return [node.text ?? '', adfText(node.content)].join(' ').trim();
}

/**
 * HTTP client: JSON in and out, one retry on 429 with Retry-After, a log line per call.
 * `fetchImpl` and `sleep` are injectable for tests.
 */
export function client({ fetchImpl = fetch, log = console.log, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), secrets = [] }) {
  return async function call(method, url, { auth, body } = {}) {
    const headers = { Accept: 'application/json' };
    if (auth) headers.Authorization = auth;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const init = { method, headers, body: body === undefined ? undefined : JSON.stringify(body) };
    let res = await fetchImpl(url, init);
    if (res.status === 429) {
      const wait = Math.min(Number(res.headers?.get?.('retry-after') ?? 5) || 5, 60);
      await sleep(wait * 1000);
      res = await fetchImpl(url, init);
    }
    const u = new URL(url);
    log(redact(`  ${method} ${u.host}${u.pathname} → ${res.status}`, secrets));
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    return { status: res.status, ok: res.status >= 200 && res.status < 300, json };
  };
}

export const gateway = (app, cloudId) => `https://api.atlassian.com/ex/${app}/${cloudId}`;

export async function cloudIdOf(call, site) {
  const r = await call('GET', `https://${site}/_edge/tenant_info`);
  if (!r.ok || !r.json?.cloudId) throw new Error(`cannot read cloudId from https://${site}/_edge/tenant_info (${r.status})`);
  return r.json.cloudId;
}

/**
 * Admin step: creates CITEST in Jira and Confluence if missing, refuses to touch an existing one without the marker.
 * Without `confirm` it only reports what it would do. Returns { actions, problems }.
 */
export async function setup(call, { site, email, token, confirm }) {
  const auth = basic(email, token);
  const base = `https://${site}`;
  const actions = [];
  const problems = [];

  const me = await call('GET', `${base}/rest/api/3/myself`, { auth });
  if (!me.ok) return { actions, problems: [`admin token rejected by Jira (${me.status}) — check ATLASSIAN_ADMIN_EMAIL and ATLASSIAN_ADMIN_TOKEN`] };

  const project = await call('GET', `${base}/rest/api/3/project/${KEY}?expand=description`, { auth });
  if (project.ok) {
    if (hasMarker(adfText(project.json?.description))) actions.push(`Jira: project ${KEY} exists`);
    else problems.push(`Jira: project ${KEY} exists without "${MARKER}" in its description — add it by hand or use another site`);
  } else if (project.status === 404) {
    if (!confirm) actions.push(`Jira: would create project ${KEY} (company-managed Scrum)`);
    else {
      const r = await call('POST', `${base}/rest/api/3/project`, {
        auth,
        body: {
          key: KEY, name: PROJECT_NAME, description: DESCRIPTION, projectTypeKey: 'software',
          projectTemplateKey: SCRUM_TEMPLATE, leadAccountId: me.json.accountId, assigneeType: 'UNASSIGNED',
        },
      });
      if (r.ok) actions.push(`Jira: created project ${KEY}`);
      else problems.push(`Jira: creating project ${KEY} failed (${r.status}) — the admin needs "Administer Jira"; or create it by hand (7.2, step 2)`);
    }
  } else problems.push(`Jira: reading project ${KEY} failed (${project.status})`);

  const spaces = await call('GET', `${base}/wiki/api/v2/spaces?keys=${KEY}&description-format=plain`, { auth });
  const space = spaces.json?.results?.[0];
  if (!spaces.ok) problems.push(`Confluence: reading spaces failed (${spaces.status}) — is Confluence added to the site?`);
  else if (space) {
    if (hasMarker(space.description?.plain?.value)) actions.push(`Confluence: space ${KEY} exists`);
    else problems.push(`Confluence: space ${KEY} exists without "${MARKER}" in its description — add it by hand or use another site`);
  } else if (!confirm) actions.push(`Confluence: would create space ${KEY}`);
  else {
    let r = await call('POST', `${base}/wiki/api/v2/spaces`, {
      auth, body: { key: KEY, name: PROJECT_NAME, description: { value: DESCRIPTION, representation: 'plain' } },
    });
    if (!r.ok && [404, 405, 410, 501].includes(r.status)) {
      r = await call('POST', `${base}/wiki/rest/api/space`, {
        auth, body: { key: KEY, name: PROJECT_NAME, description: { plain: { value: DESCRIPTION, representation: 'plain' } } },
      });
    }
    if (r.ok) actions.push(`Confluence: created space ${KEY}`);
    else problems.push(`Confluence: creating space ${KEY} failed (${r.status}) — create it by hand (7.2, step 2) with "${MARKER}" in the description`);
  }
  return { actions, problems };
}

/**
 * Bot step: every bot token works through the gateway, belongs to the bot (not the admin), and sees CITEST.
 * Read-only. Returns { results: [{ env, status: 'ok'|'fail'|'skip', note }], problems, warnings }.
 */
export async function checkBot(call, { cloudId, botEmail, adminEmail, tokens }) {
  const results = [];
  const warnings = [];
  const accounts = new Set();
  for (const t of BOT_TOKENS) {
    const token = tokens[t.env];
    if (!token) { results.push({ env: t.env, status: 'skip', note: 'variable not set' }); continue; }
    const auth = basic(botEmail, token);
    const gw = gateway(t.app, cloudId);
    if (t.app === 'jira') {
      const me = await call('GET', `${gw}/rest/api/3/myself`, { auth });
      if (!me.ok) { results.push({ env: t.env, status: 'fail', note: `rejected (${me.status}) — wrong token, e-mail or app; needs read:jira-user` }); continue; }
      accounts.add(me.json?.accountId);
      if (adminEmail && String(me.json?.emailAddress ?? '').toLowerCase() === adminEmail.toLowerCase()) {
        results.push({ env: t.env, status: 'fail', note: 'token belongs to the admin account — create it while logged in as the bot' });
        continue;
      }
      const p = await call('GET', `${gw}/rest/api/3/project/${KEY}`, { auth });
      if (!p.ok) { results.push({ env: t.env, status: 'fail', note: `cannot see project ${KEY} (${p.status}) — needs read:jira-work and access to Jira` }); continue; }
      const all = await call('GET', `${gw}/rest/api/3/project/search?maxResults=50`, { auth });
      const others = (all.json?.values ?? []).map((v) => v.key).filter((k) => k !== KEY);
      if (others.length) warnings.push(`${t.env}: the bot also sees ${others.join(', ')} — keep only ${KEY} on the sandbox site`);
      if (t.role === 'write') {
        const perm = await call('GET', `${gw}/rest/api/3/mypermissions?projectKey=${KEY}&permissions=CREATE_ISSUES,DELETE_ISSUES`, { auth });
        const missing = ['CREATE_ISSUES', 'DELETE_ISSUES'].filter((k) => perm.ok && !perm.json?.permissions?.[k]?.havePermission);
        if (!perm.ok || missing.length) {
          results.push({ env: t.env, status: 'fail', note: perm.ok ? `the bot lacks ${missing.join(', ')} in ${KEY}` : `cannot read permissions (${perm.status})` });
          continue;
        }
      }
      results.push({ env: t.env, status: 'ok', note: t.role === 'write' ? `sees ${KEY}, may create and delete issues (scopes checked by the seeder)` : `sees ${KEY}` });
    } else {
      const s = await call('GET', `${gw}/wiki/api/v2/spaces?keys=${KEY}`, { auth });
      if (!s.ok) { results.push({ env: t.env, status: 'fail', note: `rejected (${s.status}) — wrong token, e-mail or app; needs read:space:confluence` }); continue; }
      if (!s.json?.results?.length) { results.push({ env: t.env, status: 'fail', note: `does not see space ${KEY} — give the bot access to Confluence` }); continue; }
      results.push({ env: t.env, status: 'ok', note: t.role === 'write' ? `sees ${KEY} (write scopes checked by the seeder)` : `sees ${KEY}` });
    }
  }
  if (accounts.size > 1) warnings.push('the Jira tokens belong to different accounts — create all four as the bot');
  const problems = results.filter((r) => r.status === 'fail').map((r) => `${r.env}: ${r.note}`);
  return { results, problems, warnings };
}
