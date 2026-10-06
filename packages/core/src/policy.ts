import type { Severity } from './model.js';

export type SeverityAction = 'block' | 'notify' | 'record';

/**
 * What a blocking-severity AI finding does to readiness.
 *  block                — blocks on its own, like a rule finding
 *  require_confirmation — needs attention until a human confirms it; then it blocks
 *  notify               — never blocks, only needs attention
 */
export type AiFindingsAction = 'block' | 'require_confirmation' | 'notify';

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
  /** Optional in stored settings written before it existed; read through `aiFindingsAction`. */
  aiFindings?: AiFindingsAction;
}

export const DEFAULT_POLICY: AnalysisPolicy = {
  actions: { critical: 'block', warning: 'notify', info: 'record' },
  disabledRules: [],
  aiFindings: 'require_confirmation',
};

export const aiFindingsAction = (p: AnalysisPolicy): AiFindingsAction => p.aiFindings ?? 'require_confirmation';
