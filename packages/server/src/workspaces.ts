import { mkdir, rename } from 'node:fs/promises';
import { join } from 'node:path';
import type { AutoCloseSink } from './auto-close.js';
import { AtlassianConnection, type ConnectConfig } from './connections.js';
import { Engine } from './engine.js';
import { WORKSPACE_ID_PATTERN } from './schemas.js';
import { Store, type WorkspaceInfo } from './store.js';
import { DEFAULT_WORKSPACE } from '@ci/core';

/**
 * Workspaces (F5, docs/WORKSPACES-F5-PLAN.md): each has its own settings, sources, analysis, decisions, approvals,
 * drift and audit. `default` is the data directory itself, so an existing installation keeps its data; the others
 * live in `<data>/workspaces/<id>/` and are listed in `<data>/workspaces.json` (with `default` only when renamed).
 * A deleted workspace's directory moves to `<data>/workspaces-deleted/<id>-<time>/`: nothing is erased.
 */
export { DEFAULT_WORKSPACE } from '@ci/core';
const WORKSPACE_ID = new RegExp(WORKSPACE_ID_PATTERN);

export interface Workspace {
  id: string;
  name: string;
  store: Store;
  engine: Engine;
  atlassian: AtlassianConnection;
  /** Where its decided A2a steps go besides the log (pdi's registry); set by buildApp. */
  sink?: AutoCloseSink;
}

export class WorkspaceExistsError extends Error {}
export class WorkspaceRefusedError extends Error {}

export class Workspaces {
  private readonly byId = new Map<string, Workspace>();

  /** `setup` wires each workspace (pdi, schedule) as it opens. */
  constructor(
    private readonly dataDir: string,
    private readonly connect: ConnectConfig,
    private readonly setup: (w: Workspace) => void | Promise<void>,
  ) {}

  /** Opens `default` and every listed workspace. */
  async init() {
    await this.open({ id: DEFAULT_WORKSPACE, name: 'Default', createdAt: '' });
    for (const info of await this.default.store.workspaces()) {
      if (info.id === DEFAULT_WORKSPACE) this.default.name = info.name;
      else if (WORKSPACE_ID.test(info.id)) await this.open(info);
    }
  }

  get default(): Workspace {
    return this.byId.get(DEFAULT_WORKSPACE)!;
  }

  get(id: string): Workspace | undefined {
    return this.byId.get(id);
  }

  all(): Workspace[] {
    return [...this.byId.values()];
  }

  list(): { id: string; name: string }[] {
    return this.all().map(({ id, name }) => ({ id, name }));
  }

  /** A new workspace with the default settings (demo mode), like a fresh installation. */
  async create(id: string, name: string, at: string): Promise<Workspace> {
    if (!WORKSPACE_ID.test(id)) throw new Error(`Workspace id must match ${WORKSPACE_ID_PATTERN}`);
    if (this.byId.has(id)) throw new WorkspaceExistsError(`Workspace ${id} already exists`);
    const info: WorkspaceInfo = { id, name: name.trim() || id, createdAt: at };
    await this.default.store.updateWorkspaces((all) => [...all.filter((w) => w.id !== id), info]);
    return this.open(info);
  }

  /** A new name; the id, and so every address, stays. */
  async rename(id: string, name: string, at: string): Promise<Workspace> {
    const w = this.byId.get(id);
    if (!w) throw new WorkspaceRefusedError(`No workspace ${id}`);
    w.name = name.trim() || id;
    await this.default.store.updateWorkspaces((all) => (all.some((x) => x.id === id) ? all.map((x) => (x.id === id ? { ...x, name: w.name } : x)) : [...all, { id, name: w.name, createdAt: at }]));
    return w;
  }

  /** Stops the workspace and moves its directory aside; `default`, which is the data directory itself, stays. */
  async remove(id: string, at: string): Promise<{ archivedTo: string }> {
    if (id === DEFAULT_WORKSPACE) throw new WorkspaceRefusedError('The default workspace cannot be deleted');
    const w = this.byId.get(id);
    if (!w) throw new WorkspaceRefusedError(`No workspace ${id}`);
    w.engine.stop();
    this.byId.delete(id);
    await this.default.store.updateWorkspaces((all) => all.filter((x) => x.id !== id));
    const archivedTo = join('workspaces-deleted', `${id}-${at.replace(/[-:.]/g, '')}`);
    await mkdir(join(this.dataDir, 'workspaces-deleted'), { recursive: true });
    await rename(join(this.dataDir, 'workspaces', id), join(this.dataDir, archivedTo));
    return { archivedTo };
  }

  private async open(info: WorkspaceInfo): Promise<Workspace> {
    const store = new Store(info.id === DEFAULT_WORKSPACE ? this.dataDir : join(this.dataDir, 'workspaces', info.id));
    await store.init();
    const atlassian = new AtlassianConnection(store, this.connect);
    const engine = new Engine(store, this.connect.mode === 'oauth' ? atlassian : undefined);
    const w: Workspace = { id: info.id, name: info.name, store, engine, atlassian };
    this.byId.set(w.id, w);
    await this.setup(w);
    return w;
  }
}
