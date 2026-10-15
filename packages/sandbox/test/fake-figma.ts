import { runInNewContext } from 'node:vm';

/**
 * In-memory Figma for the plugin and seeder tests: the part of the plugin API the generated code.js calls, and the
 * REST route the seeder reads it back through (GET /v1/files/:key?depth=3&plugin_data=shared).
 * Node ids are Figma's own (100:1, 100:2…), never the frame ids of the world, as in a real file.
 */

export const FIGMA_TOKEN = 'dummy-figma-0005';
export const FILE_KEY = 'FakeFileKey0006';
export const FILE_NAME = 'CI sandbox';

type Data = Record<string, Record<string, string>>;

export class FakeNode {
  name = '';
  parent: FakeNode | null = null;
  children: FakeNode[] = [];
  x = 0;
  y = 0;
  width = 100;
  height = 100;
  characters?: string;
  fontName?: { family: string; style: string };
  reactions: any[] = [];
  readonly data: Data = {};

  constructor(readonly figma: FakeFigma, readonly id: string, readonly type: string) {}

  getSharedPluginData(ns: string, key: string): string {
    return this.data[ns]?.[key] ?? '';
  }

  setSharedPluginData(ns: string, key: string, value: string): void {
    (this.data[ns] ??= {})[key] = value;
  }

  appendChild(child: FakeNode): void {
    if (this.type === 'TEXT' || this.type === 'RECTANGLE') throw new Error(`${this.type} cannot have children`);
    child.detach();
    child.parent = this;
    this.children.push(child);
  }

  remove(): void {
    if (this.type === 'PAGE' && this.figma.currentPage === this) throw new Error('Cannot remove the current page');
    this.detach();
    this.figma.removed.push(this.id);
  }

  resize(w: number, h: number): void {
    this.width = w;
    this.height = h;
  }

  async setReactionsAsync(reactions: any[]): Promise<void> {
    for (const r of reactions) for (const a of r.actions ?? []) if (a.destinationId && !this.figma.byId(a.destinationId)) throw new Error(`no node ${a.destinationId}`);
    this.reactions = reactions;
  }

  async loadAsync(): Promise<void> {
    if (this.type === 'PAGE') this.figma.loaded.add(this.id);
  }

  private detach(): void {
    if (!this.parent) {
      const i = this.figma.root.children.indexOf(this);
      if (i >= 0) this.figma.root.children.splice(i, 1);
      return;
    }
    this.parent.children = this.parent.children.filter((c) => c !== this);
    this.parent = null;
  }
}

export class FakeFigma {
  readonly root: { children: FakeNode[] } = { children: [] };
  currentPage: FakeNode;
  command = '';
  closed?: string;
  readonly removed: string[] = [];
  readonly loaded = new Set<string>();
  fontLoaded = false;
  private seq = 0;

  constructor() {
    this.currentPage = this.createPage();
    this.currentPage.name = 'Page 1';
  }

  private node(type: string): FakeNode {
    return new FakeNode(this, `100:${++this.seq}`, type);
  }

  byId(id: string): FakeNode | undefined {
    const walk = (n: FakeNode): FakeNode | undefined => (n.id === id ? n : n.children.map(walk).find(Boolean));
    return this.root.children.map(walk).find(Boolean);
  }

  createPage(): FakeNode {
    const page = this.node('PAGE');
    this.root.children.push(page);
    return page;
  }

  createFrame(): FakeNode {
    const frame = this.node('FRAME');
    this.needsLoaded(this.currentPage);
    this.currentPage.appendChild(frame);
    return frame;
  }

  createText(): FakeNode {
    if (!this.fontLoaded) throw new Error('Cannot write to node with unloaded font');
    const text = this.node('TEXT');
    this.currentPage.appendChild(text);
    return text;
  }

  createRectangle(): FakeNode {
    const rect = this.node('RECTANGLE');
    this.currentPage.appendChild(rect);
    return rect;
  }

