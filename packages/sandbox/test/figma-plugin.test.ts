import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compareFrames, liveFigma, rateLimited, readFigma, type FigmaAccess } from '../src/kits/figma.js';
import { PLUGIN_DIR, pluginFiles, pluginWorld } from '../src/figma-plugin.js';
import { SandboxError } from '../src/live/context.js';
import { checkoutWorld, worldAfter } from '../src/world/checkout.js';
import { FakeFigma, FIGMA_TOKEN, FILE_KEY, combinedFetch } from './fake-figma.js';

// docs/TEST-DATA-GENERATOR.md, 4.2: the "CI sandbox" plugin builds the frames of the world in Figma; the seeder
// reads them back through the REST API. The generated code.js runs here against an in-memory plugin API.

const WORLD = checkoutWorld();
const { code, manifest } = pluginFiles();
const marked = (fig: FakeFigma) =>
  fig.root.children.flatMap((p) => p.children).filter((n) => n.getSharedPluginData('ci_sandbox', 'id'));
const live = (fig: FakeFigma) => liveFigma(FILE_KEY, fig.file(3, true));

describe('generated files', () => {
  it('FIG-01: committed code.js and manifest.json match the world (npm run sandbox:figma-plugin)', () => {
    expect(readFileSync(new URL('code.js', PLUGIN_DIR), 'utf8')).toBe(code);
    expect(readFileSync(new URL('manifest.json', PLUGIN_DIR), 'utf8')).toBe(manifest);
  });

  it('FIG-02: the runtime avoids syntax older plugin sandboxes rejected', () => {
    const runtime = readFileSync(new URL('runtime.js', PLUGIN_DIR), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    expect(runtime).not.toMatch(/\?\.|\?\?|\.\.\./);
  });

  it('FIG-03: the menu has Seed, one Mutate per Figma scenario and Reset; no network', () => {
    const m = JSON.parse(manifest);
    const commands = m.menu.filter((x: any) => x.command).map((x: any) => x.command);
    expect(commands).toEqual(['seed', ...Object.keys(pluginWorld().targets).filter((c) => c.startsWith('mutate:')), 'reset']);
    expect(m.networkAccess.allowedDomains).toEqual(['none']);
    expect(m.documentAccess).toBe('dynamic-page');
  });
});

describe('plugin', () => {
  it('FIG-04: seed builds every frame of the world; the file reads back without differences; a second seed changes nothing', async () => {
    const fig = new FakeFigma();
    const msg = await fig.run(code, 'seed');
    expect(msg).toContain(`${WORLD.frames.length} created`);
    expect(marked(fig)).toHaveLength(WORLD.frames.length);
    expect(compareFrames(WORLD.frames, live(fig), 'Seed')).toEqual([]);

    const ids = marked(fig).map((n) => n.id);
    const again = await fig.run(code, 'seed');
    expect(again).toContain('0 created, 0 updated, 0 removed');
    expect(marked(fig).map((n) => n.id)).toEqual(ids);
  });

  it('FIG-05: frames keep Figma node ids of their own; the mark maps them to the world', async () => {
    const fig = new FakeFigma();
    await fig.run(code, 'seed');
    const l = live(fig);
    for (const f of WORLD.frames) {
      const got = l.frames.get(f.id)!;
      expect(got.nodeId).not.toBe(f.id);
      expect(got.url).toContain(FILE_KEY);
      expect(got.url).toContain(`node-id=${got.nodeId.replace(/:/g, '-')}`);
    }
  });

  it('FIG-06: a file with layers the plugin did not make is refused and nothing changes', async () => {
    const fig = new FakeFigma();
    fig.addForeign();
    const msg = await fig.run(code, 'seed');
    expect(msg).toMatch(/did not make.*Nothing was changed/);
    expect(marked(fig)).toEqual([]);
    expect(fig.root.children).toHaveLength(1);
  });

  it('FIG-07: mutate brings the file to the world after the scenario', async () => {
    const fig = new FakeFigma();
    await fig.run(code, 'seed');
    const msg = await fig.run(code, 'mutate:figma-remove-error');
    const after = worldAfter('figma-remove-error');
    expect(msg).toMatch(/[1-9]\d* removed/);
    expect(compareFrames(after.frames, live(fig), 'Mutate: figma-remove-error')).toEqual([]);
    expect(compareFrames(WORLD.frames, live(fig), 'Seed')).not.toEqual([]);
  });

  it('FIG-08: reset removes every frame and page it made, and leaves a foreign layer alone', async () => {
    const fig = new FakeFigma();
    await fig.run(code, 'seed');
    const sketch = fig.addForeign();
    await fig.run(code, 'reset');
    expect(marked(fig)).toEqual([]);
    expect(fig.byId(sketch.id)).toBe(sketch);
    expect(fig.root.children.every((p) => p.getSharedPluginData('ci_sandbox', 'page') !== '1')).toBe(true);
  });

  it('FIG-09: an unknown command changes nothing', async () => {
    const fig = new FakeFigma();
    expect(await fig.run(code, 'mutate:nope')).toMatch(/unknown command/);
    expect(marked(fig)).toEqual([]);
  });
});

describe('readFigma', () => {
  const access = (fig: FakeFigma, over: Partial<FigmaAccess> = {}): FigmaAccess => ({
    token: FIGMA_TOKEN,
    fileKey: FILE_KEY,
    apiBase: 'https://api.figma.com/v1',
    fetchImpl: combinedFetch(fig, async () => new Response('', { status: 500 })) as FigmaAccess['fetchImpl'],
    ...over,
  });
  const failure = async (a: FigmaAccess) => {
    const e = await readFigma(a).catch((x) => x);
    expect(e).toBeInstanceOf(SandboxError);
    const text = String((e as SandboxError).problems ?? e.message);
    expect(text).not.toContain(a.token);
    expect(text).not.toContain(a.fileKey);
    return text;
  };

  it('FIG-10: reads the marked frames over REST with plugin data', async () => {
    const fig = new FakeFigma();
    await fig.run(code, 'seed');
    const l = await readFigma(access(fig));
    expect(l.frames.size).toBe(WORLD.frames.length);
    expect(fig.requests).toEqual([`GET /v1/files/${FILE_KEY}?depth=3&plugin_data=shared`]);
  });

  it('FIG-11: counts frames without the mark', async () => {
    const fig = new FakeFigma();
    fig.addForeign();
    expect((await readFigma(access(fig))).unmarked).toBe(1);
  });

  it.each([
    { id: 'FIG-12', over: { token: 'dummy-wrong-0007' }, hint: /refused \(403\).*FIGMA_TOKEN/ },
    { id: 'FIG-13', over: { fileKey: 'OtherKey0008' }, hint: /404.*SANDBOX_FIGMA_FILE_KEY/ },
  ])('$id: errors carry a hint, never the token or the file key', async ({ over, hint }) => {
    expect(await failure(access(new FakeFigma(), over))).toMatch(hint);
  });

  it.each([
    { id: 'FIG-14', status: 429, body: '{}', hint: /rate limited/ },
    { id: 'FIG-15', status: 502, body: '', hint: /failed \(502\)/ },
    { id: 'FIG-16', status: 200, body: '<html>', hint: /not JSON/ },
    { id: 'FIG-17', status: 200, body: '{"name":"x"}', hint: /unexpected response/ },
  ])('$id: status $status → $hint', async ({ status, body, hint }) => {
    const fetchImpl = (async () => new Response(body, { status })) as unknown as FigmaAccess['fetchImpl'];
    expect(await failure(access(new FakeFigma(), { fetchImpl }))).toMatch(hint);
  });

  it.each([
    { id: 'FIG-18', headers: {} as Record<string, string>, hint: 'rate limited (429) — try again later' },
    { id: 'FIG-19', headers: { 'retry-after': '30' }, hint: 'wait 1 min' },
    { id: 'FIG-20', headers: { 'retry-after': '7200' }, hint: 'wait 2 h' },
    { id: 'FIG-21', headers: { 'retry-after': '343657', 'x-figma-plan-tier': 'starter', 'x-figma-rate-limit-type': 'low' }, hint: 'wait 4 days (plan starter, limit low' },
    { id: 'FIG-22', headers: { 'retry-after': 'Thu, 01 Jan 1970 00:10:00 GMT' }, hint: 'wait 10 min' },
    { id: 'FIG-23', headers: { 'retry-after': 'soon' }, hint: 'try again later' },
  ])('$id: 429 with $headers → $hint', ({ headers, hint }) => {
    expect(rateLimited(new Headers(headers), 0)).toContain(hint);
  });
});
