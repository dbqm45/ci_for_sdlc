import { mkdir, rename } from 'node:fs/promises';
import { join } from 'node:path';
import type { Pool } from 'pg';
import { FileBackend, PgBackend, archiveWorkspace, type Backend } from './backend.js';
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
 * With CI_DATABASE_URL the same lives in Postgres instead (`PgStorage`), one workspace per `workspace` value.
 */
export { DEFAULT_WORKSPACE } from '@ci/core';
const WORKSPACE_ID = new RegExp(WORKSPACE_ID_PATTERN);

export interface Workspace {
  id: string;
  name: string;
  store: Store;
  engine: Engine;
  atlassian: AtlassianConnection;
  /** The organization it belongs to (accounts mode, docs/ORGANIZATIONS-PLAN.md); none = the first organization. */
  orgId?: string;
  /** Where its decided A2a steps go besides the log (pdi's registry); set by buildApp. */
  sink?: AutoCloseSink;
}

/** Where the workspaces keep their state. */
export interface Storage {
  readonly kind: 'files' | 'postgres';
  backend(id: string): Backend;
  /** Moves a deleted workspace's state aside; returns where it went. */
  archive(id: string, at: string): Promise<string>;
  /** The state of an archived workspace (`archivedAs` as `archive` returned it). */
  archived(archivedAs: string): Backend;
  /** Moves an archived workspace's state back under `id`. */
  unarchive(archivedAs: string, id: string): Promise<void>;
}

const stamp = (at: string) => at.replace(/[-:.]/g, '');

/** JSON files: `default` in the data directory itself, the others in `workspaces/<id>/`. */
export class FileStorage implements Storage {
  readonly kind = 'files';
  constructor(private readonly dataDir: string) {}
  backend(id: string) {
    return new FileBackend(id === DEFAULT_WORKSPACE ? this.dataDir : join(this.dataDir, 'workspaces', id));
  }
  async archive(id: string, at: string) {
    const to = join('workspaces-deleted', `${id}-${stamp(at)}`);
    await mkdir(join(this.dataDir, 'workspaces-deleted'), { recursive: true });
    await rename(join(this.dataDir, 'workspaces', id), join(this.dataDir, to));
    return to;
  }
  archived(archivedAs: string) {
    if (!/^workspaces-deleted\/[^/\\]+$/.test(archivedAs)) throw new Error(`Not an archived workspace: ${archivedAs}`);
    return new FileBackend(join(this.dataDir, archivedAs));
  }
  async unarchive(archivedAs: string, id: string) {
    this.archived(archivedAs);
    await mkdir(join(this.dataDir, 'workspaces'), { recursive: true });
    await rename(join(this.dataDir, archivedAs), join(this.dataDir, 'workspaces', id));
  }
}

/** Postgres (CI_DATABASE_URL): rows of every workspace in the same tables, kept apart by row-level security. */
export class PgStorage implements Storage {
  readonly kind = 'postgres';
  constructor(private readonly pool: Pool) {}
  backend(id: string) {
    return new PgBackend(this.pool, id);
  }
  async archive(id: string, at: string) {
    const to = `deleted:${id}-${stamp(at)}`;
    await archiveWorkspace(this.pool, id, to);
    return to;
  }
  archived(archivedAs: string) {
    if (!archivedAs.startsWith('deleted:')) throw new Error(`Not an archived workspace: ${archivedAs}`);
    return new PgBackend(this.pool, archivedAs);
  }
  async unarchive(archivedAs: string, id: string) {
    this.archived(archivedAs);
    await archiveWorkspace(this.pool, archivedAs, id);
  }
}

/** A deleted workspace, kept for `ERASE_AFTER_DAYS` and then erased for good (T7, docs/DATA-DELETION.md). */
export interface DeletedWorkspace {
  id: string;
  name: string;
  orgId?: string;
  archivedAs: string;
  deletedAt: string;
  eraseAfter: string;
}

/** Days a deleted workspace can still be restored before the hourly job erases it. */
export const ERASE_AFTER_DAYS = 30;
const DELETED_DOC = 'workspaces-deleted.json';

export class WorkspaceExistsError extends Error {}
export class WorkspaceRefusedError extends Error {}

export class Workspaces {
  private readonly byId = new Map<string, Workspace>();

