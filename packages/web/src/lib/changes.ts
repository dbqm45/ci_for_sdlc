import type { ChangeReadiness } from '@ci/core';

/** A pdi change (stories labelled `change:CHG-n`) as GET /api/changes returns it (F4). */
export interface ChangeState extends ChangeReadiness {
  /** The last request for approval sent to pdi (gate.requested). */
  requested?: { at: string; by: string; event: string };
  /** F5: the workspace of each story. */
  workspaces?: Record<string, string>;
}

/** The change a story of workspace `ws` belongs to, if any (the same key in another workspace is another story). */
export const changeOfItem = (changes: readonly ChangeState[], key: string, ws = 'default'): ChangeState | undefined =>
  changes.find((c) => c.items.includes(key) && (c.workspaces?.[key] ?? 'default') === ws);

/** A request for approval makes sense only with the pdi link and for a change pdi does not already have as ready. */
export const canAskPdi = (pdi: boolean, c: ChangeState | undefined): c is ChangeState => pdi && !!c && c.readiness !== 'ready';

/** How the change stands, for its badge. */
export const changeLabel = (c: ChangeState): string => `${c.change} · ${c.readiness === 'ready' ? 'ready' : c.readiness === 'drift' ? 'drift' : 'not ready'} · ${c.items.length} ${c.items.length === 1 ? 'story' : 'stories'}`;