  async loadFontAsync(font: { family: string; style: string }): Promise<void> {
    if (font.family === 'Inter') this.fontLoaded = true;
  }

  async setCurrentPageAsync(page: FakeNode): Promise<void> {
    this.currentPage = page;
  }

  closePlugin(message?: string): void {
    this.closed = message ?? '';
  }

  /** Dynamic page access: a page must be loaded before its children are read or changed. */
  private needsLoaded(page: FakeNode): void {
    if (page !== this.currentPage && !this.loaded.has(page.id)) throw new Error(`page ${page.name} is not loaded`);
  }

  /** Runs the generated plugin as Figma would: the code in a fresh context with `figma` as its only global. */
  async run(code: string, command: string): Promise<string> {
    this.command = command;
    this.closed = undefined;
    this.loaded.clear();
    await runInNewContext(code, { figma: this });
    if (this.closed === undefined) throw new Error('the plugin did not call closePlugin');
    return this.closed;
  }

  /** Something a designer drew by hand, without the plugin's mark. */
  addForeign(name = 'Sketch'): FakeNode {
    const frame = this.node('FRAME');
    frame.name = name;
    this.currentPage.appendChild(frame);
    return frame;
  }

  // -------------------------------------------------------------------------- REST

  /** The file as GET /v1/files/:key returns it; `depth` counts levels below the document, as Figma does. */
  file(depth = Infinity, pluginData = false): unknown {
    const rest = (n: FakeNode, level: number): any => {
      const out: any = { id: n.id, name: n.name, type: n.type === 'PAGE' ? 'CANVAS' : n.type };
      if (n.type === 'TEXT') out.characters = n.characters ?? '';
      if (n.reactions.length) out.interactions = n.reactions.map((r) => ({ trigger: r.trigger, actions: r.actions }));
      if (pluginData && Object.keys(n.data).length) out.sharedPluginData = structuredClone(n.data);
      if (n.type !== 'TEXT' && n.type !== 'RECTANGLE' && level < depth) out.children = n.children.map((c) => rest(c, level + 1));
      return out;
    };
    return {
      name: FILE_NAME,
      lastModified: '2026-10-01T10:00:00Z',
      document: { id: '0:0', name: 'Document', type: 'DOCUMENT', children: this.root.children.map((p) => rest(p, 1)) },
    };
  }

  readonly requests: string[] = [];

  /** fetch for api.figma.com; anything else is not Figma's. */
  handle(url: URL, headers: Record<string, string>): Response | undefined {
    if (url.hostname !== 'api.figma.com') return undefined;
    this.requests.push(`GET ${url.pathname}${url.search}`);
    if (headers['X-Figma-Token'] !== FIGMA_TOKEN) return json(403, { status: 403, err: 'Invalid token' });
    const m = /^\/v1\/files\/([^/]+)$/.exec(url.pathname);
    if (!m) return json(404, { status: 404, err: 'Not found' });
    if (decodeURIComponent(m[1]!) !== FILE_KEY) return json(404, { status: 404, err: 'Not found' });
    const depth = Number(url.searchParams.get('depth') ?? Infinity);
    return json(200, this.file(depth, url.searchParams.get('plugin_data') === 'shared'));
  }
}

const json = (status: number, value: unknown) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

/** One fetch for both fakes: Figma's host to the Figma fake, the rest to Atlassian's. */
export function combinedFetch(figma: FakeFigma, other: (input: string | URL, init?: any) => Promise<Response>) {
  return async (input: string | URL, init: { method?: string; headers?: Record<string, string>; body?: string } = {}): Promise<Response> => {
    const url = new URL(String(input));
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(init.headers ?? {})) headers[k.toLowerCase() === 'x-figma-token' ? 'X-Figma-Token' : k] = v;
    return figma.handle(url, headers) ?? other(input, init);
  };
}