  /** `setup` wires each workspace (pdi, schedule) as it opens. */
  constructor(
    private readonly storage: Storage,
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

  /** A new workspace with the default settings (demo mode), like a fresh installation; `orgId`: its organization. */
  async create(id: string, name: string, at: string, orgId?: string): Promise<Workspace> {
    if (!WORKSPACE_ID.test(id)) throw new Error(`Workspace id must match ${WORKSPACE_ID_PATTERN}`);
    if (this.byId.has(id)) throw new WorkspaceExistsError(`Workspace ${id} already exists`);
    const info: WorkspaceInfo = { id, name: name.trim() || id, createdAt: at, ...(orgId && { orgId }) };
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

  /**
   * Stops the workspace, drops its Atlassian connection and moves its data aside, to be erased for good after
   * `ERASE_AFTER_DAYS` (T7); until then `restore` brings it back. `default`, the data directory itself, stays.
   */
  async remove(id: string, at: string): Promise<{ archivedTo: string; eraseAfter: string }> {
    if (id === DEFAULT_WORKSPACE) throw new WorkspaceRefusedError('The default workspace cannot be deleted');
    const w = this.byId.get(id);
    if (!w) throw new WorkspaceRefusedError(`No workspace ${id}`);
    w.engine.stop();
    // The stored refresh token goes now, not with the archive: a deleted workspace keeps no access to the team's site.
    await this.storage.backend(id).remove('connections.json');
    this.byId.delete(id);
    await this.default.store.updateWorkspaces((all) => all.filter((x) => x.id !== id));
    const archivedTo = await this.storage.archive(id, at);
    const eraseAfter = new Date(Date.parse(at) + ERASE_AFTER_DAYS * 86_400_000).toISOString();
    await this.updateDeleted((all) => [...all, { id, name: w.name, ...(w.orgId && { orgId: w.orgId }), archivedAs: archivedTo, deletedAt: at, eraseAfter }]);
    return { archivedTo, eraseAfter };
  }

  /** Deleted workspaces that can still be restored, oldest first. */
  async deleted(): Promise<DeletedWorkspace[]> {
    const v = await this.storage.backend(DEFAULT_WORKSPACE).read(DELETED_DOC);
    return Array.isArray(v) ? (v as DeletedWorkspace[]) : [];
  }

  /** Brings a deleted workspace back under its id (its Atlassian connection has to be made again). */
  async restore(archivedAs: string, at: string): Promise<Workspace> {
    const d = (await this.deleted()).find((x) => x.archivedAs === archivedAs);
    if (!d) throw new WorkspaceRefusedError('No deleted workspace by that name, or it was already erased.');
    if (this.byId.has(d.id)) throw new WorkspaceExistsError(`A workspace ${d.id} exists again; rename or delete it first.`);
    await this.storage.unarchive(archivedAs, d.id);
    await this.updateDeleted((all) => all.filter((x) => x.archivedAs !== archivedAs));
    const info: WorkspaceInfo = { id: d.id, name: d.name, createdAt: at, ...(d.orgId && { orgId: d.orgId }) };
    await this.default.store.updateWorkspaces((all) => [...all.filter((w) => w.id !== d.id), info]);
    return this.open(info);
  }

  /** Erases a deleted workspace for good, before its date. */
  async erase(archivedAs: string): Promise<DeletedWorkspace> {
    const d = (await this.deleted()).find((x) => x.archivedAs === archivedAs);
    if (!d) throw new WorkspaceRefusedError('No deleted workspace by that name, or it was already erased.');
    await this.storage.archived(archivedAs).erase();
    await this.updateDeleted((all) => all.filter((x) => x.archivedAs !== archivedAs));
    return d;
  }

  /** Erases every deleted workspace past its date (the hourly job); returns what was erased. */
  async purge(now: Date): Promise<DeletedWorkspace[]> {
    const due = (await this.deleted()).filter((d) => Date.parse(d.eraseAfter) <= now.getTime());
    for (const d of due) await this.erase(d.archivedAs);
    return due;
  }

  private deletedQueue: Promise<unknown> = Promise.resolve();
  private updateDeleted(fn: (all: DeletedWorkspace[]) => DeletedWorkspace[]) {
    const run = this.deletedQueue.then(async () => this.storage.backend(DEFAULT_WORKSPACE).write(DELETED_DOC, fn(await this.deleted())));
    this.deletedQueue = run.catch(() => undefined);
    return run;
  }

  private async open(info: WorkspaceInfo): Promise<Workspace> {
    const store = new Store(this.storage.backend(info.id));
    await store.init();
    const atlassian = new AtlassianConnection(store, this.connect);
    const engine = new Engine(store, this.connect.mode === 'oauth' ? atlassian : undefined);
    const w: Workspace = { id: info.id, name: info.name, store, engine, atlassian, ...(info.orgId && { orgId: info.orgId }) };
    this.byId.set(w.id, w);
    await this.setup(w);
    return w;
  }
}
