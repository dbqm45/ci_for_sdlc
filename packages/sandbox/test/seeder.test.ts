import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { basic } from '../../../scripts/lib/sandbox-atlassian.mjs';
import { main } from '../src/cli.js';
import { SANDBOX_LABEL } from '../src/kits/encode.js';
import { checkoutWorld } from '../src/world/checkout.js';
import { pluginFiles } from '../src/figma-plugin.js';
import { ENV, FakeAtlassian, TOKENS, type FakeOptions } from './fake-atlassian.js';
import { FakeFigma, FIGMA_TOKEN, FILE_KEY, combinedFetch } from './fake-figma.js';

// docs/TEST-DATA-GENERATOR.md, 4.3 and 8.4: the seeder against an in-memory Jira and Confluence.
// Status reads through the core connectors (global fetch), so the fake stands in for both.

const WORLD = checkoutWorld();
let dir: string;
let file: string;
let fake: FakeAtlassian;

function site(opts: FakeOptions = {}): FakeAtlassian {
  fake = new FakeAtlassian(opts);
  vi.stubGlobal('fetch', fake.fetch);
  return fake;
}

const run = (argv: string[], env: Record<string, string | undefined> = ENV) =>
  main(argv, env, { file, fetchImpl: fake.fetch, sleep: async () => {} });

// Stage E4: the sandbox Figma file, built by the generated plugin, read by the seeder over REST.
const FIGMA_ENV = { ...ENV, FIGMA_TOKEN, SANDBOX_FIGMA_FILE_KEY: FILE_KEY };
const PLUGIN = pluginFiles().code;
const FIGMA_LINKS = WORLD.requirements.flatMap((r) => r.remoteLinks).filter((u) => new URL(u).hostname.endsWith('figma.com')).length;
let fig: FakeFigma;

function figmaSite(opts: FakeOptions = {}): FakeFigma {
  site(opts);
  fig = new FakeFigma();
  vi.stubGlobal('fetch', combinedFetch(fig, fake.fetch));
  return fig;
}

const runF = (argv: string[], env: Record<string, string | undefined> = FIGMA_ENV) =>
  main(argv, env, { file, fetchImpl: combinedFetch(fig, fake.fetch) as typeof fake.fetch, sleep: async () => {} });
const figmaRemotes = () => fake.remotes.filter((r) => (r.globalId ?? '').includes(':figma-'));
const problems = (lines: string[]) => lines.filter((l) => l.startsWith('✗'));

const labelled = () => [...fake.issues.values()].filter((i) => i.fields.labels.includes(SANDBOX_LABEL));
const labelledPages = () => [...fake.pages.values()].filter((p) => !p.trashed && p.labels.includes(SANDBOX_LABEL));
const state = () => JSON.parse(readFileSync(file, 'utf8'));

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sbx-'));
  file = join(dir, 'state.json');
});
afterEach(() => {
  vi.unstubAllGlobals();
  rmSync(dir, { recursive: true, force: true });
});

