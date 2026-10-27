import type { ChangeReadiness } from '@ci/core';

/** A pdi change (stories labelled `change:CHG-n`) as GET /api/changes returns it (F4). */
export interface ChangeState extends ChangeReadiness {
  /** The last request for approval sent to pdi (gate.requested). */
  requested?: { at: string; by: string; event: string };
}

/** The change a story belongs to, if any. */
export const changeOfItem = (changes: readonly ChangeState[], key: string): ChangeState | undefined => changes.find((c) => c.items.includes(key));

/** A request for approval makes sense only with the pdi link and for a change pdi does not already have as ready. */
export const canAskPdi = (pdi: boolean, c: ChangeState | undefined): c is ChangeState => pdi && !!c && c.readiness !== 'ready';

/** How the change stands, for its badge. */
export const changeLabel = (c: ChangeState): string => `${c.change} · ${c.readiness === 'ready' ? 'ready' : c.readiness === 'drift' ? 'drift' : 'not ready'} · ${c.items.length} ${c.items.length === 1 ? 'story' : 'stories'}`;
