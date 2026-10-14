#!/usr/bin/env node
// Sets up and checks the Atlassian sandbox (docs/TEST-DATA-GENERATOR.md, 7.2). Reads secrets only from the environment.
//   node scripts/sandbox-atlassian.mjs setup             # admin token: shows what it would create (dry run)
//   node scripts/sandbox-atlassian.mjs setup --confirm   # creates Jira project and Confluence space CITEST
//   node scripts/sandbox-atlassian.mjs check             # bot tokens: read-only check, prints cloudId and base URLs
// Variables: ATLASSIAN_SITE, SANDBOX_ALLOWED_SITES; setup: ATLASSIAN_ADMIN_EMAIL, ATLASSIAN_ADMIN_TOKEN;
// check: SANDBOX_BOT_EMAIL, JIRA_API_TOKEN, CONFLUENCE_API_TOKEN, SANDBOX_JIRA_WRITE_TOKEN, SANDBOX_CONFLUENCE_WRITE_TOKEN.
import { BOT_TOKENS, checkBot, checkSite, client, cloudIdOf, gateway, parseSite, setup } from './lib/sandbox-atlassian.mjs';

const env = process.env;
const [command, ...flags] = process.argv.slice(2);
if (flags.some((f) => f !== '--confirm') || !['setup', 'check'].includes(command)) {
  console.error('Usage: node scripts/sandbox-atlassian.mjs setup [--confirm] | check   (tokens only from the environment)');
  process.exit(2);
}

const fail = (problems) => {
  console.error(`\n✗ ${problems.length} problem(s):\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  process.exit(1);
};

const siteProblems = checkSite(env);
if (siteProblems.length) fail(siteProblems);
const site = parseSite(env.ATLASSIAN_SITE);
const secrets = [env.ATLASSIAN_ADMIN_TOKEN, ...BOT_TOKENS.map((t) => env[t.env])].filter(Boolean);
const call = client({ secrets });

try {
  console.log(`Site: ${site}`);
  const cloudId = await cloudIdOf(call, site);

  if (command === 'setup') {
    const missing = ['ATLASSIAN_ADMIN_EMAIL', 'ATLASSIAN_ADMIN_TOKEN'].filter((k) => !env[k]);
    if (missing.length) fail(missing.map((k) => `${k}: not set`));
    const confirm = flags.includes('--confirm');
    const { actions, problems } = await setup(call, { site, email: env.ATLASSIAN_ADMIN_EMAIL, token: env.ATLASSIAN_ADMIN_TOKEN, confirm });
    console.log(`\n${actions.map((a) => `✓ ${a}`).join('\n')}`);
    if (problems.length) fail(problems);
    if (!confirm && actions.some((a) => a.includes('would'))) console.log('\nDry run. Run again with --confirm to create.');
  } else {
    if (!env.SANDBOX_BOT_EMAIL) fail(['SANDBOX_BOT_EMAIL: not set (the bot address, with +ci-sandbox-bot)']);
    if (env.ATLASSIAN_ADMIN_EMAIL && env.ATLASSIAN_ADMIN_EMAIL.toLowerCase() === env.SANDBOX_BOT_EMAIL.toLowerCase()) {
      fail(['SANDBOX_BOT_EMAIL equals ATLASSIAN_ADMIN_EMAIL — the bot needs its own account (7.2, step 3)']);
    }
    const tokens = Object.fromEntries(BOT_TOKENS.map((t) => [t.env, env[t.env]]));
    const { results, problems, warnings } = await checkBot(call, {
      cloudId, botEmail: env.SANDBOX_BOT_EMAIL, adminEmail: env.ATLASSIAN_ADMIN_EMAIL, tokens,
    });
    console.log('');
    for (const r of results) console.log(`${{ ok: '✓', fail: '✗', skip: '–' }[r.status]} ${r.env}: ${r.note}`);
    for (const w of warnings) console.log(`! ${w}`);
    console.log(`\nNot secret, for the reference files and the app:\n  cloudId=${cloudId}`);
    console.log(`  Jira base URL:       ${gateway('jira', cloudId)}\n  Confluence base URL: ${gateway('confluence', cloudId)}`);
    if (problems.length) fail(problems);
    if (results.some((r) => r.status === 'skip')) console.log('\nSome tokens were not set; the check is incomplete.');
  }
} catch (e) {
  const msg = String(e?.message ?? e).split('\n')[0];
  fail([msg === 'fetch failed' ? `no connection to Atlassian — allow *.atlassian.net and api.atlassian.com in the network` : msg]);
}