describe('seed', () => {
  it('SBX-01: without --confirm only lists the writes', async () => {
    site();
    const r = await run(['seed']);
    expect(r.code).toBe(0);
    expect(fake.writes()).toEqual([]);
    expect(r.lines.filter((l) => l.startsWith('• would create'))).toHaveLength(WORLD.requirements.length + WORLD.documents.length);
    expect(r.lines.at(-1)).toMatch(/Dry run — nothing was changed/);
  });

  it('SBX-02: with --confirm builds the world, status reads it back in sync, a second seed writes nothing', async () => {
    site({ pageSize: 5 });
    const r = await run(['seed', '--confirm']);
    expect(r.lines.filter((l) => l.startsWith('✗'))).toEqual([]);
    expect(r.code).toBe(0);
    expect(labelled()).toHaveLength(WORLD.requirements.length);
    expect(labelledPages()).toHaveLength(WORLD.documents.length);
    expect(fake.links.length).toBeGreaterThan(0);
    expect(fake.remotes.length).toBeGreaterThan(0);

    const s = await run(['status']);
    expect(s.lines.filter((l) => l.startsWith('✗'))).toEqual([]);
    expect(s.code).toBe(0);
    expect(s.lines).toContain('in sync with the world');

    const before = fake.writes().length;
    const again = await run(['seed', '--confirm']);
    expect(again.code).toBe(0);
    expect(fake.writes().slice(before)).toEqual([]);
  });

  it('SBX-03: Jira reading the link ends the other way round still ends in sync', async () => {
    site({ links: 'swapped' });
    expect((await run(['seed', '--confirm'])).code).toBe(0);
    expect(state().linkOrientation).toBe('swapped');
    const s = await run(['status']);
    expect(s.lines.filter((l) => l.startsWith('✗'))).toEqual([]);
    expect(s.code).toBe(0);
  });

  it('SBX-04: a lost state file creates no duplicates; a labelled extra issue is deleted', async () => {
    site();
    await run(['seed', '--confirm']);
    rmSync(file);
    const extra = fake.addIssue('Left over', [SANDBOX_LABEL, 'ci-sbx-pay-999']);
    const before = fake.writes().length;
    const r = await run(['seed', '--confirm']);
    expect(r.code).toBe(0);
    const writes = fake.writes().slice(before);
    expect(writes.filter((w) => w === 'POST /rest/api/3/issue' || w === 'POST /wiki/api/v2/pages')).toEqual([]);
    expect(writes).toContain(`DELETE /rest/api/3/issue/${extra.key}`);
    expect(labelled()).toHaveLength(WORLD.requirements.length);
  });

  it('SBX-05: a 429 is retried after Retry-After', async () => {
    site();
    fake.throttle(1);
    const sleep = vi.fn(async (_ms: number) => {});
    const r = await main(['seed'], ENV, { file, fetchImpl: fake.fetch, sleep });
    expect(r.code).toBe(0);
    expect(sleep).toHaveBeenCalledExactlyOnceWith(0);
    expect(fake.requests[1]?.url).toBe(fake.requests[0]?.url);
  });

  it('SBX-06: an issue description Jira rejects is created again without the footer, with a warning', async () => {
    site({ hook: (req) => (req.method === 'POST' && req.url.endsWith('/issue') && JSON.stringify(req.body).includes('"status"') ? { status: 400, json: { errors: { description: 'status node' } } } : undefined) });
    const r = await run(['seed', '--confirm']);
    expect(r.code).toBe(0);
    expect(labelled()).toHaveLength(WORLD.requirements.length);
    expect(r.lines.some((l) => l.startsWith('! ') && /footer/i.test(l))).toBe(true);
  });

  it('SBX-15: a component missing from the project is reported, the issues are written without it', async () => {
    site({ components: ['Payments'] });
    const r = await run(['seed', '--confirm']);
    expect(r.code).toBe(0);
    expect(r.lines.some((l) => l.startsWith('! ') && l.includes('no component(s) Account, Checkout'))).toBe(true);
    expect(labelled()).toHaveLength(WORLD.requirements.length);
  });
});

