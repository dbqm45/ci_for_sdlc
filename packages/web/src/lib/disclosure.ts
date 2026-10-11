/** Actions accepted by {@link disclosureReducer}. */
export type DisclosureAction = 'open' | 'close' | 'toggle' | 'escape';

/**
 * Pure open/closed state transition shared by every overlay-style UI piece
 * (account menu, mobile nav drawer, rail "expand sidebar" overlay).
 * Kept framework-free so the transition table is testable without rendering React.
 */
export function disclosureReducer(open: boolean, action: DisclosureAction): boolean {
  switch (action) {
    case 'open':
      return true;
    case 'close':
    case 'escape':
      return false;
    case 'toggle':
      return !open;
    default:
      return open;
  }
}
