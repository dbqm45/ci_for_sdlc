import type { Severity } from './model.js';

export type SeverityAction = 'block' | 'notify' | 'record';

/**
 * Organization policy: what each severity does to readiness.
 *  block  — open finding makes the item NOT READY
 *  notify — item NEEDS ATTENTION, surfaced in notifications
 *  record — kept for audit only, does not change status
 */
export interface AnalysisPolicy {
  actions: Record<Severity, SeverityAction>;
  /** Rule ids switched off by the organization. */
  disabledRules: string[];
}

export const DEFAULT_POLICY: AnalysisPolicy = {
  actions: { critical: 'block', warning: 'notify', info: 'record' },
  disabledRules: [],
};