describe('mutate, reset, status', () => {
  it('SBX-07: mutate applies a scenario once and remembers it', async () => {
    site();
    await run(['seed', '--confirm']);
    let before = fake.writes().length;
    expect((await run(['mutate', 'timeout-change', '--confirm'])).code).toBe(0);
    expect(fake.writes().slice(before).some((w) => /^PUT \/wiki\/api\/v2\/pages\/\d+$/.test(w))).toBe(true);
    expect(state().scenarios).toEqual(['timeout-change']);

    before = fake.writes().length;
    expect((await run(['mutate', 'story-card-limit', '--confirm'])).code).toBe(0);
    expect(fake.writes().slice(before).some((w) => /^PUT \/rest\/api\/3\/issue\/CITEST-\d+$/.test(w))).toBe(true);
    expect(state().scenarios).toEqual(['timeout-change', 'story-card-limit']);

    const s = await run(['status']);
    expect(s.code).toBe(0);
    expect(s.lines.some((l) => l.includes('scenarios: timeout-change, story-card-limit'))).toBe(true);

    const again = await run(['mutate', 'timeout-change', '--confirm']);
    expect(again.code).toBe(1);
    expect(again.lines.join('\n')).toMatch(/already applied/);
    const unknown = await run(['mutate', 'nope', '--confirm']);
    expect(unknown.code).toBe(1);
    expect(unknown.lines.join('\n')).toMatch(/unknown scenario "nope"/);
  });

  it("SBX-08: a Figma scenario needs Figma, then the plugin's Mutate, and only then is recorded", async () => {
    figmaSite();
    await fig.run(PLUGIN, 'seed');
    expect((await runF(['seed', '--confirm'])).code).toBe(0);

    const off = await runF(['mutate', 'figma-remove-error', '--confirm'], ENV);
    expect(off.code).toBe(1);
    expect(off.lines.join('\n')).toMatch(/set FIGMA_TOKEN and SANDBOX_FIGMA_FILE_KEY/);

    const before = fake.writes().length;
    const early = await runF(['mutate', 'figma-remove-error', '--confirm']);
    expect(early.code).toBe(1);
    expect(early.lines.join('\n')).toMatch(/CI sandbox → Mutate: figma-remove-error/);
    expect(fake.writes().slice(before)).toEqual([]);
    expect(state().scenarios ?? []).toEqual([]);

    await fig.run(PLUGIN, 'mutate:figma-remove-error');
    const r = await runF(['mutate', 'figma-remove-error', '--confirm']);
    expect(problems(r.lines)).toEqual([]);
    expect(r.code).toBe(0);
    expect(state().scenarios).toEqual(['figma-remove-error']);
    const s = await runF(['status']);
    expect(problems(s.lines)).toEqual([]);
    expect(s.code).toBe(0);
  });

  it('SBX-09: reset deletes only labelled objects', async () => {
    site();
    await run(['seed', '--confirm']);
    const own = fake.addIssue('Made by hand');
    const page = fake.addPage('Notes by hand');
    const r = await run(['reset', '--confirm']);
    expect(r.code).toBe(0);
    expect(labelled()).toEqual([]);
    expect(labelledPages()).toEqual([]);
    expect(fake.issues.has(own.key)).toBe(true);
    expect(fake.pages.get(page.id)?.trashed).toBe(false);
    expect(state().issues).toEqual({});
  });

  it('SBX-16: an issue with a subtask made by hand is left alone, with its subtask', async () => {
    site();
    await run(['seed', '--confirm']);
    const story = labelled().find((i) => fake.typeOf(i).name === 'Story')!;
    const own = fake.addIssue('Subtask by hand', [], 'Subtask', story.key);
    const r = await run(['reset', '--confirm']);
    expect(r.code).toBe(0);
    expect(fake.requests.filter((q) => q.url.includes('deleteSubtasks'))).toEqual([]);
    expect(fake.issues.has(own.key)).toBe(true);
    expect(fake.issues.has(story.key)).toBe(true);
    expect(r.lines.some((l) => l.startsWith('! ') && l.includes(`${story.key} has subtasks not made by the seeder`))).toBe(true);
  });

  it('SBX-17: an unexpected error is masked too', async () => {
    site({ hook: (req) => { if (req.method === 'POST') throw new TypeError(`boom ${ENV.SANDBOX_JIRA_WRITE_TOKEN}`); return undefined; } });
    const r = await run(['seed', '--confirm']);
    expect(r.code).toBe(1);
    for (const t of TOKENS) expect(r.lines.join('\n')).not.toContain(t);
  });

  it('SBX-10: status names an edited issue and page, and the next seed repairs them', async () => {
    site();
    await run(['seed', '--confirm']);
    const issue = labelled()[0]!;
    issue.fields.summary = 'Edited by hand';
    const page = labelledPages()[0]!;
    page.body = '<p>Edited by hand</p>';
    page.version++;

    const s = await run(['status']);
    expect(s.code).toBe(1);
    expect(s.lines.some((l) => l.startsWith('✗') && l.includes(`(${issue.key}): title differs from the world`))).toBe(true);
    expect(s.lines.some((l) => l.startsWith('✗') && l.includes(`(${page.id}): body differs from the world`))).toBe(true);

    expect((await run(['seed', '--confirm'])).code).toBe(0);
    expect((await run(['status'])).code).toBe(0);
  });
});

describe('figma (E4)', () => {
  it('SBX-18: without Figma settings the Figma links are left out, with a warning', async () => {
    site();
    const r = await run(['seed', '--confirm']);
    expect(r.code).toBe(0);
    expect(r.lines.some((l) => l.startsWith('! ') && l.includes(`${FIGMA_LINKS} Figma link(s) left out`))).toBe(true);
    expect(figmaRemotes()).toEqual([]);
  });

  it('SBX-19: seed links issues to the frames the plugin made, under their real node ids; status is in sync', async () => {
    figmaSite();
    await fig.run(PLUGIN, 'seed');
    const r = await runF(['seed', '--confirm']);
    expect(problems(r.lines)).toEqual([]);
    expect(r.code).toBe(0);
    expect(figmaRemotes()).toHaveLength(FIGMA_LINKS);
    const nodeIds = new Set(fig.root.children.flatMap((p) => p.children).map((n) => n.id.replace(/:/g, '-')));
    for (const link of figmaRemotes()) {
      const url = new URL(link.object.url);
      expect(url.pathname.split('/')[2]).toBe(FILE_KEY);
      expect(nodeIds.has(url.searchParams.get('node-id')!)).toBe(true);
    }

    const s = await runF(['status']);
    expect(problems(s.lines)).toEqual([]);
    expect(s.code).toBe(0);
    expect(s.lines.some((l) => /Figma: \d+ frame\(s\) of the plugin in the sandbox file; world: \d+ frames/.test(l))).toBe(true);

    const before = fake.writes().length;
    expect((await runF(['seed', '--confirm'])).code).toBe(0);
    expect(fake.writes().slice(before)).toEqual([]);
  });

  it('SBX-20: before the plugin ran, issues wait for their frames and no Figma link is written', async () => {
    figmaSite();
    const r = await runF(['seed', '--confirm']);
    expect(r.code).toBe(0);
    expect(r.lines.some((l) => l.startsWith('! ') && l.includes('not in the sandbox file'))).toBe(true);
    expect(figmaRemotes()).toEqual([]);
    const s = await runF(['status']);
    expect(s.code).toBe(1);
    expect(problems(s.lines).some((l) => l.includes('CI sandbox → Seed'))).toBe(true);
  });

  it('SBX-21: a frame edited in Figma and a Figma link removed in Jira are reported; seed restores the link', async () => {
    figmaSite();
    await fig.run(PLUGIN, 'seed');
    await runF(['seed', '--confirm']);
    const frame = fig.root.children.flatMap((p) => p.children).find((n) => n.getSharedPluginData('ci_sandbox', 'id'))!;
    frame.name = 'Renamed by hand';
    const gone = figmaRemotes()[0]!;
    fake.remotes.splice(fake.remotes.indexOf(gone), 1);

    const s = await runF(['status']);
    expect(s.code).toBe(1);
    expect(problems(s.lines).some((l) => l.includes('name differ from the world'))).toBe(true);
    expect(problems(s.lines).some((l) => l.includes('links to Figma frames'))).toBe(true);

    await fig.run(PLUGIN, 'seed');
    expect((await runF(['seed', '--confirm'])).code).toBe(0);
    expect(figmaRemotes()).toHaveLength(FIGMA_LINKS);
    expect((await runF(['status'])).code).toBe(0);
  });

  it('SBX-22: the Figma token and file key are masked in every line', async () => {
    figmaSite({ hook: (req) => (req.method === 'POST' ? { status: 400, json: { errorMessages: [`bad ${FIGMA_TOKEN} ${FILE_KEY}`] } } : undefined) });
    await fig.run(PLUGIN, 'seed');
    const r = await runF(['seed', '--confirm']);
    expect(r.code).toBe(1);
    const out = r.lines.join('\n');
    expect(out).not.toContain(FIGMA_TOKEN);
    expect(out).not.toContain(FILE_KEY);
  });
});

describe('guards (8.4)', () => {
  it('SBX-11: a site not on the allowed list is refused before any request', async () => {
    site();
    const r = await run(['seed', '--confirm'], { ...ENV, SANDBOX_ALLOWED_SITES: 'other.atlassian.net' });
    expect(r.code).toBe(1);
    expect(r.lines.join('\n')).toMatch(/SANDBOX_ALLOWED_SITES/);
    expect(fake.requests).toEqual([]);
  });

  it('SBX-12: a project without the marker is refused, nothing written', async () => {
    site({ projectMarker: false });
    const r = await run(['seed', '--confirm']);
    expect(r.code).toBe(1);
    expect(r.lines.join('\n')).toMatch(/refuses to touch it/);
    expect(fake.writes()).toEqual([]);
  });

  it('SBX-13: a token quoted in an error message is masked in every line', async () => {
    const leak = `bad ${ENV.SANDBOX_JIRA_WRITE_TOKEN} and ${basic(ENV.SANDBOX_BOT_EMAIL, ENV.SANDBOX_JIRA_WRITE_TOKEN)}`;
    site({ hook: (req) => (req.method === 'POST' ? { status: 400, json: { errorMessages: [leak] } } : undefined) });
    const r = await run(['seed', '--confirm']);
    expect(r.code).toBe(1);
    const out = r.lines.join('\n');
    expect(out).toMatch(/\*\*\*/);
    for (const t of TOKENS) expect(out).not.toContain(t);
    expect(out).not.toContain(basic(ENV.SANDBOX_BOT_EMAIL, ENV.SANDBOX_JIRA_WRITE_TOKEN));
  });

  it.each([[[]], [['mutate']], [['seed', '--confirm', '--dry-run']], [['status', '--bogus']], [['seed', 'extra']]])('SBX-14: usage error %j exits 2', async (argv) => {
    site();
    const r = await run(argv);
    expect(r.code).toBe(2);
    expect(fake.requests).toEqual([]);
  });
});
